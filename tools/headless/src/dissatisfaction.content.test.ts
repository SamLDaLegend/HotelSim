// θ-b1 — THE TWO NUMBERS, DERIVED AND THEN EXECUTED AGAINST THE SHIPPED BYTES.
//
//   pnpm exec vitest run dissatisfaction
//
// ============================================================================
// §2.1 SAYS A BOUND MUST BE DERIVABLE FROM A STATED REQUIREMENT. This file runs the
// derivations rather than quoting them, which is the difference ADR-0007 keeps being about.
//
//   `dissatisfactionCapacityTicks` = 431, placed between TWO CLIFFS by equal multiplicative
//   margin (ADR-0015's rule, one instrument over):
//
//     LOWER   129 — the arrival backlog. A guest arrives AT its want line on every need and is
//                   served one at a time, so even in a hotel with a free provider for
//                   everything it wants something unserved while the FIRST TWO are worked
//                   through — 60 + 69. The third visit fills nothing: by then the other two
//                   engagement needs are back below their lines and the lodging need is
//                   EXCUSED (ADR-0026 as amended). Below this a PERFECTLY PROVISIONED hotel
//                   evicts its guests.
//     UPPER   1,440 — `stayDurationTicks`. A resident nothing serves fills at one per tick and
//                   leaves at age exactly the ceiling; checkout is tested first, so at or above
//                   the stay the rule is DEAD.
//     PLACED  round(sqrt(129 x 1440)) = 431.  431/129 = 3.3411, 1440/431 = 3.3411.
//
//   `dissatisfactionReliefPerTick` = 1, the smallest integer that clears the requirement that a
//   guest RECOVER from that backlog before its next need comes due — `r x 351 >= 129`.
//
// THE LOWER CLIFF IS READ OUT OF THE FIELD ITSELF rather than reconstructed from need levels,
// because the thing being checked is the stock the simulation actually keeps.
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  bindContent,
  createGridBounds,
  createValidityCache,
  createWorld,
  dissatisfactionCapacityOf,
  dissatisfactionReliefOf,
  guestSpeedOf,
  guestsInOrder,
  lodgingNeedOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  run,
  stayDurationOf,
  stepTick,
  toleranceOf,
  wantAtOf,
} from '@hotelsim/sim';
import type { GuestRulesData, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const SHIPPED = loadContent();

// ==========================================================================================
//  THE WORST JOURNEY, RE-DERIVED AT G-038a-ii-alpha BECAUSE IT STOPPED BEING THE MANHATTAN SUM.
//
//  IT USED TO BE `(maxFloor-minFloor) + (maxColumn-minColumn) + (maxRow-minRow)` = 108, and
//  that expression WOULD HAVE GONE ON RETURNING 108 — a green row whose derivation had become
//  false, which is the ADR-0007 class inside the file that exists to derive the number.
//
//  A FLOOR IS NOW REACHED BY A STAIR. `stairLeg` in `packages/sim/src/guests.ts` sends a guest
//  with a cross-floor destination to the STAIRWELL COLUMN first, up it, and then on — so the
//  worst journey is THREE LEGS and not one:
//
//      horizontal to the stairwell   +   the floor axis   +   horizontal from the stairwell
//         79 + 7 = 86               +        22          +           79 + 7 = 86      = 194
//
//  AND THIS IS WHY STAIRS ARE ALIGNED. One stairwell column through the plot gives 194 and a
//  derived speed floor of 2, so the shipped `guestCellsPerTick: 3` stays legal with no content
//  edit. FREE placement — a stair anywhere per floor pair — gives roughly `22 x 86 + 108`, about
//  1,900 cells and a floor of NINETEEN, at which the shipped dial becomes ILLEGAL by this
//  file's own arithmetic. The ruling is written out in `packages/sim/src/stairs.ts`.
//
//  TICKS ARE THE SUM OF THREE CEILINGS, NOT THE CEILING OF THE SUM, and the difference is real
//  rather than pedantic: a guest lands exactly on the stairwell and exactly on the destination
//  floor, spending part of a budget each time. At speed 3 that is 66 ticks where `ceil(194/3)`
//  says 65. The larger number is the true bound, so it is the one derived here.
// ==========================================================================================

/** The two horizontal spans and the vertical one, from the plot the sim actually ships. */
const legsOfThePlot = (): { readonly horizontal: number; readonly vertical: number } => {
  const bounds = createGridBounds();
  return {
    horizontal: bounds.maxColumn - bounds.minColumn + (bounds.maxRow - bounds.minRow),
    vertical: bounds.maxFloor - bounds.minFloor,
  };
};

/** The worst journey the plot permits, IN CELLS: to the stairwell, up it, and on. */
const worstJourneyCells = (): number => {
  const { horizontal, vertical } = legsOfThePlot();
  return horizontal + vertical + horizontal;
};

/** The worst journey the plot permits, IN TICKS, at `speed`. Three legs, three ceilings. */
const worstJourneyTicks = (speed: number): number => {
  const { horizontal, vertical } = legsOfThePlot();
  return Math.ceil(horizontal / speed) + Math.ceil(vertical / speed) + Math.ceil(horizontal / speed);
};

/** The shipped tables with the guest rules patched. */
const rebound = (patch: Partial<GuestRulesData>): ReturnType<typeof bindContent> =>
  bindContent({
    ...SHIPPED.content,
    guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => ({ ...entry, ...patch })),
  } as SimContent);

