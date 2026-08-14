// G-014b — A GUEST THAT COMMITS: when it walks out on a provider, and when it does not.
//
//   pnpm exec vitest run hysteresis
//
// The goal's statement in full: *a guest that has committed does not abandon unless an
// alternative beats it by a content-defined margin, and abandonments are a reported
// outcome.* This file owns the DECISION. The era comparison and the counters over a real
// run are `tools/headless/src/hysteresis.report.test.ts`; the margin's own lower bound is
// `hysteresis.bound.test.ts`.
//
// ============================================================================
// THE CONTENT BELOW IS BUILT SO THAT PRESSURE IS ARITHMETIC A READER CAN DO IN THEIR HEAD,
// AND THAT IS WHAT MAKES THE BOUNDARY CASES EXACT RATHER THAN APPROXIMATE.
//
// Both engagement needs have `capacityTicks` 400 at `refillPerTick` 3, so one tick moves each
// by exactly 10,000/400 = 25 basis points — the challenger DOWN by one step of decay and the
// incumbent UP by three of refill. The gap between them therefore opens at exactly 100 basis
// points a tick, and a margin of M is first cleared at n = M/100.
//
// IT READ "both engagement needs have `patienceTicks` 100 … the incumbent is SERVED, so its
// patience is pinned at its cap and its pressure stays at 0" UNTIL θ-a SWEEP 2, AND BOTH HALVES
// WERE WRONG BY THEN. The field is deleted, the capacity is 400, and under a stock the incumbent
// does not sit pinned — it is REFILLED, which is why the gap closes from both ends and why 4 x 25
// comes to the same 100 the countdown model got from the challenger alone. `ENGAGEMENT_CAPACITY`
// and `GAP_BASIS_POINTS_PER_TICK` below both say this correctly, seventy lines from a header that
// did not: the derived rate was rewritten, the paragraph a reader meets first was not.
//
// That relation — not a captured tick number — is what the boundary test asserts, computed
// from the content it runs against.
// ============================================================================
//
// ============================================================================
// PROOF OF BITE, AS A RECIPE RATHER THAN AS A CLAIM. Three mutations were applied to
// `packages/sim/src/guests.ts` during BUILD, each reverted and the file's `sha256` compared
// after (`CLAUDE.md`'s mutation recipe; a scratch checksum, because `git stash` would have
// stashed the very work being probed). Re-run any of them with
// `pnpm exec vitest run hysteresis` and the NAMED tests below go red:
//
//   drop `release(...)` from the switch in `reserve`
//       -> "ON THE TICK OF THE SWITCH, the second guest already holds the provider the
//          first let go", and three of `hysteresis.report.test.ts`'s criterion arms.
//   pass `bestNeed.needId` instead of `engagement.needId` to `abandonNeed`
//       -> "EXACTLY ON IT (gap = margin)", all four challenger-tie cases, and the era arms.
//   replace `abandonMarginOf(content)` with `0` in the bar
//       -> both boundary cases, every tie case, the absent-table comparison, and the whole
//          of `hysteresis.report.test.ts`.
//
// AND ONE MUTATION LANDED ON THE WRONG LINE FIRST, WHICH IS WORTH MORE THAN THE THREE THAT
// LANDED. `release(search, engagement.entityId, engagedRoom, content)` appears TWICE in
// `guests.ts` — step 5 (the engagement finished) and the switch — and a first-occurrence
// replace hit step 5. Every report-level arm went red and this file stayed green, which read
// exactly like "the unit tests do not cover the release". They do; the probe was pointed at
// another line. A mutation probe needs its target verified, not merely its verdict read.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import type { Command, ScheduledCommand } from './commands.js';
import { abandonMarginOf, bindContent, ONE_WHOLE_BASIS_POINTS } from './content.js';
import type {
  BoundContent,
  GuestRulesData,
  ItemTypeData,
  NeedTypeData,
  RoomTypeData,
  SimContent,
} from './content.js';
import { entitiesInOrder } from './entities.js';
import { guestsInOrder } from './guests.js';
import type { Guest } from './guests.js';
import {
  abandonNeed,
  assertNeedOutcomes,
  assertNeedVector,
  findNeedState,
  needOutcomeOf,
} from './needs.js';
import type { NeedState } from './needs.js';
import { run, stepTick } from './tick.js';
import {
  abandonThresholdBasisPoints,
  MAX_PENDING_PRESSURE_BASIS_POINTS,
  pressureBasisPoints,
} from './utility.js';
import { createWorld } from './world.js';
import type { World } from './world.js';

/**
 * One tick of decay moves a need of this capacity by exactly 25 basis points.
 *
 * 400 RATHER THAN THE OLD `patienceTicks` OF 100, and it is chosen so that TWO of this file's
 * requirements survive at once:
 *
 *   THE GAP STILL OPENS AT 100 BASIS POINTS A TICK, so `dueAfter` is still `margin / 100` and
 *   every run length below still lands where it did. Under the countdown model that 100 was the
 *   challenger's own rate; under a stock it is the SUM of the challenger's decay and the
 *   incumbent's refill, and 4 x 25 is the same number.
 *   NO ENGAGEMENT FINISHES ON ITS OWN. A stock finishes when it is FULL, which takes
 *   `wantLine / refillPerTick` ticks — 67 here, against the 60 ticks of the longest run below.
 */
const ENGAGEMENT_CAPACITY = 400;
const BASIS_POINTS_PER_TICK = ONE_WHOLE_BASIS_POINTS / ENGAGEMENT_CAPACITY;

/**
 * G-027b — THE GAP NOW CLOSES FROM BOTH ENDS, AND THAT IS THE ONE ARITHMETIC CHANGE IN THIS
 * FILE.
 *
 * Under the countdown model a SERVED need's patience sat pinned at its cap, so its pressure was
 * 0 and only the challenger moved: the gap grew at `BASIS_POINTS_PER_TICK` a tick. Under a stock
 * the incumbent is being REFILLED while the challenger DECAYS, so both move and the gap grows at
 * `(refillPerTick + 1) x BASIS_POINTS_PER_TICK`. Every "due after" below is derived from this
 * rate rather than from the challenger's alone.
 */
const ENGAGEMENT_REFILL = 3;
const GAP_BASIS_POINTS_PER_TICK = (ENGAGEMENT_REFILL + 1) * BASIS_POINTS_PER_TICK;

/**
 * Where a guest starts wanting, as a share of each need's own capacity — so every need is formed
 * at the SAME pressure, which is what keeps `aaa` the incumbent by the tie rule alone.
 *
 * IT IS HALF THE CAPACITY, and that is chosen so an engagement lasts: at refill 3 the incumbent
 * takes 67 ticks to fill and be released, which outlasts every run in this file.
 */
