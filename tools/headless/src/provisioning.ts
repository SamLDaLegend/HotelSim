// G-043 — THE PROVISIONING RULE, WITH BOTH SIDES IN THE SAME UNIT.
//
// ============================================================================================
//  WHY THIS MODULE EXISTS, AND IT IS A REPAIR RATHER THAN A TIDY-UP.
//
//  The rule that says how many amenities a hotel of `rooms` rooms needs was spelled, in two
//  harness files independently, as some version of:
//
//      min(rooms, stayDurationTicks / arrivals) / (1 + refillPerTick)
//
//  **The quotient counts arrival COMMANDS — parties — and the divisor counts GUESTS.** The day
//  `guest-rules.json` declared `partySizeWeights` the two sides stopped being the same unit and
//  nothing in either expression could say so. That is ADR-0039 section 2's class: a guard
//  spelled in the flags it guards cannot see the content redefine what a flag means.
//
//  **FIVE SITES WERE CHECKED AND THREE CARRY IT** — the census below names each with a result, and
//  the count is stated that way deliberately, because "found five times" would be an overclaim of
//  exactly the shape this project keeps having to retract. A fifth LOCAL fix would have left three
//  copies of an arithmetic that has now been wrong in two of them and half-wrong in the third.
//
//  SO EVERY QUANTITY BELOW CARRIES ITS UNIT IN ITS NAME, and the conversion between the two
//  happens in exactly ONE function (`concurrentGuests`). A caller that wants guests cannot
//  reach a party count without going through it.
// ============================================================================================
//
// ============================================================================================
//  THE UNIT THE HOTEL IS MEASURED IN IS PARTIES, AND THAT IS MEASURED RATHER THAN ASSUMED.
//
//  A lodging room is claimed by ONE PARTY: `guests.ts`'s room search skips a room holding a
//  standing claim from a different party, so a single guest occupies a whole bedroom and a pair
//  shares one. **A bedroom is therefore one PARTY of capacity, not `capacity` strangers.**
//
//  The two models disagree by the room capacity, and the disagreement is decidable by asking
//  the simulation which room count stops turning guests away. `provisioning.report.test.ts`
//  asks it: the capacity model's room count still turns guests away and the party model's does
//  not. Nothing here is a claim about `capacity` at all — it bounds a party's SIZE (bind time
//  refuses content whose largest party cannot be housed) and it does not pool strangers.
// ============================================================================================
//
// ============================================================================================
//  §5.8 — WHERE ELSE THIS CLASS LIVES. FIVE SITES, NAMED, EACH WITH A RESULT.
//
//  The class is "a party count divided by a guest-denominated bound". Every division in
//  `packages/` and `tools/` by an arrival cadence was enumerated; these are all of them.
//
//   1. `unserved.report.test.ts`         CARRIED IT. Repaired: its rule is this module.
//
//   2. `scorer.report.test.ts`           CARRIED IT until G-040b-ii, which fixed the party unit
//                                        and introduced the BEDS model in the same repair.
//                                        Repaired here by sharing. **No verdict in that file
//                                        moved** — every arm is green under both models, which
//                                        is why the wrong model survived a repair aimed at it.
//
//   3. `determinism-log.ts`              CARRIES IT, at the `concurrentGuests` binding that
//                                        `copiesFor` divides by `1 + serviceFloorRefill`.
//                                        **NOT REPAIRED HERE, DELIBERATELY.** Read in guests the
//                                        amenity count of the I2 log's first two waves goes from
//                                        two of each kind to three, which moves the log's entity
//                                        ids and therefore the I2 hash — and that file's own
//                                        note records that a wave with more amenities made the
//                                        hotel "WORK too well", stopping `leftDissatisfied` at
//                                        sixty thousand ticks and costing the gate the coverage
//                                        of the row it was added for. So the repair trades
//                                        against a deliberate coverage balance in a harness this
//                                        goal does not own. **Parked with its falsification
//                                        test**: make the division count guests, re-run
//                                        `pnpm test:determinism` and the four `*.determinism`
//                                        suites, and read whether `leftDissatisfied` survives to
//                                        the horizon. If it does, the repair is free and is a
//                                        one-line goal; if it does not, the wave counts are the
//                                        goal and the units are its cause.
//
//   4. `bench.workload.golden.test.ts`   CHECKED, CLEAN. It carries two constants — commands and
//                                        guests — and reads the shipped table back at the
//                                        constant so a dial change goes red there rather than at
//                                        a hash three hundred lines down.
//
//   5. `tools/gates/workload.mjs`        CHECKED, CLEAN, AND IT IS THE MODEL ANSWER. The same
//                                        quotient stood there and was RETIRED at G-032a in
//                                        favour of an occupancy MEASURED off the run, because
//                                        the quotient read one number at three different
//                                        occupancies. A rule that must be computed before the
//                                        run cannot do that — but its test can, and every arm
//                                        in `provisioning.report.test.ts` does.
// ============================================================================================

