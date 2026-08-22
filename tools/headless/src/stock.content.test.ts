// G-027b — EVERY NUMBER THE STOCK MODEL READS, ENUMERATED FROM THE SCHEMA AND EACH ONE EXERCISED.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// A CENSUS, NOT A FORMULA. The goal block said `2 x needTypes + 2`; the true count was
// `2 x needTypes + 4` = TWELVE at θ-a, because the model also reads `abandonMarginBasisPoints`
// (whose derivation R1 re-opens, so it cannot be excluded as pre-existing) and
// `stayDurationTicks`. θ-b1 took it to fourteen and θ-b2 to fifteen.
// A formula that happens to equal the right answer is not a census — so the list is REFLECTED
// out of the parsed schemas and asserted set-equal to the names below, and a numeric field
// added to either schema and not added here reddens by name.
//
// **THE COUNT LIVES IN ONE ASSERTION AND NOWHERE ELSE, AND THIS HEADER USED TO BREAK THAT.** It
// read "THE TWELVE NUMBERS" and gave the total as a bare `= TWELVE` — a figure θ-b1 moved to
// fourteen without touching this line, so the file's own title was two goals stale while every
// assertion in it was green. That is the row-count claim class θ-b2 enumerated (ADR-0027): a
// number duplicated across prose and predicate, where only the predicate is checked. The prose
// now names the ERAS, which do not go out of date, and the live total is the `it(...)` below.
//
// AND EVERY ONE OF THEM MUST MOVE THE SIMULATION. The second half is the exhaustion arm: run
// the shipped content, run it again with one number changed, and require the state hash to
// differ. A number in the census that no run can see is either not read or not load-bearing,
// and either way the census describes a hotel nobody is running.
//
// IT LIVES HERE RATHER THAN IN `packages/sim` FOR ONE REASON: the shipped numbers are BYTES ON
// DISK, and `packages/sim` may not read a file (I1). A copy of the table inside the sim's tests
// would be the duplicated constant this repo has paid for twice.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { guestRulesSchema, needTypeSchema } from '@hotelsim/content';
import {
  abandonMarginOf,
  bindContent,
  createWorld,
  formNeedVector,
  hashState,
  idleShareBasisPoints,
  lodgingNeedOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  run,
  declaredRefill,
  serviceFloorRefill,
  stayDurationOf,
  toleranceOf,
  wantAtOf,
} from '@hotelsim/sim';
import type { BoundContent, GuestRulesData, NeedTypeData, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { FOOD_COURT_CONTENT } from './fixtures/food-court.js';
import { marginBoundOver } from './fixtures/margin-bound.js';
import { schedule } from './report.js';

const SHIPPED = loadContent();

/** The numbers the stock model reads. THE LIST, and the thing the reflection is compared to. */
const PER_NEED_TYPE = ['capacityTicks', 'refillPerTick'] as const;
const PER_GUEST_RULES = [
  'wantAtBasisPoints',
  'toleranceTicks',
  'abandonMarginBasisPoints',
  'stayDurationTicks',
  // θ-b1. The census grew by two and its own title grew with it — which is the census working:
  // a criterion naming a COUNT can be satisfied while a number nobody counted is invented, and
  // this list is what stops that.
  'dissatisfactionCapacityTicks',
  'dissatisfactionReliefPerTick',
  // θ-b2. The census grew by one again, and this one is the first member that is UNREACHABLE IN
  // THE SHIPPED HOTEL: a visit duration ends the stay of a guest that books no room, and every
  // guest under shipped content books one. It is on the census rather than in `NOT_THE_MODELS`
  // because the stock model absolutely does read it — see the exhaustion arm, which gives it the
  // one hotel it is reachable in rather than excusing it.
  'visitDurationTicks',
] as const;


/**
 * Numeric fields the schemas declare that THE STOCK MODEL does not read, each with its owner.
 *
 * "THE STOCK MODEL", NOT "THE SIMULATION" — corrected at θ-b1 sweep 3, and the difference is the
 * whole of a defect. Both fields below ARE read, on every departure, by `reviews.ts`, and the
 * result lands in `world.reviewOutcomes`, which is hashed state. What they do not touch is the
 * thing this census is about: how a need decays, when a guest wants it, when a stay ends.
 *
 * The anti-vacuity arm at the bottom of this file asserts exactly that distinction rather than
 * the wider claim — the stock model's own state comes out byte-identical, and the review rows
 * move. Written the wider way it was false, and green only because of a fixed point in the
 * score arithmetic that the two arms it ran on happened to sit inside.
 */
const NOT_THE_MODELS: Record<string, string> = {
  reviewScoreMin: 'reviews (G-019) — read by `reviews.ts`, not by the stock model',
  reviewScoreMax: 'reviews (G-019) — read by `reviews.ts`, not by the stock model',
  // G-041. THE FIRST NEED-TYPE FIELD ON THIS LIST, and the reason it is here rather than on the
  // census is exact: `bindContent` reads it once, at LOAD, to ask its serviceability question at
  // the worst rate the content permits (`assertNeedDemandIsServiceable`). Nothing in a TICK reads
  // it. The thing that will — G-037a's room-quality fold, which turns it into the rate a guest in
  // a bare room actually experiences — is on a branch and is not this goal (ADR-0057).
  //
  // **SO THIS ENTRY IS AN OBLIGATION WITH AN EXPIRY DATE.** When the fold merges,
  // `serviceFloorBasisPoints` becomes a number the stock model reads on every tick, and it moves
  // to `PER_NEED_TYPE` with a mutation and an arm like every other census member. A goal that
  // lands the fold and leaves this line here has left the census describing the wrong hotel.
  serviceFloorBasisPoints:
    'bindContent (G-041, ADR-0054/0057) — read by the serviceability refusal at LOAD; the fold ' +
    'that makes it a rate the stock model reads is G-037a, and this entry expires when it merges',
};

const numericFieldsOf = (shape: Record<string, unknown>): readonly string[] =>
  Object.entries(shape)
    .filter(([, field]) => {
      const def = (field as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def;
      return def?.type === 'int' || def?.type === 'number' || def?.innerType?.def?.type === 'int';
    })
    .map(([name]) => name)
    .sort();

/** The shipped tables, rebound with one of them replaced. */
const rebound = (patch: Partial<SimContent>): BoundContent => bindContent({ ...SHIPPED.content, ...patch });

describe('THE CENSUS — reflected out of the schemas, not counted by hand', () => {
  // THE TWO SCHEMAS ARE ASKED THE SAME QUESTION SINCE G-041, and that is a unification rather
  // than a loosening. A need type used to be checked with `toEqual` and guest rules with
  // "census or named owner", and the difference was an accident of which schema grew a
  // non-model field first. `serviceFloorBasisPoints` is the second such field; the escape hatch
  // itself is pinned two tests down, so an entry cannot be added to it silently.
  const ownedBySomebody = (declared: readonly string[], census: readonly string[]): void => {
    for (const name of declared) {
      const owned = census.includes(name) || NOT_THE_MODELS[name] !== undefined;
      expect(owned, `${name} is declared on disk and belongs to nobody`).toBe(true);
    }
    for (const name of census) expect(declared).toContain(name);
  };

  it('every numeric field of a need type is either in the census or has a named owner', () => {
    ownedBySomebody(numericFieldsOf(needTypeSchema.shape as unknown as Record<string, unknown>), PER_NEED_TYPE);
  });

  it('every numeric field of guest rules is either in the census or has a named owner', () => {
    ownedBySomebody(numericFieldsOf(guestRulesSchema.shape as unknown as Record<string, unknown>), PER_GUEST_RULES);
  });

  it('AND THE ESCAPE HATCH IS PINNED, so a field cannot leave the census quietly', () => {
    // A list that anything may be added to is not an exemption list, it is a hole. Three names,
    // each with a stated owner above; a fourth is a decision somebody has to write down here.
    expect(Object.keys(NOT_THE_MODELS).sort()).toEqual(['reviewScoreMax', 'reviewScoreMin', 'serviceFloorBasisPoints']);
  });

  it('and the total is 2 x needTypes + 7 — FIFTEEN, where θ-b1 shipped fourteen and θ-a twelve', () => {
    expect(needTypesInOrder(SHIPPED).length).toBe(4);
    expect(PER_NEED_TYPE.length * needTypesInOrder(SHIPPED).length + PER_GUEST_RULES.length).toBe(15);
  });
});

describe('THE EXHAUSTION ARM — every number in the census moves the SIMULATION', () => {
  // ==========================================================================
  // IT HASHED `serialise(...)` UNTIL SWEEP 2, AND A SERIALISED WORLD CARRIES `contentHash`.
  //
  // That field is the BIND-TIME FINGERPRINT OF THE CONTENT, so it moves for any edit to any
  // content table whatsoever — and the arm was therefore green for every field on the census
  // whether the model read it or not. `ai-critic` measured it with the fingerprint masked:
  //
  //     dissatisfactionCapacityTicks: 181     raw differs  TRUE    sim differs  TRUE
  //     dissatisfactionCapacityTicks: 430     raw differs  TRUE    sim differs  false
  //     dissatisfactionReliefPerTick: 61      raw differs  TRUE    sim differs  FALSE
  //     reviewScoreMin: 0                     raw differs  TRUE    sim differs  false
  //
  // **`reviewScoreMin` is the field THIS FILE declares as one the model does not read, and it
  // passed. And `dissatisfactionReliefPerTick` — a census member this goal added — moved
  // nothing.** ADR-0007 exactly: a check that succeeds while inspecting nothing, guarding one of
  // the two numbers the goal exists to introduce.
  //
  // So the subject is `hashState` over the world with `contentHash` MASKED — the simulated
  // history and nothing about which document produced it — and the anti-vacuity arm below feeds
  // it a field the model provably does not read and requires it to come back UNMOVED.
  // ==========================================================================
  const simHash = (content: BoundContent, arm: Arm): string => {
    const world0 = createWorld(42, content);
    const commands = schedule(arm.ticks, content, world0.grid, arm.rooms, 120, 0, 0, 0, arm.amenities);
    // MASKED, NOT OMITTED: `hashState` over a world with the fingerprint blanked is still every
    // guest, every need, every counter and every transaction the run produced.
    return hashState({ ...run(world0, content, arm.ticks, commands), contentHash: '' });
  };

  type Arm = { readonly rooms: number; readonly amenities: number; readonly ticks: number };

  /**
   * The hotel a mutation is judged in, and why there is more than one.
   *
   * A NUMBER ONLY MOVES A RUN IN A HOTEL WHERE IT IS REACHABLE, and that is a fact about the
   * model rather than a weakness in the arm. `dissatisfactionReliefPerTick` is the drain on a
   * stock: in a three-room hotel with one of each amenity the guests are being let down almost
   * continuously, so the stock only ever RISES and the drain rate is never consulted. Measured —
   * it moves nothing there at any value. In a hotel that serves its guests it moves the run at
   * 2 and at 61.
   *
   * That is the honest report and it is better than one workload: it says WHERE each number
   * lives. Every other member bites in the default hotel.
   */
  const DEFAULT_ARM: Arm = { rooms: 3, amenities: 1, ticks: 2_000 };
  const SERVED_ARM: Arm = { rooms: 60, amenities: 3, ticks: 6_000 };
  /**
   * The hotel with NO BEDROOMS (θ-b2), and it is the third answer to "where does this number
   * live" rather than an exception to the question.
   *
   * `visitDurationTicks` ends the stay of a guest that books no room, and **every guest under
   * shipped content books one** — so it is unreachable in both arms above, at every value, by
   * construction rather than by tuning. That is not grounds for excusing it onto
   * `NOT_THE_MODELS`: the stock model reads it, hard, and the honest report is the one this file
   * already gives for `dissatisfactionReliefPerTick` — say WHERE the number lives and run it
   * there. `--rooms 0` because a food court has none, and `schedule` now refuses `--rooms N > 0`
   * over such content rather than quietly seeding nothing.
   */
  const VISITOR_ARM: Arm = { rooms: 0, amenities: 3, ticks: 2_000 };
  /**
   * THE DEFAULT HOTEL, RUN TWICE AS LONG — the fourth answer to "where does this number live",
   * and it is a WINDOW rather than a hotel (G-039b-alpha).
   *
   * `dissatisfactionCapacityTicks` bit in `DEFAULT_ARM` until the spine, and the layout change
   * pushed the first tick at which the ceiling BINDS past 2,000. Measured over this file's own
   * instrument, mutation value against arm length, `same`/`MOVED` on the state hash:
   *
   *     value       181   200   250   300   360   429
   *     3/1/2000    same  same  same  same  same  same
   *     3/1/4000    MOVED MOVED MOVED same  same  same
   *     3/1/6000    MOVED MOVED MOVED same  same  same
   *     60/3/6000   same  same  same  same  same  same
   *
   * So the field is REACHABLE in the default hotel and the arm's WINDOW was too short, which is
   * a different fact from `dissatisfactionReliefPerTick`'s (unreachable at any value in the
   * hotel that never serves anybody) and is recorded as a different fact. Doubling the window
   * is the smallest change that restores the bite, and 4,000 rather than 6,000 because the two
   * read identically and the shorter one costs less on `pnpm test`.
   *
   * IT IS NOT A WEAKENING: the mutation value is unchanged at 181 — still the tightest ceiling
   * `assertDissatisfactionOutlastsTheLobby` admits — and the arm still asks the same question
   * of the same hotel.
   */
  const DEEP_ARM: Arm = { rooms: 3, amenities: 1, ticks: 6_000 };
  /**
   * THE HOTEL WITH BEDS AND NOTHING TO DO (G-041) — the fifth answer to "where does this number
   * live", and the G-041 rates are what moved the answer here.
   *
   * `dissatisfactionCapacityTicks` is the ceiling on the let-down stock, so it only bites where
   * a guest is let down long enough to reach it. Re-derived rates serve a guest with a room FIVE
   * TIMES faster than the pre-G-041 table did at the declared rate, and in every hotel that has
   * an amenity at all the stock now stops short of the ceiling. Measured over this file's own
   * instrument — mutation value against arm, `same`/`MOVED` on the masked state hash:
   *
   *     value             181   200   250   300   360   429
   *     3/1/2000          same  same  same  same  same  same
   *     3/1/4000          same  same  same  same  same  same
   *     3/1/5000          same  same  same  same  same  same
   *     3/1/6000          same  same  same  same  same  same
   *     3/0/2000          MOVED MOVED MOVED MOVED MOVED MOVED
   *     3/0/4000          MOVED MOVED MOVED MOVED MOVED MOVED
   *
   * **IT IS A STRONGER ARM THAN THE ONE IT REPLACES, not a weaker one.** `DEEP_ARM` bit at 181,
   * 200 and 250 and went `same` from 300 up; this one bites at 429 — ONE BELOW THE SHIPPED
   * VALUE — so the arm now has resolution at the shipped number rather than only far from it.
   * And the hotel it names is the row `assertDissatisfactionOutlastsTheLobby` exists for: *"it
   * had a bed and nothing to do"* (ADR-0025 §2). The number finally lives where its own error
   * message says it does.
   */
  const STARVED_ARM: Arm = { rooms: 3, amenities: 0, ticks: 2_000 };
  const FOOD_COURT = bindContent(FOOD_COURT_CONTENT as unknown as SimContent);

  /**
   * WHICH ARM A NEED-TYPE FIELD IS JUDGED IN, where it is not the default one (G-041).
   *
   * Until G-041 every one of the eight need-type numbers bit in `DEFAULT_ARM`, so the per-need
   * loop below needed no override and had none. The re-derived rates took one away:
   * `night_rest.refillPerTick` rose 1 → 2, a nap fell 180 ticks → 45, and the mutation's effect
   * now washes out before the 2,000-tick horizon this arm hashes at. Measured, same instrument,
   * mutation value against arm:
   *
   *     value             4     6     20    72
   *     3/1/2000          same  same  same  same
   *     3/1/4000          same  same  same  same
   *     3/1/5000          MOVED MOVED MOVED MOVED
   *     3/1/6000          MOVED MOVED MOVED MOVED
   *     60/3/6000         MOVED MOVED MOVED MOVED
   *
   * **THE MUTATION IS UNCHANGED AT +70 AND THE HOTEL IS UNCHANGED**; only the window moved, and
   * it moved to the first length at which the field is visible with a margin rather than to the
   * first length that happened to be green — 5,000 and 6,000 read alike and 6,000 is the value
   * `DEEP_ARM` already carries, so this costs one arm rather than two. That is G-039b-alpha's
   * ruling applied a second time: a window too short to see a number is a fact about the arm.
   */
  const NEED_TYPE_ARM: Record<string, Arm> = { 'night_rest.refillPerTick': DEEP_ARM };

  /**
   * How each guest-rules field is mutated, in which hotel, and why — because a mutation chosen
   * to make a test pass is worth nothing.
   *
   * `abandonMarginBasisPoints` GOES TO ZERO rather than down by sixty. The blanket `-60` moved
   * nothing in any hotel measured: under a stock the incumbent's pressure FALLS while it is
   * served, so a 5,940-point gap is no easier to open than a 6,000-point one. Zero is the
   * value G-014b's own thrash control uses and it re-decides on every tie.
   *
   * `dissatisfactionCapacityTicks` GOES TO 181, one above the lobby tolerance — the tightest
   * ceiling `assertDissatisfactionOutlastsTheLobby` admits against the shipped `toleranceTicks`.
   * At 430 it moves nothing over two thousand ticks, which is what a number one below its
   * shipped value SHOULD do and is why the mutation is large rather than adjacent. **Its ARM
   * moved to `DEEP_ARM` at G-039b-alpha and its VALUE did not** — see `DEEP_ARM` for the
   * value-by-window table that says why.
   *
   * `dissatisfactionReliefPerTick` GOES UP, because 1 is the floor `cloneDissatisfaction`
   * admits: a stock that never drains is a ratchet.
   *
   * `visitDurationTicks` GOES TO 400 IN THE FOOD COURT, and the hotel, the direction and the
   * SIZE are each forced by something rather than chosen.
   *
   * THE HOTEL: no visitor exists in the other two arms, at any value.
   *
   * THE DIRECTION: `assertVisitCeilingIsInTheWindow` requires the ceiling strictly inside
   * `(visit - t_last, visit)`, so against the fixture's ceiling of 190 the duration cannot go to
   * or below 190 without the content refusing to bind. Downward is a 17-tick window; upward is
   * open.
   *
   * THE SIZE, AND THIS IS THE ARM'S OWN RESOLUTION RATHER THAN A FACT ABOUT THE FIELD. Measured
   * over this arm — 208 (shipped), 191, 207 and 300 all produce a BYTE-IDENTICAL world. Two
   * mechanisms quantise it, both of them correct:
   *
   *   THE DEFERRAL. A visitor is at a provider from age 129 to 208, so a clock expiring anywhere
   *   in [191, 207] is held until 208 — it leaves when it is next at liberty (ADR-0026 amended).
   *   The whole downward window sits inside one filling.
   *
   *   THE SNAPSHOT. This arm hashes one world at one tick, and arrivals are 120 ticks apart, so a
   *   change smaller than one arrival interval moves no guest across the boundary between
   *   "departed" and "still here". 300 - 208 = 92 < 120 and is invisible; **400 - 208 = 192 > 120
   *   and is not.**
   *
   * So the mutation is the smallest one that clears BOTH quantisers, and the numbers above are
   * why, rather than a value that happened to turn the arm green. Recording them is the point:
   * an arm whose resolution nobody has stated will one day be satisfied by a field it cannot see.
   */
  const GUEST_RULES_MUTATION: Record<
    string,
    { readonly to: number; readonly arm: Arm; readonly base?: BoundContent }
  > = {
    wantAtBasisPoints: { to: 2_940, arm: DEFAULT_ARM },
    toleranceTicks: { to: 120, arm: DEFAULT_ARM },
    abandonMarginBasisPoints: { to: 0, arm: DEFAULT_ARM },
    stayDurationTicks: { to: 1_380, arm: DEFAULT_ARM },
    dissatisfactionCapacityTicks: { to: 181, arm: STARVED_ARM },
    dissatisfactionReliefPerTick: { to: 61, arm: SERVED_ARM },
    visitDurationTicks: { to: 400, arm: VISITOR_ARM, base: FOOD_COURT },
  };

  it('a mutation to ANY of the fifteen produces a different SIMULATION', () => {
    const unmoved: string[] = [];
    const baseline = new Map<Arm, string>([
      [DEFAULT_ARM, simHash(SHIPPED, DEFAULT_ARM)],
      [SERVED_ARM, simHash(SHIPPED, SERVED_ARM)],
      [VISITOR_ARM, simHash(FOOD_COURT, VISITOR_ARM)],
      [DEEP_ARM, simHash(SHIPPED, DEEP_ARM)],
      [STARVED_ARM, simHash(SHIPPED, STARVED_ARM)],
    ]);
    for (const needType of needTypesInOrder(SHIPPED)) {
      for (const field of PER_NEED_TYPE) {
        const mutated = rebound({
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.id === needType.id ? ({ ...entry, [field]: entry[field] + 70 } as NeedTypeData) : entry,
          ),
        });
        const arm = NEED_TYPE_ARM[`${needType.id}.${field}`] ?? DEFAULT_ARM;
        if (simHash(mutated, arm) === baseline.get(arm)) unmoved.push(`${needType.id}.${field}`);
      }
    }
    for (const field of PER_GUEST_RULES) {
      const plan = GUEST_RULES_MUTATION[field];
      expect(plan, `${field} is on the census with no mutation planned`).toBeDefined();
      // THE BASE IS THE ARM'S OWN CONTENT, not always `SHIPPED` (θ-b2): a field only reachable in
      // a hotel with no bedrooms has to be mutated in the document that describes one.
      const base = plan!.base ?? SHIPPED;
      const mutated = bindContent({
        ...base.content,
        guestRules: (base.content.guestRules ?? []).map((entry) => ({ ...entry, [field]: plan!.to }) as GuestRulesData),
      });
      if (simHash(mutated, plan!.arm) === baseline.get(plan!.arm)) unmoved.push(`guestRules.${field}`);
    }
    expect(unmoved).toEqual([]);
  });

  it('AND A FIELD THE STOCK MODEL DOES NOT READ LEAVES THE STOCK MODEL UNTOUCHED', () => {
    // ========================================================================
    // THIS ARM WAS GREEN BY NUMERIC COINCIDENCE UNTIL SWEEP 3, AND ITS PREMISE WAS FALSE.
    //
    // It asserted that mutating `reviewScoreMin` moved nothing, on the ground that
    // `NOT_THE_MODELS` lists it as a field "the MODEL does not read". **The simulation reads it
    // on every departure** — `reviews.ts` maps a guest's met-need count onto the scale and folds
    // the result into `world.reviewOutcomes`, which is hashed state. The arm survived because
    // for a four-need vector `min + floor(k x bands / 4)` is a FIXED POINT at k of 2, 3 and 4
    // between (min 1, bands 5) and (min 0, bands 6) — and neither arm above produces a guest
    // that met one need or none. `ai-critic` found it and measured the arms that do.
    //
    // SO THE CLAIM IS RE-STATED AT THE WIDTH IT IS TRUE AT, and it is a sharper claim rather
    // than a weaker one: the field is unread BY THE STOCK MODEL, so the stock model's own state
    // — the guests, their needs, the outcome table and the ledger — comes out BYTE-IDENTICAL,
    // while the review rows move.
    //
    // ------------------------------------------------------------------------
    // AND THE NEED TALLY LEFT THAT LIST AT G-028b, WHICH IS A SECOND NARROWING OF THE SAME
    // CLAIM AND HAS TO BE SAID RATHER THAN QUIETLY DROPPED.
    //
    // ADR-0037 makes `met` the top per-need BAND, and the band count IS `max - min + 1`. So
    // `reviewScoreMin` now reaches `met` and `unmet` on every row: mutating it changes the UNIT
    // the tally counts in. The tick columns — `unservedTicks`, `instanceTicks`, `abandoned` —
    // are counted in ticks and stay identical, and THAT is what separates a change of unit from
    // the simulation behaving differently. `review.boundary.test.ts` carries the same narrowing
    // for the same reason, and both name the control.
    //
    // The fixed points the old table reported are gone with it: shifting `min` used to shift
    // every score by the same amount, so at some arms the rows coincided. Changing the band
    // count changes the QUANTISATION, so the distribution moves wherever the arm produces a
    // guest whose share sits near a band edge. The loop below no longer claims a fixed point
    // anywhere; it asserts the invariants that survive, and requires the third arm to move the
    // masked hash so the mask is still certified against a field that provably moves the world.
    // ------------------------------------------------------------------------
    //
    // AND THE THIRD ARM IS WHAT MAKES THIS AN ANTI-VACUITY CHECK AT ALL. A comparison that came
    // back "same" everywhere would be satisfied by a hash that had been blinded — which is the
    // very defect this arm exists to catch, one level up. The third arm requires the masked hash
    // to SEE the change, so the mask is certified against a field that provably moves the world.
    // ========================================================================
    const REVIEWED_ARM: Arm = { rooms: 3, amenities: 0, ticks: 2_000 };
    const withMinScore = (min: number): BoundContent =>
      rebound({
        guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => ({ ...entry, reviewScoreMin: min }) as GuestRulesData),
      });
    const ranOn = (content: BoundContent, arm: Arm) => {
      const world0 = createWorld(42, content);
      return run(world0, content, arm.ticks, schedule(arm.ticks, content, world0.grid, arm.rooms, 120, 0, 0, 0, arm.amenities));
    };
    const mutated = withMinScore(0);

    for (const arm of [DEFAULT_ARM, SERVED_ARM, REVIEWED_ARM]) {
      const base = ranOn(SHIPPED, arm);
      const other = ranOn(mutated, arm);
      // THE STOCK MODEL'S OWN STATE, named field by field rather than folded into a hash — so a
      // failure says WHICH part of the model turned out to read the review scale.
      expect(other.guestOutcomes, 'reviewScoreMin moved the outcome table').toEqual(base.guestOutcomes);
      expect(other.guests, 'reviewScoreMin moved a guest').toEqual(base.guests);
      expect(other.ledger, 'reviewScoreMin moved the ledger').toEqual(base.ledger);
      // THE NEED TALLY'S TICK COLUMNS, which are counted in ticks rather than in bands and so
      // cannot move with the scale. This is the control for the narrowing above: without it,
      // "the tally moved" would be indistinguishable from "the guests did something different".
      const tickColumns = (rows: typeof base.needOutcomes): unknown =>
        rows.map((row) => ({
          needId: row.needId,
          unservedTicks: row.unservedTicks,
          instanceTicks: row.instanceTicks,
          abandoned: row.abandoned,
          resolved: row.met + row.unmet,
        }));
      expect(tickColumns(other.needOutcomes), 'reviewScoreMin moved the tally in TICKS').toEqual(
        tickColumns(base.needOutcomes),
      );
      // ----------------------------------------------------------------------
      // AND EVERYTHING ELSE IN THE WORLD, WHICH THE FOUR NAMED FIELDS HAD SILENTLY STOPPED
      // COVERING (ADR-0027). This arm replaced a whole-world `simHash` equality; four fields
      // are sharper about WHICH part of the model moved, and they say nothing about the tick,
      // the rng, the grid, the entities, the build or loan outcomes — or `reviewOutcomes`,
      // which the comment table above claims a value for at two arms and nothing asserted.
      //
      // So the whole world is compared with exactly TWO fields excluded, each for a stated
      // reason: `contentHash`, because the two documents genuinely differ and that is the mask
      // this file exists to justify; and `reviewOutcomes`, because it is the one thing the
      // field is ALLOWED to move — and it is pinned separately, per arm, immediately below.
      const exceptReviews = (world: typeof base): unknown => ({
        ...world,
        contentHash: '',
        reviewOutcomes: [],
        // The two the scale is ALLOWED to reach, both excluded by name and both pinned above:
        // the review rows, and the tally's band-valued columns.
        needOutcomes: tickColumns(world.needOutcomes),
      });
      expect(exceptReviews(other), 'reviewScoreMin moved the world outside the review rows').toEqual(
        exceptReviews(base),
      );
      // AND THE REVIEW ROWS THEMSELVES MOVE AT THE ARM CHOSEN FOR IT. The fixed points the other
      // two arms used to rest on are gone (see the block above), so what is asserted here is the
      // half that makes this an anti-vacuity check: a comparison coming back "same" everywhere
      // would be satisfied by a hash that had been blinded, which is the defect this arm exists
      // to catch one level up.
      if (arm === REVIEWED_ARM) {
        expect(other.reviewOutcomes, 'the third arm must MOVE the review rows or it is vacuous').not.toEqual(
          base.reviewOutcomes,
        );
      }
    }

    // AND IT IS NOT INERT: at an arm where a guest meets one need or none, the scale's floor
    // reaches the distribution and the masked hash reports it. Both halves are asserted, because
    // either alone is satisfiable by a blinded comparison.
    const reviewedBase = ranOn(SHIPPED, REVIEWED_ARM);
    const reviewedOther = ranOn(mutated, REVIEWED_ARM);
    expect(reviewedOther.reviewOutcomes).not.toEqual(reviewedBase.reviewOutcomes);
    expect(simHash(mutated, REVIEWED_ARM)).not.toBe(simHash(SHIPPED, REVIEWED_ARM));
  });

  it('AND THE MASK IS CERTIFIED — two worlds alike in everything but the fingerprint hash alike', () => {
    // ========================================================================
    // WHAT THE MASK BUYS, ASSERTED RATHER THAN TRUSTED. `simHash` blanks `World.contentHash` so
    // the exhaustion arm measures the SIMULATION rather than the document that produced it. That
    // is only worth anything if some content edit exists which moves the fingerprint and nothing
    // else — otherwise the mask is removing a field nobody would have been fooled by.
    //
    // THE EDIT USED TO BE `reviewScoreMin` AND IT NO LONGER QUALIFIES (G-028b). ADR-0037 makes
    // the band count `max - min + 1`, so that field now reaches the review rows AND the need
    // tally's `met`/`unmet` — it moves the world, which is the one thing this arm's edit must
    // not do. It is replaced by the guest rules' DISPLAY NAME: a string carried into the
    // fingerprint by `cloneGuestRules` exactly as every other table's is, and read by nothing
    // in `packages/sim` at all.
    //
    // THAT IS A STRONGER CERTIFICATION THAN WHAT IT REPLACES, not a weaker one. The old edit was
    // only ever "unread" by numeric coincidence at two arms — sweep 3 found the premise false —
    // whereas a display name is unread by construction. If a future goal makes the simulation
    // read a name, this arm goes red, which is the correct direction.
    //
    // THE PRECONDITION IS CHECKED RATHER THAN ASSUMED: the two worlds are required to be equal
    // in every hashed field once the fingerprint is blanked, and their fingerprints are required
    // to differ. Only then does the equality of `simHash` mean the mask did the work.
    //
    // IT IS THE ARM THAT GOES RED IF THE MASK IS EVER REMOVED, which the arm above no longer
    // does — and that gap is the reason this exists as its own case. Verified by mutation:
    // deleting `contentHash: ''` from `simHash` turns this red and nothing else.
    // ========================================================================
    const world0 = createWorld(42, SHIPPED);
    const mutatedContent = rebound({
      guestRules: (SHIPPED.content.guestRules ?? []).map(
        (entry) => ({ ...entry, name: `${entry.name} (renamed for the mask arm)` }) as GuestRulesData,
      ),
    });
    const runOn = (content: BoundContent): ReturnType<typeof run> =>
      run(
        createWorld(42, content),
        content,
        DEFAULT_ARM.ticks,
        schedule(DEFAULT_ARM.ticks, content, world0.grid, DEFAULT_ARM.rooms, 120, 0, 0, 0, DEFAULT_ARM.amenities),
      );
    const base = runOn(SHIPPED);
    const other = runOn(mutatedContent);
    // THE DOCUMENTS DIFFER...
    expect(other.contentHash).not.toBe(base.contentHash);
    // ...AND THE WORLDS DO NOT, once the fingerprint is out of the comparison.
    expect({ ...other, contentHash: '' }).toEqual({ ...base, contentHash: '' });
    // ...SO THIS EQUALITY IS THE MASK, and it is the assertion that fails without it.
    expect(simHash(mutatedContent, DEFAULT_ARM)).toBe(simHash(SHIPPED, DEFAULT_ARM));
  });
});