const WANT_AT = 5_000;
const ENGAGEMENT_LINE = (WANT_AT * ENGAGEMENT_CAPACITY) / ONE_WHOLE_BASIS_POINTS;

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

const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  // The lodging need outlasts everything here, so no stay ends mid-experiment and the only
  // thing that can end an engagement is the decision this file is about. It is 20,000 rather
  // than the old 100,000 because `assertLodgingBecomesWanted` refuses a want line further away
  // than the stay generates away-time for; nothing here reads the lodging need, and a guest
  // that is always engaged is never at home to be served by its room anyway.
  capacityTicks: lodging ? 20_000 : ENGAGEMENT_CAPACITY,
  // 8 rather than 2 so that a table with THREE engagement needs still leaves a guest time to
  // sleep: `assertNeedDemandIsServiceable` refuses one that demands the whole of it.
  refillPerTick: lodging ? 8 : ENGAGEMENT_REFILL,
});

/**
 * `stayDurationTicks` IS ON EVERY ROW SINCE G-027a, AND IT IS DELIBERATELY ENORMOUS. This
 * file's lodging need is 100,000 ticks for a stated reason — no stay may end mid-experiment,
 * because the only thing allowed to end an engagement here is the decision under test — and
 * the checkout terminator is a second way a stay could end. It is pushed past every run in
 * this file for exactly the same reason, and `bindContent`'s floor makes 100,000 the minimum
 * it could be anyway.
 */
const STAY = 100_000;

const rules = (abandonMarginBasisPoints: number): readonly GuestRulesData[] => [
  {
    id: 'houseRules',
    name: 'House Rules',
    abandonMarginBasisPoints,
    stayDurationTicks: STAY,
    toleranceTicks: STAY,
    wantAtBasisPoints: WANT_AT,
  },
];

/** The same table with no MARGIN on it — the pre-G-014b statement, in the only shape that
 *  can still be run (see the `no guest rules` block below). */
const rulesWithoutMargin: readonly GuestRulesData[] = [
  { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: WANT_AT },
];

/**
 * The standard hotel of this file: a bedroom, a provider of `aaa` and a provider of `bbb`.
 *
 * `aaa` sorts before `bbb`, so a guest whose needs are all at zero pressure engages `aaa`
 * first — needs are walked in ascending id and the loop keeps the incumbent on a tie. That
 * makes `aaa` the INCUMBENT in every case below without anything having to arrange it.
 */
const twoNeeds = (margin: number | undefined, extra: Partial<SimContent> = {}): BoundContent =>
  bindContent({
    roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa']), roomType('roomB', ['bbb'])],
    needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
    guestRules: margin === undefined ? rulesWithoutMargin : rules(margin),
    ...extra,
  });

