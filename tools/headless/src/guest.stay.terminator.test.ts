// G-027a — A STAY HAS A DURATION, AND NOTHING ENDS BECAUSE A NEED FINISHED.
//
//   pnpm exec vitest run stay
//
// This file pins THE TERMINATOR ITSELF: when a guest leaves, what the branch that decides
// it is allowed to look at, and what a need finishing does now that it no longer ends a
// stay. The four-arm differential is in `guest.stay.test.ts`; the migration is in
// `guest.stay.save.test.ts`; the content derivations are in `content.stay.test.ts`.
//
// THE ONE CLAIM THIS FILE MAKES AND THE ONE IT MAY NOT MAKE. ADR-0017 has five parts and
// G-027a builds one of them: §4, a stay ends by checkout or by the guest giving up. It does
// NOT build §1, "a need is a stock, never done" — `needs.ts` is untouched, `night_rest`
// still completes at `satisfyTicks` and stays completed. So the assertions below say *no
// DEPARTURE reads need state to decide the stay is over*. **"No need is terminal" is
// G-027b's and is not claimed here**, and the difference is exactly the difference between
// "the door no longer opens when the need finishes" and "the need no longer finishes".
//
// Content ids here are camelCase (ADR-0003).

// IT LIVES IN `tools/headless` AND NOT IN `packages/sim`, WHICH IS I1 RATHER THAN TASTE:
// the scan below reads `guests.ts` off the disk, and `packages/sim` may not name `node:fs`
// (`pnpm check:purity`). Its three siblings are pure and live beside the code they pin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bindContent,
  countStuckGuests,
  createWorld,
  departureCountOf,
  findNeedState,
  guestsInOrder,
  isNeedMet,
  maxGuestLifetimeTicks,
  run,
  stepTick,
} from '@hotelsim/sim';
import type {
  Command,
  GuestRulesData,
  GuestStore,
  NeedTypeData,
  RoomTypeData,
  ScheduledCommand,
  World,
} from '@hotelsim/sim';

const RATE = 8_500;
/** Deliberately far below the stay, so a met lodging need has a long time to end nothing. */
const SATISFY = 20;
const PATIENCE = 30;
const STAY = 200;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: RATE,
  provides,
});
const needType = (id: string): NeedTypeData => ({
  id,
  name: id,
  role: 'lodging',
  satisfyTicks: SATISFY,
  patienceTicks: PATIENCE,
});
const rules = (stay: number): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  stayDurationTicks: stay,
});

const content = bindContent({
  roomTypes: [roomType('roomA', ['rest'])],
  needTypes: [needType('rest')],
  guestRules: [rules(STAY)],
});

const spawnRoom = (index: number): Command => ({
  kind: 'spawnEntity',
  entityKind: 'roomA',
  at: { floor: 0, column: index * 2 },
});
const arrive: Command = { kind: 'guestArrives' };
const at = (tick: number, command: Command): ScheduledCommand => ({ tick, command });

const hotel = (rooms: number): World =>
  stepTick(createWorld(1, content), content, Array.from({ length: rooms }, (_, i) => spawnRoom(i)));

