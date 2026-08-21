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
  for (let i = 0; i < options.ticks; i += 1) {
    world = stepTick(world, content, (byTick.get(world.tick) ?? []) as never);
    for (const guest of guestsInOrder(world.guests)) {
      if (guest.dissatisfaction > peak) peak = guest.dissatisfaction;
    }
  }
  return peak;
};

describe('THE LOWER CLIFF — 129, derived and then measured on the shipped tables', () => {
  const lodging = lodgingNeedOf(SHIPPED);
  const engagement = needTypesInOrder(SHIPPED).filter((entry) => entry.id !== lodging?.id);

  it('the arrival backlog fills for 60 + 69 = 129 ticks, computed from the need table', () => {
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
    expect(visits).toEqual([60, 69, 79]);
    expect(elapsed).toBe(208);
    // AND THE LAST VISIT FILLS NOTHING, WHICH IS THE AMENDMENT AS ARITHMETIC. While the third
    // need is being served the other two are back below their want lines, and the lodging need
    // is EXCUSED because the guest chose to be out (ADR-0026 as amended) — so the stock stops
    // climbing 79 ticks before the chase ends. The fill is the chase MINUS its last leg.
    const fill = elapsed - (visits[visits.length - 1] ?? 0);
    expect(fill).toBe(129);
    expect(lodging).toBeDefined();
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
    const bounds = createGridBounds();
    const worstJourney =
      bounds.maxFloor - bounds.minFloor + (bounds.maxColumn - bounds.minColumn) + (bounds.maxRow - bounds.minRow);
    const speed = guestSpeedOf(SHIPPED);
    // A leg per engagement need chased, at most the worst journey the plot permits. `speed`
    // undefined is the historical no-travel content and costs nothing, which keeps this
    // expression correct for the era `absence` describes rather than special-cased for it.
    const legs = speed === undefined ? 0 : engagement.length * Math.ceil(worstJourney / speed);
    expect(worstJourney).toBe(108);
    expect(legs).toBe(108);

    const uncontended = peakOver(SHIPPED, 10, 60, 3);
    expect(uncontended).toBeGreaterThanOrEqual(129);
    expect(uncontended).toBeLessThanOrEqual(129 + legs);
    // PINNED AS WELL AS BOUNDED. The bound above is worst-case over the whole plot and the
    // seeded hotel is nowhere near it, so on its own it would admit a 98-tick regression
    // without a murmur. The literal is what keeps this arm sharp; the bound is what keeps it
    // honest about which half is derived.
    expect(uncontended).toBe(139);
    expect(peakOver(SHIPPED, 10, 6, 5)).toBe(179);
  });

  it('THE SPEED FLOOR THE CEILING IMPLIES IS 2, AND THE SHIPPED DIAL CLEARS IT', () => {
    // ========================================================================================
    // A SECOND FLOOR UNDER `guestCellsPerTick`, PRODUCED BY THIS GOAL AND BINDING ABOVE THE
    // ONE THE SCHEMA ALREADY CARRIED.
    //
    // `guestCellsPerTickSchema` derives its floor from `toleranceTicks`: a journey must not be
    // able to exhaust a guest's patience on its own, which at 108 cells against 180 ticks
    // clears at any speed of 1 or more. **The ceiling gives a tighter one.** The requirement
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
    const bounds = createGridBounds();
    const worstJourney =
      bounds.maxFloor - bounds.minFloor + (bounds.maxColumn - bounds.minColumn) + (bounds.maxRow - bounds.minRow);
    const ceiling = dissatisfactionCapacityOf(SHIPPED) ?? 0;
    const reachableAt = (speed: number): number => 129 + engagement.length * Math.ceil(worstJourney / speed);
    // THE CLIFF, FROM BOTH SIDES — ADR-0007's two-sided form, over the dial rather than over
    // the ceiling.
    expect(reachableAt(1)).toBeGreaterThan(ceiling);
    expect(reachableAt(2)).toBeLessThan(ceiling);
    // SMALLEST ADMISSIBLE SPEED, computed rather than asserted, so a content change to the
    // ceiling or a plot change to the depth moves it here instead of leaving a stale 2.
    let floor = 1;
    while (reachableAt(floor) > ceiling) floor += 1;
    expect(floor).toBe(2);
    expect(guestSpeedOf(SHIPPED) ?? 0).toBeGreaterThanOrEqual(floor);
    // AND THE UPPER ENDPOINT, WHICH IS WHERE THE DIAL STOPS DOING ANYTHING: `stepTowards`
    // clamps at the destination, so at the worst journey's own length every journey on this
    // plot costs one tick and every larger value is the identical world. The shipped value
    // sits inside [floor, worstJourney] and is a preference there (ADR-0013 §4).
    expect(guestSpeedOf(SHIPPED) ?? 0).toBeLessThanOrEqual(worstJourney);
    expect(guestSpeedOf(SHIPPED)).toBe(3);
  });

  it('THE CEILING CLEARS IT, with the margin the placement rule produces', () => {
    const ceiling = dissatisfactionCapacityOf(SHIPPED);
    expect(ceiling).toBe(431);
    expect(ceiling).toBeGreaterThan(129);
    // Equal multiplicative margin: the two ratios agree to five significant figures, which is
    // the property being bought and the reason 431 rather than any other number between them.
    expect(Math.round(((ceiling ?? 0) * 10_000) / 129)).toBe(33_411);
    expect(Math.round(((stayDurationOf(SHIPPED) ?? 0) * 10_000) / (ceiling ?? 1))).toBe(33_411);
    expect(Math.round(Math.sqrt(129 * (stayDurationOf(SHIPPED) ?? 0)))).toBe(431);
  });

  it('and a ceiling UNDER the cliff evicts a perfectly provisioned hotel — the cliff, from below', () => {
    // ADR-0007's two-sided form. The same uncontended hotel, and the rule that fires nowhere
    // above fires on essentially everybody.
    //
    // ---------------------------------------------------------------------------
    // IT TAKES THE LOBBY TOLERANCE DOWN WITH IT, AND THAT IS A FINDING RATHER THAN A WORKAROUND.
    // A ceiling of 129 against the shipped `toleranceTicks` of 180 is REFUSED — the partition
    // floor is `tolerance + 1` = 181, which is ABOVE the 129-tick backlog. **Holding the shipped
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
    const tooTight = rebound({ dissatisfactionCapacityTicks: 100, toleranceTicks: 20 });
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
  it('r x 351 >= 129: the drain window is the cycle minus the backlog', () => {
    // The first need re-crosses its want line at `visit + line` ticks — 60 + 420 = 480 on the
    // shipped table — so a guest that stops filling at 129 has 351 ticks before anything is
    // wanted again. Anything slower than 129/351 leaves a residue that compounds every cycle.
    const wantAt = wantAtOf(SHIPPED);
    const lodging = lodgingNeedOf(SHIPPED);
    const first = needTypesInOrder(SHIPPED).find((entry) => entry.id !== lodging?.id);
    expect(first).toBeDefined();
    const line = Math.floor((wantAt * (first?.capacityTicks ?? 0)) / ONE_WHOLE_BASIS_POINTS);
    const cycle = Math.ceil(line / (first?.refillPerTick ?? 1)) + line;
    expect(cycle).toBe(480);
    const window = cycle - 129;
    expect(window).toBe(351);
    const relief = dissatisfactionReliefOf(SHIPPED) ?? 0;
    expect(relief * window).toBeGreaterThanOrEqual(129);
    // SMALLEST INTEGER: one lower is zero, which `cloneDissatisfaction` refuses outright because
    // a stock that never drains is a ratchet.
    expect(relief).toBe(1);
  });
});

describe('THE PARTITION — the ceiling must outlast the lobby, and it is refused rather than hoped', () => {
  it('the shipped pair satisfies it, and the partition floor is the BINDING lower bound', () => {
    expect(dissatisfactionCapacityOf(SHIPPED)).toBeGreaterThan(toleranceOf(SHIPPED) ?? 0);
    // The two lower bounds on this number, and which one wins AT THE SHIPPED TOLERANCE: the
    // arrival backlog says 129 and the partition says `toleranceTicks + 1` = 181. **181 is
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
