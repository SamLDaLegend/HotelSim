// θ-b1 — THE FOUR ARMS, computed rather than pinned (ADR-0017 4(b), ADR-0025 §2).
//
//   pnpm exec vitest run dissatisfaction
//
// ============================================================================
// G-027a's four-arm idiom, extended by the terminator it deliberately did not implement. One
// need table, one seed, one arrival schedule; the only thing that differs is WHAT THE HOTEL HAS.
//
//   1. WELL PROVISIONED      rooms and amenities for everybody
//                            -> leftDissatisfied === 0, and every count identical to HEAD
//   2. ROOMS, NO AMENITIES   -> leftDissatisfied > 0 AND checkedOut === 0
//   3. CONTENDED             fewer rooms and fewer amenities than arrivals
//                            -> all THREE guest-initiated rows > 0
//   4. STARVED OF ROOMS      one room, amenities for everybody
//                            -> gaveUp > 0 AND leftDissatisfied === 0
//
// ARM 4 IS THE PARTITION AND ARM 1 IS THE CONTROL. Arm 4 is what
// `assertDissatisfactionOutlastsTheLobby` protects: a guest that never got a bed must be counted
// under "nobody would give it a room", because that row tells the player to build ROOMS and the
// other tells it to build AMENITIES (ADR-0025 §2). Arm 1 is the one that must not have moved at
// all — a well-run hotel notices nothing about this goal.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { createWorld, run } from '@hotelsim/sim';
import type { RunSummary } from './report.js';
import { loadContent } from './content-loader.js';
import { buildSummary, parseArgs, schedule } from './report.js';

const content = loadContent();

const armOf = (argv: readonly string[]): RunSummary => {
  const options = parseArgs(['--days', '30', '--seed', '7', ...argv]);
  const initial = createWorld(options.seed, content);
  const world = run(
    initial,
    content,
    options.ticks,
    schedule(
      options.ticks,
      content,
      initial.grid,
      options.rooms,
      options.arrivalEveryTicks,
      options.buildEveryTicks,
      options.demolishEveryTicks,
      options.loanEveryTicks,
      options.amenities,
    ),
  );
  const { summary, violations } = buildSummary(world, content, options);
  expect(violations, argv.join(' ')).toEqual([]);
  return summary;
};

const count = (summary: RunSummary, reason: string): number =>
  summary.guests.departures.find((row) => row.reason === reason)?.count ?? 0;

const wellProvisioned = armOf(['--rooms', '6', '--amenities', '5']);
const noAmenities = armOf(['--rooms', '6', '--amenities', '0']);
/**
 * ARM 3'S HOTEL, AND ITS ROOM COUNT IS DERIVED FROM THE TWO THINGS THE ARM'S NAME PROMISES.
 *
 * It was `--rooms 6 --amenities 1 --arrivals 96` and produced `leftDissatisfied` 0 after G-041,
 * so the arm stopped being able to make its own claim. **The fix is the hotel, not the bar** —
 * "contended" is a property a workload either has or has not, and this one stopped having it
 * when `refillPerTick` became the rate a fully appointed room reaches (ADR-0054, ADR-0057).
 *
 * TWO INEQUALITIES BOUND THE ROOM COUNT, AND BOTH COME FROM NUMBERS ALREADY ON DISK:
 *
 *   SOME GUESTS MUST BE TURNED AWAY, or `gaveUp` is zero. Occupancy is capped by the arrival
 *   cadence at `stayDurationTicks / arrivals` = 1,440 / 96 = **15**, so a hotel with 15 rooms or
 *   more turns nobody away. Hence `rooms <= 14`.
 *
 *   ONE AMENITY MUST NOT KEEP UP, or `leftDissatisfied` is zero. A need is served for
 *   `1/(1 + rate)` of the time, so one provider sustains `1 + rate` concurrent guests
 *   (`determinism-log.ts`'s `copiesFor`, the same relation). At the SERVICE FLOOR that is
 *   `1 + 7` = **8**. Hence `rooms >= 9`.
 *
 * **MEASURED, AND THE LOWER BOUND LANDS EXACTLY ON THE ARITHMETIC**: at 8 rooms
 * `leftDissatisfied` is 0, at 9 it is 1, at 10 it is 13, at 12 it is 166, and at 16 `gaveUp`
 * falls to 0. The window `[9, 14]` is derived; **12 is a preference inside it**, taken because
 * both ends of the window are then clear by a margin rather than by one event, and said to be a
 * preference rather than dressed up as forced (ADR-0013 §4).
 */
