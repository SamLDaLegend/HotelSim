// G-065 — THE GUEST GETS A VOICE. The selection function, driven.
//
//   pnpm exec vitest run review.remark
//
// ============================================================================
// WHAT THIS FILE PINS, AND EVERY ONE OF THEM IS A PROPERTY RATHER THAN A LINE OF DIALOGUE.
// The words themselves are content and are judged by a human reading `guest-remarks.json`;
// nothing here asserts that anything is funny.
//
//   NOBODY IS MUTE          `bindGuestRemarks` refuses a table with a hole in it, naming the
//                           score and the need nothing covers. This is the "a need that cannot
//                           be satisfied is a bug" rule, one subsystem over: a guest that
//                           reaches the exit with nothing to say is a content defect found at
//                           load rather than an empty speech bubble found in play.
//   THE NUMBER IS MEASURED  `{hours}` is replaced by whole hours the simulation actually
//                           integrated, and no rendered line still carries the placeholder.
//                           HOTELSIM.md section 6.1: do not state a fact the sim never held.
//   THE CHOICE IS TOTAL     specific beats wildcard, severe beats mild, and anything still
//                           tied is settled by the guest's id. No PRNG draw, no Map iteration,
//                           no document order — re-sorting the JSON changes nothing.
//   THE STARS AGREE         the score in a `SpokenRemark` is `reviewOf`'s answer for the same
//                           stay, by construction rather than by a caller's discipline.
//   THE CALENDAR CLOSES     `TICKS_PER_HOUR` cannot be imported from `world.ts` (that would be
//                           an import cycle), so the two halves are cross-checked here.
//
// Content ids here are camelCase (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData } from './content.js';
import type { NeedState } from './needs.js';
import { bindGuestRemarks, remarkFor, reviewOf, TICKS_PER_HOUR } from './reviews.js';
import type { GuestRemarkData } from './reviews.js';
import { TICKS_PER_DAY } from './world.js';

const STAY = 1_440;
const MIN = 1;
const MAX = 5;
const HOURS_PER_DAY = 24;

const bedroom: RoomTypeData = {
  id: 'bedroom',
  name: 'Bedroom',
  capacity: 1,
  nightlyRatePence: 8_500,
  provides: ['rest'],
  requires: [],
};
const cafe: RoomTypeData = { id: 'cafe', name: 'Cafe', capacity: 1, nightlyRatePence: 0, provides: ['food'], requires: [] };
const arcade: RoomTypeData = { id: 'arcade', name: 'Arcade', capacity: 1, nightlyRatePence: 0, provides: ['fun'], requires: [] };

const needTypes: readonly NeedTypeData[] = [
  { id: 'rest', name: 'Rest', role: 'lodging', capacityTicks: 300, refillPerTick: 2 },
  { id: 'food', name: 'Food', role: 'engagement', capacityTicks: 1_400, refillPerTick: 14 },
  { id: 'fun', name: 'Fun', role: 'engagement', capacityTicks: 1_400, refillPerTick: 14 },
];

const houseRules = {
  id: 'houseRules',
  name: 'House',
  abandonMarginBasisPoints: 6_000,
  reviewScoreMin: MIN,
  reviewScoreMax: MAX,
  stayDurationTicks: STAY,
  wantAtBasisPoints: 3_000,
  toleranceTicks: 180,
  dissatisfactionCapacityTicks: 301,
  dissatisfactionReliefPerTick: 1,
};

const CONTENT = bindContent({ roomTypes: [bedroom, cafe, arcade], needTypes, guestRules: [houseRules] });

/** Content that predates reviews entirely: no scale, so no guest leaves one (ADR-0008). */
const NO_SCALE = bindContent({
  roomTypes: [bedroom, cafe, arcade],
  needTypes,
  guestRules: [
    {
      id: 'houseRules',
      name: 'House',
      abandonMarginBasisPoints: 6_000,
      stayDurationTicks: STAY,
      wantAtBasisPoints: 3_000,
      toleranceTicks: 180,
      dissatisfactionCapacityTicks: 301,
      dissatisfactionReliefPerTick: 1,
    },
  ],
});

/** A vector of the three needs, each with the given unserved-tick count, in table order. */
function vector(unserved: readonly number[]): readonly NeedState[] {
  return needTypes.map((needType, i) => ({
    needId: needType.id,
    deficit: 0,
    unservedTicks: unserved[i] ?? 0,
    reservedEntityId: 0,
  })) as unknown as readonly NeedState[];
}

/** One wildcard row per score — the minimum table that covers the whole grid. */
const WILDCARDS: readonly GuestRemarkData[] = Array.from({ length: MAX - MIN + 1 }, (_, i) => ({
  id: `wildcardAt${String(MIN + i)}`,
  name: `Wildcard ${String(MIN + i)}`,
  score: MIN + i,
  text: `nothing in particular at ${String(MIN + i)}`,
}));