const spawn = (entityKind: string, column: number, floor = 0): Command => ({
  kind: 'spawnEntity',
  entityKind,
  at: { floor, column },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const build = (content: BoundContent, ...commands: readonly Command[]): World =>
  stepTick(createWorld(7, content), content, commands);

const only = (world: World): Guest => {
  const guests = guestsInOrder(world.guests);
  expect(guests).toHaveLength(1);
  return guests[0]!;
};

const engagedKind = (world: World, guest: Guest): string | undefined => {
  if (guest.engagement === null) return undefined;
  return entitiesInOrder(world.entities).find((entity) => entity.id === guest.engagement!.entityId)?.kind;
};

const abandonCountOf = (guest: Guest, needId: string): number =>
  findNeedState(guest.needs, needId)?.abandonCount ?? -1;

// ============================================================================
//  CRITERION 3's SATURATION CLAUSE, PINNED AT THE CLAMP IN `pressureBasisPoints`.
//  (It was pinned at `isNeedPending`'s definition until θ-a sweep 2, and that field is deleted;
//  the block below has said so since G-027b, ten lines under a banner that had not moved.)
// ============================================================================

describe('NO need can reach one whole, so a margin of one whole is total commitment', () => {
  // WHY THIS IS NOT A GRID OVER CONSTRUCTED PAIRS. A grid SAMPLES the property: it shows that
  // pressure stayed under 10,000 for the states somebody thought of. The property is a
  // consequence of one definition, so the test follows the definition instead — the
  // orchestrator's ruling at PLAN, and it is a better test for being four assertions rather
  // than a hundred.
  //
  // THE DEFINITION MOVED AT G-027b AND THE PROPERTY DID NOT. It used to rest on
  // `isNeedPending`: a need with no patience left was not scored at all, so the ceiling fell
  // out of the scoring loop's own exit. A stock has no such exit — nothing is terminal and an
  // EMPTY need is scored like any other — so the ceiling is now a CLAMP inside
  // `pressureBasisPoints`, imposed precisely so that this document keeps meaning what it meant.
  // The steps below follow the new definition in the same shape.
  const type = (capacityTicks: number): NeedTypeData => ({
    id: 'x',
    name: 'x',
    role: 'engagement',
    capacityTicks,
    refillPerTick: 1,
  });
  const state = (deficit: number): NeedState => ({
    needId: 'x',
    deficit,
    metBy: deficit === 0 ? 'room' : null,
    abandonCount: 0,
    unservedTicks: 0,
  });

  it('STEP 1 — an EMPTY need is still scored, so the old ceiling has nothing to rest on', () => {
    // The premise the countdown proof used and the stock model deletes, stated as a case so
    // the change is visible rather than inferred: a need at its capacity is a legal, scorable
    // state, and one PAST its capacity is reachable through the v12 -> v13 migration.
    expect(pressureBasisPoints(type(100), state(100))).toBeGreaterThan(0);
    expect(pressureBasisPoints(type(100), state(400))).toBeGreaterThan(0);
  });

  it('STEP 2 — so the ceiling is the clamp, and no deficit of any capacity beats it', () => {
    // Driven across five orders of magnitude of capacity — including 1, where every non-zero
    // deficit is already at or past it — and at deficits below, on and far past the capacity.
    for (const capacityTicks of [1, 2, 100, 10_000, 1_000_000]) {
      for (const deficit of [1, capacityTicks - 1, capacityTicks, capacityTicks * 4]) {
        if (deficit < 1) continue;
        expect(pressureBasisPoints(type(capacityTicks), state(deficit))).toBeLessThanOrEqual(
          MAX_PENDING_PRESSURE_BASIS_POINTS,
        );
      }
    }
    expect(MAX_PENDING_PRESSURE_BASIS_POINTS).toBe(ONE_WHOLE_BASIS_POINTS - 1);
  });

  it('STEP 3 — and the clamp is REAL: an empty need lands exactly on it rather than near it', () => {
    // ADR-0007's other half. "Nothing beats the ceiling" is only interesting if something
    // reaches it; a `pressureBasisPoints` that saturated well below would satisfy step 2 while
    // inspecting nothing. Two needs that are both empty therefore SCORE ALIKE, which is the
    // resolution the clamp costs and the thing G-028 inherits.
    expect(pressureBasisPoints(type(100), state(100))).toBe(MAX_PENDING_PRESSURE_BASIS_POINTS);
    expect(pressureBasisPoints(type(7), state(7_000))).toBe(MAX_PENDING_PRESSURE_BASIS_POINTS);
  });

  it('STEP 4 — so the threshold at a saturating margin is one no pressure can reach', () => {
    // The consequence, stated where the margin is compared rather than left to a reader.
    const bar = abandonThresholdBasisPoints(0, ONE_WHOLE_BASIS_POINTS);
    expect(bar).toBeGreaterThan(MAX_PENDING_PRESSURE_BASIS_POINTS);
  });
});

// ============================================================================
//  CRITERION 4 — THE BOUNDARY, DRIVEN BOTH WAYS.
// ============================================================================

describe('the boundary: a gap of margin - 1 keeps the engagement, a gap of margin switches', () => {
  const MARGIN = 1_000;
  const content = twoNeeds(MARGIN);

  /** The world at `ticks` ticks after the guest arrived and engaged. */
  const after = (ticks: number): World => {
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
    return run(world, content, ticks + 1, [at(world.tick, arrive)]);
  };

  /**
   * THE TICK THE SWITCH IS DUE, COMPUTED FROM CONTENT RATHER THAN CAPTURED.
   *
   * BOTH ENDS MOVE SINCE G-027b. The incumbent is being REFILLED, so its pressure FALLS by
   * `refillPerTick x BASIS_POINTS_PER_TICK` a tick; the challenger decays, so its pressure
   * rises by `BASIS_POINTS_PER_TICK`. The gap therefore opens at the sum of the two, and first
   * REACHES the margin after `margin / that` ticks. Under the countdown model the incumbent's
   * patience sat pinned at its cap and only the challenger moved.
   */
  const dueAfter = abandonMarginOf(content) / GAP_BASIS_POINTS_PER_TICK;

  it('the arithmetic this file rests on is what the content actually says', () => {
    expect(abandonMarginOf(content)).toBe(MARGIN);
    expect(GAP_BASIS_POINTS_PER_TICK).toBe(100);
    expect(dueAfter).toBe(10);
    expect(Number.isInteger(dueAfter)).toBe(true);
  });

  it('ONE TICK EARLY (gap = margin - 100): still engaged with the incumbent, nothing abandoned', () => {
    const world = after(dueAfter - 1);
    const guest = only(world);
    const incumbent = findNeedState(guest.needs, 'aaa')!;
    const challenger = findNeedState(guest.needs, 'bbb')!;
    const type = (id: string): NeedTypeData => content.content.needTypes!.find((entry) => entry.id === id)!;
    // The gap is stated, so a failure says WHICH side moved rather than only that it did.
    // The GAP is what the margin is compared against, and both ends of it moved this tick.
    const gap = pressureBasisPoints(type('bbb'), challenger) - pressureBasisPoints(type('aaa'), incumbent);
    expect(gap).toBe(MARGIN - GAP_BASIS_POINTS_PER_TICK);
    expect(engagedKind(world, guest)).toBe('roomA');
    expect(abandonCountOf(guest, 'aaa')).toBe(0);
  });

  it('EXACTLY ON IT (gap = margin): the guest switches, and the incumbent carries the abandonment', () => {
    const world = after(dueAfter);
    const guest = only(world);
    const type = (id: string): NeedTypeData => content.content.needTypes!.find((entry) => entry.id === id)!;
    const gap =
      pressureBasisPoints(type('bbb'), findNeedState(guest.needs, 'bbb')!) -
      pressureBasisPoints(type('aaa'), findNeedState(guest.needs, 'aaa')!);
    expect(gap).toBe(MARGIN);
    expect(engagedKind(world, guest)).toBe('roomB');
    // THE COUNT LANDS ON THE NEED THAT WAS WALKED OUT ON, NOT ON THE ONE WALKED TO. No law
    // can catch that misfiling — it conserves the total and moves no other number — so it is
    // pinned by driving it. See the matrix on `NeedOutcome.abandoned`.
    expect(abandonCountOf(guest, 'aaa')).toBe(1);
    expect(abandonCountOf(guest, 'bbb')).toBe(0);
  });

  it('and the progress the abandoned need had made is RETAINED, not scrapped', () => {
    // A guest that walks out halfway through has still had half of it, exactly as one whose
    // provider was demolished under it (G-012's ruling at seeding). Scrapping progress would
    // make abandonment far more expensive than any margin could price.
    const world = after(dueAfter);
    const abandoned = findNeedState(only(world).needs, 'aaa')!;
    // It was served for `dueAfter` ticks at `ENGAGEMENT_REFILL` a tick, so exactly that much of
    // its deficit is gone and the rest is still owed. A reset would put it back on the line.
    expect(abandoned.deficit).toBeLessThan(ENGAGEMENT_LINE);
    expect(abandoned.deficit).toBe(ENGAGEMENT_LINE - dueAfter * ENGAGEMENT_REFILL);
    expect(abandoned.deficit).toBeGreaterThan(0);
  });
});

// ============================================================================
//  CRITERION 4 — TIES AMONG CHALLENGERS THAT BOTH CLEAR THE MARGIN.
// ============================================================================

describe('two challengers tied on pressure, both clearing the margin: the LOWER NEED ID wins', () => {
  // THE TIE THIS GOAL INTRODUCES, which is not the one G-014a pinned. G-014a settled two
  // PROVIDERS of one need; this settles two NEEDS that are equally desperate and equally
  // available, at the moment a guest decides to walk out on a third.
  const content = (declarationOrder: readonly NeedTypeData[]): BoundContent =>
    bindContent({
      roomTypes: [
        roomType('bedroom', ['rest']),
        roomType('roomA', ['aaa']),
        roomType('roomB', ['bbb']),
        roomType('roomC', ['ccc']),
      ],
      needTypes: declarationOrder,
      guestRules: rules(1_000),
    });

  const ascending = [need('aaa', false), need('bbb', false), need('ccc', false), need('rest', true)];
  const descending = [...ascending].reverse();

  // TWO KINDS OF ORDER, AND BOTH ARE MEANINGFUL HERE. The order the needs are DECLARED in
  // decides nothing (`bindContent` normalises), and the order the providers are SPAWNED in
  // decides their entity ids. Neither may decide which need the guest reaches for; only the
  // need id may. One order alone cannot tell "lowest need id" from "first found".
  const orders: readonly (readonly Command[])[] = [
    [spawn('roomB', 4), spawn('roomC', 6)],
    [spawn('roomC', 6), spawn('roomB', 4)],
  ];

  for (const [declaredAs, declared] of [
    ['ascending', ascending],
    ['descending', descending],
  ] as const) {
    for (const [spawnedAs, providers] of [
      ['B then C', orders[0]!],
      ['C then B', orders[1]!],
    ] as const) {
      it(`needs declared ${declaredAs}, providers spawned ${spawnedAs}: the guest goes to bbb`, () => {
        const bound = content(declared);
        const world = build(bound, spawn('bedroom', 0), spawn('roomA', 2), ...providers);
        // Both challengers wait side by side from the same tick, so their pressures are equal
        // at every tick and both clear the margin together.
        const served = run(world, bound, 11, [at(world.tick, arrive)]);
        const guest = only(served);
        const bbb = findNeedState(guest.needs, 'bbb')!;
        const ccc = findNeedState(guest.needs, 'ccc')!;
        // Equal DEFICITS since G-027b, which is the same statement one model on: both are
        // decaying untouched from the same want line, so neither is ahead of the other and the
        // tie is a real tie rather than a rounding artefact.
        expect(bbb.deficit).toBe(ccc.deficit);
        expect(engagedKind(served, guest)).toBe('roomB');
        expect(abandonCountOf(guest, 'aaa')).toBe(1);
      });
    }
  }
});

describe('two providers of the CHALLENGER need, tied on fit: the lower entity id wins', () => {
  // LABELLED PATH COVERAGE, NOT EVIDENCE (`ai-critic`, MINOR 2). G-014a's
  // `utility.tiebreak.test.ts` already discharges "equal-fit providers go to the lower entity
  // id" through the same `findFreeRoom` path, and this goal changed nothing about it. What
  // is here is the assurance that the rule still holds when the search is reached from the
  // ABANDON branch rather than from the fresh-engagement branch — a different caller, the
  // same code. If this ever disagrees with `utility.tiebreak.test.ts`, one of them is lying.
  const content = bindContent({
    roomTypes: [
      roomType('bedroom', ['rest']),
      // Both declare a fit, because `bindContent` refuses half a fit table: a silent
      // provider would score 0 and lose every comparison, which reads as a ranking rather
      // than as an omission (`assertFitIsReadable`).
      roomType('roomA', ['aaa'], 5_000),
      roomType('roomB', ['bbb'], 5_000),
    ],
    needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
    guestRules: rules(1_000),
  });

  for (const [label, providers] of [
    ['left then right', [spawn('roomB', 4), spawn('roomB', 6)]],
    ['right then left', [spawn('roomB', 6), spawn('roomB', 4)]],
  ] as const) {
    it(`spawned ${label}: the guest switches to the lower-id roomB, and the CELL differs`, () => {
      const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), ...providers);
      const served = run(world, content, 11, [at(world.tick, arrive)]);
      const guest = only(served);
      const chosen = entitiesInOrder(served.entities).find((entity) => entity.id === guest.engagement!.entityId)!;
      const roomBs = entitiesInOrder(served.entities).filter((entity) => entity.kind === 'roomB');
      expect(roomBs).toHaveLength(2);
      expect(chosen.id).toBe(Math.min(...roomBs.map((entity) => entity.id)));
      // The half that makes two orders worth running: under "first found" the same CELL would
      // win both times.
      expect(chosen.at).toEqual(label === 'left then right' ? { floor: 0, column: 4 } : { floor: 0, column: 6 });
    });
  }
});