const contended = armOf(['--rooms', '12', '--amenities', '1', '--arrivals', '96']);
const starvedOfRooms = armOf(['--rooms', '1', '--amenities', '5']);

describe('ARM 1 — a hotel that works notices nothing', () => {
  it('evicts nobody for dissatisfaction', () => {
    expect(count(wellProvisioned, 'leftDissatisfied')).toBe(0);
  });

  it('AND EVERY COUNT IS THE ONE HEAD PRODUCED — the criterion this goal is judged hardest on', () => {
    // Measured against the commit before this one, at this invocation: 192 checkedOut, 161
    // gaveUp, 0 evictions. A moved HASH is expected — `Guest.dissatisfaction` is hashed state
    // and `guest-rules.json` gained two fields — and a moved COUNT on this arm would be a
    // defect in this goal rather than a consequence of it.
    //
    // THE REVIEW DISTRIBUTION IS NOT A COUNT IN THAT SENSE, AND IT MOVED AT G-028b. ADR-0037
    // replaced the scorer, so the same 353 departures are re-expressed on the same scale: the
    // 192 the hotel housed at the ceiling, the 161 it did not below them. The DEPARTURES are
    // what this arm is about and they are untouched — which is the claim, and it is stronger
    // for having a moving neighbour beside it.
    // RE-RECORDED AT G-040b-ii, AND THE ARM'S OWN CLAIM SURVIVES INTACT: the shipped content
    // declares `partySizeWeights: [3, 1]`, whose realised cycle is 1, 1, 2, so 360 arrival
    // commands bring 480 guests and a pair sleeps in one of these six bedrooms. Every row scales
    // and NOTHING CHANGES KIND — `leftDissatisfied` is still 0, both eviction rows are still 0,
    // and the distribution still has exactly two occupied bands holding exactly the checkouts
    // and the give-ups. That is what this arm is for: a hotel that works still notices nothing.
    //
    // 192 -> 256 is 4/3 EXACTLY, which is the cleanest possible statement that the extra
    // checkouts are the extra guests and not a change of behaviour: six bedrooms of capacity 2
    // housed 192 parties of one and now house 256 people in the same beds. Revenue follows the
    // same multiplier because `payForStay` is per guest (ADR-0072 ruling 2) — 256 x 8,500p.
    expect(count(wellProvisioned, 'checkedOut')).toBe(256);
    expect(count(wellProvisioned, 'gaveUp')).toBe(214);
    expect(count(wellProvisioned, 'evictedRoomGone')).toBe(0);
    expect(count(wellProvisioned, 'evictedRoomUnusable')).toBe(0);
    expect(wellProvisioned.guests.arrived).toBe(480);
    // RE-RECORDED AT G-059: **[0, 0, 214, 0, 256] -> [214, 0, 0, 256, 0]**, both occupied bands
    // moving and the DEPARTURE TABLE above untouched, which is exactly the shape this arm is
    // built to make legible. The 214 give-ups fall to the floor because a guest the hotel never
    // housed did not have a stay to review; the 256 checkouts fall 5 -> 4 because this hotel is
    // short of the top star tier and its standing is now one of the five terms in the mean. The
    // arm's own claim is unchanged and is the four assertions ABOVE this line: `leftDissatisfied`
    // 0, both eviction rows 0, 480 arrived, 2,176,000p. A hotel that works still notices nothing.
    expect(wellProvisioned.reviews.distribution.map((row) => row.count)).toEqual([214, 0, 0, 256, 0]);
    expect(wellProvisioned.money.revenuePennies).toBe(2_176_000);
    // The multiplier, asserted rather than asked to be noticed: four guests per three commands.
    expect(wellProvisioned.guests.arrived * 3).toBe(360 * 4);
  });
});