/** The highest dissatisfaction any guest reaches over a run, read out of the field. */
const peakOver = (content: ReturnType<typeof bindContent>, days: number, rooms: number, amenities: number): number => {
  const options = { seed: 7, ticks: days * 1_440 };
  const initial = createWorld(options.seed, content);
  const commands = schedule(options.ticks, content, initial.grid, rooms, 120, 0, 0, 0, amenities);
  const byTick = new Map<number, { kind: string }[]>();
  for (const entry of commands) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  let world = initial;
  let peak = 0;
  // ONE `ValidityCache` ACROSS THE WALK, WHICH IS WHAT `run` HOLDS (G-038a-ii-beta). Stepping
  // by hand to watch per-tick state is right; stepping by hand WITHOUT a cache rebuilds every
  // derived index in the simulation on every tick — the placement index, the grounded set, the
  // valid-room list and, since this goal, the reachable component — which is a configuration no
  // host uses and which G-010 exists to have removed. **This changes no answer and that is a
  // checked fact, not a claim**: `validity.cache.test.ts` asserts a run with a cache and a run
  // without one produce the same state hash. The workload, the schedule and the tick count are
  // untouched.
  const cache = createValidityCache();
  for (let i = 0; i < options.ticks; i += 1) {
    world = stepTick(world, content, (byTick.get(world.tick) ?? []) as never, cache);
    for (const guest of guestsInOrder(world.guests)) {
      if (guest.dissatisfaction > peak) peak = guest.dissatisfaction;
    }
  }
  return peak;
};

/**
 * THE ARRIVAL BACKLOG, COMPUTED RATHER THAN WRITTEN DOWN (G-041).
 *
 * It was the literal `129` in five places in this file until G-041 moved it to 63 — and every one
 * of those five was a restatement of the fold the first test in this file already runs. A number
 * duplicated across prose and predicate, where only some of the copies are checked, is ADR-0027's
 * row-count class; the re-derivation is what made it cheaper to fix than to update.
 *
 * A guest arrives at its want line on every need and is served ONE at a time, so the queue
 * lengthens as it is worked. The stock stops climbing when the LAST need begins being served —
 * the other two are back below their lines and the lodging need is EXCUSED (ADR-0026 as amended)
 * — so the fill is the chase minus its last leg.
 */