// ============================================================================
//  MAJOR 4(a) — THE SEARCH SUCCEEDS FIRST. A GUEST NEVER ABANDONS INTO NOTHING.
// ============================================================================

describe('a challenger that clears the margin but has NO free provider changes nothing', () => {
  // §6.1's "reads as stupid" in its literal form: a guest that walks out of the café, finds
  // the games room taken, and stands in the corridor holding nothing. Under an
  // implementation that released the incumbent and then searched, this is what the run would
  // show — and `abandoned` would climb while satisfaction fell.

  it('NO PROVIDER AT ALL: the guest stays engaged long past the margin, and abandons nothing', () => {
    const content = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa', 'bbb'])],
      needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
      guestRules: rules(1_000),
    });
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2));
    // Fifty ticks: five times the margin's worth of gap, and half of `bbb`'s whole capacity.
    const served = run(world, content, 51, [at(world.tick, arrive)]);
    const guest = only(served);
    expect(engagedKind(served, guest)).toBe('roomA');
    expect(abandonCountOf(guest, 'aaa')).toBe(0);
    expect(guest.engagement!.needId).toBe('aaa');
  });

  it('THE ONLY PROVIDER IS THE ONE IT IS ALREADY HOLDING: still no switch, because `held` excludes it', () => {
    // The incumbent cannot self-select. `findFreeRoom` skips everything in `held`, and the
    // guest's own provider is in `held` — so "switch to the thing I am already at" is
    // unrepresentable rather than merely unlikely.
    //
    // AND THIS IS THE PARKED PRICE OF THE ORDERING, MADE VISIBLE. `roomA` serves BOTH needs,
    // so a guest that could see what it already holds would satisfy `bbb` without moving.
    // It cannot, because the search that decides the switch runs while the room is held. No
    // shipped content reaches this — nothing in `packages/content/data` provides two needs —
    // and closing it needs a different decision. -> `PARKING.md`.
    const content = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa', 'bbb'])],
      needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
      guestRules: rules(1_000),
    });
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2));
    const served = run(world, content, 51, [at(world.tick, arrive)]);
    const guest = only(served);
    expect(guest.engagement).not.toBeNull();
    expect(abandonCountOf(guest, 'aaa')).toBe(0);
  });

  it('ANOTHER GUEST HOLDS IT: the first guest keeps what it has rather than dropping it for nothing', () => {
    // The contended form, and the one a player would actually see. Two guests, one provider
    // of each need: whoever gets `roomB` keeps it, and the other does not abandon `roomA` to
    // stand in the corridor.
    const content = twoNeeds(1_000);
    const world = build(content, spawn('bedroom', 0), spawn('bedroom', 4), spawn('roomA', 8), spawn('roomB', 12));
    const served = run(world, content, 60, [at(world.tick, arrive), at(world.tick + 1, arrive)]);
    const guests = guestsInOrder(served.guests);
    expect(guests).toHaveLength(2);
    // Every guest is engaged with something. Nobody is holding nothing.
    for (const guest of guests) expect(guest.engagement).not.toBeNull();
    const kinds = guests.map((guest) => engagedKind(served, guest)).sort();
    expect(kinds).toEqual(['roomA', 'roomB']);
  });
});

