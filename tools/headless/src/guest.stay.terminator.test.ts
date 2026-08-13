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
// G-027a built one of them: §4, a stay ends by checkout or by the guest giving up. The
// assertions below say *no DEPARTURE reads need state to decide the stay is over*, and that is
// all they say — the difference between "the door no longer opens when the need finishes" and
// "the need no longer finishes".
//
// §1 HAS SINCE LANDED, AND THIS PARAGRAPH OUTLIVED IT BY A GOAL. It read *"`needs.ts` is
// untouched, `night_rest` STILL COMPLETES at `satisfyTicks` and stays completed … 'no need is
// terminal' is G-027b's and is not claimed here"*, which was true when it was written and false
// from the moment G-027b landed: `satisfyTicks` is deleted and nothing completes. The scoping is
// kept because it is still what this file's assertions are ABOUT — a terminator test that
// quietly widened into a need-model test would be pinning something nobody chose — but the state
// of the world around it is now stated in the past tense. `needs.stock.test.ts` owns §1.
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
  isNeedFull,
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
/**
 * G-027b: `capacityTicks` is time-to-empty, which is what the deleted `patienceTicks` named, so
 * `PATIENCE` is carried onto the lodging need. `refillPerTick` replaces `satisfyTicks`; neither
 * decides a departure any more, which is this file's whole subject.
 */
const needType = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  capacityTicks: PATIENCE,
  refillPerTick: lodging ? 2 : 3,
});
const rules = (stay: number): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  stayDurationTicks: stay,
  // The OTHER terminator (G-027b), and it is deliberately longer than any wait below: this file
  // is about the CHECKOUT clock, so a guest giving up would be a second way out competing with
  // the one under test.
  toleranceTicks: 10_000,
  // 1,000 basis points of a 30-tick capacity is a want line of 3. Two crossings cost 60,000
  // against the 50 away-ticks a 200-tick stay generates at refill 3, which is 500,000.
  wantAtBasisPoints: 1_000,
});

