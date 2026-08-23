// G-040b-ii — THE SHIPPED PARTY DIAL, AND THE CYCLE IT REALLY EMITS.
//
//   pnpm exec vitest run party
//
// ============================================================================
//  WHY A FILE FOR ONE JSON FIELD.
//
//  G-040b-i landed the whole party mechanism with the distribution ABSENT, so every arrival
//  was one guest and not one shipped number moved (ADR-0072). This goal turns the dial:
//  `guest-rules.json` declares `partySizeWeights: [3, 1]`. Everything downstream of it — the
//  goldens, the occupancy pin, the scaling campaign — moves because of THAT line, so the line
//  gets a test that says what it means rather than a diff that says what it is.
//
//  AND THE THING IT PINS IS THE CYCLE, NOT THE RATIO. `partySizeWeights` is read as a repeating
//  pattern along the guest-id line and a party consumes ONE ORDINAL PER MEMBER, so the ordinals
//  its members occupy are never consulted and the realised mix is NOT the weight ratio:
//  ADR-0072 measured `[1, 1]` emitting PAIRS FOREVER and `[3, 1]` giving the cycle 1, 1, 2.
//  A designer reading `[3, 1]` as "three singles to one pair" is reading it wrong — it is TWO
//  singles to one pair — so the realised cycle is asserted here, over the shipped bytes,
//  rather than left to be re-derived by whoever meets the number next.
//
//  AND IT IS READ OUT OF A RUN RATHER THAN OUT OF `partySizeOf`. The walk is already pinned
//  against hand-built content in `packages/sim/src/guest.party.arrival.test.ts` — absent, `[1]`,
//  `[0, 1]`, `[1, 1]`, `[3, 1]`, an interior zero, and every refusal. Repeating that here with
//  the shipped table would be a second reading of the same function; what is NOT covered
//  anywhere else is that the shipped hotel, stepped through the shipped schedule, actually emits
//  the sequence. So this file groups the guests of a real run by `partyId` and reads the cycle
//  off THEM.
//
//  IT LIVES IN `tools/headless` because it reads the shipped bytes off the disk, which
//  `packages/sim` may not do (I1).
// ============================================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createValidityCache, createWorld, guestsInOrder, stepTick } from '@hotelsim/sim';
import type { Command, World } from '@hotelsim/sim';
import { GUEST_RULES_PATH, ROOM_TYPES_PATH, loadContent } from './content-loader.js';
import { buildSummary, parseArgs, schedule } from './report.js';

const content = loadContent();
const shippedRules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as {
  partySizeWeights?: number[];
  maxPartySize?: number;
}[];
const shippedRoomTypes = JSON.parse(readFileSync(ROOM_TYPES_PATH, 'utf8')) as {
  id: string;
  capacity: number;
  provides?: string[];
}[];

/**
 * Five simulated days of the documented invocation, stepped in process, keeping every guest
 * that was ever in the store.
 *
 * A guest is REMOVED when it departs, so `world.guests` at the end is not the run — the census
 * has to be taken while the run happens. `seen` is keyed by guest id and written on every tick
 * the guest is alive, which costs a map write per guest per tick and is the cheapest thing that
 * cannot miss a guest who arrived and left between two samples.
 */
function census(days: number): {
  world: World;
  arrivalCommands: number;
  arrived: number;
  partyIdOf: Map<number, number>;
} {
  const ticks = days * 1_440;
  const options = parseArgs(['--days', String(days), '--seed', '42']);
  const initial = createWorld(options.seed, content);
  const commands = schedule(ticks, content, initial.grid, options.rooms, options.arrivalEveryTicks);
  const byTick = new Map<number, Command[]>();
  let arrivalCommands = 0;
  for (const entry of commands) {
    if (entry.command.kind === 'guestArrives') arrivalCommands += 1;
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  let world = initial;
  const cache = createValidityCache();
  const partyIdOf = new Map<number, number>();
  for (let i = 0; i < ticks; i += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? [], cache);
    for (const guest of guestsInOrder(world.guests)) partyIdOf.set(guest.id, guest.partyId);
  }
  return { world, arrivalCommands, arrived: buildSummary(world, content, options).summary.guests.arrived, partyIdOf };
}

const RUN = census(5);

/**
 * The sizes of the run's parties, in arrival order.
 *
 * Sorted explicitly by guest id before anything is read off it — a Map's iteration order must
 * never decide an answer, here for the reason `packages/sim` may not let it (I2).
 */
const realisedCycle = (): readonly number[] => {
  const ids = [...RUN.partyIdOf.keys()].sort((a, b) => a - b);
  const sizes = new Map<number, number>();
  for (const id of ids) {
    const party = RUN.partyIdOf.get(id) as number;
    sizes.set(party, (sizes.get(party) ?? 0) + 1);
  }
  return [...sizes.keys()].sort((a, b) => a - b).map((party) => sizes.get(party) as number);
};