describe('the switch RELEASES the old provider, in the same tick, to whoever wants it', () => {
  // The reservation half (§6.1), and the sharp form of it. `release` is the ONE place `held`
  // shrinks, and it un-exhausts exactly the needs the freed provider serves — so a provider
  // handed back mid-tick is available to a guest visited LATER IN THE SAME LOOP. An
  // implementation that cleared the field on the guest without going through `release` would
  // leave the freed room invisible for the rest of the tick: a guest standing in the lobby
  // beside an empty café, which is `findFreeRoom`'s whole soundness argument in one line.
  //
  // THE SAME-TICK HANDOFF IS WHAT MAKES THIS TEST BITE, and reading the run a tick later
  // would not: `held` is rebuilt from the guests' own reservations at the top of every tick,
  // so a missing `release` costs exactly ONE tick of visibility and then heals itself. A test
  // that looked at the end state would see the handoff happen anyway, one tick late, and
  // report green. Asked at the tick of the switch, it sees the difference.
  const content = twoNeeds(1_000);

  /**
   * Two guests arriving on the SAME tick, so their needs stay in lockstep and both reach the
   * margin together. Guest 1 is visited first and takes roomA; guest 2 takes a roomB. When
   * the margin clears, guest 1 moves to the free roomB and hands roomA back — and guest 2,
   * visited later in that same loop, is the guest that wants it.
   */
  const twoGuests = (ticks: number): World => {
    const world = build(
      content,
      spawn('bedroom', 0),
      spawn('bedroom', 4),
      spawn('roomA', 8),
      spawn('roomB', 12),
      spawn('roomB', 16),
    );
    return run(world, content, ticks + 1, [at(world.tick, arrive), at(world.tick, arrive)]);
  };

  const engagements = (world: World): readonly string[] =>
    guestsInOrder(world.guests).map((guest) => engagedKind(world, guest) ?? 'nothing');

  it('the two guests start on different providers, or there is no handoff to observe', () => {
    expect(engagements(twoGuests(1))).toEqual(['roomA', 'roomB']);
  });

  it('ON THE TICK OF THE SWITCH, the second guest already holds the provider the first let go', () => {
    // Ten ticks is where the gap first reaches the margin — the same relation the boundary
    // block computes. Guest 1 leaves roomA for the spare roomB; guest 2 leaves its roomB for
    // roomA. Both movements happen inside one call to `stepGuests`.
    const world = twoGuests(10);
    expect(engagements(world)).toEqual(['roomB', 'roomA']);
    const guests = guestsInOrder(world.guests);
    const held = guests.map((guest) => guest.engagement!.entityId);
    expect(new Set(held).size).toBe(2);
    expect(guests.map((guest) => abandonCountOf(guest, 'aaa') + abandonCountOf(guest, 'bbb'))).toEqual([1, 1]);
  });

  it('and nobody ever holds two providers or none, at any tick across the whole run', () => {
    // The leak this would produce if a challenger were speculatively added to `held` before
    // the decision to switch. It never surfaces in the need table — it surfaces as `orphan
    // res` and `stuck` in a run, and as a guest with two reservations here.
    for (let ticks = 1; ticks <= 30; ticks += 1) {
      const world = twoGuests(ticks);
      const guests = guestsInOrder(world.guests);
      const held = guests.flatMap((guest) => (guest.engagement === null ? [] : [guest.engagement.entityId]));
      expect(held, `tick ${ticks}`).toHaveLength(guests.length);
      expect(new Set(held).size, `tick ${ticks}`).toBe(held.length);
    }
  });
});

// ============================================================================
//  WITHIN ONE NEED, COMMITMENT IS STILL TOTAL.
// ============================================================================

describe('a guest never leaves a half-eaten meal to eat the same meal at a nicer table', () => {
  it('a better-fit provider of the SAME need appearing later does not move the guest', () => {
    const content = bindContent({
      roomTypes: [
        roomType('bedroom', ['rest']),
        roomType('roomA', ['aaa'], 2_500),
        roomType('fancyA', ['aaa'], 7_500),
        roomType('roomB', ['bbb'], 5_000),
      ],
      needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
      guestRules: rules(1_000),
    });
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2));
    // Engaged with the worse one, because it is the only one. Five ticks later a better one
    // exists and is free — and the guest stays where it is.
    let served = run(world, content, 4, [at(world.tick, arrive)]);
    expect(engagedKind(served, only(served))).toBe('roomA');
    served = stepTick(served, content, [spawn('fancyA', 4)]);
    served = run(served, content, 5, []);
    expect(engagedKind(served, only(served))).toBe('roomA');
    expect(abandonCountOf(only(served), 'aaa')).toBe(0);
  });
});

// ============================================================================
//  THE MARGIN IS CONTENT, AND ITS ABSENCE IS AN ERA (ADR-0008).
// ============================================================================