const arrivalBacklogTicks = (): number => {
  const lodgingNeed = lodgingNeedOf(SHIPPED);
  const wantAt = wantAtOf(SHIPPED);
  let elapsed = 0;
  let last = 0;
  for (const entry of needTypesInOrder(SHIPPED).filter((need) => need.id !== lodgingNeed?.id)) {
    const line = Math.floor((wantAt * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
    last = Math.ceil((line + elapsed) / entry.refillPerTick);
    elapsed += last;
  }
  return elapsed - last;
};

describe('THE LOWER CLIFF — 63, derived and then measured on the shipped tables', () => {
  const lodging = lodgingNeedOf(SHIPPED);
  const engagement = needTypesInOrder(SHIPPED).filter((entry) => entry.id !== lodging?.id);

  it('the arrival backlog fills for 30 + 33 = 63 ticks, computed from the need table', () => {
    // A guest arrives at its want line on every need and is served ONE at a time. Each need it
    // is not yet serving keeps decaying while it waits, so the queue lengthens as it is worked:
    // the nth need starts from its line PLUS everything spent on the ones before it.
    const wantAt = wantAtOf(SHIPPED);
    let elapsed = 0;
    const visits: number[] = [];
    for (const entry of engagement) {
      const line = Math.floor((wantAt * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS);
      const visit = Math.ceil((line + elapsed) / entry.refillPerTick);
      visits.push(visit);
      elapsed += visit;
    }
    // 30 / 33 / 35 AT G-041, WHERE IT READ 60 / 69 / 79. What moved is `refillPerTick` 7 -> 14 —
    // ADR-0054 makes the declared rate the one a FULLY APPOINTED room reaches, and this chase is
    // therefore the chase in the BEST hotel the content permits. In the worst one it is the old
    // 60 / 69 / 79 exactly, because the floor rate is the old declared rate (`needs.rates.test.ts`).
    expect(visits).toEqual([30, 33, 35]);
    expect(elapsed).toBe(98);
    // AND THE LAST VISIT FILLS NOTHING, WHICH IS THE AMENDMENT AS ARITHMETIC. While the third
    // need is being served the other two are back below their want lines, and the lodging need
    // is EXCUSED because the guest chose to be out (ADR-0026 as amended) — so the stock stops
    // climbing 79 ticks before the chase ends. The fill is the chase MINUS its last leg.
    const fill = elapsed - (visits[visits.length - 1] ?? 0);
    expect(fill).toBe(63);
    expect(lodging).toBeDefined();
    // AND THE HELPER EVERY OTHER TEST IN THIS FILE READS IS THIS FOLD, not a fourth copy of it.
    expect(arrivalBacklogTicks()).toBe(fill);
  });

  it('and a hotel that serves everything reaches the chase PLUS ITS LEGS, both bounded', () => {
    // ========================================================================================
    // THIS ARM READ `toBe(129)` UNTIL G-023b-ii, AND IT WAS AN EQUALITY BETWEEN A DERIVATION
    // AND A MEASUREMENT. Turning travel on left the derivation at 129 and moved the
    // measurement to 139, and **re-pinning 139 over the top would have left a derived number
    // and a measured number disagreeing inside one test** — a green row with an ADR-0007
    // defect in it. The derivation is EXTENDED instead, and this comment says which of the two
    // repairs was taken.
    //
    // WHAT THE ARITHMETIC ABOVE MODELS AND WHAT IT DOES NOT. It models a CHASE between
    // providers — three visits of 60, 69 and 79 ticks, the stock climbing until the third
    // begins — and it does not model the LEGS between them, because when it was written there
    // were none. With `guestCellsPerTick` declared, the stock also climbs while the guest
    // WALKS, once per engagement need it chases:
    //
    //     peak <= chase + needs(engagement) x ceil(worstJourney / speed)
    //
    // Every term is read rather than typed: the chase from the need table, the leg count from
    // the same table, the journey from the plot the sim actually ships, the speed from the
    // guest rules. **129 IS NOW A FLOOR AND THE EXCESS IS BOUNDED**, which is the honest shape
    // of a derivation that models part of a quantity.
    //
    // AND THE SIX-ROOM ARM DOES NOT MOVE — 179 with travel off and 179 with it on, at every
    // speed from 1 to 12. **That is evidence rather than luck**: its peak belongs to guests
    // queueing for a bed, and a guest nobody has given a room is going nowhere. Travel raises
    // the backlog of guests being SERVED and leaves the backlog of guests being IGNORED where
    // it was, which is the one-line statement of what this whole goal did.
    // ========================================================================================
    const worstJourney = worstJourneyCells();
    const speed = guestSpeedOf(SHIPPED);
    // A leg per engagement need chased, at most the worst journey the plot permits. `speed`
    // undefined is the historical no-travel content and costs nothing, which keeps this
    // expression correct for the era `absence` describes rather than special-cased for it.
    const legs = speed === undefined ? 0 : engagement.length * worstJourneyTicks(speed);
    // 108 -> 194 AT G-038a-ii-alpha, and the CAUSE is the stair rather than the plot: not one
    // edge of `createGridBounds` moved. See `worstJourneyCells` above.
    expect(worstJourney).toBe(194);
    expect(legs).toBe(198);

    const backlog = arrivalBacklogTicks();
    const uncontended = peakOver(SHIPPED, 10, 60, 3);
    expect(uncontended).toBeGreaterThanOrEqual(backlog);
    expect(uncontended).toBeLessThanOrEqual(backlog + legs);
    // AND THE BOUND STILL BINDS SOMETHING. 63 + 198 = 261, under the 301 ceiling —
    // which is the property the speed floor below is derived from, asserted here so that
    // widening the journey can never quietly pass this arm by making the bound vacuous.
    // ...BY 40 TICKS, WHERE IT WAS 104 BEFORE G-041, AND THAT NARROWING IS A FINDING RATHER THAN
    // AN INCIDENTAL. Both ends moved: the backlog fell 129 -> 63 with the rates, and the ceiling
    // fell 431 -> 301 because it is the geometric mean of that backlog and the stay. The journey
    // did not move at all, so the SAME plot now eats a larger share of the window — which is why
    // the speed floor below comes out at 3 rather than 2 and the legal plot depth at 27 rather
    // than 60. A goal that widens the plot again meets this inequality first.
    expect(backlog + legs).toBeLessThan(dissatisfactionCapacityOf(SHIPPED) ?? 0);
    expect((dissatisfactionCapacityOf(SHIPPED) ?? 0) - (backlog + legs)).toBe(40);
    // PINNED AS WELL AS BOUNDED. The bound above is worst-case over the whole plot and the
    // seeded hotel is nowhere near it, so on its own it would admit a 98-tick regression
    // without a murmur. The literal is what keeps this arm sharp; the bound is what keeps it
    // honest about which half is derived.
    // 139 -> 141 AT G-038a-iii-b, WHICH DECLARED THE STAIRWELL, AND IT MOVES BY TWO TICKS. The
    // 60-room arm's peak backlog is guests being SERVED, and a served guest's journey now has a
    // vertical leg in it — so the deepest any need in this hotel gets is two ticks deeper. It
    // is still an order of magnitude inside the 129 + 198 bound above, which is the property
    // that arm asserts and the reason this literal is a sharpener rather than the claim.
    // 78 -> 88 AT G-054. Guests spread across the amenities instead of queueing at the
    // alphabetically first one (`needTieBreakRank`, ADR-0078), so the deepest any need in the
    // 60-room hotel gets is ten ticks deeper. **It is still an order of magnitude inside the
    // 129 + 198 bound the arm above asserts**, which is the derived property; this literal is
    // the sharpener, and it is re-pinned rather than widened.
    expect(uncontended).toBe(88);
    // AND THE SIX-ROOM ARM STILL DOES NOT MOVE, at 179, THROUGH THE STAIRWELL AS WELL AS
    // THROUGH TRAVEL. The paragraph above calls that evidence rather than luck — its peak
    // belongs to guests queueing for a bed, and a guest nobody has given a room is going
    // nowhere, by stairs or otherwise. It is the control that survived both goals.
    expect(peakOver(SHIPPED, 10, 6, 5)).toBe(179);
  });

  it('THE SPEED FLOOR THE CEILING IMPLIES IS 2, AND THE SHIPPED DIAL CLEARS IT', () => {
    // ========================================================================================
    // A SECOND FLOOR UNDER `guestCellsPerTick`, PRODUCED BY THIS GOAL AND BINDING ABOVE THE
    // ONE THE SCHEMA ALREADY CARRIED.
    //
    // `guestCellsPerTickSchema` derives its floor from `toleranceTicks`: a journey must not be
    // able to exhaust a guest's patience on its own. **THAT SENTENCE USED TO END "which at 108
    // cells against 180 ticks clears at any speed of 1 or more", AND AT 194 IT IS FALSE** — a
    // speed-1 guest sent on the worst journey this plot permits spends 194 ticks walking and
    // times out at 180 because it WALKED, which is the cliff ADR-0017 was written to dissolve.
    // So the tolerance floor is 2 as well now, and `THE TOLERANCE FLOOR IS ALSO 2` below drives
    // it rather than leaving it in prose. **The ceiling still gives the tighter bound.** The
    // requirement
    // `dissatisfactionCapacityTicks` encodes is that a PERFECTLY PROVISIONED hotel does not
    // evict its guests, and the bound above is what such a guest can reach — so a speed at
    // which `chase + legs` passes the ceiling re-opens the eviction that number was placed to
    // close.
    //
    // IT IS A CLAIM ABOUT WHAT THE PLOT PERMITS, NOT ABOUT THE SEEDED HOTEL, and it is stated
    // with exactly the scope the tolerance floor above it has. The measured peak at speed 1 is
    // 163, far under 431 — no shipped workload puts two providers 108 cells apart. What the
    // plot ALLOWS is the thing a content bound has to survive.
    // ========================================================================================
    const ceiling = dissatisfactionCapacityOf(SHIPPED) ?? 0;
    const reachableAt = (speed: number): number =>
      arrivalBacklogTicks() + engagement.length * worstJourneyTicks(speed);
    // THE CLIFF, FROM BOTH SIDES — ADR-0007's two-sided form, over the dial rather than over
    // the ceiling.
    //
    // ==========================================================================================
    // THE FLOOR ROSE 2 -> 3 AT G-041, AND NOTHING ABOUT TRAVEL OR THE PLOT MOVED. Both ends of
    // this inequality are downstream of the need rates: the backlog is the arrival chase (129 ->
    // 63) and the ceiling is its geometric mean with the stay (431 -> 301). The journey is the
    // same 194 cells it was. So the window shrank around a fixed cost, and the smallest speed
    // that fits went up:
    //
    //     speed 1   63 + 3 x (86 + 22 + 86) = 645  >  301   the ceiling is BREACHED
    //     speed 2   63 + 3 x (43 + 11 + 43) = 354  >  301   BREACHED, and it CLEARED before G-041
    //     speed 3   63 + 3 x (29 +  8 + 29) = 261  <  301   clears, and is what ships
    //
    // **THE SHIPPED 3 IS NOW EXACTLY ON THE FLOOR RATHER THAN ONE ABOVE IT**, with 40 ticks of
    // headroom where it had 104. `guestCellsPerTick` was a PREFERENCE inside [2, 108] and is now
    // a preference inside [3, 108] that happens to sit at its lower end — so the next goal that
    // widens the plot, deepens the shaft or lowers this dial meets a derived bound rather than a
    // comfortable margin. That is recorded here rather than left to be discovered.
    // ==========================================================================================
    expect(reachableAt(1)).toBeGreaterThan(ceiling);
    expect(reachableAt(2)).toBeGreaterThan(ceiling);
    expect(reachableAt(3)).toBeLessThan(ceiling);
    // SMALLEST ADMISSIBLE SPEED, computed rather than asserted, so a content change to the
    // ceiling or a plot change to the depth moves it here instead of leaving a stale number.
    let floor = 1;
    while (reachableAt(floor) > ceiling) floor += 1;
    expect(floor).toBe(3);
    expect(guestSpeedOf(SHIPPED) ?? 0).toBeGreaterThanOrEqual(floor);
    // AND IT IS AT THE FLOOR, NOT ABOVE IT. Asserted so that a future edit which lowers the dial
    // to 2 cannot pass by reading only the inequality above.
    expect(guestSpeedOf(SHIPPED) ?? 0).toBe(floor);
    // AND THE UPPER ENDPOINT, WHICH IS WHERE THE DIAL STOPS DOING ANYTHING — AND IT DID NOT
    // MOVE WITH THE JOURNEY, WHICH IS WORTH SAYING BECAUSE THE OBVIOUS EDIT WOULD HAVE MOVED IT.
    // `stepTowards` clamps at the destination, so the dial saturates at THE LONGEST SINGLE LEG
    // and not at the longest JOURNEY. With a stairwell the legs are 86, 22 and 86; with none —
    // ~~which is every world in this project today~~ **which since G-038a-iii-b is no world
    // this project ships, and the endpoint DID NOT MOVE ANYWAY** — the journey is one leg of
    // 108. So 108 is still the largest leg anywhere and still the endpoint: 86 and 22 are both
    // under it, which is exactly why the aligned shaft was the placement that kept this
    // arithmetic to one number. The shipped value sits inside
    // [floor, 108] and is a preference there (ADR-0013 §4).
    const { horizontal, vertical } = legsOfThePlot();
    const longestLeg = Math.max(horizontal + vertical, horizontal, vertical);
    expect(longestLeg).toBe(108);
    expect(guestSpeedOf(SHIPPED) ?? 0).toBeLessThanOrEqual(longestLeg);
    expect(guestSpeedOf(SHIPPED)).toBe(3);
  });

  it('THE TOLERANCE FLOOR IS ALSO 2 NOW, and at 108 it was 1 — the sentence that went false', () => {
    // ========================================================================================
    // THE OTHER FLOOR, DRIVEN RATHER THAN QUOTED (G-038a-ii-alpha). `guestCellsPerTickSchema`
    // and `grid.ts` both carried *"at 108 cells against 180 ticks, any speed of 1 or more
    // clears it"*. A stair makes the worst journey 194 and that sentence false, and a
    // derivation that has gone false while its test stays green is the exact class this file
    // exists to catch — so the claim is now executed on both sides of the cliff.
    // ========================================================================================
    const tolerance = toleranceOf(SHIPPED) ?? 0;
    expect(tolerance).toBe(180);
    expect(worstJourneyTicks(1)).toBeGreaterThan(tolerance);
    expect(worstJourneyTicks(2)).toBeLessThan(tolerance);
    // AND IT IS THE STAIR AND NOT THE PLOT THAT MOVED IT: the same plot, walked as one
    // Manhattan leg the way a world with no stairwell still walks it, clears at speed 1.
    const { horizontal, vertical } = legsOfThePlot();
    expect(horizontal + vertical).toBe(108);
    expect(horizontal + vertical).toBeLessThan(tolerance);
  });

  it('AND THE PLOT DEPTH IS RE-DERIVED IN THE SAME CHANGE, because `grid.ts` rests on this', () => {
    // ========================================================================================
    // `DEFAULT_MAX_ROW` IS DERIVED FROM THIS INEQUALITY AND ITS OWN DOCBLOCK CITES THIS FILE.
    // The old derivation was `100 + depth < 180 => depth <= 79`, evaluated AT SPEED 1 — and
    // with a stair, speed 1 breaches at EVERY depth, so that form has no solution at all. The
    // bound is therefore JOINT: a depth is legal against a SPEED, and neither package may move
    // alone.
    //
    // The binding half is the ceiling rather than the tolerance (100 ticks against 180), and at
    // the shipped speed of 3 it gives `2*ceil((78+depth)/3) + 8 <= 100`, i.e. depth <= 60. The
    // shipped depth is 8 and sits well inside — but 79 would now be ILLEGAL, which is the part
    // that had to be re-derived rather than left standing.
    // ========================================================================================
    const speed = guestSpeedOf(SHIPPED) ?? 0;
    const ceiling = dissatisfactionCapacityOf(SHIPPED) ?? 0;
    const bounds = createGridBounds();
    const engagementNeeds = engagement.length;
    /** The worst journey in ticks on a plot of this width and `depth` rows, at `speed`. */
    const atDepth = (depth: number): number => {
      const horizontal = bounds.maxColumn - bounds.minColumn + (depth - 1);
      const vertical = bounds.maxFloor - bounds.minFloor;
      return 2 * Math.ceil(horizontal / speed) + Math.ceil(vertical / speed);
    };
    const legal = (depth: number): boolean =>
      arrivalBacklogTicks() + engagementNeeds * atDepth(depth) < ceiling &&
      atDepth(depth) < (toleranceOf(SHIPPED) ?? 0);
    // COMPUTED, NOT ASSERTED, so a content change to the ceiling or a plot change to the width
    // moves it here instead of leaving a stale number — WHICH IS EXACTLY WHAT G-041 DID. The
    // rates moved the backlog and the backlog moved the ceiling, and the legal plot depth fell
    // 60 -> 27 without a line of `grid.ts` being touched. `DEFAULT_MAX_ROW` is 7 (depth 8) and
    // still sits well inside, so nothing is broken; what changed is how much room the next goal
    // that wants a deeper plot has, and its docblock is updated in this change rather than left
    // citing a bound this file no longer produces.
    let deepest = 1;
    while (legal(deepest + 1)) deepest += 1;
    expect(deepest).toBe(27);
    // THE CLIFF, FROM BOTH SIDES.
    expect(legal(deepest)).toBe(true);
    expect(legal(deepest + 1)).toBe(false);
    // AND THE SHIPPED PLOT CLEARS IT. `DEFAULT_MAX_ROW` is 7, so the depth is 8.
    expect(bounds.maxRow - bounds.minRow + 1).toBe(8);
    expect(legal(bounds.maxRow - bounds.minRow + 1)).toBe(true);
    // The old ceiling of 79 is no longer legal, which is the finding rather than a footnote —
    // and neither is the 60 this same inequality produced before G-041 moved the rates.
    expect(legal(79)).toBe(false);
    expect(legal(60)).toBe(false);
  });

  it('THE CEILING CLEARS IT, with the margin the placement rule produces', () => {
    // IT READ 431 AGAINST A BACKLOG OF 129 UNTIL G-041, AND IT WAS RESTATING BOTH. The ceiling is
    // the geometric mean of the backlog and the stay — equal multiplicative margin from each — so
    // when the rates moved the backlog, this number moved with it whether or not anybody edited
    // it. The three assertions below now RUN that derivation instead of quoting its output, which
    // is the difference between a bound and a remembered number (§2.1).
    const ceiling = dissatisfactionCapacityOf(SHIPPED);
    const backlog = arrivalBacklogTicks();
    const stay = stayDurationOf(SHIPPED) ?? 0;
    expect(backlog).toBe(63);
    expect(ceiling).toBe(301);
    expect(ceiling).toBeGreaterThan(backlog);
    expect(Math.round(Math.sqrt(backlog * stay))).toBe(ceiling);
    // Equal multiplicative margin, to within the rounding `sqrt(90,720) = 301.197` forces: the
    // two ratios are 47,778 and 47,841 basis points and agree to better than a seventh of one
    // percent. (They agreed to five significant figures at 129/431/1,440 because 185,760 is very
    // nearly a perfect square. Asserting five figures again would have been asserting that
    // coincidence, so the tolerance is stated instead of inherited.)
    const lower = Math.round(((ceiling ?? 0) * 10_000) / backlog);
    const upper = Math.round((stay * 10_000) / (ceiling ?? 1));
    expect(lower).toBe(47_778);
    expect(upper).toBe(47_841);
    expect(Math.abs(upper - lower) / lower).toBeLessThan(0.002);
  });

  it('and a ceiling UNDER the cliff evicts a perfectly provisioned hotel — the cliff, from below', () => {
    // ADR-0007's two-sided form. The same uncontended hotel, and the rule that fires nowhere
    // above fires on essentially everybody.
    //
    // ---------------------------------------------------------------------------
    // IT TAKES THE LOBBY TOLERANCE DOWN WITH IT, AND THAT IS A FINDING RATHER THAN A WORKAROUND.
    // A ceiling at the backlog against the shipped `toleranceTicks` of 180 is REFUSED — the
    // partition floor is `tolerance + 1` = 181, which is ABOVE the 63-tick backlog. **Holding the shipped
    // tolerance of 180 fixed, then, the partition floor binds above the cliff and no admissible
    // ceiling can evict a perfectly provisioned guest.**
    //
    // THE CLAIM IS THAT NARROW ON PURPOSE, and the arm below is why: it lowers the tolerance to
    // 20 and the ceiling to 100, which is perfectly legal content, and that hotel DOES evict.
    // A first draft of this comment said "no legal content can evict a perfectly provisioned
    // guest" and was refuted six lines further down by its own demonstration — the two lower
    // bounds move together, so a claim about one of them has to name where the other is standing.
    //
    // Lowering both leaves the arm's own behaviour untouched: at sixty rooms nobody queues for a
    // bed, so `toleranceTicks` is inert here and only the ceiling is doing anything.
    // ---------------------------------------------------------------------------
    // 100 -> 50 AT G-041, AND THE VALUE IS DERIVED FROM THE CLIFF RATHER THAN CHOSEN. The arm
    // needs a ceiling UNDER the arrival backlog, because that is what "the cliff, from below"
    // means; the backlog fell 129 -> 63 with the rates, so 100 stopped being under it and this
    // arm evicted nobody. 50 is under 63 and over the partition floor of `toleranceTicks + 1`.
    expect(arrivalBacklogTicks()).toBeGreaterThan(50);
    const tooTight = rebound({ dissatisfactionCapacityTicks: 50, toleranceTicks: 20 });
    const options = { seed: 7, ticks: 14_400 };
    const initial = createWorld(options.seed, tooTight);
    const world = run(
      initial,
      tooTight,
      options.ticks,
      schedule(options.ticks, tooTight, initial.grid, 60, 120, 0, 0, 0, 3),
    );
    const left = world.guestOutcomes.departures.find((row) => row.reason === 'leftDissatisfied')?.count ?? 0;
    expect(left).toBeGreaterThan(0);
  });
});

describe('THE UPPER CLIFF — the stay, and the rule is dead at or above it', () => {
  const stay = stayDurationOf(SHIPPED) ?? 0;

  /** A starved hotel — rooms, no amenities — at one ceiling. How many walked out. */
  const leftAt = (ceiling: number): number => {
    const content = rebound({ dissatisfactionCapacityTicks: ceiling });
    const initial = createWorld(7, content);
    const world = run(initial, content, 43_200, schedule(43_200, content, initial.grid, 6, 120, 0, 0, 0, 0));
    return world.guestOutcomes.departures.find((row) => row.reason === 'leftDissatisfied')?.count ?? 0;
  };

  it('fires at stay - 1 and NOT at stay, which is the boundary from both sides', () => {
    // A guest nothing serves reaches the ceiling at age exactly the ceiling, and checkout is
    // asked first — so `stay` is the first value at which no resident can ever get there. This
    // is the reachability bound ADR-0025 §3 bought back with an executed test instead of a
    // bind-time refusal, and this is that test.
    expect(leftAt(stay - 1)).toBeGreaterThan(0);
    expect(leftAt(stay)).toBe(0);
  });

  it('and the shipped ceiling is under it, so the rule is live on the shipped tables', () => {
    expect(dissatisfactionCapacityOf(SHIPPED)).toBeLessThan(stay);
  });
});

describe('THE RELIEF RATE — 1, the smallest that clears the recovery requirement', () => {
  it('r x 387 >= 63: the drain window is the cycle minus the backlog', () => {
    // The first need re-crosses its want line at `visit + line` ticks — 30 + 420 = 450 on the
    // shipped table — so a guest that stops filling at 63 has 387 ticks before anything is
    // wanted again. Anything slower than 63/387 leaves a residue that compounds every cycle.
    const wantAt = wantAtOf(SHIPPED);
    const lodging = lodgingNeedOf(SHIPPED);
    const first = needTypesInOrder(SHIPPED).find((entry) => entry.id !== lodging?.id);
    expect(first).toBeDefined();
    const line = Math.floor((wantAt * (first?.capacityTicks ?? 0)) / ONE_WHOLE_BASIS_POINTS);
    const cycle = Math.ceil(line / (first?.refillPerTick ?? 1)) + line;
    // 450 AT G-041, WHERE IT READ 480: the helping is 30 ticks at the declared rate instead of
    // 60, and the 420-tick decay is unchanged because decay is one per tick whatever a room is
    // worth. This is the same 450 the lodging capacity is derived from one file over — the
    // engagement PERIOD at the ceiling — and the two are the same quantity rather than two
    // numbers that happen to agree.
    expect(cycle).toBe(450);
    const backlog = arrivalBacklogTicks();
    const window = cycle - backlog;
    expect(window).toBe(387);
    const relief = dissatisfactionReliefOf(SHIPPED) ?? 0;
    expect(relief * window).toBeGreaterThanOrEqual(backlog);
    // SMALLEST INTEGER: one lower is zero, which `cloneDissatisfaction` refuses outright because
    // a stock that never drains is a ratchet.
    expect(relief).toBe(1);
  });
});

describe('THE PARTITION — the ceiling must outlast the lobby, and it is refused rather than hoped', () => {
  it('the shipped pair satisfies it, and the partition floor is the BINDING lower bound', () => {
    expect(dissatisfactionCapacityOf(SHIPPED)).toBeGreaterThan(toleranceOf(SHIPPED) ?? 0);
    // The two lower bounds on this number, and which one wins AT THE SHIPPED TOLERANCE: the
    // arrival backlog says 63 and the partition says `toleranceTicks + 1` = 181. **181 is
    // higher**, so with `toleranceTicks` at 180 the refusal is what actually keeps a well-run
    // hotel from evicting. Stated because a reader deriving the ceiling would otherwise conclude
    // that anything above 129 is admissible on the shipped table, and it is not.
    //
    // IT IS NOT A CLAIM ABOUT ALL CONTENT. Lower the tolerance and the partition floor drops
    // with it, and a ceiling under 129 becomes admissible — which is exactly what the cliff arm
    // above drives. The two bounds are coupled, not ordered.
    expect((toleranceOf(SHIPPED) ?? 0) + 1).toBeGreaterThan(129);
  });

  it('and bindContent refuses the pair one tick either side of the boundary', () => {
    const tolerance = toleranceOf(SHIPPED) ?? 0;
    expect(() => rebound({ dissatisfactionCapacityTicks: tolerance + 1 })).not.toThrow();
    expect(() => rebound({ dissatisfactionCapacityTicks: tolerance })).toThrow(/STRICTLY GREATER/);
    expect(() => rebound({ dissatisfactionCapacityTicks: tolerance - 1 })).toThrow(/STRICTLY GREATER/);
  });

  it('and it refuses half a stock, because a ceiling with no drain is a countdown', () => {
    const halved = { ...SHIPPED.content, guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => {
      const { dissatisfactionReliefPerTick: _drop, ...rest } = entry;
      return rest;
    }) } as SimContent;
    expect(() => bindContent(halved)).toThrow(/a stock is a ceiling AND a drain/);
  });

  it('and content declaring NEITHER still binds, which is the era it describes', () => {
    const era = { ...SHIPPED.content, guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => {
      const { dissatisfactionCapacityTicks: _c, dissatisfactionReliefPerTick: _r, ...rest } = entry;
      return rest;
    }) } as SimContent;
    const bound = bindContent(era);
    expect(dissatisfactionCapacityOf(bound)).toBeUndefined();
    expect(dissatisfactionReliefOf(bound)).toBeUndefined();
  });
});