const content = bindContent({
  // `lounge` provides the engagement need and is NEVER spawned below: with none in the store
  // no guest can engage, so every departure here is still a checkout or a wait.
  roomTypes: [roomType('roomA', ['rest']), roomType('lounge', ['snack'])],
  needTypes: [needType('rest', true), needType('snack', false)],
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
    // The whole goal in one assertion. `SATISFY` was 20 and `STAY` is 200: under the era this
    // replaces the guest left at tick 21. It is still here at tick 100, in its room, with the
    // need it came for FULL — and under G-027b full is not even a terminal state, it is where
    // a resting guest sits while its room keeps topping it up.
    const world = run(hotel(1), content, 100, [at(1, arrive)]);
    const guest = guestsInOrder(world.guests)[0];
    expect(guest).toBeDefined();
    const lodging = guest === undefined ? undefined : findNeedState(guest.needs, 'rest');
    expect(lodging).toBeDefined();
    expect(lodging !== undefined && isNeedFull(lodging)).toBe(true);
    expect(guest?.roomEntityId).not.toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
  });

  it('a FULL lodging need does not become a give-up either, which is where the old branch would have sent it', () => {
    // `!isNeedPending` was true of a MET need as well as a failed one. Before G-027a the met
    // case had already `continue`d, so the give-up branch could read the loose predicate; with
    // no met case above it, such a predicate here would file every completed stay as `gaveUp`
    // the tick after the need finished. G-027b removes the predicate and keys the give-up on
    // the CLOCK instead, so the tripwire is now "a guest whose rest is full and whose wait has
    // not run out stays put": the guest below has 180 ticks left to run.
    const world = run(hotel(1), content, SATISFY + 3, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(0);
    expect(guestsInOrder(world.guests)).toHaveLength(1);
  });

  it('a guest with no room still gives up when its toleranceTicks run out, and pays nothing', () => {
    // Zero rooms. A guest with no room gives up after `toleranceTicks` of waiting, which this
    // content puts far out on purpose — see `rules`. The number that decides it is the guest
    // rules' now, not the lodging need's, so the run is as long as the tolerance rather than
    // as long as the old patience.
    const patient = bindContent({
      roomTypes: [roomType('roomA', ['rest']), roomType('lounge', ['snack'])],
      needTypes: [needType('rest', true), needType('snack', false)],
      guestRules: [{ ...rules(STAY), toleranceTicks: PATIENCE }],
    });
    const empty = stepTick(createWorld(1, patient), patient, []);
    const world = run(empty, patient, PATIENCE + 1, [at(1, arrive)]);
    expect(departureCountOf(world.guestOutcomes, 'gaveUp')).toBe(1);
    expect(departureCountOf(world.guestOutcomes, 'checkedOut')).toBe(0);
    expect(world.ledger.filter((transaction) => transaction.reason === 'roomRevenue')).toHaveLength(0);
  });

  it('the lifetime bound is max(tolerance, stay) + 1, and it is ATTAINED rather than respected', () => {
    // The old bound was `patience + satisfy + 1` — a sum, and an overestimate, because a
    // queued guest's stay used to start when it got a room. The clock is arrival-relative
    // now, so the two terms are alternatives. A bound nothing reaches cannot catch a guest
    // that overstays by a little, which is what `countStuckGuests` is for.
    // THE WAIT TERM IS `toleranceTicks` SINCE G-027b, where it was the lodging need's own
    // `patienceTicks`. The two are the same quantity — how long a guest that never gets a room
    // waits — and this content's is 10,000, so IT is the larger term here.
    expect(maxGuestLifetimeTicks(content, 'rest')).toBe(10_000 + 1);

    // And with a tolerance below the stay, the stay is the larger one.
    const shortWait = bindContent({
      roomTypes: [roomType('roomA', ['rest']), roomType('lounge', ['snack'])],
      needTypes: [needType('rest', true), needType('snack', false)],
      guestRules: [{ ...rules(STAY), toleranceTicks: PATIENCE }],
    });
    expect(maxGuestLifetimeTicks(shortWait, 'rest')).toBe(STAY + 1);
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
    // The two terms are the stay and the TOLERANCE (G-027b), so this content's own numbers are
    // read back rather than the need's.
    const toleranceHere = 10_000;
    const max = Math.max(STAY, toleranceHere);
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
            { needId: 'rest', deficit: 0, metBy: 'room', abandonCount: 0 },
            { needId: 'snack', deficit: 3, metBy: null, abandonCount: 0 },
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
      'isNeedFull',
      'isNeedEmpty',
      'isNeedWanted',
      'deficit',
      'findNeedState',
      'lodgingNeed',
      'guest.needs',
    ]) {
      expect(branch, `the checkout branch reads ${forbidden}; a stay ends on a clock`).not.toContain(forbidden);
    }
  });

  it('and the give-up branch is a clock too now, so BOTH ways out are clocks', () => {
    // G-027b. This used to be the failing companion: the give-up branch read `isNeedFailed` on
    // the lodging need, so pointing the checkout scan at it went red. It does not any more —
    // the wait ends on `toleranceTicks` from the guest's own `arrivedTick` — which is a
    // strengthening of this whole block rather than a hole in it, and it is asserted here so
    // the change cannot be silent.
    const start = source.indexOf('if (lodgingUnserved && tick - guest.arrivedTick >= tolerance)');
    expect(start, 'the give-up branch has been rewritten; this scan is pointed at nothing').toBeGreaterThan(0);
    const end = source.indexOf('continue;', start);
    const branch = source.slice(start, end);
    expect(branch).not.toContain('findNeedState');
    expect(branch).not.toContain('deficit');
  });

  it('and the scan can fail — the same predicate over a branch that DOES read need state', () => {
    // ADR-0007: a check that cannot fail is not a check. The ENGAGEMENT RELEASE in step 5
    // legitimately reads need state — it lets go of a provider when the need it serves reaches
    // full — so pointing the identical scan at it must go red. That is the failing companion,
    // and it moved here because the branch it used to be pointed at stopped reading need state
    // when both terminators became clocks.
    const start = source.indexOf('if (served === undefined || !isNeedWanted(');
    expect(start).toBeGreaterThan(0);
    const branch = source.slice(start, source.indexOf('}', start));
    expect(branch).toContain('isNeedWanted');
    expect(branch).toContain('findNeedType');
  });
});