const book = (extra: readonly GuestRemarkData[] = []): ReturnType<typeof bindGuestRemarks> =>
  bindGuestRemarks(CONTENT, [...WILDCARDS, ...extra]);

/**
 * One copy of a row at EVERY score on the scale.
 *
 * The fixtures below are about SELECTION and not about the scorer, and a row filed at a score
 * the arm's vector does not produce tests the wrong thing quietly — it falls through to the
 * wildcard and the assertion reads as a selection failure. Spanning the scale removes the
 * coupling: whatever `reviewOf` says about the vector, the row under test is a candidate.
 */
function atEveryScore(row: Omit<GuestRemarkData, 'score'>): readonly GuestRemarkData[] {
  return Array.from({ length: MAX - MIN + 1 }, (_, i) => ({ ...row, id: `${row.id}At${String(MIN + i)}`, score: MIN + i }));
}

describe('THE CALENDAR CLOSES — the hour is derived from world.ts and cannot be imported from it', () => {
  it('ticks per hour times hours per day is ticks per day', () => {
    // `reviews.ts` cannot import `TICKS_PER_DAY`: `world.ts` value-imports `createReviewOutcomes`
    // from it, so the arrow only goes one way and `.dependency-cruiser.cjs` makes a cycle an
    // ERROR. This is the cross-check that stands in for the import — a TEST may name both.
    expect(TICKS_PER_HOUR * HOURS_PER_DAY).toBe(TICKS_PER_DAY);
  });
});

describe('NOBODY IS MUTE — a table with a hole in it is refused at bind, with the cell named', () => {
  it('accepts the minimum covering table: one wildcard per score', () => {
    expect(book().rows).toHaveLength(MAX - MIN + 1);
  });

  it('and every stay the scorer can produce then has something to say', () => {
    // EVERY NEED AT EVERY WHOLE HOUR OF A STAY, both completed and cut short. A cell that
    // produced `undefined` or an empty line would be a guest standing at the exit with an
    // empty speech bubble.
    //
    // THE SCORES ARE COLLECTED RATHER THAN ASSUMED, and asserted afterwards. A sweep that
    // drove a loop variable called `score` while the scorer decided something else would be
    // green while inspecting one cell (ADR-0007); what says this one is not is the set below,
    // which must span the whole scale.
    const bound = book();
    const reached = new Set<number>();
    for (let need = 0; need < needTypes.length; need += 1) {
      for (let hours = 0; hours <= HOURS_PER_DAY; hours += 1) {
        for (const cutShort of [false, true]) {
          const unserved = needTypes.map((_, i) => (i === need ? hours * TICKS_PER_HOUR : 0));
          const spoken = remarkFor(bound, CONTENT, vector(unserved), cutShort, STAY, MAX, 1);
          expect(spoken, `need ${String(need)} hours ${String(hours)} cutShort ${String(cutShort)}`).toBeDefined();
          expect(spoken?.text.length).toBeGreaterThan(0);
          if (spoken !== undefined) reached.add(spoken.score);
        }
      }
    }
    // AND THE SET IS PINNED AS OBSERVED RATHER THAN AS HOPED. One starved need at a time does
    // not reach `MIN + 1` on this content: a stay that ran its course with two needs perfect
    // cannot mean the whole vector down that far, and a stay that did not run its course is
    // floored. That is the same shape as HOTELSIM.md section 1.1's finding about the shipped
    // arms occupying {1, 4, 5}, seen here through the scorer rather than through a run — and
    // pinning it is what makes this sweep evidence rather than a loop.
    expect([...reached].sort((a, b) => a - b)).toEqual([MIN, MIN + 2, MIN + 3, MAX]);
  });

  it('REFUSES a table that leaves a score uncovered, and names the score and the need', () => {
    const short = WILDCARDS.filter((row) => row.score !== MAX - 1);
    expect(() => bindGuestRemarks(CONTENT, short)).toThrow(new RegExp(`scoring ${String(MAX - 1)}`));
    expect(() => bindGuestRemarks(CONTENT, short)).toThrow(/rest|food|fun/);
  });

  it('REFUSES a table whose every row demands severity, because a calm guest is a cell too', () => {
    // `minUnservedHours` is a gate, so a row behind one covers nothing at zero hours. This is
    // the failure a coverage rule written on "is there a row at this score" would let through.
    const gated = WILDCARDS.map((row) => ({ ...row, minUnservedHours: 2 }));
    expect(() => bindGuestRemarks(CONTENT, gated)).toThrow(/zero unserved hours/);
  });

  it('REFUSES a row filed at a score this content cannot award', () => {
    const offScale: GuestRemarkData = { id: 'offScale', name: 'Off', score: MAX + 1, text: 'unreachable' };
    expect(() => bindGuestRemarks(CONTENT, [...WILDCARDS, offScale])).toThrow(/offScale/);
    expect(() => bindGuestRemarks(CONTENT, [...WILDCARDS, offScale])).toThrow(/unreachable/);
  });

  it('REFUSES a row that complains about a need this content does not declare', () => {
    const typo: GuestRemarkData = { id: 'typo', name: 'Typo', score: MAX, needId: 'restt', text: 'about nothing' };
    expect(() => bindGuestRemarks(CONTENT, [...WILDCARDS, typo])).toThrow(/typo/);
    expect(() => bindGuestRemarks(CONTENT, [...WILDCARDS, typo])).toThrow(/restt/);
  });

  it('REFUSES a table under content that declares no review scale — nothing could select a row', () => {
    expect(() => bindGuestRemarks(NO_SCALE, WILDCARDS)).toThrow(/no review scale/);
  });

  it('REFUSES a table under content that declares no need types', () => {
    // A shed and a set of house rules: nobody can form a need, so nobody can be reviewed and
    // every row in the table is a line nothing could ever select.
    const shed: RoomTypeData = { id: 'shed', name: 'Shed', capacity: 1, nightlyRatePence: 0, provides: [], requires: [] };
    const noNeeds = bindContent({ roomTypes: [shed], guestRules: [houseRules] });
    expect(() => bindGuestRemarks(noNeeds, WILDCARDS)).toThrow(/no need types/);
  });
});

