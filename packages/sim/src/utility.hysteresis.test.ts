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
// Both engagement needs have `patienceTicks` 100, so one tick of waiting moves a need's
// pressure by exactly 10000/100 = 100 basis points. The incumbent is SERVED, so its patience
// is pinned at its cap and its pressure stays at 0 (`advanceNeed`'s cap branch). So after n
// ticks of engagement the gap between a waiting challenger and the incumbent is exactly
// 100n, and a margin of M is first cleared at n = M/100.
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
  isNeedPending,
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

/** One tick of waiting moves a need with this patience by exactly 100 basis points. */
const ENGAGEMENT_PATIENCE = 100;
const BASIS_POINTS_PER_TICK = ONE_WHOLE_BASIS_POINTS / ENGAGEMENT_PATIENCE;

/** Long enough that no engagement in this file ever finishes on its own. */
const ENGAGEMENT_SATISFY = 5_000;

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
  // thing that can end an engagement is the decision this file is about.
  satisfyTicks: lodging ? 100_000 : ENGAGEMENT_SATISFY,
  patienceTicks: lodging ? 100_000 : ENGAGEMENT_PATIENCE,
});

const rules = (abandonMarginBasisPoints: number): readonly GuestRulesData[] => [
  { id: 'houseRules', name: 'House Rules', abandonMarginBasisPoints },
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
    ...(margin === undefined ? {} : { guestRules: rules(margin) }),
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
//  CRITERION 3's SATURATION CLAUSE, PINNED AT `isNeedPending`'s DEFINITION.
// ============================================================================

describe('a PENDING need can never reach one whole, so a margin of one whole is total commitment', () => {
  // WHY THIS IS NOT A GRID OVER CONSTRUCTED PAIRS. A grid SAMPLES the property: it shows
  // that pressure stayed under 10,000 for the pairs somebody thought of. The property is a
  // consequence of one definition, so the test follows the definition instead — the
  // orchestrator's ruling at PLAN, and it is a better test for being three assertions
  // rather than a hundred.
  const type = (patienceTicks: number): NeedTypeData => ({
    id: 'x',
    name: 'x',
    role: 'engagement',
    satisfyTicks: 1,
    patienceTicks,
  });
  const state = (patienceRemaining: number): NeedState => ({
    needId: 'x',
    patienceRemaining,
    progressRemaining: 1,
    metBy: null,
    abandonCount: 0,
  });

  it('STEP 1 — `isNeedPending` is false at patienceRemaining 0 and true at 1, so a pending need has at least 1', () => {
    expect(isNeedPending(state(0))).toBe(false);
    expect(isNeedPending(state(1))).toBe(true);
  });

  it('STEP 2 — so the most urgent PENDING need of any patience scores under one whole', () => {
    // `patienceRemaining: 1` is the extreme step 1 licenses, and pressure falls as patience
    // remaining rises, so this is the maximum over every pending state of that patience.
    // Driven across four orders of magnitude of `patienceTicks` — including 1, where the
    // extreme is also the ONLY pending state — rather than over a grid of pairs.
    for (const patienceTicks of [1, 2, 100, 10_000, 1_000_000]) {
      const need = state(1);
      expect(isNeedPending(need)).toBe(true);
      expect(pressureBasisPoints(type(patienceTicks), need)).toBeLessThanOrEqual(
        MAX_PENDING_PRESSURE_BASIS_POINTS,
      );
    }
    expect(MAX_PENDING_PRESSURE_BASIS_POINTS).toBe(ONE_WHOLE_BASIS_POINTS - 1);
  });

  it('STEP 3 — and the saturating branch is REAL: it fires, but only for a need that is not pending', () => {
    // ADR-0007's other half. "Unreachable for a pending need" is only interesting if the
    // branch exists at all; a `pressureBasisPoints` that could never return one whole would
    // satisfy step 2 while inspecting nothing.
    const spent = state(0);
    expect(pressureBasisPoints(type(100), spent)).toBe(ONE_WHOLE_BASIS_POINTS);
    expect(isNeedPending(spent)).toBe(false);
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
   * The incumbent is served, so its patience sits at its cap and its pressure is 0; the
   * challenger waits, so its pressure rises `BASIS_POINTS_PER_TICK` a tick. The gap first
   * REACHES the margin after `margin / rate` ticks of waiting.
   */
  const dueAfter = abandonMarginOf(content) / BASIS_POINTS_PER_TICK;

  it('the arithmetic this file rests on is what the content actually says', () => {
    expect(abandonMarginOf(content)).toBe(MARGIN);
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
    expect(pressureBasisPoints(type('aaa'), incumbent)).toBe(0);
    expect(pressureBasisPoints(type('bbb'), challenger)).toBe(MARGIN - BASIS_POINTS_PER_TICK);
    expect(engagedKind(world, guest)).toBe('roomA');
    expect(abandonCountOf(guest, 'aaa')).toBe(0);
  });

  it('EXACTLY ON IT (gap = margin): the guest switches, and the incumbent carries the abandonment', () => {
    const world = after(dueAfter);
    const guest = only(world);
    const type = (id: string): NeedTypeData => content.content.needTypes!.find((entry) => entry.id === id)!;
    expect(pressureBasisPoints(type('bbb'), findNeedState(guest.needs, 'bbb')!)).toBe(MARGIN);
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
    expect(abandoned.progressRemaining).toBeLessThan(ENGAGEMENT_SATISFY);
    expect(abandoned.progressRemaining).toBe(ENGAGEMENT_SATISFY - dueAfter);
    expect(isNeedPending(abandoned)).toBe(true);
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
        expect(bbb.patienceRemaining).toBe(ccc.patienceRemaining);
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
    // Fifty ticks: five times the margin's worth of gap, and half of `bbb`'s whole patience.
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

describe('content that declares no guest rules is content from before the margin', () => {
  // REACHED AT THE `bindContent` / `SimContent` LEVEL, BECAUSE NO HOST CAN REACH IT
  // (`ai-critic`, MINOR 4). `loadContent` reads five fixed filenames and `readContentFile`
  // throws on a missing one, so a `--content` directory without `guest-rules.json` is
  // refused rather than defaulted. The absent-table branch is therefore only reachable from
  // an injected `SimContent` — which is exactly what a save taken under pre-G-014b content
  // is, and what M5's bundler-fed host could be. ADR-0007: a branch nothing exercises is a
  // branch nobody has checked.
  const marginless = twoNeeds(undefined);
  const saturating = twoNeeds(ONE_WHOLE_BASIS_POINTS);
  const live = twoNeeds(1_000);

  it('reads as TOTAL COMMITMENT, which is the smallest value at which the branch is unreachable', () => {
    expect(marginless.content.guestRules).toBeUndefined();
    expect(abandonMarginOf(marginless)).toBe(ONE_WHOLE_BASIS_POINTS);
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
    expect(Object.keys(marginless.content)).not.toContain('guestRules');
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
          { id: 'houseRules', name: 'House Rules', abandonMarginBasisPoints } as GuestRulesData,
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
      guestRules: [{ id: 'houseRules', name: 'House Rules' }],
    });
    expect(Object.keys(bound.content.guestRules![0]!)).toEqual(['id', 'name']);
    expect(abandonMarginOf(bound)).toBe(ONE_WHOLE_BASIS_POINTS);
  });
});

describe('a margin of ZERO is the thrash control, and it thrashes', () => {
  // The other end. It must stay loadable — `bindContent` refuses no margin, deliberately —
  // because it is the arm criterion 3 measures the shipped margin against.
  it('re-decides as soon as the gap opens at all, and the counter says so', () => {
    const content = twoNeeds(0);
    const world = build(content, spawn('bedroom', 0), spawn('roomA', 2), spawn('roomB', 4));
    const served = run(world, content, 60, [at(world.tick, arrive)]);
    const guest = only(served);
    // Every tick the served need's pressure falls behind the waiting one's by one step, so
    // the guest swaps at the first opportunity and keeps swapping.
    expect(abandonCountOf(guest, 'aaa') + abandonCountOf(guest, 'bbb')).toBeGreaterThan(10);
  });

  it('and a departing guest carries its whole history into the tally, not a flag', () => {
    // `abandoned` is a COUNT. A guest that dithered twenty times and one that dithered once
    // must be different numbers, or the margin has nothing to be tuned against.
    const content = bindContent({
      roomTypes: [roomType('bedroom', ['rest']), roomType('roomA', ['aaa']), roomType('roomB', ['bbb'])],
      needTypes: [
        need('aaa', false),
        need('bbb', false),
        // A stay short enough to end inside this run, so the fold at departure is what is
        // being read rather than the live guest.
        { id: 'rest', name: 'rest', role: 'lodging', satisfyTicks: 30, patienceTicks: 100 },
      ],
      guestRules: rules(0),
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
  const alpha: GuestRulesData = { id: 'aaaRules', name: 'A', abandonMarginBasisPoints: 1_000 };
  const omega: GuestRulesData = { id: 'zzzRules', name: 'Z', abandonMarginBasisPoints: 9_000 };

  it('takes the lower id in both declaration orders, and the two orders fingerprint alike', () => {
    const forward = twoRules(alpha, omega);
    const reversed = twoRules(omega, alpha);
    expect(abandonMarginOf(forward)).toBe(1_000);
    expect(abandonMarginOf(reversed)).toBe(1_000);
    // Normalisation, not luck: the same table typed two ways is the same document.
    expect(forward.fingerprint).toBe(reversed.fingerprint);
  });
});

describe('abandonNeed is the one place the count moves, and it refuses a terminal need', () => {
  // The guard exists because a caller that reached a resolved need must not be able to invent
  // a history for it. The TICK cannot reach that state — step 5 releases an engagement the
  // moment its need resolves, before step 7 can abandon anything — which is exactly why it is
  // driven here rather than left to the loop.
  const state = (progressRemaining: number, patienceRemaining: number): NeedState => ({
    needId: 'aaa',
    patienceRemaining,
    progressRemaining,
    metBy: progressRemaining === 0 ? 'room' : null,
    abandonCount: 0,
  });

  it('increments a PENDING need by one and leaves both countdowns alone', () => {
    const before = [state(5, 5)];
    const after = abandonNeed(before, 'aaa');
    expect(after[0]).toEqual({ ...before[0], abandonCount: 1 });
    expect(after).not.toBe(before);
  });

  it('returns the SAME ARRAY for a met need, a failed need, and a need that is not there', () => {
    const met = [state(0, 5)];
    const failed = [state(5, 0)];
    expect(abandonNeed(met, 'aaa')).toBe(met);
    expect(abandonNeed(failed, 'aaa')).toBe(failed);
    expect(abandonNeed(met, 'zzz')).toBe(met);
  });

  it('and it touches nothing but the one need it is given', () => {
    const before = [state(5, 5), { ...state(5, 5), needId: 'bbb' }];
    const after = abandonNeed(before, 'bbb');
    expect(after[0]).toBe(before[0]);
    expect(after[1]!.abandonCount).toBe(1);
  });
});

describe('assertNeedVector refuses a corrupt abandonCount, like every other counter on a need', () => {
  // Its siblings — `patienceRemaining` and `progressRemaining` — are both driven at load
  // (`needs.save.test.ts`, `guest.save.test.ts`). The MISSING-key case for this field is
  // driven by `needs.hysteresis.save.test.ts`'s unmigrated-v8 world; the corrupt-VALUE case
  // was not driven by anything until this block.
  const vector = (abandonCount: unknown): unknown[] => [
    { needId: 'aaa', patienceRemaining: 5, progressRemaining: 5, metBy: null, abandonCount },
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
