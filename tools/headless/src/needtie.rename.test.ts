// G-054 — ADR-0078's INSTRUMENT, TURNED INTO A REGRESSION TEST.
//
//   pnpm exec vitest run needtie
//
// ============================================================================
//  WHAT THIS MEASURES, AND WHY IT IS THE ONLY HONEST FORM OF THE CLAIM
//
//  ADR-0078 asked whether the need a guest starves is decided by anything a designer meant,
//  and answered it by RENAMING the three engagement needs and changing nothing else. A rename
//  is behaviourally inert by construction — `createRng` is seeded from `--seed` alone and
//  `World.contentHash` is a load-time guard rather than an input to anything — so no draw, no
//  entity id, no cell and no fit moves, which makes any difference in the OUTPUT attributable
//  to the ids and to nothing else. It came back:
//
//      | span over amenities 3/4/6 | pos0        | pos1        | pos2        | worst/best |
//      | ------------------------- | ----------- | ----------- | ----------- | ---------- |
//      | BEFORE G-054              | 126-254 bp  | 337-445 bp  | 569-613 bp  | 4.87x      |
//      | AFTER  G-054              | 373-429 bp  | 365-416 bp  | 394-435 bp  | 1.19x      |
//
//  Three disjoint bands ordered by alphabetical position became three bands lying on top of
//  each other. Read by NEED instead of by position, which is the goal's own sentence — the
//  span of one need's own figure across the three namings:
//
//      | across the three namings  | comfort     | entertainment | nourishment |
//      | ------------------------- | ----------- | ------------- | ----------- |
//      | BEFORE G-054              | 179-586 bp  | 126-606 bp    | 181-613 bp  |
//      | AFTER  G-054              | 378-435 bp  | 365-414 bp    | 380-421 bp  |
//
//  `guest_nourishment` — which has TWICE the supply of the other two, a café and a vending
//  machine — read 181 bp when its id sorted first and 613 bp when it sorted last. **The same
//  need, the same supply, the same guests: 3.39x, purely from being renamed. It is 1.11x now.**
//
//  FIVE SLOTS FOR EVERY NUMBER ABOVE: what = `unservedTicks / instanceTicks` in basis points
//  per need row · workload = 12 rooms, one arrival per 120 ticks, seed 7, 20 simulated days,
//  amenity rungs 3/4/6, three namings · sample count = EXACT DETERMINISTIC INTEGERS, so no
//  repeats and no aggregation over runs · aggregated how = min and max over the nine
//  (naming x rung) readings in each cell · regime = NONE, because a deterministic integer has
//  no regime.
//
//  THE TWO ARMS ARE PAIRED AND INTERLEAVED IN ONE SITTING, and the BEFORE arm is this tree
//  with `pressure < bestPressure` mutated back to `pressure <= bestPressure` — one character,
//  which is exactly the whole of the defect. Restored under ADR-0022's recipe and the file's
//  sha256 compared before and after. The BEFORE arm also turns all five behavioural assertions
//  in this file and `utility.needtie.test.ts` RED, so the bite is measured and not assumed.
//
//  WHAT THE ASSERTIONS ARE, AND WHAT THEY ARE NOT. They are NOT "the figures are equal". A
//  per-guest tie-break gives each need about a third of the guests that were tied, and "about"
//  is a distribution, so a naming still moves an individual reading by a few percent. What is
//  asserted is that a reading no longer TRACKS POSITION — the bands overlap, the worst-served
//  position is not always the same one, and a need's own figure survives being renamed.
//  **If this file goes red, do not adjust a bound: the question it answers is whether a
//  spelling decides who starves.**
//
//  AND IT DOES NOT ASSERT SYMMETRY. ADR-0079 rules the needs asymmetrical BY DESIGN, because
//  different things satisfy them. Nothing here says the three rows should read alike under one
//  naming; it says ONE ROW should read alike under three namings.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent, createWorld, needOutcomeOf, needTypesInOrder, ONE_WHOLE_BASIS_POINTS, run } from '@hotelsim/sim';
import type { BoundContent, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const SHIPPED = loadContent();
const SEED = 7;
const ROOMS = 12;
/**
 * ONE ARRIVAL PER 120 TICKS, AND IT IS DELIBERATELY NOT `workload.ARRIVAL_EVERY_TICKS`.
 *
 * That constant is 96 and it is the BENCH's cadence, pinned to the occupancy `check:tickcost`
 * was calibrated at. This file measures a hotel a player would recognise — 12 rooms fed at the
 * ladder cadence ADR-0078 used and `unserved.report.test.ts` already runs at — and tying the
 * two together would mean a tick-cost recalibration silently re-took this experiment. The
 * census in `workload.concurrency.test.ts` scans for the NAME, so the name is not reused
 * either: this is a different quantity and it says so.
 */
const ARRIVALS_EVERY = 120;
const DAYS = 20;
const TICKS_PER_DAY = 1_440;
const RUNGS = [3, 4, 6] as const;

/**
 * The prefixes that decide alphabetical order, applied to the SHIPPED ids rather than
 * replacing them. Two things fall out of that: no need id is typed in this file, so the
 * rename follows a content rename instead of going stale against one; and each arm's ids
 * differ from the shipped ones by exactly two leading characters, which keeps the "changed
 * nothing else" claim visible in the strings themselves.
 */
const PREFIXES = ['a_', 'm_', 'z_'] as const;

const ENGAGEMENT = needTypesInOrder(SHIPPED)
  .filter((needType) => needType.role !== 'lodging')
  .map((needType) => needType.id);

/** Rewrites every occurrence of a need id, in every table a need id can appear in. */
function renamedContent(shift: number): { readonly content: BoundContent; readonly slotOf: ReadonlyMap<string, string> } {
  const slotOf = new Map<string, string>();
  ENGAGEMENT.forEach((id, index) => slotOf.set(id, `${PREFIXES[(index + shift) % PREFIXES.length]}${id}`));
  const rename = (id: string): string => slotOf.get(id) ?? id;
  const source = SHIPPED.content;
  const next: SimContent = {
    ...source,
    needTypes: (source.needTypes ?? []).map((needType) => ({ ...needType, id: rename(needType.id) })),
    roomTypes: source.roomTypes.map((roomType) => ({ ...roomType, provides: (roomType.provides ?? []).map(rename) })),
    itemTypes: (source.itemTypes ?? []).map((itemType) => ({
      ...itemType,
      provides: (itemType.provides ?? []).map(rename),
    })),
  };
  return { content: bindContent(next), slotOf };
}

type Reading = {
  readonly shift: number;
  readonly amenities: number;
  /** The need's index in ascending content-id order among the engagement needs. */
  readonly position: number;
  /** The id this need carries in the SHIPPED table — the thing a rename must not move. */
  readonly original: string;
  readonly unservedBp: number;
};

/** One hotel, one amenity rung, one naming: the unserved share of each engagement need. */
function readingsAt(shift: number, amenities: number): readonly Reading[] {
  const { content, slotOf } = renamedContent(shift);
  const ticks = DAYS * TICKS_PER_DAY;
  const world = createWorld(SEED, content);
  const commands = schedule(ticks, content, world.grid, ROOMS, ARRIVALS_EVERY, 0, 0, 0, amenities);
  const after = run(world, content, ticks, commands);
  const inOrder = needTypesInOrder(content).filter((needType) => needType.role !== 'lodging');
  return inOrder.map((needType, position) => {
    const row = needOutcomeOf(after.needOutcomes, needType.id);
    const instanceTicks = row?.instanceTicks ?? 0;
    // A rung where nobody stayed measures nothing and would satisfy every assertion below by
    // reading zero everywhere. Refused loudly rather than reported as a flat spread.
    if (instanceTicks <= 0) throw new Error(`${needType.id} has no guest-ticks at ${amenities} amenities`);
    const original = [...slotOf.entries()].find((entry) => entry[1] === needType.id)?.[0];
    if (original === undefined) throw new Error(`${needType.id} is not a renamed engagement need`);
    return {
      shift,
      amenities,
      position,
      original,
      unservedBp: Math.floor(((row?.unservedTicks ?? 0) * ONE_WHOLE_BASIS_POINTS) / instanceTicks),
    };
  });
}

const ALL: readonly Reading[] = RUNGS.flatMap((amenities) => [0, 1, 2].flatMap((shift) => readingsAt(shift, amenities)));

const spanOf = (readings: readonly Reading[]): readonly [number, number] => [
  Math.min(...readings.map((reading) => reading.unservedBp)),
  Math.max(...readings.map((reading) => reading.unservedBp)),
];

describe('which need starves is not decided by the spelling of its id (ADR-0078, G-054)', () => {
  it('has three engagement needs to permute, or it is measuring nothing', () => {
    // The instrument is a rotation over the engagement needs. With fewer than two of them
    // there is no tie to break and every assertion below is vacuously true.
    expect(ENGAGEMENT.length).toBe(PREFIXES.length);
    expect(ALL).toHaveLength(RUNGS.length * PREFIXES.length * ENGAGEMENT.length);
  });

  it('no longer orders the three ALPHABETICAL POSITIONS — the bands overlap', () => {
    // BEFORE: pos0 126-254, pos1 337-445, pos2 569-613. Three bands with daylight between them,
    // in position order, at every one of the nine cells. THE ASSERTION IS THE OVERLAP rather
    // than a tolerance: if position still decided, the bands would separate again, and nobody
    // has to choose a threshold for that to be visible.
    const bands = [0, 1, 2].map((position) => spanOf(ALL.filter((reading) => reading.position === position)));
    for (const [lower, upper] of bands) {
      for (const [otherLower, otherUpper] of bands) {
        expect(lower, `${lower}-${upper} against ${otherLower}-${otherUpper}`).toBeLessThanOrEqual(otherUpper);
        expect(upper, `${lower}-${upper} against ${otherLower}-${otherUpper}`).toBeGreaterThanOrEqual(otherLower);
      }
    }
  });

  it('does not order them WEAKLY either — the worst-served position is not always the same', () => {
    // Overlapping bands are necessary and not sufficient: three bands can overlap and still put
    // the same position last in all nine cells. Before G-054 the worst-served position was
    // position 2, nine times out of nine.
    const worst = new Set<number>();
    for (const rung of RUNGS) {
      for (const shift of [0, 1, 2]) {
        const cell = ALL.filter((reading) => reading.amenities === rung && reading.shift === shift);
        worst.add(cell.reduce((a, b) => (b.unservedBp > a.unservedBp ? b : a)).position);
      }
    }
    expect(worst.size, `the worst-served position was always ${[...worst].join('/')}`).toBeGreaterThan(1);
  });

  it('leaves each NEED reading the same whatever it is called — the goal, in one assertion', () => {
    // `guest_nourishment` read 181 / 337 / 613 across the three namings: 3.39x for a
    // need whose supply never changed. THE RATIO IS THE FINDING; the absolutes are workload
    // figures, quoted with their five slots in this file's header.
    //
    // THE BOUND IS 1.5x AND IT IS DERIVED RATHER THAN OBSERVED. A per-guest tie-break hands
    // each need about a third of the guests that were tied, and "about" is a distribution, so
    // exact equality is not the property. What must be excluded is a SYSTEMATIC advantage, and
    // the smallest one a positional rule can still produce is 2x — the 50/25/25 split a
    // rotation over the whole need vector leaves behind, because the vector carries a lodging
    // need the walk skips (see `needTieBreakRank`). 1.5x lies between the noise and the
    // smallest defect, which is what makes it a bound and not a tuning.
    for (const rung of RUNGS) {
      for (const original of ENGAGEMENT) {
        const acrossNamings = ALL.filter((reading) => reading.original === original && reading.amenities === rung);
        expect(acrossNamings, original).toHaveLength(PREFIXES.length);
        const [lower, upper] = spanOf(acrossNamings);
        expect(upper, `${original} at ${rung} amenities spans ${lower}-${upper}`).toBeLessThan(lower * 1.5);
      }
    }
  });
});