describe('THE STARS AGREE — one call answers the score and the sentence', () => {
  it('reports exactly the score reviewOf gives the same stay', () => {
    const needs = vector([600, 120, 0]);
    const spoken = remarkFor(book(), CONTENT, needs, false, STAY, 3, 7);
    expect(spoken?.score).toBe(reviewOf(CONTENT, needs, false, STAY, 3));
  });

  it('and a stay that was cut short is floored, sentence and stars together', () => {
    const needs = vector([0, 0, 0]);
    const spoken = remarkFor(book(), CONTENT, needs, true, STAY, MAX, 7);
    expect(spoken?.score).toBe(MIN);
    expect(spoken?.remarkId).toBe(`wildcardAt${String(MIN)}`);
  });

  it('is SILENT under content that declares no review scale, rather than inventing a line', () => {
    // A book bound under one content, spoken under content from the era before reviews. The
    // `reviewOf` contract verbatim (ADR-0008): a run with no reviews is not a run where
    // everybody was quietly delighted.
    expect(remarkFor(book(), NO_SCALE, vector([0, 0, 0]), false, STAY, 0, 1)).toBeUndefined();
  });

  it('is SILENT for a guest that formed no needs at all', () => {
    expect(remarkFor(book(), CONTENT, [], false, STAY, MAX, 1)).toBeUndefined();
  });
});

