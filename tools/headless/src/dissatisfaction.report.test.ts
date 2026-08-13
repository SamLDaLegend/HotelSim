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
const contended = armOf(['--rooms', '6', '--amenities', '1', '--arrivals', '96']);
const starvedOfRooms = armOf(['--rooms', '1', '--amenities', '5']);

describe('ARM 1 — a hotel that works notices nothing', () => {
  it('evicts nobody for dissatisfaction', () => {
    expect(count(wellProvisioned, 'leftDissatisfied')).toBe(0);
  });

  it('AND EVERY COUNT IS THE ONE HEAD PRODUCED — the criterion this goal is judged hardest on', () => {
    // Measured against the commit before this one, at this invocation: 192 checkedOut, 161
    // gaveUp, 0 evictions, and a review distribution of 0/0/0/353/0. A moved HASH is expected —
    // `Guest.dissatisfaction` is hashed state and `guest-rules.json` gained two fields — and a
    // moved COUNT on this arm would be a defect in this goal rather than a consequence of it.
    expect(count(wellProvisioned, 'checkedOut')).toBe(192);
    expect(count(wellProvisioned, 'gaveUp')).toBe(161);
    expect(count(wellProvisioned, 'evictedRoomGone')).toBe(0);
    expect(count(wellProvisioned, 'evictedRoomUnusable')).toBe(0);
    expect(wellProvisioned.guests.arrived).toBe(360);
    expect(wellProvisioned.reviews.distribution.map((row) => row.count)).toEqual([0, 0, 0, 353, 0]);
    expect(wellProvisioned.money.revenuePennies).toBe(1_632_000);
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

  it('and the conservation law closes over ALL SIX rows', () => {
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
    expect(count(starvedOfRooms, 'checkedOut')).toBe(32);
    expect(count(starvedOfRooms, 'gaveUp')).toBe(326);
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