import {
  firstGuestRules,
  needTypesInOrder,
  partySizeOf,
  stayDurationOf,
  toleranceOf,
  wantAtOf,
  wantLineOf,
} from '@hotelsim/sim';
import type { BoundContent } from '@hotelsim/sim';

/**
 * HOW MANY GUESTS ONE ARRIVAL COMMAND BRINGS, over the cycle the shipped table emits.
 *
 * THE TABLE IS A CYCLE OVER THE GUEST-ID LINE, NOT A PROBABILITY (ADR-0072). A party consumes
 * one ordinal per member, so the ordinals its members occupy are never asked — which is why
 * `[3, 1]` reads as three singles per pair and emits one, one, two. The long-run mean is the
 * mean over that cycle and nothing else.
 *
 * **IT CALLS `partySizeOf` RATHER THAN WALKING THE WEIGHTS AGAIN.** The band walk lives in
 * `packages/sim` and a second copy of it in a harness is ADR-0021's duplicated-constant shape —
 * `scorer.report.test.ts` carried exactly that copy, and its version answers the wrong mean for
 * any table whose cycle does not begin at the first ordinal. The independent check on this
 * number is `party.content.test.ts`, which reads the ratio out of a REAL RUN.
 *
 * THE CYCLE IS FOUND RATHER THAN ASSUMED TO BE ONE PERIOD LONG. The walk's whole state is
 * `ordinal % period`, so the size sequence is eventually periodic; the first residue that
 * repeats closes the cycle, and the mean is taken over the cycle rather than over a prefix that
 * may straddle it. Terminates in at most `period + 1` steps, because there are only that many
 * residues and each step consumes at least one ordinal.
 *
 * Guest ids ascend from 1, so the walk starts at 1 — the ordinal the first party really gets.
 */
export function guestsPerArrivalCommand(content: BoundContent): number {
  const weights = firstGuestRules(content)?.partySizeWeights;
  // The absent case is every build before the dial: one command, one guest.
  if (weights === undefined) return 1;
  let period = 0;
  for (const weight of weights) period += weight;
  const firstSeenAt = new Map<number, number>();
  const sizes: number[] = [];
  let ordinal = 1;
  for (;;) {
    const residue = ordinal % period;
    const seen = firstSeenAt.get(residue);
    if (seen !== undefined) {
      const cycle = sizes.slice(seen);
      let guests = 0;
      for (const size of cycle) guests += size;
      return guests / cycle.length;
    }
    firstSeenAt.set(residue, sizes.length);
    const size = partySizeOf(content, ordinal);
    sizes.push(size);
    ordinal += size;
  }
}

/**
 * HOW MANY ARRIVAL COMMANDS ARE IN FLIGHT AT ONCE — in PARTIES.
 *
 * A stay divided by the gap between commands. This is the quantity `rooms` is comparable with,
 * because a room holds a party; it is NOT the quantity any provider bound is expressed in.
 */
export function partiesInFlight(content: BoundContent, arrivalEveryTicks: number): number {
  return (stayDurationOf(content) ?? 0) / arrivalEveryTicks;
}

/** The lodging PARTIES a hotel of `rooms` rooms holds at this cadence: its rooms or its feed. */
export function concurrentParties(content: BoundContent, rooms: number, arrivalEveryTicks: number): number {
  return Math.min(rooms, partiesInFlight(content, arrivalEveryTicks));
}

/**
 * THE SAME POPULATION IN GUESTS — the one conversion, and the only place a party count becomes
 * a guest count.
 *
 * Every comparison in this project against a bound that counts guests goes through here.
 */
export function concurrentGuests(content: BoundContent, rooms: number, arrivalEveryTicks: number): number {
  return concurrentParties(content, rooms, arrivalEveryTicks) * guestsPerArrivalCommand(content);
}

/**
 * THE GUESTS WAITING IN THE LOBBY AT ONCE, in guests: the arrival rate times the window a guest
 * will wait before giving up.
 *
 * The rate is in guests per tick — commands per tick times the guests each brings — which is the
 * second place the party unit entered and the second place it was dropped.
 */
function guestsWaiting(content: BoundContent, arrivalEveryTicks: number): number {
  return ((toleranceOf(content) ?? 0) / arrivalEveryTicks) * guestsPerArrivalCommand(content);
}

/**
 * The engagement needs, in table order. Every rule below is one expression with one number per
 * term, so it is only expressible while the engagement needs agree about their rate and about
 * how long one serving takes; `provisioning.report.test.ts` asserts that uniformity, and content
 * that broke it would need a rule per need rather than a wider bound here.
 */
const engagementNeeds = (content: BoundContent) =>
  needTypesInOrder(content).filter((needType) => needType.role !== 'lodging');