describe('content that declares no MARGIN is content from before the margin', () => {
  // REACHED AT THE `bindContent` / `SimContent` LEVEL, BECAUSE NO HOST CAN REACH IT
  // (`ai-critic`, MINOR 4). `loadContent` reads five fixed filenames and `readContentFile`
  // throws on a missing one, so a `--content` directory without `guest-rules.json` is
  // refused rather than defaulted. The absent-margin branch is therefore only reachable from
  // an injected `SimContent` — which is exactly what a save taken under pre-G-014b content
  // is, and what M5's bundler-fed host could be. ADR-0007: a branch nothing exercises is a
  // branch nobody has checked.
  //
  // ============================================================================
  // WHAT G-027a CHANGED HERE, AND IT IS A REAL NARROWING RATHER THAN A RENAME.
  //
  // These arms used to omit the `guestRules` TABLE entirely, which was the literal
  // pre-G-014b document. **That document can no longer be run at all** when it declares a
  // lodging need: `assertEveryStayCanEnd` refuses it, because a stay duration has no
  // historical value to fall back on and a guest without one would check in and never leave.
  //
  // So the era statement is made in the only shape that still runs — a table that declares
  // the stay and says nothing about the margin — and it is the same claim: `abandonMarginOf`
  // reads absence as TOTAL COMMITMENT, and a world driven under it behaves exactly like one
  // driven at the saturating value. The whole-table-absent case keeps its own arm below,
  // over content with no lodging need, which is the only content that can still express it.
  // ============================================================================
  const marginless = twoNeeds(undefined);
  const saturating = twoNeeds(ONE_WHOLE_BASIS_POINTS);
  const live = twoNeeds(1_000);

  it('reads as TOTAL COMMITMENT, which is the smallest value at which the branch is unreachable', () => {
    expect(marginless.content.guestRules?.[0]).not.toHaveProperty('abandonMarginBasisPoints');
    expect(abandonMarginOf(marginless)).toBe(ONE_WHOLE_BASIS_POINTS);
  });

  it('and so does a content set with NO guest-rules table, which needs a hotel nobody lodges in', () => {
    // The literal pre-G-014b document, kept reachable at the one place it still binds.
    //
    // IT HAS NO NEED TYPES AT ALL, AND THAT IS FORCED RATHER THAN CHOSEN. Every content set
    // that declares a need declares a LODGING need — `lodgingNeedIn` falls back to the lowest
    // id when no role is written, and `assertLodgingNeedIsUnambiguous` refuses a table that
    // declares roles and names no lodging one. So "declares needs and has no lodging need" is
    // not a document that exists, and the only content `assertEveryStayCanEnd` has nothing to
    // say about is content with no needs. That is exactly `SAVE_V1_CONTENT`'s shape, which is
    // why the permanent fixture still binds (ADR-0006).
    const noTable = bindContent({ roomTypes: [roomType('roomA', [])] });
    expect(noTable.content.guestRules).toBeUndefined();
    expect(Object.keys(noTable.content)).not.toContain('guestRules');
    expect(abandonMarginOf(noTable)).toBe(ONE_WHOLE_BASIS_POINTS);
  });

  it('and the ABSENT table and a SATURATING one produce the same simulation', () => {
    const drive = (content: BoundContent): World => {
      const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
      return run(world, content, 60, [at(world.tick, arrive)]);
    };
    const absent = only(drive(marginless));
    const declared = only(drive(saturating));
    expect(absent.needs).toEqual(declared.needs);
    expect(absent.engagement).toEqual(declared.engagement);
    expect(abandonCountOf(absent, 'aaa')).toBe(0);
  });

  it('while the SHIPPED-shaped margin does move, so the comparison above is not two dead worlds', () => {
    // Read at the tick the switch is due rather than at the end of a long run. THIS FILE'S
    // CONTENT IS DELIBERATELY BELOW ITS OWN DERIVED BOUND: `M x P / 10000` is 10 ticks here
    // against engagements of 5,000, so a guest left running oscillates — which is exactly
    // what `hysteresis.bound.test.ts` forbids the SHIPPED table from doing, and exactly why
    // that bound is a criterion. Tuning is not this file's subject; the mechanism is.
    const world = build(live, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
    const served = run(world, live, 11, [at(world.tick, arrive)]);
    expect(abandonCountOf(only(served), 'aaa')).toBe(1);
    expect(engagedKind(served, only(served))).toBe('roomB');
  });

  it('and the absent table does not change the content FINGERPRINT of a world that had none', () => {
    // Absence is not emptiness. A content set with no `guestRules` key fingerprints exactly
    // as it did before this goal existed, which is what keeps a save taken under it loadable
    // (ADR-0006). Declaring the table — at ANY value, including the one that changes nothing
    // — is a different document.
    expect(marginless.fingerprint).not.toBe(saturating.fingerprint);
    expect(saturating.fingerprint).not.toBe(live.fingerprint);
    // The KEY, not the table (G-027a): a document that declares the stay and no margin is a
    // different document from one that declares both, and `cloneGuestRules` strips the absent
    // key rather than carrying `undefined` into the fingerprint.
    expect(Object.keys(marginless.content.guestRules![0]!)).not.toContain('abandonMarginBasisPoints');
  });
});

describe('bindContent refuses a margin no comparison could mean, from a host zod never saw', () => {
  // THE BOUNDARY CHECK IN `cloneGuestRules`, which shipped with nothing on it. `packages/sim`
  // takes injected data and cannot assume it came through the schema — M5's bundler, a test
  // fixture and a save-derived `SimContent` are all raw hosts — so the range is re-checked at
  // bind time with the table named, which is the `cloneEconomy` and `assertFitValue`
  // discipline. `registry.test.ts` owns the disk-side half of the same rule.
  const withMargin = (abandonMarginBasisPoints: unknown): (() => unknown) =>
    () =>
      bindContent({
        roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa'])],
        needTypes: [need('aaa', false), need('rest', true)],
        guestRules: [
          {
            id: 'houseRules',
            name: 'House Rules',
            abandonMarginBasisPoints,
            stayDurationTicks: STAY,
            toleranceTicks: STAY,
            wantAtBasisPoints: WANT_AT,
          } as GuestRulesData,
        ],
      });

  it('refuses a negative, an over-range and a fractional margin, naming the field', () => {
    for (const bad of [-1, ONE_WHOLE_BASIS_POINTS + 1, 6_000.5, Number.NaN]) {
      expect(withMargin(bad), String(bad)).toThrow(/abandonMarginBasisPoints/);
    }
  });

  it('and accepts both ends and the middle, because all three mean something', () => {
    for (const good of [0, 1, 6_000, ONE_WHOLE_BASIS_POINTS]) {
      expect(withMargin(good), String(good)).not.toThrow();
    }
  });

  it('and strips the key when it is absent rather than carrying undefined into the fingerprint', () => {
    // An absent key and a key holding `undefined` are different documents to `hashJson`, and
    // only the absent form is the "predates the margin" statement (ADR-0006). The
    // `cloneNeedType` role contract exactly.
    const bound = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa'])],
      needTypes: [need('aaa', false), need('rest', true)],
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: STAY, toleranceTicks: STAY, wantAtBasisPoints: WANT_AT },
      ],
    });
    // The other three keys are present because this content declares a lodging need and
    // `bindContent` refuses it otherwise (G-027a for the stay, G-027b for the wait and the
    // want line); the MARGIN key is the one under test, and it is still absent rather than
    // `undefined`.
    expect(Object.keys(bound.content.guestRules![0]!)).toEqual([
      'id',
      'name',
      'stayDurationTicks',
      'wantAtBasisPoints',
      'toleranceTicks',
    ]);
    expect(abandonMarginOf(bound)).toBe(ONE_WHOLE_BASIS_POINTS);
  });
});