describe('the stay ends on a clock, and the clock starts at the door', () => {
  it('a guest that walked into an empty hotel checks out on exactly arrivedTick + stayDurationTicks', () => {
    // ARRIVAL IS TICK 1: `stepTick` at tick 0 built the room, and the command is scheduled
    // for the next one. The guest reserves on the tick it arrives (`stepGuests` step 7), so
    // it holds a room from tick 1 and the checkout comparison first passes at 1 + STAY.
    const start = hotel(1);
    // `run` takes a COUNT of ticks from `start.tick`, which is 1, so `STAY` ticks simulates
    // ticks 1..STAY and stops one short of the checkout tick.
    const before = run(start, content, STAY, [at(1, arrive)]);
    expect(guestsInOrder(before.guests)).toHaveLength(1);
    expect(departureCountOf(before.guestOutcomes, 'checkedOut')).toBe(0);

    const after = run(start, content, STAY + 1, [at(1, arrive)]);
    expect(guestsInOrder(after.guests)).toHaveLength(0);
    expect(departureCountOf(after.guestOutcomes, 'checkedOut')).toBe(1);
  });

  it('and it pays exactly once, on that tick and not before', () => {
    const start = hotel(1);
    const before = run(start, content, STAY, [at(1, arrive)]);
    const after = run(start, content, STAY + 1, [at(1, arrive)]);
    const revenue = (world: World): number =>
      world.ledger.filter((transaction) => transaction.reason === 'roomRevenue').length;
    expect(revenue(before)).toBe(0);
    expect(revenue(after)).toBe(1);
  });

  it('THE LODGING NEED COMPLETES LONG BEFORE THE DOOR OPENS, AND COMPLETING IT ENDS NOTHING', () => {
    // The whole goal in one assertion. `SATISFY` is 20 and `STAY` is 200: under the era this
    // replaces the guest left at tick 21. It is still here at tick 100, in its room, with the
    // need it came for already met.
    const world = run(hotel(1), content, 100, [at(1, arrive)]);
    const guest = guestsInOrder(world.guests)[0];
    expect(guest).toBeDefined();
    const lodging = guest === undefined ? undefined : findNeedState(guest.needs, 'rest');
    expect(lodging).toBeDefined();
    expect(lodging !== undefined && isNeedMet(lodging)).toBe(true);
    expect(guest?.roomEntityId).not.toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
  });

  it('a met lodging need does not become a give-up either, which is where the old branch would have sent it', () => {
    // `!isNeedPending` is true of a MET need as well as a failed one. Before this goal the met
    // case had already `continue`d, so the give-up branch could read the loose predicate; with
    // no met case above it, a `!isNeedPending` here would file every completed stay as
    // `gaveUp` the tick after the need finished. This case is that mutation's tripwire: the
    // guest below has a met need and 180 ticks left to run.
    const world = run(hotel(1), content, SATISFY + 3, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
  });

  it('a guest with no room still gives up when its patience runs out, and pays nothing', () => {
    // Zero rooms. The lodging need drains one tick of patience a tick and fails at PATIENCE.
    const empty = stepTick(createWorld(1, content), content, []);
    const world = run(empty, content, PATIENCE + 1, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
    expect(world.ledger.filter((transaction) => transaction.reason === 'roomRevenue')).toHaveLength(0);
  });

  it('the lifetime bound is max(patience, stay) + 1, and it is ATTAINED rather than respected', () => {
    // The old bound was `patience + satisfy + 1` — a sum, and an overestimate, because a
    // queued guest's stay used to start when it got a room. The clock is arrival-relative
    // now, so the two terms are alternatives. A bound nothing reaches cannot catch a guest
    // that overstays by a little, which is what `countStuckGuests` is for.
    expect(maxGuestLifetimeTicks(content, 'rest')).toBe(STAY + 1);

    // 25 is below this need's PATIENCE of 30 and above the floor `bindContent` computes
    // (the lodging need's own 20 satisfyTicks), so the patience term is the larger one.
    const shortStay = bindContent({
      roomTypes: [roomType('roomA', ['rest'])],
      needTypes: [needType('rest')],
      guestRules: [rules(25)],
    });
    expect(maxGuestLifetimeTicks(shortStay, 'rest')).toBe(PATIENCE + 1);
  });

  it('AND `countStuckGuests` COUNTS A ONE-TICK OVERSTAY — the claim its comment makes, executed', () => {
    // ========================================================================
    // THE ARITHMETIC IS DRIVEN RATHER THAN ARGUED, because for one critique round it was
    // argued and the argument was wrong. `countStuckGuests` compared `age > limit` where
    // `limit = max(stay, patience) + 1`, so the first age it counted was `max + 2` — while its
    // own comment claimed a one-tick overstay was caught AND offered, as the motivation, the
    // `>`-for-`>=` checkout mutation that leaves a guest at exactly `max + 1`.
    //
    // Three ages, one either side of the boundary and one on it. A guest at `max` is
    // LEGITIMATE — checkout fires during the tick age reaches `stay`, so it is still in the
    // store at that tick's commit boundary — and a guest at `max + 1` is the overstay.
    // ========================================================================
    const max = Math.max(STAY, PATIENCE);
    expect(maxGuestLifetimeTicks(content, 'rest')).toBe(max + 1);

    const guestAged = (age: number): GuestStore => ({
      nextId: 2,
      list: [
        {
          id: 1,
          at: { floor: 0, column: 0 },
          arrivedTick: 1_000 - age,
          roomEntityId: 1,
          engagement: null,
          needs: [
            { needId: 'rest', patienceRemaining: PATIENCE, progressRemaining: 0, metBy: 'room', abandonCount: 0 },
          ],
        },
      ],
    });

    expect(countStuckGuests(1_000, guestAged(max - 1), content), `age ${max - 1}`).toBe(0);
    expect(countStuckGuests(1_000, guestAged(max), content), `age ${max}`).toBe(0);
    // THE ONE-TICK OVERSTAY. This is the assertion the previous round's comment promised and
    // the previous round's predicate did not deliver.
    expect(countStuckGuests(1_000, guestAged(max + 1), content), `age ${max + 1}`).toBe(1);
    expect(countStuckGuests(1_000, guestAged(max + 2), content), `age ${max + 2}`).toBe(1);
  });
});

describe('NO DEPARTURE READS NEED STATE TO DECIDE THE STAY IS OVER', () => {
  // A SOURCE SCAN OVER THE BRANCH, AND IT IS THE ONLY WAY TO SAY THIS. A behavioural test
  // can show that a met need did not open the door on the runs it happened to drive; it
  // cannot show that the branch does not consult one. `review.boundary.test.ts` and
  // `migration-scan...save.test.ts` set the precedent — a claim about what a piece of code
  // may NAME is checked by reading the bytes it is made of.
  //
  // CHECKED AGAINST THE BYTES ON DISK, NEVER AGAINST A RETYPED COPY (CLAUDE.md).
  const GUESTS = fileURLToPath(new URL('../../../packages/sim/src/guests.ts', import.meta.url));
  const source = readFileSync(GUESTS, 'utf8');

  /** The executable body of the checkout branch: from the `if` to its `continue;`. */
  const checkoutBranch = (): string => {
    const start = source.indexOf('if (lodgingRoom !== null && stayDuration !== undefined');
    expect(start, 'the checkout branch has been rewritten; this scan is pointed at nothing').toBeGreaterThan(0);
    const end = source.indexOf('continue;', start);
    expect(end).toBeGreaterThan(start);
    // Comments are stripped: this is a claim about what the branch DOES, and the prose
    // above it is allowed — indeed required — to discuss the need state it does not read.
    return source
      .slice(start, end)
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
  };

  it('the checkout branch names the tick and the room, and no need predicate at all', () => {
    const branch = checkoutBranch();
    expect(branch).toContain('tick - guest.arrivedTick');
    expect(branch).toContain('lodgingRoom');
    for (const forbidden of [
      'isNeedMet',
      'isNeedFailed',
      'isNeedPending',
      'progressRemaining',
      'patienceRemaining',
      'findNeedState',
      'lodgingNeed',
      'guest.needs',
    ]) {
      expect(branch, `the checkout branch reads ${forbidden}; a stay ends on a clock`).not.toContain(forbidden);
    }
  });

  it('and the scan can fail — the same predicate over a branch that DOES read need state', () => {
    // ADR-0007: a check that cannot fail is not a check. The give-up branch four lines below
    // the checkout one legitimately reads `isNeedFailed`, so pointing the identical scan at
    // it must go red. That is the failing companion, and it doubles as the record that
    // ADR-0017 4(b) is NOT implemented here: giving up still reads lodging patience.
    const start = source.indexOf('if (lodging !== undefined && isNeedFailed(lodging))');
    expect(start).toBeGreaterThan(0);
    const end = source.indexOf('continue;', start);
    const branch = source.slice(start, end);
    expect(branch).toContain('isNeedFailed');
  });
});