describe('the shipped party dial', () => {
  it('IS `[3, 1]`, DECLARED IN THE ONE CONTENT FILE THIS GOAL EDITS', () => {
    // The bytes, not a bound reading of them: a value pin taken through the sim would still be
    // green if the field were deleted and the absent-means-one path took over.
    expect(shippedRules).toHaveLength(1);
    expect(shippedRules[0]?.partySizeWeights).toEqual([3, 1]);
  });

  it('AND THE REALISED CYCLE IS 1, 1, 2 — which is NOT the weight ratio', () => {
    // ========================================================================
    // THE TRAP, PINNED AGAINST THE SHIPPED VALUE (ADR-0072). `[3, 1]` reads as "three parts
    // alone to one part in a pair", and a designer who ships it expecting three singles per
    // pair gets TWO. The weights index ORDINALS and a pair eats two of them, so the second
    // member's slot — which carries the weight of a single — is never asked.
    //
    // Ordinal by ordinal, from the first guest id the simulation issues:
    //
    //     ordinal   1  2  3  4  5  6  7  8  9  10 11 12
    //     size      1  1  2  -  1  1  2  -  1  1  2  -
    //
    // The `-` slots are the ones a pair's second member occupies. Period FOUR ordinals, THREE
    // parties, FOUR guests — and the period divides the ordinal line exactly, so the pattern is
    // the same from the very first arrival with no warm-up.
    // ========================================================================
    const cycle = realisedCycle();
    expect(cycle.slice(0, 12)).toEqual([1, 1, 2, 1, 1, 2, 1, 1, 2, 1, 1, 2]);
    // AND IT NEVER DRIFTS. The whole run, not its opening: a cycle asserted over its first
    // twelve parties would also be satisfied by a dial that changed its mind on day two.
    for (const [index, size] of cycle.entries()) expect(size).toBe(index % 3 === 2 ? 2 : 1);
    expect(cycle.length).toBeGreaterThan(50);
  });

  it('so ONE THIRD OF PARTIES and ONE HALF OF GUESTS arrive as a pair', () => {
    // The two numbers every moved golden in this goal is a consequence of, computed off the run
    // rather than asserted as folklore.
    const cycle = realisedCycle();
    const pairs = cycle.filter((size) => size === 2).length;
    const guests = cycle.reduce((total, size) => total + size, 0);
    // One party in three is a pair …
    expect(pairs * 3).toBe(cycle.length);
    // … and since a pair is two guests, half of the guests in this hotel walked in with
    // somebody. That second sentence is the one every moved golden in this goal follows from.
    expect(pairs * 2).toBe(guests / 2);
    expect(guests * 3).toBe(cycle.length * 4);
  });

  it('and the largest party is DERIVED from the table, not declared beside it', () => {
    // `bindContent` reads the table's LENGTH and refuses a `maxPartySize` that disagrees, so the
    // shipped document deliberately declares only one of the two. If a later goal adds the
    // second field, this goes red and the two numbers get reconciled in one place.
    expect(shippedRules[0]?.maxPartySize).toBeUndefined();
    expect(shippedRules[0]?.partySizeWeights).toHaveLength(2);
    expect(Math.max(...realisedCycle())).toBe(2);
  });

  it('AND THE HOTEL CAN HOUSE IT — the margin against the refusal is ZERO', () => {
    // `assertPartiesCanBeHoused` refuses content whose largest party exceeds the roomiest room
    // type PROVIDING the lodging need. `bindContent` accepted this content when this file
    // imported it, so the refusal is satisfied; what is written down here is the MARGIN, which
    // is nothing at all. A goal that lowers `standard_room`'s capacity to 1, or lengthens this
    // table to reach 3, ships a hotel in which some party can never be housed anywhere — and
    // one of those two edits is refused at load while the other is not.
    const lodgingCapacities = shippedRoomTypes
      .filter((room) => (room.provides ?? []).length > 0 && room.capacity > 0 && room.id === 'standard_room')
      .map((room) => room.capacity);
    expect(lodgingCapacities).toEqual([2]);
    expect(shippedRules[0]?.partySizeWeights).toHaveLength(lodgingCapacities[0] as number);
  });
});

describe('the dial is LIVE in a real run, and its arithmetic closes', () => {
  it('FOUR GUESTS ARRIVE FOR EVERY THREE ARRIVAL COMMANDS', () => {
    // 60 commands, 80 guests, on the documented five-day invocation. The commands are unchanged
    // by this goal — it is the same schedule G-040b-i ran — so the whole of the difference is
    // the dial, and `arrived` counting GUESTS rather than commands is what makes it visible
    // (G-040b-i; the conservation law throws if the two are conflated).
    expect(RUN.arrivalCommands).toBe(60);
    expect(RUN.arrived).toBe(80);
    expect(RUN.arrived * 3).toBe(RUN.arrivalCommands * 4);
  });

  it('and a PAIR SHARES ONE ROOM, which is what capacity was for', () => {
    // ========================================================================
    // THE OBSERVABLE THE WHOLE MECHANISM EXISTS FOR, on the shipped hotel rather than on a
    // hand-built fixture: two guests of one party, holding ONE room entity between them.
    //
    // ADR-0053 measured that `capacity` had one reader in the repository and that setting it to
    // 99 everywhere produced a byte-identical report. This is the assertion that stops that
    // being true again — it fails on any build in which a pair sleeps in two rooms, and on any
    // build in which the dial is quietly turned back off.
    //
    // The run is sampled at its LAST tick, so it is a statement about a moment a viewer could
    // scrub to rather than about a tally.
    // ========================================================================
    const lodgersByRoom = new Map<number, number[]>();
    for (const guest of guestsInOrder(RUN.world.guests)) {
      if (guest.roomEntityId <= 0) continue;
      const found = lodgersByRoom.get(guest.roomEntityId);
      if (found === undefined) lodgersByRoom.set(guest.roomEntityId, [guest.partyId]);
      else found.push(guest.partyId);
    }
    const shared = [...lodgersByRoom.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, parties]) => parties.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    for (const [, parties] of shared) {
      // Two lodgers in one room, and they are ONE party — ADR-0055's "two strangers never
      // share", asserted on the shipped run rather than assumed from the search's filter.
      expect(parties).toHaveLength(2);
      expect(new Set(parties).size).toBe(1);
    }
  });
});