/**
 * HOW MANY LODGER GUESTS ONE PROVIDER OF A KIND SUSTAINS — `refillPerTick + 1`, by flow
 * conservation over a closed cycle: a need's decay equals its refill, so the served fraction is
 * `1 / (1 + refillPerTick)` whatever the capacity and the want line.
 *
 * IT COUNTS GUESTS, WHICH IS THE WHOLE POINT OF THIS MODULE. It is also an UPPER bound on what a
 * provider really delivers: it charges nothing for the walk to the provider and nothing for the
 * deeper deficit a guest arrives with when it has queued. See the note in
 * `provisioning.report.test.ts` on where that gap is visible.
 */
export function guestsPerProvider(content: BoundContent): number {
  return (engagementNeeds(content)[0]?.refillPerTick ?? 0) + 1;
}

/**
 * HOW LONG ONE SERVING TAKES, in ticks: the deficit a guest engages with over the rate the
 * provider fills it at, `wantLine / refillPerTick`.
 *
 * DERIVED, AND IT USED TO BE A LITERAL — the history is carried here with the function because it
 * is the reason the function exists. The number came off θ-b2's occupancy note and sat in
 * `unserved.report.test.ts` under a header claiming nothing in that ladder was a number somebody
 * chose, which was false of it and load-bearing: it sets the amenity count of every rung. It is
 * not a free constant at all. A guest engages at its WANT LINE and is released at FULL — the far
 * side of the hysteresis — so the ticks it holds a provider for are the deficit it arrived with
 * over the rate that provider fills it at.
 *
 * IT IS THE UNCONTENDED MINIMUM RATHER THAN THE HOLD, which is ADR-0033's own reading of the rule
 * as a FLOOR rather than a prediction. A guest's other needs decay while it is being served, so a
 * guest walking to its SECOND provider engages BELOW its want line — deeper than this — and holds
 * that provider longer. `ceil` is what makes the difference immaterial: the realised hold runs
 * above this figure and the amenity count it produces is unchanged at every rung of the ladder.
 */
export function serviceTicks(content: BoundContent): number {
  const need = engagementNeeds(content)[0];
  return need === undefined ? 0 : wantLineOf(need, wantAtOf(content)) / need.refillPerTick;
}

/** And how many LOBBY guests one provider clears: the tolerance window over one serving. */
function lobbyGuestsPerProvider(content: BoundContent): number {
  return (toleranceOf(content) ?? 0) / serviceTicks(content);
}

/**
 * THE AMENITIES OF EACH KIND A HOTEL OF `rooms` ROOMS NEEDS, at the load it converges to.
 *
 * ============================================================================================
 * THE ARITHMETIC, WITH THE UNIT OF EVERY TERM WRITTEN DOWN:
 *
 *     lodgers  = min(rooms, stay / arrivals)   PARTIES    x guestsPerArrivalCommand -> GUESTS
 *     waiting  = tolerance / arrivals          PARTIES    x guestsPerArrivalCommand -> GUESTS
 *     amenities = ceil( lodgers / guestsPerProvider + waiting / lobbyGuestsPerProvider )
 *
 * **BOTH NUMERATORS ARE NOW GUESTS AND BOTH DENOMINATORS ALWAYS WERE.** What this replaces
 * divided the PARTY counts by the guest-denominated capacities, which under-provisions every
 * rung by the mean party size, and bites first at whichever rung is the first to cross a
 * provider's capacity.
 *
 * THE `ceil` HAS TWO FIXED POINTS AND THIS IS THE STABLE ONE (ADR-0033): a starved hotel
 * suppresses the concurrency the rule is measured on, so provisioning to the CONVERGED load
 * rather than to the raw demand is what makes rungs comparable. The lobby term is charged only
 * to a hotel that has one — a hotel with a room for every party in flight leaves nobody waiting,
 * and both sides of that branch are party counts, which they always were.
 * ============================================================================================
 */
export function amenitiesFor(content: BoundContent, rooms: number, arrivalEveryTicks: number): number {
  const lodgers = concurrentGuests(content, rooms, arrivalEveryTicks);
  const hasLobby = rooms < partiesInFlight(content, arrivalEveryTicks);
  const waiting = hasLobby ? guestsWaiting(content, arrivalEveryTicks) : 0;
  return Math.ceil(lodgers / guestsPerProvider(content) + waiting / lobbyGuestsPerProvider(content));
}

/**
 * THE ROOM COUNT AT WHICH THE CADENCE STOPS BEING THE BINDING CONSTRAINT.
 *
 * A room count, and it is a PARTY count read as one — legitimately, because a room holds a
 * party. Rounded because a cadence that does not divide the stay leaves a fraction of a party in
 * flight and a hotel cannot buy a fraction of a room.
 */
export function saturatingRooms(content: BoundContent, arrivalEveryTicks: number): number {
  return Math.round(partiesInFlight(content, arrivalEveryTicks));
}