describe('THE GRIEVANCE — the need the guest went longest without', () => {
  const ABOUT_EACH = [
    ...atEveryScore({ id: 'aboutRest', name: 'Rest', needId: 'rest', text: 'about rest' }),
    ...atEveryScore({ id: 'aboutFood', name: 'Food', needId: 'food', text: 'about food' }),
    ...atEveryScore({ id: 'aboutFun', name: 'Fun', needId: 'fun', text: 'about fun' }),
  ];

  it('picks the longest-unserved need, not the first one in the vector', () => {
    const spoken = remarkFor(book(ABOUT_EACH), CONTENT, vector([60, 120, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('about food');
  });

  it('breaks a tie by ASCENDING needId, which is a stated rule and not the vector order (I2)', () => {
    // `rest` is first in the need table and `food` sorts first by id. A tie must go to `food`,
    // which is what says the rule is the one written down rather than the one the array happens
    // to express.
    const spoken = remarkFor(book(ABOUT_EACH), CONTENT, vector([120, 120, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('about food');
  });

  it('a guest served perfectly still has a worst need, and it is spoken about', () => {
    // All three at zero, so the tie-break alone decides — and `food` is the lowest id.
    const spoken = remarkFor(book(ABOUT_EACH), CONTENT, vector([0, 0, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('about food');
  });
});

describe('THE CHOICE IS TOTAL — specific beats wildcard, severe beats mild, ties go to the id', () => {
  const specific = atEveryScore({ id: 'aboutFood', name: 'Food', needId: 'food', text: 'the specific one' });
  const severe = atEveryScore({
    id: 'aboutFoodBadly',
    name: 'Food, badly',
    needId: 'food',
    minUnservedHours: 3,
    text: 'the severe one',
  });

  it('a row that NAMES the need beats a wildcard at the same score', () => {
    const spoken = remarkFor(book(specific), CONTENT, vector([0, 240, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('the specific one');
  });

  it('and no stack of severity lets a wildcard outrank one that names the need', () => {
    // The rank is `specific * (hours + 1) + minUnservedHours`, and a candidate's
    // `minUnservedHours` is at most `hours` — so the specific term cannot be reached from below.
    // Driven at the severest wildcard the gate admits rather than argued.
    const loud = atEveryScore({ id: 'aLoudWildcard', name: 'Loud', minUnservedHours: HOURS_PER_DAY, text: 'the loud wildcard' });
    const unserved = HOURS_PER_DAY * TICKS_PER_HOUR;
    const spoken = remarkFor(book([...specific, ...loud]), CONTENT, vector([0, unserved, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('the specific one');
  });

  it('among rows that both name the need, the HIGHEST severity gate the guest clears wins', () => {
    const bound = book([...specific, ...severe]);
    const clears = remarkFor(bound, CONTENT, vector([0, 4 * TICKS_PER_HOUR, 0]), false, STAY, MAX, 1);
    expect(clears?.text).toBe('the severe one');
  });

  it('and a guest that does not clear the gate gets the milder line rather than nothing', () => {
    const bound = book([...specific, ...severe]);
    const short = remarkFor(bound, CONTENT, vector([0, 2 * TICKS_PER_HOUR, 0]), false, STAY, MAX, 1);
    expect(short?.text).toBe('the specific one');
  });

  it('THE TIE-BREAK BITES: two equally ranked rows split by guest id, in ascending id order', () => {
    // The shipped table has no tie, so this arm is driven by a table written to produce one.
    // Without it the fourth step of the selection order would be a rule nothing ever executes.
    const twin = atEveryScore({ id: 'bAboutFood', name: 'Twin', needId: 'food', text: 'the twin' });
    const bound = book([...specific, ...twin]);
    const needs = vector([0, 240, 0]);
    const said = (guestId: number): string | undefined => remarkFor(bound, CONTENT, needs, false, STAY, MAX, guestId)?.text;
    expect(said(0)).toBe('the specific one');
    expect(said(1)).toBe('the twin');
    expect(said(2)).toBe('the specific one');
    // Ids are positive in every world, and the modulo is written to be total anyway.
    expect(said(-1)).toBe('the twin');
  });

  it('DOCUMENT ORDER IS NOT AN INPUT: the same rows shuffled bind to the same answers', () => {
    const rows = [...WILDCARDS, ...specific, ...severe];
    const forward = bindGuestRemarks(CONTENT, rows);
    const backward = bindGuestRemarks(CONTENT, [...rows].reverse());
    const needs = vector([0, 240, 0]);
    expect(backward.rows.map((row) => row.id)).toEqual(forward.rows.map((row) => row.id));
    expect(remarkFor(backward, CONTENT, needs, false, STAY, MAX, 3)).toEqual(
      remarkFor(forward, CONTENT, needs, false, STAY, MAX, 3),
    );
  });

  it('is a pure function: the same stay asked twice says the same thing', () => {
    const bound = book([...specific, ...severe]);
    const needs = vector([120, 360, 30]);
    expect(remarkFor(bound, CONTENT, needs, false, STAY, 4, 11)).toEqual(
      remarkFor(bound, CONTENT, needs, false, STAY, 4, 11),
    );
  });
});

describe('THE NUMBER IS MEASURED — {hours} is an integral the simulation took (section 6.1)', () => {
  const counted = atEveryScore({
    id: 'aboutFoodCounted',
    name: 'Counted',
    needId: 'food',
    minUnservedHours: 2,
    text: 'I waited {hours} hours, and I will say it twice: {hours}',
  });

  it('replaces every occurrence with the whole hours that need went unserved', () => {
    const spoken = remarkFor(book(counted), CONTENT, vector([0, 9 * TICKS_PER_HOUR, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toBe('I waited 9 hours, and I will say it twice: 9');
  });

  it('FLOORS rather than rounds, so the guest never claims an hour it did not spend', () => {
    const nearly = 9 * TICKS_PER_HOUR + (TICKS_PER_HOUR - 1);
    const spoken = remarkFor(book(counted), CONTENT, vector([0, nearly, 0]), false, STAY, MAX, 1);
    expect(spoken?.text).toContain('9 hours');
  });

  it('and no rendered line anywhere in the grid still carries a placeholder', () => {
    const bound = book(counted);
    for (let hours = 0; hours <= HOURS_PER_DAY; hours += 1) {
      const spoken = remarkFor(bound, CONTENT, vector([0, hours * TICKS_PER_HOUR, 0]), false, STAY, MAX, 1);
      expect(spoken?.text, `at ${String(hours)} hours`).not.toContain('{');
    }
  });
});