describe('a margin of ZERO is the thrash control, and it thrashes', () => {
  // The other end. It must stay loadable — `bindContent` refuses no margin, deliberately —
  // because it is the arm criterion 3 measures the shipped margin against.
  it('re-decides as soon as the gap opens at all, where the shipped-shaped margin never does', () => {
    // TWO-SIDED, AND IT HAD TO BECOME SO AT G-027b. The old form asserted "more than ten
    // switches in sixty ticks", which was true when the only thing standing between a guest
    // and a switch was the margin. It is not the only thing any more: a challenger must also
    // be WANTED, and a need that was just served sits below its want line until it decays back
    // to it. So the want line damps thrash on its own and a margin of zero yields four
    // switches in sixty ticks rather than sixty.
    //
    // A bare "more than one" would be a weaker claim than the old one, so the arm is paired:
    // the same run at a margin the shipped table's size produces NONE. Thrash against no
    // thrash is what this control was always for.
    const thrashing = twoNeeds(0);
    const damped = twoNeeds(6_000);
    const swaps = (content: BoundContent): number => {
      const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
      const guest = only(run(world, content, 60, [at(world.tick, arrive)]));
      return abandonCountOf(guest, 'aaa') + abandonCountOf(guest, 'bbb');
    };
    expect(swaps(thrashing)).toBeGreaterThan(1);
    expect(swaps(damped)).toBe(0);
  });

  it('and a departing guest carries its whole history into the tally, not a flag', () => {
    // `abandoned` is a COUNT. A guest that dithered twenty times and one that dithered once
    // must be different numbers, or the margin has nothing to be tuned against.
    const content = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa']), roomType('roomB', ['bbb'])],
      needTypes: [
        // SMALLER STOCKS THAN THE REST OF THIS FILE USES. This case needs a stay that ENDS
        // inside the run, and `assertLodgingBecomesWanted` refuses a want line further out
        // than a short stay generates away-time for — so the lodging capacity comes down with
        // the stay. The thrash is unchanged: at margin 0 the guest re-decides every tick.
        need('aaa', false),
        need('bbb', false),
        { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 8 },
      ],
      // `rules(0)` carries this file's enormous `STAY`, which would keep the guest here past
      // the end of the run. The stay is the thing this case needs to END, so it declares its
      // own — and it is the one place in this file where the checkout terminator is wanted
      // rather than pushed out of the way.
      guestRules: [
        {
          id: 'houseRules',
          name: 'House Rules',
          abandonMarginBasisPoints: 0,
          stayDurationTicks: 30,
          toleranceTicks: 60,
          wantAtBasisPoints: WANT_AT,
        },
      ],
    });
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
    const served = run(world, content, 60, [at(world.tick, arrive)]);
    expect(guestsInOrder(served.guests)).toHaveLength(0);
    const row = needOutcomeOf(served.needOutcomes, 'aaa');
    expect(row).toBeDefined();
    expect(row!.abandoned).toBeGreaterThan(0);
    expect(row!.met + row!.unmet).toBe(1);
    // And the lodging need is never abandoned: it is not a candidate in the scoring loop.
    expect(needOutcomeOf(served.needOutcomes, 'rest')!.abandoned).toBe(0);
  });
});

// ============================================================================
//  THE REST OF THE §5.8 SWEEP: EVERY OTHER NEW CLAUSE THIS GOAL ADDED, DRIVEN.
//
//  `ai-critic` raised two instances of "correct code, nothing wired to it" at sweep 1 — the
//  `guest-rules.json` validation boundary and the three new invariant clauses — and
//  `HOTELSIM.md` §5.8 says a fix on a known class must state where else that class lives and
//  whether it was checked. It was, by walking this goal's own diff. Three more instances were
//  found and are below; the two DEFENSIVE POSTCONDITIONS this goal added are named in the
//  report as deliberately undriven, because ADR-0007's G-003 amendment distinguishes them:
//  unreachable-given-the-checks-above is what a correct postcondition looks like, and it can
//  mislead nobody, where a VACUOUS check is one relied on as evidence.
// ============================================================================

describe('two guest-rules entries: the LOWEST ID decides the margin, whatever the file order', () => {
  // THE OTHER HALF OF THE DUPLICATE-ID REFUSAL. `registry.test.ts` stops two entries sharing
  // an id; this pins what happens when they differ, which is the property that makes
  // `abandonMarginOf` order-independent (I2). `bindContent` normalises the table, so the
  // answer must not depend on which entry a designer typed first — and the table is a list
  // precisely because M6 wants per-archetype rules, so this stops being hypothetical then.
  const twoRules = (first: GuestRulesData, second: GuestRulesData): BoundContent =>
    bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa'])],
      needTypes: [need('aaa', false), need('rest', true)],
      guestRules: [first, second],
    });
  const alpha: GuestRulesData = {
    id: 'aaaRules',
    name: 'A',
    abandonMarginBasisPoints: 1_000,
    stayDurationTicks: STAY,
    toleranceTicks: STAY,
    wantAtBasisPoints: WANT_AT,
  };
  const omega: GuestRulesData = {
    id: 'zzzRules',
    name: 'Z',
    abandonMarginBasisPoints: 9_000,
    stayDurationTicks: STAY,
    toleranceTicks: STAY,
    wantAtBasisPoints: WANT_AT,
  };

  it('takes the lower id in both declaration orders, and the two orders fingerprint alike', () => {
    const forward = twoRules(alpha, omega);
    const reversed = twoRules(omega, alpha);
    expect(abandonMarginOf(forward)).toBe(1_000);
    expect(abandonMarginOf(reversed)).toBe(1_000);
    // Normalisation, not luck: the same table typed two ways is the same document.
    expect(forward.fingerprint).toBe(reversed.fingerprint);
  });
});

describe('abandonNeed is the one place the count moves, and it refuses a FULL need', () => {
  // The guard exists because a caller that reached a need nothing could still be serving must
  // not be able to invent a history for it. The TICK cannot reach that state — step 5 releases
  // an engagement the moment its need reaches full, before step 7 can abandon anything — which
  // is exactly why it is driven here rather than left to the loop.
  //
  // "A FAILED NEED" IS NO LONGER ONE OF THE CASES, and its absence is the model rather than an
  // omission: an EMPTY need is a need a guest is still pursuing hardest of all, so abandoning
  // one is legal and is counted. Only FULL is refused, and the guard reads `deficit === 0`
  // rather than the wanting predicate — see `abandonNeed`.
  const state = (deficit: number): NeedState => ({
    needId: 'aaa',
    deficit,
    metBy: deficit === 0 ? 'room' : null,
    abandonCount: 0,
    unservedTicks: 0,
  });

  it('increments a need that is still wanted by one and leaves its deficit alone', () => {
    const before = [state(5)];
    const after = abandonNeed(before, 'aaa');
    expect(after[0]).toEqual({ ...before[0], abandonCount: 1, unservedTicks: 0 });
    expect(after).not.toBe(before);
  });

  it('returns the SAME ARRAY for a FULL need and for a need that is not there', () => {
    const full = [state(0)];
    expect(abandonNeed(full, 'aaa')).toBe(full);
    expect(abandonNeed(full, 'zzz')).toBe(full);
    // And an EMPTY need is NOT refused: nothing is terminal, so a guest can walk out on the
    // thing it wants most. This is the case the countdown model called "failed" and skipped.
    const empty = [state(ENGAGEMENT_CAPACITY)];
    expect(abandonNeed(empty, 'aaa')).not.toBe(empty);
    expect(abandonNeed(empty, 'aaa')[0]!.abandonCount).toBe(1);
  });

  it('and it touches nothing but the one need it is given', () => {
    const before = [state(5), { ...state(5), needId: 'bbb' }];
    const after = abandonNeed(before, 'bbb');
    expect(after[0]).toBe(before[0]);
    expect(after[1]!.abandonCount).toBe(1);
  });
});