describe('ARM 2 — rooms and nothing to do: the arm G-027a wrote down as a zero', () => {
  it('everybody leaves dissatisfied, and NOBODY checks out', () => {
    // `guest.stay.test.ts`'s fourth arm nominated itself as the test that would change on the
    // day 4(b) landed. This is the same hotel seen from the report: the zero it recorded is
    // now **357**, and the row it recorded as non-zero is now the zero.
    expect(count(noAmenities, 'leftDissatisfied')).toBeGreaterThan(0);
    expect(count(noAmenities, 'checkedOut')).toBe(0);
    expect(noAmenities.money.revenuePennies).toBe(0);
  });

  it('and every engagement need is unmet for every guest, which is WHY they left', () => {
    for (const row of noAmenities.needs.filter((entry) => !entry.lodging)) {
      expect(row.met, row.needId).toBe(0);
    }
  });
});

describe('ARM 3 — contended: all three ways a guest can end its own stay, at once', () => {
  it('reports checkedOut, gaveUp AND leftDissatisfied, all non-zero', () => {
    // One hotel, three different instructions to a player: some guests never got a bed, some
    // got one and left, some ran the clock out. A single counter would average them.
    expect(count(contended, 'checkedOut')).toBeGreaterThan(0);
    expect(count(contended, 'gaveUp')).toBeGreaterThan(0);
    expect(count(contended, 'leftDissatisfied')).toBeGreaterThan(0);
  });

  it('and the conservation law closes over EVERY row, whatever the table holds', () => {
    // (The title said "ALL SIX rows" until θ-b2 made it seven. A count in a test NAME is the
    // worst place for one: vitest prints it, no assertion checks it, and it has to be re-typed
    // at every insertion — the row-count claim class this goal enumerated. The fold below never
    // named a number, so only the title was ever wrong.)
    const departed = contended.guests.departures.reduce((total, row) => total + row.count, 0);
    expect(departed + contended.guests.inHotel).toBe(contended.guests.arrived);
  });
});

describe('ARM 4 — starved of rooms: the partition, and it is the one a refusal protects', () => {
  it('gives up in the lobby and NEVER records a resident walkout', () => {
    expect(count(starvedOfRooms, 'gaveUp')).toBeGreaterThan(0);
    expect(count(starvedOfRooms, 'leftDissatisfied')).toBe(0);
  });

  it('and its counts are HEAD\'s too, because nothing here reaches the new branch', () => {
    // The second control. A hotel whose guests never get a bed is untouched by a rule about
    // guests that have one — so this arm, like arm 1, moves only its hash.
    // RE-RECORDED AT G-040b-ii. A one-room hotel now sleeps TWO people, so the row that could
    // not move for any earlier goal moves for this one: 32 -> 43 checkouts out of a third more
    // arrivals. **The claim is untouched and is the line above** — `leftDissatisfied` is still
    // exactly 0, because a guest that never gets a bed still leaves as `gaveUp` long before its
    // dissatisfaction could saturate.
    expect(count(starvedOfRooms, 'checkedOut')).toBe(43);
    expect(count(starvedOfRooms, 'gaveUp')).toBe(434);
  });
});

describe('THE STEERING SIGNAL — the two rows point at different builds', () => {
  it('more amenities removes the walkouts; more rooms does not', () => {
    // ADR-0025 §2's table, executed. Arm 2 and arm 1 differ ONLY in the amenity count and the
    // walkouts vanish; arm 4 has one room and five amenities and has no walkouts to remove. A
    // single merged counter could not tell those two hotels apart.
    expect(count(noAmenities, 'leftDissatisfied')).toBeGreaterThan(0);
    expect(count(wellProvisioned, 'leftDissatisfied')).toBe(0);
    expect(count(starvedOfRooms, 'gaveUp')).toBeGreaterThan(count(wellProvisioned, 'gaveUp'));
  });
});