describe('THE DERIVATIONS, EXECUTED — the day the shipped table describes', () => {
  const lodging = lodgingNeedOf(SHIPPED);
  const stay = stayDurationOf(SHIPPED) ?? 0;
  const engagement = needTypesInOrder(SHIPPED).filter((entry) => entry.id !== lodging?.id);

  it('each engagement need is served three times a day for an hour — IN THE WORST ROOM (G-041)', () => {
    // THE DAY IS UNCHANGED AND THE ROOM IT DESCRIBES IS NOT. ADR-0054 made `refillPerTick` the
    // rate a FULLY APPOINTED room reaches, so the design day — three one-hour helpings — is now
    // read at `serviceFloorRefill`, and the declared rate buys the same day back faster. Both
    // ends are asserted here because the pair IS the re-derivation.
    for (const entry of engagement) {
      const servicePerDay = stay / (1 + serviceFloorRefill(entry));
      expect(servicePerDay).toBe(180);
      const visit =
        Math.floor((wantAtOf(SHIPPED) * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS) / serviceFloorRefill(entry);
      expect(visit).toBe(60);
      expect(servicePerDay / visit).toBe(3);
      // ...and the same helping in a fully appointed room takes 30 ticks, not 60.
      expect(
        Math.floor((wantAtOf(SHIPPED) * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS) / declaredRefill(entry),
      ).toBe(30);
      expect(declaredRefill(entry)).toBeGreaterThan(serviceFloorRefill(entry));
    }
  });

  it('and sleep is DERIVED from that activity rather than stated beside it', () => {
    expect(lodging).toBeDefined();
    const awayAtFloor = engagement.reduce((total, entry) => total + stay / (1 + serviceFloorRefill(entry)), 0);
    expect(awayAtFloor).toBe(540);
    // An hour of activity costs an hour of recovery — in the worst room in the game.
    expect(lodging === undefined ? undefined : serviceFloorRefill(lodging)).toBe(1);
    expect(awayAtFloor / (lodging === undefined ? 1 : serviceFloorRefill(lodging))).toBe(540);
    // THE RHYTHM IS A RATIO, NOT A COUNT (G-041): one nap comes due per round of the day's
    // activities. It is pinned at the CEILING, where `assertLodgingBecomesWanted` binds hardest.
    const awayAtCeiling = engagement.reduce(
      (total, entry) => total + Math.floor(stay / (1 + declaredRefill(entry))),
      0,
    );
    expect(awayAtCeiling).toBe(288);
    const first = engagement[0];
    expect(first).toBeDefined();
    const decay = Math.floor((wantAtOf(SHIPPED) * (first?.capacityTicks ?? 0)) / ONE_WHOLE_BASIS_POINTS);
    const ceilingPeriod = decay + decay / declaredRefill(first as NeedTypeData);
    expect(ceilingPeriod).toBe(450);
    const napAt = Math.floor((wantAtOf(SHIPPED) * (lodging?.capacityTicks ?? 0)) / ONE_WHOLE_BASIS_POINTS);
    expect(napAt).toBe(90);
    expect((awayAtCeiling * ceilingPeriod) / stay).toBe(napAt);
  });

  it('the day adds up, and what is left over is the headroom M3 spends', () => {
    // THE IDLE SHARE IS A CEILING AND IT READS THE DECLARED RATE (G-041). The most idle a guest
    // can be is a fully appointed hotel with nothing to wait for; every room below the ceiling
    // serves more slowly and spends more of the stay. The FLOOR-rate complement is the 2,500 this
    // line read before G-041, and it is now the busiest the content permits rather than the only
    // thing it permits — asserted as such at the bottom of this test.
    expect(idleShareBasisPoints(SHIPPED)).toBe(7_003);
    const busy = ONE_WHOLE_BASIS_POINTS - idleShareBasisPoints(SHIPPED);
    // 432 of 1,440 ticks accounted for — 288 out and 144 napping — leaving 1,008. Stated in
    // ticks as well as basis points because the two are one statement and a reader checks one
    // of them. (The PLAN said 1,020/420: it carried a 480-tick sleep from the number set before
    // the lodging need was re-derived, while quoting the correct 25% beside it. The share was
    // right and the tick line was stale; this assertion is why that could not survive BUILD.)
    expect(Math.round((busy * stay) / ONE_WHOLE_BASIS_POINTS)).toBe(432);
    expect(stay - 432).toBe(1_008);
    // AND THE OTHER END: at the service floor the same fold reads 7,500 busy and 2,500 idle —
    // 540 out, 540 napping, 360 spare, which is the day this project simulated up to G-041.
    let floorBusy = 0;
    for (const entry of engagement) floorBusy += Math.floor(ONE_WHOLE_BASIS_POINTS / (1 + serviceFloorRefill(entry)));
    floorBusy += Math.floor(floorBusy / (lodging === undefined ? 1 : serviceFloorRefill(lodging)));
    expect(floorBusy).toBe(7_500);
    expect(Math.round((floorBusy * stay) / ONE_WHOLE_BASIS_POINTS)).toBe(1_080);
  });

  it('the want line clears `MAX_PENDING − margin`, and the margin clears its own re-derived bound', () => {
    expect(wantAtOf(SHIPPED)).toBeLessThanOrEqual(ONE_WHOLE_BASIS_POINTS - 1 - abandonMarginOf(SHIPPED));
    // IMPORTED, NOT RESTATED. `hysteresis.bound.test.ts` asserts the same bound from the other
    // end (criterion 5), and two copies of one derivation is the duplicated-constant defect
    // ADR-0021 was written about — a comment claiming two things describe the same building,
    // with nothing checking it.
    const bound = marginBoundOver(engagement);
    // 10,000 x 15 / 28 = 5,357.14, and it ROUNDS UP: a bound that is not a whole basis point is
    // never met by rounding down. (It read 5,715 at the pre-G-041 rate of 7; the shipped 6,000
    // clears either, which is exactly why the arithmetic had to be executed rather than cited —
    // the bound moved under a margin nobody touched, and only the executed form saw it.)
    expect(bound).toBe(5_358);
    expect(abandonMarginOf(SHIPPED)).toBeGreaterThanOrEqual(bound);
    expect(bound).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });

  it('and tolerance is PRESERVED from the countdown era rather than re-derived', () => {
    expect(toleranceOf(SHIPPED)).toBe(180);
    expect(toleranceOf(SHIPPED) ?? 0).toBeLessThan(stay);
  });

  it('and the shipped capacities keep the QUANTISED pressure ordering the exact one', () => {
    // `utility.ts`'s header states the condition and `utility.test.ts` drives the arithmetic
    // over a fixed pair; neither can see the shipped table, because content is injected
    // (ADR-0001). This is the half that reads the real denominators.
    //
    //     lcm(capacityA, capacityB) < 10,000  IS SUFFICIENT for `pressureBasisPoints` to order
    //     two needs exactly as the un-floored cross-multiplication would.
    //
    // It is sufficient and NOT necessary, so a future table over the bound is not thereby
    // broken — it is a table whose ordering has to be argued rather than inherited, which is
    // what this reddening would be saying.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const capacities = needTypesInOrder(SHIPPED).map((entry) => entry.capacityTicks);
    expect(capacities.length).toBeGreaterThan(1);
    let worst = 0;
    for (let i = 0; i < capacities.length; i += 1) {
      for (let j = i + 1; j < capacities.length; j += 1) {
        const a = capacities[i] ?? 0;
        const b = capacities[j] ?? 0;
        worst = Math.max(worst, (a * b) / gcd(a, b));
      }
    }
    // 300 / 1,400 / 1,400 / 1,400: the engagement pairs are 1,400 and the lodging pairs 4,200.
    // THE SAME WORST PAIR THE 600/1,400 TABLE PRODUCED, and that is not luck — it is the property
    // G-041's derivation checks last, and the reading of the lodging rhythm it rules out
    // (`C = 320`) would have shipped 11,200 and quantised this very comparison. See
    // `serviceFloorBasisPointsSchema` and `needs.rates.test.ts`.
    expect(worst).toBe(4_200);
    expect(worst).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });
});

describe('THE REFUSALS, AND BOTH ARE REACHABLE FROM BOTH SIDES', () => {
  const withLodgingCapacity = (value: number): BoundContent =>
    rebound({
      needTypes: needTypesInOrder(SHIPPED).map((entry) =>
        entry.role === 'lodging' ? { ...entry, capacityTicks: value } : entry,
      ),
    });

  it('a lodging need too big to become wanted twice is REFUSED — including the one this goal planned', () => {
    // 480 sits exactly on the bound (want line 144 = half of 288 away-ticks); 481 is over it.
    // IT READS THE DECLARED RATE, and G-041 is why that has to be said out loud: away time is a
    // RANGE now, and the smallest of it — the hotel where rest is hardest to want — is the fully
    // appointed one. The bound was 900/901 while the declared rate was 7 and `A` was 540.
    expect(() => withLodgingCapacity(480)).not.toThrow();
    expect(() => withLodgingCapacity(481)).toThrow(/never become wanted twice/);
    // AND THE NUMBER SET G-027b FIRST PLANNED, which made the lodging need decorative and
    // left the idle share at 62.5% against a 61.9% baseline. This refusal exists because of it.
    expect(() => withLodgingCapacity(3_200)).toThrow(/never become wanted twice/);
  });

  it('a table demanding a whole guest is REFUSED, and the shipped one is well under', () => {
    const withEngagementRefill = (value: number): BoundContent =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map((entry) =>
          entry.role === 'engagement' ? { ...entry, refillPerTick: value } : entry,
        ),
      });
    // BOTH VALUES ARE EVEN, and that is G-041's other refusal talking: at a service floor of
    // 5,000 an ODD refillPerTick makes the floor rate a half-tick, which `assertServiceFloorIsARate`
    // turns away before this one is reached. The pair below therefore isolates THIS refusal.
    expect(() => withEngagementRefill(12)).not.toThrow();
    // At 2 the floor rate is 1: three needs at 5,000 basis points each is one and a half guests.
    expect(() => withEngagementRefill(2)).toThrow(/basis points of a guest's time/);
    // AND IT IS THE FLOOR RATE THE REFUSAL READS, WHICH IS THE WHOLE OF G-041 IN ONE ARM. At the
    // DECLARED rate a table of 2s demands 3 x 3,333 + 4,999 = 14,998 and would be refused for the
    // same reason — so a value that separates the two readings is needed. 12 is one: at the
    // declared rate it demands 3 x 769 + 384 = 2,691, and at the floor rate of 6 it demands
    // 3 x 1,428 + 4,284 = 8,568. Both clear. Drop the floor to 1,000 and the floor rate becomes 1
    // while the declared rate does not move at all — and only a refusal reading the floor sees it.
    expect(() =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map((entry) => ({ ...entry, refillPerTick: 20, serviceFloorBasisPoints: 500 })),
      }),
    ).toThrow(/basis points of a guest's time/);
    expect(() =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map((entry) => ({ ...entry, refillPerTick: 20, serviceFloorBasisPoints: 10_000 })),
      }),
    ).not.toThrow();
  });

  it('AND A SERVICE FLOOR THE SIMULATION WOULD ROUND AWAY IS REFUSED (G-041)', () => {
    // `refillPerTick x f` is what a guest in the worst room actually gets, and a deficit falls by
    // an INTEGER per tick. A table where that product is fractional declares a floor no guest
    // ever experiences — and the rate derivation on `capacityTicksSchema` is written in terms of
    // the product, so it would stop being re-runnable from the numbers on disk.
    const withFloor = (value: number): BoundContent =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map((entry) =>
          entry.role === 'engagement' ? { ...entry, serviceFloorBasisPoints: value } : entry,
        ),
      });
    // 14 x 5,000 = 7 exactly; 14 x 2,500 = 3.5 and is refused. REACHABLE FROM BOTH SIDES.
    expect(() => withFloor(5_000)).not.toThrow();
    expect(() => withFloor(2_500)).toThrow(/not a whole number/);
    // And absence is the historical reading rather than an error: a table that declares no floor
    // is fully appointed, which is every world this project simulated before G-041.
    expect(() =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map(({ serviceFloorBasisPoints: _drop, ...rest }) => rest),
      }),
    ).not.toThrow();
  });

  it('and content that declares a lodging need must say how long a guest waits', () => {
    expect(() =>
      rebound({
        guestRules: (SHIPPED.content.guestRules ?? []).map(({ toleranceTicks: _drop, ...rest }) => rest),
      }),
    ).toThrow(/toleranceTicks/);
  });

  describe('and a DECLARED want line that floors to 0 is REFUSED AT LOAD (round 1)', () => {
    // WHY THIS REFUSAL EXISTS: a guest is formed AT its want line, so a line of 0 forms a need
    // that is already FULL with nothing recorded as having served it — the one need vector
    // `assertNeedVector` refuses. Without a bind-time check the content binds cleanly and the
    // FIRST ARRIVAL throws from inside the tick, which is where ~45 fixtures for this goal died
    // one debugging cycle at a time. Every document below is schema-valid.
    //
    // AND THE SPLIT IS THE POINT: a DECLARED line that rounds away is a designer's number not
    // doing what they meant, and is refused; an ABSENT line is the pre-G-027b era and is
    // ACCEPTED, with the guest arriving one tick below full (`formNeedVector`). That is the
    // same "silence on disk / silence in history" rule the prices, `provides` and `requires`
    // already follow (ADR-0008).
    const withWantAt = (wantAt: number | undefined): (() => BoundContent) => {
      const rules = (SHIPPED.content.guestRules ?? []).map(({ wantAtBasisPoints: _drop, ...rest }) =>
        wantAt === undefined ? rest : ({ ...rest, wantAtBasisPoints: wantAt } as GuestRulesData),
      );
      return () => rebound({ guestRules: rules });
    };

    it('an explicit 0 — which `basisPointsSchema` permits and `cloneStockRules` admits', () => {
      expect(withWantAt(0)).toThrow(/line of 0 ticks/);
    });

    it('while an ABSENT want line still BINDS — history is a statement, not an oversight', () => {
      expect(withWantAt(undefined)).not.toThrow();
      // And the guest it forms is one tick below full on every need rather than at 0, which is
      // what makes the acceptance safe: `assertNeedVector` would refuse the alternative.
      for (const need of formNeedVector(withWantAt(undefined)())) {
        expect(need.deficit, `${need.needId} arrived full under content with no want line`).toBe(1);
        expect(need.metBy).toBeNull();
      }
    });

    it('and a line that FLOORS to 0 on a small capacity, with a legal want line and legal rates', () => {
      // 50 basis points of a 100-tick capacity is half a tick. The other need types keep the
      // shipped 1,400, so nothing else about this table is marginal — and 50 is a want line a
      // designer could write for a reason.
      const smallest = needTypesInOrder(SHIPPED)[0];
      expect(smallest).toBeDefined();
      expect(() =>
        bindContent({
          ...SHIPPED.content,
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.id === smallest?.id ? { ...entry, capacityTicks: 100 } : entry,
          ),
          guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => ({ ...entry, wantAtBasisPoints: 50 })),
        }),
      ).toThrow(/line of 0 ticks/);
    });

    it('and the boundary is driven from BOTH sides at the shipped want line', () => {
      // The bound `wantAtBasisPoints x capacityTicks >= 10,000` written as the smallest capacity
      // the shipped 3,000 admits: 4 gives a line of 1 and binds, 3 gives 0.9 and is refused.
      // Quoted in `wantAtBasisPointsSchema`; executed here, because a boundary in prose is a
      // boundary nobody has checked.
      const withCapacity = (value: number) => (): BoundContent =>
        rebound({
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.role === 'lodging' ? entry : { ...entry, capacityTicks: value },
          ),
        });
      expect(wantAtOf(SHIPPED)).toBe(3_000);
      expect(withCapacity(4)).not.toThrow();
      expect(withCapacity(3)).toThrow(/line of 0 ticks/);
    });

    it('while the SHIPPED table clears it on every need — the refusal is not refusing everything', () => {
      // ANTI-VACUITY. A check that threw for all content would satisfy the three above and be
      // useless, and the shipped want line is 3,000 basis points against capacities of 600 and
      // 1,400 — lines of 180 and 420, both far from the floor.
      expect(() => rebound({})).not.toThrow();
      for (const entry of needTypesInOrder(SHIPPED)) {
        expect(Math.floor((wantAtOf(SHIPPED) * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS)).toBeGreaterThan(0);
      }
    });
  });

  it('while content with NO lodging need is untouched by all three', () => {
    expect(() =>
      bindContent({ roomTypes: [{ id: 'shed', name: 'shed', capacity: 1, nightlyRatePence: 0, requires: [] }] }),
    ).not.toThrow();
  });
});