describe('assertNeedVector refuses a corrupt abandonCount, like every other counter on a need', () => {
  // Its sibling — `deficit` — is driven at load
  // (`needs.save.test.ts`, `guest.save.test.ts`). The MISSING-key case for this field is
  // driven by `needs.hysteresis.save.test.ts`'s unmigrated-v8 world; the corrupt-VALUE case
  // was not driven by anything until this block.
  const vector = (abandonCount: unknown): unknown[] => [
    { needId: 'aaa', deficit: 5, metBy: null, abandonCount, unservedTicks: 0 },
  ];
  /** The same vector with the OTHER counter under test, so one helper cannot mask the other. */
  const counted = (unservedTicks: unknown): unknown[] => [
    { needId: 'aaa', deficit: 5, metBy: null, abandonCount: 0, unservedTicks },
  ];

  it('refuses a negative, a fraction and a non-number, naming the field and the guest', () => {
    for (const bad of [-1, 1.5, Number.NaN, '2']) {
      expect(() => assertNeedVector(vector(bad), 41), String(bad)).toThrow(
        /negative or non-integer abandonCount/,
      );
    }
    expect(() => assertNeedVector(vector(-1), 41)).toThrow(/guest 41/);
  });

  it('and accepts 0 and any positive integer, because a guest may change its mind often', () => {
    for (const good of [0, 1, 99]) {
      expect(() => assertNeedVector(vector(good), 41), String(good)).not.toThrow();
    }
  });

  // AND `unservedTicks` IS THE SAME KIND OF FIELD, SO IT GETS THE SAME THREE CASES (G-028a).
  // The block's title says "like every other counter on a need", and a counter added without
  // its cases here would make that sentence false the day it shipped.
  it('refuses a negative, a fraction, a non-number and a MISSING unservedTicks', () => {
    for (const bad of [-1, 1.5, Number.NaN, '2']) {
      expect(() => assertNeedVector(counted(bad), 41), String(bad)).toThrow(
        /negative or non-integer unservedTicks/,
      );
    }
    expect(() => assertNeedVector(counted(-1), 41)).toThrow(/guest 41/);
    // The missing key is a DIFFERENT message from a corrupt value, because at load an absent
    // key and a 0 are different statements — only this case can tell a v16 world from a v15
    // one that skipped its migration.
    expect(() => assertNeedVector([{ needId: 'aaa', deficit: 5, metBy: null, abandonCount: 0 }], 41)).toThrow(
      /has no unservedTicks field/,
    );
  });

  it('and accepts 0 and any positive integer, because a hotel may fail a guest for a long time', () => {
    for (const good of [0, 1, 99]) {
      expect(() => assertNeedVector(counted(good), 41), String(good)).not.toThrow();
    }
  });
});

// ============================================================================
//  THE CLAUSE THAT MAKES MAJOR 4(b)'s DECISION STRUCTURAL, WATCHED GOING RED.
// ============================================================================

describe('a tally row cannot carry an abandonment before a guest that formed the need has left', () => {
  // THIS IS THE STRUCTURAL WITNESS THE `NeedOutcome.abandoned` MATRIX CLAIMS, AND UNTIL NOW
  // NOTHING HAD EVER SEEN IT TRIP. The matrix says an implementation that incremented the
  // TALLY mid-stay — rather than folding it out of a departing guest's own need state —
  // "trips it on the first abandonment of the run". A justification for a design decision
  // that rests on a branch nobody has watched fire is ADR-0007's subject with the argument
  // pointing at itself, and `ai-critic` said so.
  //
  // `needs.test.ts`'s ordering case uses non-zero `abandoned` beside non-zero met/unmet,
  // which PASSES this clause without exercising it. These drive both sides of it.
  const row = (over: Partial<{ met: number; unmet: number; abandoned: number }> = {}) => ({
    needId: 'aaa',
    met: 0,
    unmet: 0,
    metByItem: 0,
    abandoned: 0,
    unservedTicks: 0,
    instanceTicks: 0,
    ...over,
  });

  it('THROWS on a row that abandoned something before anything resolved — the mid-stay increment', () => {
    expect(() => assertNeedOutcomes([row({ abandoned: 1 })], 5)).toThrow(
      /records 1 abandonment\(s\) but no instance of it has resolved/,
    );
  });

  it('and it is the ABANDONMENT that trips it, not the empty row: 0 abandoned is fine', () => {
    expect(() => assertNeedOutcomes([row()], 5)).not.toThrow();
  });

  it('and one resolved instance is enough to license any number of abandonments', () => {
    // Deliberately NOT `abandoned <= departed`: a guest may abandon the same need many times,
    // so no such bound exists. The clause has a stated blind spot and this is its edge.
    expect(() => assertNeedOutcomes([row({ met: 1, abandoned: 99 })], 5)).not.toThrow();
    expect(() => assertNeedOutcomes([row({ unmet: 1, abandoned: 99 })], 5)).not.toThrow();
  });

  it('and the counter is still a non-negative integer, checked by name', () => {
    expect(() => assertNeedOutcomes([row({ met: 1, abandoned: -1 })], 5)).toThrow(/abandoned for "aaa"/);
    expect(() => assertNeedOutcomes([row({ met: 1, abandoned: 1.5 })], 5)).toThrow(/abandoned for "aaa"/);
  });
});

// ============================================================================
//  THE ITEM PATH, WHICH IS THE SAME PATH.
// ============================================================================

describe('an item can be abandoned and an item can be switched to', () => {
  // `providersFor` returns rooms and items in one list, so nothing in the decision knows the
  // difference. Asserted rather than assumed, because G-013's release site DID once answer
  // `[]` for every item and left a freed vending machine invisible for the rest of a tick.
  const content = bindContent({
    roomTypes: [
      roomType('bedroom', ['rest']),
      roomType('hostA', [], undefined, ['machineA']),
      roomType('hostB', [], undefined, ['machineB']),
    ],
    needTypes: [need('aaa', false), need('bbb', false), need('rest', true)],
    itemTypes: [itemType('machineA', ['aaa'], 5_000), itemType('machineB', ['bbb'], 5_000)],
    guestRules: rules(1_000),
  });

  it('the guest walks from one machine to the other, and the abandoned machine is freed', () => {
    const world = build(content, spawn('bedroom', 0), spawn('hostA', 2), spawn('machineA', 2), spawn('hostB', 4), spawn('machineB', 4));
    const served = run(world, content, 11, [at(world.tick, arrive)]);
    const guest = only(served);
    expect(engagedKind(served, guest)).toBe('machineB');
    expect(abandonCountOf(guest, 'aaa')).toBe(1);
  });
});
