// G-028a — THE INSTRUMENT, THROUGH REAL PROCESSES.
//
//   pnpm exec vitest run unserved
//
// ============================================================================
//  WHAT THIS FILE IS FOR, AND WHY IT IS NOT A REVIEW TEST.
//
//  ADR-0033 measured the build loop's review signal and found it ABSENT: the departure tally
//  is a one-tick snapshot of a population that arrives on a fixed cadence and stays a fixed
//  length, so every guest is read at the same phase of the same deterministic cycle, and a
//  one-tick change in that cadence moves the whole population a whole band.
//
//  This goal ships the replacement MEASUREMENT and changes no verdict: `reviewOf` is untouched,
//  `met` and `unmet` are untouched, and `report.ts`'s review law A is untouched — because that
//  law compares the top-review count against the least-met row, so the score and `met` have to
//  move in the same diff or a well-provisioned hotel exits 1 (ADR-0034 §2). The arms below
//  therefore assert things about the SHARE, and where they mention the review mean they do so as
//  a GOLDEN: what the shipped scorer does today, recorded so that the goal which replaces it has
//  something exact to replace.
//
//  THE LADDER IS DERIVED HERE RATHER THAN TYPED. ADR-0033's finding was that AXIS 1's ladder is
//  four CLI flag strings which hold amenities fixed while adding rooms — so it builds
//  progressively worse-provisioned hotels and a falling score is correct. The rungs below take
//  their amenity count from the published provisioning rule, computed from the shipped content:
//  a provider sustains `refillPerTick + 1` lodgers by flow conservation, and `toleranceTicks / 60`
//  guests waiting in the lobby. Edit the content and the ladder re-derives; nothing here is a
//  number somebody chose.
// ============================================================================

import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadContent } from './content-loader.js';
import { amenitiesFor as amenitiesForAt, saturatingRooms } from './provisioning.js';
import { meanReviewHundredths, unservedShareBasisPoints } from './report.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');
const CONTENT = loadContent();

function run(args: readonly string[]): RunSummary {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args, '--json'], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
    encoding: 'utf8',
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as RunSummary;
}

/** The cadence every rung shares. One arrival per this many ticks. */
const ARRIVALS = 120;
const BASE = ['--days', '30', '--seed', '7', '--arrivals', String(ARRIVALS)] as const;
const at = (rooms: number, amenities: number, arrivals = ARRIVALS): RunSummary =>
  run([...BASE.slice(0, 4), '--arrivals', String(arrivals), '--rooms', String(rooms), '--amenities', String(amenities)]);

// ============================================================================
//  THE PROVISIONING RULE — NOW IN `provisioning.ts`, AND THE UNITS ARE WHY (G-043).
//
//  EVERY TERM OF THIS RULE USED TO LIVE HERE, and it divided a PARTY count by a bound that
//  counts GUESTS: `stayDurationTicks / arrivals` counts arrival COMMANDS, and one command has
//  brought more than one guest since the dial shipped. So the rule under-provisioned every rung
//  by the mean party size, and bit at the first rung whose population crossed what one provider
//  sustains — which is the TOP rung, and is the whole of the OPEN FINDING recorded below.
//
//  IT IS SHARED RATHER THAN REPAIRED IN PLACE because this was the FIFTH sighting of that class
//  in five places, and the fourth repair — `scorer.report.test.ts` — fixed the party unit while
//  bounding occupancy by BEDS, which the simulation does not do. Two copies that disagree about
//  the model is how the fifth one survived. `provisioning.report.test.ts` asks the simulation
//  which model is right rather than asserting it.
// ============================================================================

/** The rule, at this file's cadence. Every rung's amenity count comes through here. */
const amenitiesFor = (rooms: number): number => amenitiesForAt(CONTENT, rooms, ARRIVALS);

/**
 * The room count at which the cadence stops being the binding constraint — the ladder's top
 * rung, and the room count several arms below use as "the saturated hotel".
 *
 * A PARTY COUNT READ AS A ROOM COUNT, which is legitimate because a lodging room is claimed by
 * one party; `provisioning.report.test.ts` settles that against the simulation rather than
 * assuming it. It is the same value this file called `DEMAND`, and the rename is the point: it
 * was being used as a room count, a party count and a guest count in three different places.
 */
const DEMAND = saturatingRooms(CONTENT, ARRIVALS);

/**
 * The ladder: room counts spanning starved to saturated, each provisioned to its own load.
 *
 * IT MOVES TWO AXES AT ONCE, AND THE ARMS BELOW ARE TITLED FOR THAT (ADR-0034's amendment). A rung
 * adds rooms AND the amenities that rule says those rooms need, so what this ladder measures is a
 * hotel scaled along the provisioning DIAGONAL. **A player does not move along it**: they build one
 * thing at a time, and the amenity axis alone is the golden below, which does not read the same way.
 * A claim about "a better-provisioned hotel" taken from a diagonal is wider than its predicate.
 */
const ROOM_LADDER = [1, 3, 6, DEMAND] as const;
const LADDER = ROOM_LADDER.map((rooms) => at(rooms, amenitiesFor(rooms)));

// ============================================================================
//  THE STATISTICS, FOLDED FROM THE REPORT'S OWN COLUMNS.
// ============================================================================

const sharesIn = (summary: RunSummary): number[] => summary.needs.map((row) => unservedShareBasisPoints(row));
const engagementSharesIn = (summary: RunSummary): number[] =>
  summary.needs.filter((row) => !row.lodging).map((row) => unservedShareBasisPoints(row));
const meanShare = (values: readonly number[]): number =>
  Math.round(values.reduce((total, value) => total + value, 0) / values.length);
const strictlyDecreasing = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value < values[index - 1]!);
const strictlyIncreasing = (values: readonly number[]): boolean =>
  values.every((value, index) => index === 0 || value > values[index - 1]!);
const spread = (values: readonly number[]): number => Math.max(...values) - Math.min(...values);

describe('the provisioning rule is derived from content, and the ladder is built from it', () => {
  it('the ladder is provisioned by THE rule, and the rungs it produces are on the page', () => {
    // ========================================================================
    // WHAT THE ARM THIS REPLACES ASSERTED, AND WHERE IT WENT (G-043).
    //
    // It pinned that the engagement needs agree about their refill and about how long one
    // serving takes — the uniformity without which the rule is not one expression. That claim
    // is about `provisioning.ts` rather than about this ladder, and it is asserted there, once,
    // beside the module it constrains. Keeping a second copy here would be the duplicated
    // constant ADR-0021 is about, in the file whose header says nothing in this ladder is a
    // number somebody chose.
    //
    // WHAT IS ASSERTED HERE INSTEAD IS THE THING THIS FILE OWNS: which rungs the rule produces.
    // The counts below are the ladder every literal in this file is measured on, so a content
    // edit that re-provisions a rung goes red HERE, with the rung named, rather than at whichever
    // golden happens to sit lowest in the file.
    //
    // THE TOP RUNG IS THE ONE G-043 MOVED. Read in guests it needs two amenities of each kind
    // where the party-counting rule gave it one, and every other rung is unchanged — which is
    // why three of these four runs are byte-identical to the ones this file measured before the
    // repair, and the fourth is the whole of the finding below.
    // ========================================================================
    //
    // ONE ASSERTION, NOT TWO. A second line saying the top rung's count exceeds one was written
    // here and taken out again: it is entailed by the array, so it forbids no state the array
    // permits (ADR-0035). The claim it was reaching for — that the two units fall on opposite
    // sides of what one provider sustains — is asserted in `provisioning.report.test.ts`, where
    // both units are in scope.
    expect(ROOM_LADDER.map((rooms) => amenitiesFor(rooms))).toEqual([1, 1, 1, 2]);
  });

  it('and the top rung is the saturation point the cadence implies, not a number somebody picked', () => {
    // `stayDurationTicks / arrivals` caps the population, so the ladder cannot test a hotel
    // bigger than this and a rung above it would be the same hotel. Asserted rather than
    // described: the top rung and twice the top rung produce the same run.
    const twice = at(DEMAND * 2, amenitiesFor(DEMAND));
    expect(twice.guests.departures).toEqual(LADDER[LADDER.length - 1]!.guests.departures);
    // ========================================================================================
    // THE EQUALITY IS NO LONGER EXACT ON ONE ROW OF FOUR, AND THE TWO HALVES OF THIS ARM HAVE
    // COME APART FOR A STATED REASON (G-039b-alpha).
    //
    //     departures     IDENTICAL, exactly, on both sides — the assertion above, unmoved
    //     shares         [455, 893, 1302, 0]  ->  [455, 894, 1302, 0] at TWICE the rooms
    //
    // **SATURATION IS A CLAIM ABOUT THE POPULATION AND THE SHARE IS AN INTEGRAL OVER TICKS**, and
    // only the first is implied by the cadence. Past saturation the same guests arrive, lodge and
    // leave — that is what `departures` being identical says, and it is the property this arm is
    // named for. But `--rooms 24` is a BIGGER BUILDING than `--rooms 12`: twelve more rooms means
    // twelve more lanes, the plate reaches further across the floor, and a guest walking to an
    // amenity spends a tick or two more in transit with its needs decaying. The unserved integral
    // counts those ticks. It read equal before this goal because the pre-spine plate happened to
    // give both room counts the same walk; it does not now, and one basis point on one row of
    // four is the size of the effect.
    //
    // BOTH SIDES ARE PINNED AS LITERALS RATHER THAN A TOLERANCE BEING INTRODUCED. A `toBeCloseTo`
    // here would permit any drift under whatever bound somebody chose; two exact arrays forbid
    // strictly more than the equality did, and they say WHICH row moved and by how much.
    //
    // ========================================================================================
    // **AND AT G-038a-iii-b THE EXACT EQUALITY IS BACK — ALL FOUR ROWS, BOTH SIDES.**
    //
    //     shares at the top rung   [455, 893, 1302, 0]  ->  [488, 908, 1315, 0]
    //     shares at TWICE the top  [455, 894, 1302, 0]  ->  [488, 908, 1315, 0]   IDENTICAL
    //
    // The paragraph above diagnosed the one-basis-point gap as a WALK: *"`--rooms 24` is a
    // BIGGER BUILDING than `--rooms 12` … a guest walking to an amenity spends a tick or two
    // more in transit"*. **The shaft makes that difference stop mattering, which is the
    // diagnosis being confirmed rather than a coincidence.** Every journey to an amenity in
    // this hotel is now dominated by the leg to the stairwell column and back out again — a
    // leg both room counts pay identically, because the shaft is at the same cell on both —
    // so the extra lanes past room twelve no longer buy anybody a longer walk.
    //
    // ALL THREE ROWS RISE, WHICH IS THE COST AND IS PINNED RATHER THAN GLOSSED: the unserved
    // integral is up 33, 15 and 13 basis points because the shaft is a longer walk for
    // everybody. What saturation asserts is that the two arms are the SAME RUN, and they are
    // more exactly the same run than they were before this goal.
    // ========================================================================================
    // [488, 908, 1315, 0] -> [1285, 936, 224, 0] AT G-041, AND SATURATION SURVIVES IT EXACTLY.
    // The rows move a long way — the re-derived rates make `guest_comfort` the pressed row and
    // `guest_nourishment` the served one, swapping the ends of the table — and the property this
    // arm asserts is untouched: the top rung and TWICE the top rung are the same run, row for
    // row, because past the saturation point the extra provisioning has nothing to do.
    // G-040b-ii: [1,285, 936, 224, 0] -> [2,882, 2,849, 216, 0], AND SATURATION SURVIVES IT
    // EXACTLY AGAIN. The top rung's engagement rows more than double because the party cycle
    // puts 16 guests behind the one amenity this ladder's rule provisions it with (see the block
    // on `THE SHARE FALLS AT EVERY RUNG`), and the LODGING row goes to zero — twelve bedrooms
    // hold twelve parties, which is every party in flight, so nobody waits for a bed at all. The
    // property this arm asserts is untouched: the top rung and TWICE the top rung are the same
    // run, row for row.
    // ========================================================================================
    // **G-043: [2,882, 2,849, 216, 0] -> [371, 352, 653, 0], AND SATURATION SURVIVES IT A THIRD
    // TIME.** Both arms are re-run at the amenity count the REPAIRED rule gives this rung — two
    // of each kind rather than one — and they are still the same run, row for row. That is the
    // strongest form this arm has taken: the re-provisioning moves all three engagement rows by
    // thousands of basis points and moves the equality by nothing.
    // ========================================================================================
    // **G-054: [371, 352, 653, 0] -> [493, 470, 369, 0], AND SATURATION SURVIVES IT A FOURTH
    // TIME.** The need tie-break is settled per guest now (`needTieBreakRank`, ADR-0078) instead
    // of by ascending content id, so the three engagement rows stop being ordered by spelling:
    // `guest_nourishment` — the row with two providers — goes from WORST at 653 to BEST at 369,
    // and the spread across the three narrows from 1.85x to 1.34x. **The property this arm
    // asserts is untouched again: the top rung and TWICE the top rung are the same run, row for
    // row**, which is what saturation means and what no re-pin of these literals can fake.
    // 493/470/369 -> 530/488/391 AT G-046: a door is a PLACE, so a journey costs a tick and a
    // tick in transit is a tick unserved. **What this arm asserts is untouched — the top rung
    // and TWICE the top rung agree row for row**, which is what saturation means.
    // 530/488/391 -> 531/515/404 AT G-046b: a room is LEFT through its door too, so a journey
    // costs a tick at both thresholds and a tick in transit is still a tick unserved. **What
    // this arm asserts is untouched — the top rung and TWICE the top rung agree row for row**,
    // which is what saturation means and what no re-pin of these literals can fake.
    expect(sharesIn(LADDER[LADDER.length - 1]!)).toEqual([531, 515, 404, 0]);
    expect(sharesIn(twice)).toEqual([531, 515, 404, 0]);
    // AND ALL FOUR ROWS ARE EXACTLY EQUAL AGAIN — a `toHaveLength(3)` stood here for one goal,
    // while one row of four differed, and it is restored to the full width rather than left at
    // the weaker count.
    const topShares = sharesIn(LADDER[LADDER.length - 1]!);
    expect(sharesIn(twice).filter((value, index) => value === topShares[index])).toHaveLength(4);
  });

  it('and every rung converges to the occupancy it was provisioned for — the stable fixed point', () => {
    // The `ceil` has two fixed points (ADR-0033), so "provision for the converged load" is only
    // meaningful if the load a rung converges to reproduces the provisioning. Occupancy is read
    // from the run: a rung short of rooms leaves guests in the lobby, and one with enough does
    // not, which is exactly the branch `amenitiesFor` takes.
    LADDER.forEach((summary, index) => {
      const rooms = ROOM_LADDER[index]!;
      const gaveUp = summary.guests.departures.find((row) => row.reason === 'gaveUp')?.count ?? 0;
      if (rooms < DEMAND) expect(gaveUp, `${rooms} rooms`).toBeGreaterThan(0);
      else expect(gaveUp, `${rooms} rooms`).toBe(0);
    });
  });
});

describe('AXIS 1, ALONG THE PROVISIONING DIAGONAL: rooms and amenities scaled together', () => {
  it('THE SHARE FALLS AT EVERY RUNG — the property the build loop needs and the snapshot lacks', () => {
    // ==========================================================================================
    // **OPEN FINDING, G-041 — THE ENGAGEMENT LADDER INVERTS AT THE TOP RUNG, AND THIS IS THE
    // ARM ADR-0034 §3(b) EXISTS FOR. IT NEEDS A RULING, NOT A RE-PIN, AND IT IS RECORDED HERE
    // AS EXACTLY WHAT IT IS.**
    //
    // Measured on the shipped ladder — rooms 1 / 3 / 6 / 12, amenities scaled by `amenitiesFor`,
    // unserved share in basis points, exact deterministic counts:
    //
    //     all four rows, mean     2,448  1,387    910    611     falls at every rung
    //     all four rows, worst    5,956  3,132  1,679  1,285     falls at every rung
    //     ENGAGEMENT ONLY, mean   1,278    805    654    815     RISES at the last rung
    //     ENGAGEMENT ONLY, worst  2,302  1,276    887  1,285     RISES at the last rung
    //
    // **THE STATISTIC THAT STILL FALLS IS THE ONE THAT INCLUDES LODGING, WHICH IS PRECISELY THE
    // SHAPE §3(b) CALLS AN OCCUPANCY STATISTIC WEARING A QUALITY STATISTIC'S CLOTHES.** Drop the
    // lodging row and the top rung is worse than the one below it.
    //
    // WHAT CAUSED IT, AS FAR AS IT IS KNOWN: G-041 re-derived the need rates so `refillPerTick`
    // is the rate a FULLY APPOINTED room reaches (ADR-0054, ADR-0057), and this tree has no
    // quality fold in it yet — so every room serves at the ceiling. Service stopped being the
    // bottleneck and WALKING became it: `amenitiesFor` scales the amenity count with the room
    // count, and more amenities are spread further across the plot. Past six rooms the extra
    // walk costs more than the extra capacity buys. The same inversion is measured from two
    // other instruments in the same commit — `scorer.report.test.ts`'s amenity pair (the worst
    // engagement share RISES with the second amenity at 3 and 6 rooms) and this file's own
    // amenity-axis golden below.
    //
    // WHY IT IS NOT RE-PINNED INTO A WEAKER CLAIM: this arm is the falsification ADR-0034 §3(b)
    // was written to make, and the ledger records that it *"would have caught the design this
    // goal's first plan carried"*. Turning it into "falls at three of four rungs" would delete
    // the thing it is for. So the LADDER IS ASSERTED EXACTLY, inversion included, and the
    // ordering claims are kept where they are still true and named where they are not.
    //
    // WHAT WOULD DISCHARGE IT: G-037a's fold makes a bare amenity serve at the FLOOR rate, which
    // puts service back as the bottleneck at every rung of this ladder. **A goal that merges the
    // fold re-takes this arm, and if the engagement ladder does not go back to strictly
    // decreasing, the inversion is a LAYOUT problem rather than a rate one and belongs to
    // whoever owns `amenityCell`.** That is falsifiable either way, which is what a parked
    // hypothesis owes (§4).
    // ==========================================================================================
    // ==========================================================================================
    // **THE OPEN FINDING IS CARRIED FORWARD AND IT IS WORSE AT G-040b-ii. IT IS NOT REPAIRED
    // HERE — THE HUMAN RULED IT G-043's — AND THIS BLOCK RECORDS WHAT THE PARTY DIAL DID TO IT,
    // WITH THE EXPERIMENT THAT WOULD SETTLE IT ALREADY RUN ONCE.**
    //
    // Measured on the shipped ladder, same invocation, unserved share in basis points, exact
    // deterministic counts (n = 1 IS the distribution; no clock is read, so no regime applies):
    //
    //     statistic                G-041                     + the party cycle 1, 1, 2
    //     all four rows, mean      2,448  1,387    910  611   2,459  1,431  1,132  1,487
    //     all four rows, worst     5,956  3,132  1,679 1,285   5,938  3,128  1,679  2,882
    //     ENGAGEMENT only, mean    1,278    805    654  815    1,299    866    949  1,982
    //     ENGAGEMENT only, worst   2,302  1,276    887 1,285   2,011  1,124  1,304  2,882
    //
    // **THE INVERSION HAS SPREAD IN TWO DIRECTIONS AT ONCE.** It used to be the last rung of the
    // engagement-only statistics; it now starts one rung EARLIER (rung 3 rises above rung 2 on
    // both engagement folds) and it has reached the statistic that INCLUDES the lodging row,
    // which G-041 could still show falling at every rung. **So ADR-0034 section 3(b)'s
    // "occupancy statistic wearing a quality statistic's clothes" no longer even masks it.**
    //
    // WHY, AND IT IS A UNIT ERROR IN THE PROVISIONING RULE RATHER THAN A MYSTERY. `DEMAND` is
    // `stayDurationTicks / arrivals` = 12, which counts arrival COMMANDS — PARTIES — and
    // `amenitiesFor` divides `min(rooms, DEMAND)` by `PER_PROVIDER_LODGERS`, which counts
    // GUESTS one provider can serve. The shipped cycle 1, 1, 2 brings four guests for every
    // three commands and a bedroom holds two of them, so **the top rung holds 16 guests and is
    // provisioned for 12**: `ceil(12/15) = 1` amenity where `ceil(16/15) = 2`. Every rung of
    // this ladder is now under-provisioned, and the top rung is the one where it bites, because
    // it is the only rung whose beds can hold the whole population.
    //
    // **THE FALSIFICATION TEST IS RUN AND IT COMES BACK POSITIVE, WHICH IS WHY THIS IS A FINDING
    // AND NOT A COMPLAINT.** The amenity-pair arm below measures the top rung with ONE MORE
    // amenity — which is what a guest-counting rule would provision it with — and it reads
    // `[371, 352, 653]` against the rung below it at `[1304, 1176, 368]`: engagement mean 459
    // against 949. **At the provisioning the repaired unit implies, the ladder is strictly
    // decreasing again.** Its departures say the same thing louder: 464 checked out and NOBODY
    // left dissatisfied, where the shipped rung reads 219 and 252.
    //
    // **WHAT IS NOT DONE HERE, DELIBERATELY.** The rule is not repaired — that changes the
    // amenity count of every rung and re-provisions the whole ladder, which is a re-derivation
    // of this file's subject and is G-043's to make. The dial is not tuned either: the mix is a
    // design number, demand is a TABLE OF ITS OWN (`demand.json`, G-051b, and it was "demand is M4's" until then), and tuning content until a
    // ladder behaves is exactly what section 9 makes a stop condition. **The deferral died at
    // G-051b and the argument did not.** What this goal owes is the numbers, and they are here.
    // ==========================================================================================
    // ==========================================================================================
    // **G-043 — THE RULE IS REPAIRED, AND THE FINDING IS DISCHARGED AT THE TOP RUNG ON EVERY
    // STATISTIC. WHAT SURVIVES IS AT RUNG 3, IT IS NOT A UNITS ERROR, AND IT IS NARROWED TO
    // EXACTLY THAT RATHER THAN SOFTENED.**
    //
    // The ladder is re-provisioned by `provisioning.ts`, which counts guests on both sides of the
    // division. Only the TOP rung's amenity count moves — one of each kind to two — so three of
    // these four runs are the same runs the column on the left was taken from and the fourth is
    // the repair. Same invocation, unserved share in basis points, exact deterministic counts
    // (n = 1 IS the distribution; no clock is read, so no regime applies):
    //
    //     statistic                the party-counting rule    the guest-counting rule
    //     all four rows, mean      2,459  1,431  1,132  1,487   2,459  1,431  1,132    344
    //     all four rows, worst     5,938  3,128  1,679  2,882   5,938  3,128  1,679    653
    //     ENGAGEMENT only, mean    1,299    866    949  1,982   1,299    866    949    459
    //     ENGAGEMENT only, worst   2,011  1,124  1,304  2,882   2,011  1,124  1,304    653
    //     REVIEW mean (hundredths)   318    354    400    389     318    354    400    500
    //
    // **BOTH ALL-ROWS STATISTICS ARE STRICTLY DECREASING AGAIN, AND THE REVIEW MEAN IS STRICTLY
    // INCREASING AGAIN, ACROSS ALL FOUR RUNGS.** The top rung stops being the worst-served hotel
    // on the ladder and becomes the best-served one, by a factor of three to four on every
    // engagement fold. Its departures say it louder than the shares do: 219 checked out with 252
    // walking out dissatisfied becomes 464 checked out with NOBODY dissatisfied.
    //
    // **WHAT SURVIVES, STATED EXACTLY: BOTH ENGAGEMENT-ONLY FOLDS RISE FROM RUNG 2 TO RUNG 3, AND
    // NOWHERE ELSE.** 866 -> 949 on the mean and 1,124 -> 1,304 on the worst. That rise is not
    // new — it arrived at G-040b-ii, one rung below the one this repair fixes, and the block
    // above records it as the inversion "starting one rung EARLIER".
    //
    // **ITS CAUSE IS THE `ceil`, NOT THE UNIT, AND THE ARITHMETIC IS AT THE NUMBERS.** The rule
    // provisions rung 2 and rung 3 with the SAME single amenity of each kind, because both land
    // under one whole provider — and the two rungs do not carry the same load: three rooms hold
    // four concurrent guests and six rooms hold eight, so rung 3 puts twice the population behind
    // one provider that rung 2 does. **The ladder is a diagonal with a sawtooth in it, and rung 3
    // is the tooth.** Rung 4 clears one whole provider, gets two, and pools them.
    //
    // **THE MEASUREMENT THAT WOULD DISCHARGE THE REMAINDER, RUN, AND POSITIVE**: six rooms with a
    // second amenity of each kind reads an engagement mean of 541 and a worst of 905, both BELOW
    // rung 2's 866 and 1,124 — strictly decreasing. So the residue is provisioning GRANULARITY.
    // The two candidate repairs are a rule that provisions to load rather than to a whole
    // provider, and a re-derivation of what one provider really sustains (`provisioning.ts`'s
    // figure is a ceiling that charges nothing for the walk). **Neither is done here**: the first
    // changes what this ladder measures and the second is a rates goal in G-041's shape.
    // **Choosing either because it makes this ladder monotone is the §9 stop condition**, and
    // G-039b-α refused that shape by name.
    // ==========================================================================================
    const means = LADDER.map((summary) => meanShare(sharesIn(summary)));
    // **G-054: 2,459 / 1,431 / 1,132 / 344 -> 2,461 / 1,464 / 1,153 / 333, AND THE PROPERTY IS
    // UNTOUCHED** — the all-rows mean still falls at every rung, and the rung-3 sawtooth the
    // block above derives is still exactly where the `ceil` puts it. The move is tens of basis
    // points on thousands, which is what a change that reallocates WHICH need waits, without
    // changing how much waiting there is, should read as at a fold that averages all four rows.
    // 2,461/1,464/1,153/333 -> 2,514/1,508/1,215/352 AT G-046. Every rung rises by the tick a
    // journey now costs; **the property this arm is about — the share FALLING at every rung —
    // is untouched**, and the predicate beside the literal is what says so.
    // 2,514/1,508/1,215/352 -> 2,519/1,517/1,281/363 AT G-046b, every rung rising by the second
    // threshold tick each journey now costs; **the property this arm is about — the share
    // falling at every rung — is untouched**, and the predicate beside the literal is what says
    // so rather than the literal.
    expect(means).toEqual([2_519, 1_517, 1_281, 363]);
    // **AND THE ALL-ROWS STATISTIC FALLS AT EVERY RUNG AGAIN**, which is the half of the finding
    // the repair discharges. The predicate is restored beside the literals rather than instead of
    // them, so the margin at each rung stays visible.
    expect(strictlyDecreasing(means)).toBe(true);
    // AND THE WORST-SERVED NEED FALLS TOO, which is the stronger statement: a mean can fall
    // while one need is abandoned entirely, and a guest with one need starved does not care that
    // the others were fine.
    const worst = LADDER.map((summary) => Math.max(...sharesIn(summary)));
    // G-054: the top two rungs are UNMOVED at 5,938 and 3,128, rung 3 moves by one, and the top
    // rung falls 653 -> 493. The worst row at the top rung is no longer the one whose id sorts
    // last, which is the whole of this goal; the ladder's monotone fall is untouched.
    // 1,680/493 -> 1,682/530 AT G-046 on the top two rungs, the bottom two byte-identical. The
    // ladder's monotone fall is what this arm asserts and it is unaffected.
    // 1,682/530 -> 1,766/531 AT G-046b on the top two rungs, the bottom two byte-identical
    // again. The ladder's monotone fall is what this arm asserts and it is unaffected.
    expect(worst).toEqual([5_938, 3_128, 1_766, 531]);
    expect(strictlyDecreasing(worst)).toBe(true);
    // AND WITH THE LODGING ROW DROPPED IT STILL DOES NOT, AT ONE RUNG — see the block above. Both
    // engagement ladders are asserted EXACTLY so the residue cannot be mistaken for noise and
    // cannot be fixed by anything that does not move these numbers.
    const worstEngagement = LADDER.map((summary) => Math.max(...engagementSharesIn(summary)));
    // G-054: 2,011 / 1,124 / 1,304 / 653 -> 1,462 / 1,084 / 1,414 / 493. Three of the four rungs
    // improve and rung 3 rises — the same `ceil` sawtooth the block above derives, read through
    // the worst engagement row. **Rung 1 falls by more than a quarter**, which is where a
    // per-guest tie-break helps most: one room and one amenity of each kind is the regime in
    // which everybody reaching for the same thing first is most expensive.
    // 1,462/1,084/1,414/493 -> 1,528/1,174/1,599/530 AT G-046, every rung up by the tick a
    // journey now costs. The non-monotonicity this arm records is unmoved and is asserted below.
    // 1,528/1,174/1,599/530 -> 1,532/1,193/1,766/531 AT G-046b, every rung up again by the
    // second threshold tick a journey now costs. The non-monotonicity this arm records is
    // unmoved and is asserted below.
    expect(worstEngagement).toEqual([1_532, 1_193, 1_766, 531]);
    expect(strictlyDecreasing(worstEngagement)).toBe(false);
    // WHERE IT FALLS AND WHERE IT DOES NOT, BOTH ASSERTED, so the surviving claim names the rung
    // rather than the ladder. It falls over rungs 1 -> 2, rises over 2 -> 3, and falls again over
    // 3 -> 4 by more than it rose — which is the `ceil` sawtooth the block above derives, and it
    // is a different shape from a ladder that turns over at the top.
    expect(strictlyDecreasing(worstEngagement.slice(0, 2))).toBe(true);
    expect(strictlyDecreasing(worstEngagement.slice(2))).toBe(true);
    expect(worstEngagement[3]!).toBeLessThan(worstEngagement[1]!);
  });

  it('AND IT IS NOT THE LODGING ROW DOING ALL THE WORK — the falsification, as an arm', () => {
    // ADR-0034 §3(b): a statistic that tracks the ladder only because bigger hotels give more
    // guests a bed is an OCCUPANCY statistic wearing a quality statistic's clothes, and it would
    // read flat the moment occupancy stopped moving. Drop the lodging need from the statistic
    // entirely — numerator and denominator — and the ladder must still fall.
    //
    // THIS IS THE CHECK THAT WOULD HAVE CAUGHT THE DESIGN THIS GOAL'S FIRST PLAN CARRIED, which
    // is why it ships as an arm rather than as a paragraph in a ledger.
    //
    // **AND AT G-041 IT DOES NOT — the arm above carries the finding in full and this is the
    // same inversion read through the mean instead of the maximum.** Asserted exactly, and the
    // ordering claim kept over the rungs where it holds.
    // **AND AT G-040b-ii THE INVERSION STARTS A RUNG EARLIER ON THIS FOLD TOO** — 1,299 / 866 /
    // 949 / 1,982, so rung 3 is already above rung 2. The block on `THE SHARE FALLS AT EVERY
    // RUNG` carries the cause, the arithmetic and the experiment; this is the same inversion
    // read through the mean instead of the maximum.
    // ==========================================================================================
    // **AND AT G-043 THE TOP RUNG IS DISCHARGED AND THE RUNG-3 RISE IS ALL THAT IS LEFT** —
    // 1,299 / 866 / 949 / 459. The top rung falls to well under half the rung below it, so this
    // fold agrees with the maximum, with the all-rows folds and with the review mean about where
    // the ladder now turns over and where it does not. The cause of the surviving rise is the
    // `ceil` sawtooth derived in the block above; **this fold is not evidence for it and does not
    // restate it**, it is the same rung read through a different aggregation.
    // ==========================================================================================
    const engagementMeans = LADDER.map((summary) => meanShare(engagementSharesIn(summary)));
    // **G-054: 1,299 / 866 / 949 / 459 -> 1,302 / 910 / 977, 444.** Same reading as the all-rows
    // fold above and the same conclusion: the top rung still falls to well under half the rung
    // below it, and the rung-3 rise the `ceil` sawtooth explains is still the only one left.
    // 1,302/910/977/444 -> 1,372/967/1,059/470 AT G-046, the same rise as the fold above and
    // the same conclusion: the top rung still falls to less than half the rung below it, and the
    // rung-3 rise the `ceil` sawtooth explains is still there.
    // 1,372/967/1,059/470 -> 1,379/980/1,147/483 AT G-046b, moving with the all-rows statistic
    // above and to the same conclusion: the top rung still falls to less than half the first,
    // the lodging row is still not doing the work, and the rung-3 rise the `ceil` sawtooth
    // explains is still there.
    expect(engagementMeans).toEqual([1_379, 980, 1_147, 483]);
    expect(strictlyDecreasing(engagementMeans)).toBe(false);
    expect(strictlyDecreasing(engagementMeans.slice(0, 2))).toBe(true);
    expect(strictlyDecreasing(engagementMeans.slice(2))).toBe(true);
    // And a row really is being excluded, so this is not the same fold under another name: every
    // rung carries exactly one lodging row, and the engagement fold is one shorter than the full
    // one. Without this the arm could pass by folding the same four rows twice.
    for (const summary of LADDER) {
      expect(summary.needs.filter((row) => row.lodging)).toHaveLength(1);
      expect(engagementSharesIn(summary)).toHaveLength(sharesIn(summary).length - 1);
    }
  });

  it('AND THE REVIEW MEAN NOW AGREES WITH IT — the golden this file shipped, DISCHARGED', () => {
    // ============================================================================
    // WHAT THIS ARM SAID AT G-028a, AND WHAT DISCHARGED IT.
    //
    // It was a GOLDEN: *"the shipped REVIEW mean is not monotone over the same four runs"*,
    // asserting `nonDecreasing === false` and pinning the shape — the mean fell at the second
    // rung and recovered. It existed so the goal that replaced the scorer had something exact
    // to replace, and so that nobody read a green run of this file as evidence that the review
    // was fixed.
    //
    // G-028b REPLACED THE SCORER (ADR-0037) AND THE GOLDEN IS NOW FALSE, WHICH IS THE ANSWER
    // ARRIVING RATHER THAN A REGRESSION — the words G-028a's own describe used for this case.
    // So it is INVERTED rather than deleted: the same four runs, the same fold, the opposite
    // verdict. A build that reintroduced the non-monotonicity would go red here.
    //
    // NO FIGURE IS SPELLED (ADR-0032 §1). What the effect is on THIS ladder is computed below.
    // ============================================================================
    //
    // ==========================================================================================
    //  AND AT G-039b-alpha THE DISCHARGE IS **REVERSED AT EXACTLY ONE RUNG**, AND IT IS THE RUNG
    //  IT ALWAYS HAD THE LEAST MARGIN AT. This is the loudest reading this goal produced and it
    //  is written up rather than flipped, because `strictlyIncreasing(...)).toBe(false)` would
    //  have been three characters and would have hidden all of it.
    //
    //  PAIRED, ONE SITTING, SAME LADDER, EXACT DETERMINISTIC INTEGERS — the "before" arm is this
    //  tree with `report.ts` restored to `981d5c4` and nothing else changed, restored afterwards
    //  from a scratch copy with `sha256sum -c` checked (`CLAUDE.md`'s mutation recipe):
    //
    //      rung            1 room   3 rooms   6 rooms   12 rooms
    //      before            300      317       409       500
    //      after             300     *291*      409       500
    //
    //  **THE DEPARTURES ARE BYTE-IDENTICAL AT EVERY RUNG, BOTH ARMS.** checkedOut 32/96/192/348
    //  and gaveUp 326/260/161/0 on both sides. Nobody is housed who was not housed, and nobody
    //  leaves who did not leave. What moved is the REVIEW DISTRIBUTION at one rung:
    //
    //      3 rooms   before   2:130, 3:130,        5:96
    //                after    2:192, 3:68,  4:32,  5:64
    //
    //  So this is **G-023b-ii's own sentence arriving through a different door**: *"outcomes do
    //  not move; experience does."* The spine lengthens every journey in a hotel whose two
    //  amenities are spread across the plate, guests spend more of a short stay in transit with
    //  their needs decaying, and thirty-two five-star stays become four-star ones while sixty-two
    //  three-star ones become two-star ones. ADR-0017 accepted exactly that trade for travel.
    //
    //  **WHY IT CROSSES THE LINE HERE AND NOWHERE ELSE: THE MARGIN WAS 17 HUNDREDTHS.** Rung 2
    //  sat at 317 against rung 1's 300 — a sixth of one band — and this goal moved it 26. Every
    //  other rung has 90 or more. **G-028b's discharge was true and was standing on a
    //  knife-edge**, and nothing in the file said so, because the arm asserted a PREDICATE and
    //  predicates do not carry margins. That is the finding worth more than the re-pin.
    //
    //  AND THE 1-ROOM RUNG IS WHY THE EDGE IS THERE AT ALL, which is a fact about the LADDER
    //  rather than about the scorer: at one room 326 of 358 guests never get a bed and review a
    //  neutral 3, so the rung scores like an average hotel by never being one. A hotel that
    //  serves a third of its guests badly scores below a hotel that serves almost none. Naming
    //  it is not fixing it; `G-041` re-derives the rates and ADR-0034's amendment already
    //  carries the amenity-axis half of the same complaint.
    //
    //  WHAT IS ASSERTED NOW FORBIDS STRICTLY MORE THAN THE PREDICATE IT REPLACES: all four means
    //  as literals, the tail's monotonicity unchanged, and the reversal itself as a named claim.
    //  A build that restored rung 2 goes red here, with the number in hand, instead of quietly
    //  going green.
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-038a-iii-b THE REVERSAL IS GONE AND THE DISCHARGE IS WHOLE AGAIN.** Rung 2 goes
    // 291 -> 317 — back to its pre-spine reading, to the hundredth — so the ladder is strictly
    // increasing across all four rungs and `reviewMeans[1] < reviewMeans[0]` is FALSE.
    //
    //     rung            1      2      3      4
    //     + the spine    300    291    409    500     reversed at 1 -> 2
    //     + the shaft    300    317    409    500     strictly increasing
    //
    // **THE MARGIN IS BACK TO 17 HUNDREDTHS, WHICH IS THE PART A READER MUST NOT LOSE.** The
    // block above is emphatic that G-028b's discharge *"was true and was standing on a
    // knife-edge"* and that the arm hid it by asserting a PREDICATE. That is exactly as true
    // today: 17 hundredths between rung 1 and rung 2, against 90 or more everywhere else, and
    // one goal has already knocked it over. The four literals stay so the margin is visible;
    // the predicate is restored beside them rather than instead of them.
    //
    // The 1-room rung is still why the edge exists — at one room 326 of 358 guests never get a
    // bed and review a neutral 3 — and `G-041` still owns the rates. Nothing here fixes it.
    // ==========================================================================================
    //
    // **AND AT G-041 THE KNIFE-EDGE IS GONE, WHICH IS THE ONE PLACE IN THIS FILE WHERE THE
    // RE-DERIVED RATES MAKE A CRITERION STRONGER RATHER THAN WEAKER.** [300, 317, 409, 500] ->
    // [318, 354, 409, 486]: the rung-1-to-rung-2 margin goes from **17 hundredths to 36**, more
    // than doubling, because a one-room hotel's few housed guests are now looked after and its
    // review mean rises with them. The top rung falls 500 -> 486 — it is no longer a point mass
    // at 5 — and the ladder is still strictly increasing across all four rungs. The paragraph
    // above says *"`G-041` still owns the rates. Nothing here fixes it."* This is that goal, and
    // the margin it names is what moved.
    // ==========================================================================================
    // **AND AT G-040b-ii THE DISCHARGE BREAKS AT THE TOP RUNG, WHICH IS THE OPEN FINDING
    // ARRIVING ON THE PLAYER-FACING STATISTIC.** [318, 354, 409, 486] -> [318, 354, 400, 389]:
    // the ladder rises for three rungs and then FALLS eleven hundredths into the rung whose 16
    // concurrent guests exceed what its one amenity sustains. The rung-1-to-rung-2 margin the
    // block above tracks is UNMOVED at 36, so the knife-edge that has broken twice before is not
    // what broke this time.
    //
    // `review.report.test.ts` and `scorer.report.test.ts` measure the same cell from their own
    // instruments and agree with this to the hundredth. The cause, the arithmetic and the
    // experiment are in the block on `THE SHARE FALLS AT EVERY RUNG`; nothing here repairs it.
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-043 THE DISCHARGE IS WHOLE AGAIN, ON THE PLAYER-FACING STATISTIC.**
    // [318, 354, 400, 389] -> [318, 354, 400, 500]: the three rungs the repair does not touch are
    // unmoved to the hundredth, and the rung whose sixteen concurrent guests now get the two
    // amenities of each kind the guest-counting rule provisions them with goes from ELEVEN
    // HUNDREDTHS BELOW the rung under it to a hundred above it. The ladder is strictly increasing
    // across all four rungs.
    //
    // **AND THE TOP RUNG IS A POINT MASS AT THE TOP BAND AGAIN**, which is the cost of the
    // repair and is stated rather than enjoyed: every guest at that rung checks out with every
    // need met, so the review has nothing left to resolve there. That is a real property of a
    // hotel provisioned to its own load, and it is also the CLAMP this file's phase block is
    // careful about — the phase arm below reads it back and says so rather than reporting
    // robustness.
    //
    // The rung-1-to-rung-2 margin is UNMOVED at 36, so the knife-edge that has broken twice in
    // this file's history is untouched by the repair, for the reason it was untouched by the
    // dial: nothing at one and three rooms changed.
    // ==========================================================================================
    const reviewMeans = LADDER.map((summary) => meanReviewHundredths(summary)!);
    // 400 -> 398 AT G-054 at rung 3, and the other three rungs are UNMOVED. The rung-1-to-rung-2
    // margin this block calls a knife-edge is still 36, and the top rung is still the point mass
    // at 500 the block above describes.
    // 318 / 354 / 398 / 500 -> 127 / 181 / 262 / 400 AT G-059. Every rung falls: the three
    // lean rungs turn guests away and those stays are at the floor now, and the top rung — which
    // houses and serves everybody — falls from 5.00 to 4.00 because a PROVISIONED hotel with no
    // FACILITY is not a five-star hotel and its standing is now a term in the mean.
    // **THE DISCHARGE THIS BLOCK EXISTS FOR IS UNTOUCHED**: the ladder is still strictly
    // increasing, which is the assertion below and the whole of the claim. The knife-edge margin
    // between rungs 1 and 2 WIDENS from 36 to 54, so the break this file has seen twice is
    // further away than it was.
    // 262 -> 261 AT G-046 on rung 3 alone; the other three rungs are byte-identical, and the
    // gap asserted below is unmoved. The discharge this arm records is unaffected.
    // 261 -> 260 AT G-046b on rung 3 alone; the other three rungs are byte-identical again, and
    // the gap asserted below is unmoved. The discharge this arm records is unaffected.
    expect(reviewMeans).toEqual([127, 181, 260, 400]);
    expect(reviewMeans[1]! - reviewMeans[0]!).toBe(54);
    // THE DISCHARGE HOLDS ACROSS THE WHOLE LADDER AGAIN. One predicate, not two: a `slice(1)`
    // clause stood here beside the whole-ladder one and is entailed by it (ADR-0035), which is
    // the shape this file has already deleted three of.
    expect(strictlyIncreasing(reviewMeans)).toBe(true);
    // AND THE TWO INSTRUMENTS AGREE RUNG FOR RUNG, which is what this file was built to draw and
    // is not a second copy of either ladder's own ordering: the review's best rung is the share's
    // lowest rung and the review's worst is the share's highest, at the ends the two folds have
    // no arithmetic in common at all.
    const means = LADDER.map((summary) => meanShare(sharesIn(summary)));
    expect(reviewMeans.indexOf(Math.max(...reviewMeans))).toBe(means.indexOf(Math.min(...means)));
    expect(reviewMeans.indexOf(Math.min(...reviewMeans))).toBe(means.indexOf(Math.max(...means)));
  });
});

describe('GOLDEN (ADR-0034 amendment): ON THE AMENITY AXIS ALONE, THE WORST NEED GETS WORSE', () => {
  /**
   * ============================================================================
   * THE ONE MOVE A PLAYER MAKES, AND THE STATISTIC MOVES THE WRONG WAY ON IT.
   *
   * Hold the rooms and the cadence still, add ONE amenity of each kind — the cheapest thing a
   * player can do with money — and the WORST-SERVED engagement need gets worse, while the sum and
   * the mean over the same rows get better. Both aggregations are folded here so the disagreement
   * is pinned in its direction rather than merely reported as an inversion.
   *
   * THE MECHANISM IS IN THE ROWS AND IT IS NOT A DEFECT IN THE COUNTER: a guest holds ONE provider
   * at a time, so serving one need better spends the ticks it was spending on another. That is the
   * simulation working as designed, seen through a `max`.
   *
   * WHY IT IS PINNED HERE RATHER THAN FIXED HERE. ADR-0034 ruled the review onto worst-need-decides
   * on the strength of the DIAGONAL above; this is the same ruling measured along the axis a player
   * actually moves. G-028a ships no scorer, so it cannot answer the question — it can only make
   * sure the question is in the tree, in front of the goal that does. **G-028b's plan must answer,
   * with a measurement, why worst-need-decides survives a player who builds an amenity.**
   *
   * IT IS A GOLDEN: it records what the statistic does today. If a later build makes the worst need
   * IMPROVE when an amenity is added, this arm goes red and that is the answer arriving, not a
   * regression.
   * ============================================================================
   */
  /**
   * A rung of the diagonal ladder, and the same hotel with one more of every amenity.
   *
   * The lean arm is REUSED from the ladder rather than re-run, so the pair differs in exactly the
   * flag under test. The lookup is checked rather than asserted with `!`: a rung that is not on
   * the ladder would otherwise index past the end and fail as a type error at the call site,
   * which reads as a bug in the arm rather than as the mistake it is.
   */
  const richer = (rooms: number): readonly [RunSummary, RunSummary] => {
    const index = ROOM_LADDER.indexOf(rooms as (typeof ROOM_LADDER)[number]);
    const lean = index === -1 ? undefined : LADDER[index];
    if (lean === undefined) throw new Error(`${rooms} rooms is not a rung of the derived ladder`);
    return [lean, at(rooms, amenitiesFor(rooms) + 1)];
  };

  it('THE GOLDEN IS INVERTED AT G-023b-ii: the worst engagement need now IMPROVES', () => {
    // ==========================================================================================
    // **THIS IS THE ANSWER ARRIVING, AND THIS FILE PRE-REGISTERED IT IN THOSE WORDS.** The block
    // above says: *"IT IS A GOLDEN: it records what the statistic does today. If a later build
    // makes the worst need IMPROVE when an amenity is added, this arm goes red and that is the
    // answer arriving, not a regression."* G-023b-ii declared `guestCellsPerTick: 3` and it did.
    //
    // MEASURED, BOTH ARMS, ONE SITTING, `--days 30 --seed 7 --arrivals 120`, unserved share in
    // basis points, exact integer counts so n=1 is the whole distribution:
    //
    //     rung      travel off                            travel on
    //      6 rooms  [472, 557, 1229] -> [19, 706, 1503]   [197, 937, 1700] -> [85, 808, 1630]
    //     12 rooms  [787, 818,  513] -> [21, 431,  910]   [448, 888, 1296] -> [65, 499,  998]
    //
    // With travel off, adding one amenity of each kind made SOME row worse at both rungs. With
    // travel on it makes EVERY row better at both rungs, and the maximum falls with them.
    //
    // **THE MECHANISM IS THE GOAL ITSELF, AND IT IS WHY THIS INVERSION IS THE RIGHT WAY UP.**
    // ADR-0034's amendment explained the old shape as *"a guest holds ONE provider at a time, so
    // serving one need better spends the ticks it was spending on another"* — a zero-sum over a
    // fixed budget of guest-ticks. **Travel adds a term that is not zero-sum: an extra amenity
    // is also a SHORTER WALK.** Every guest's journey to the nearest provider of a kind gets
    // cheaper, so the budget itself grows, and the row that was being robbed can improve at the
    // same time as the row that was gaining. The zero-sum reading was never wrong — it was a
    // statement about a world in which distance cost nothing.
    //
    // WHAT THIS MEANS FOR THE BUILD LOOP, SAID OUT LOUD BECAUSE IT IS THE POINT OF THE GAME:
    // *"build another amenity"* was a move that made the worst-served need WORSE, which is a
    // player being punished for the cheapest thing they can do. It is now a move that improves
    // every row. **Travel is what makes the amenity axis behave the way a player expects.**
    // ==========================================================================================
    // ==========================================================================================
    // **PART OF THE OPEN G-041 FINDING RECORDED ON `THE SHARE FALLS AT EVERY RUNG` ABOVE — READ
    // THAT BLOCK FIRST.** The amenity axis no longer improves every row: at the re-derived rates
    // service stops being the bottleneck and the WALK to a further-out amenity becomes one, so
    // the row that was already worst gets slightly worse while the other two improve sharply.
    // The claim is asserted as the exact pair of vectors rather than as a direction, so the size
    // of the regression is on the page and cannot be mistaken for the old behaviour returning.
    // ==========================================================================================
    const PAIRS: Record<number, readonly [readonly number[], readonly number[]]> = {
      // RE-TAKEN AT G-040b-ii. The `rich` arm at twelve rooms is the experiment the ladder's
      // block above names: it is the provisioning a GUEST-counting rule would give the top rung,
      // and it reads better than the rung below it on every row.
      // RE-TAKEN AT G-046: a door is a PLACE, so a journey costs a tick and every row rises.
      // **The PAIR's shape is what this table is for and it is unmoved** — two of three rows
      // still improve when the amenity is bought, at both room counts, which the arms below
      // assert.
      // RE-TAKEN AT G-046b: a room is LEFT through its door too, so every row rises again.
      // **The PAIR's shape is what this table is for and it is unmoved** — two of three rows
      // still improve when the amenity is bought, at both room counts.
      6: [
        [1_766, 1_381, 294],
        [615, 613, 542],
      ],
      // RE-TAKEN AT G-043. The twelve-room `lean` arm is now the rung the repaired rule
      // provisions — two amenities of each kind, not one — so this pair has become the move a
      // player makes ABOVE the provisioning point rather than the move that rescues a rung which
      // was under-provisioned by a unit error. The row movements shrink by an order of magnitude
      // with it, and that is the finding rather than a loss: the experiment the block on `THE
      // SHARE FALLS AT EVERY RUNG` named is no longer an experiment, it is the ladder.
      // RE-TAKEN AT G-054 with the rest of this file: the tie between equally-pressed needs is
      // settled per guest now, so the three rows stop being ordered by content id at either room
      // count. **Read the RICH arms rather than the levels**: 6 rooms went [266, 452, 905] ->
      // [570, 560, 503] and 12 went [254, 435, 607] -> [428, 401, 393], so a 3.40x and a 2.39x
      // spread across three rows became 1.13x and 1.09x. The pair's SHAPE is what this table is
      // for, and the arms below assert it.
      12: [
        [531, 515, 404],
        [457, 445, 426],
      ],
    };
    for (const rooms of [6, DEMAND]) {
      const [lean, rich] = richer(rooms);
      expect([engagementSharesIn(lean), engagementSharesIn(rich)], `${rooms} rooms`).toEqual(
        PAIRS[rooms]?.map((row) => [...row]),
      );
      // TWO ROWS OF THREE IMPROVE AT BOTH ROOM COUNTS, and by far more than the third loses:
      // 1,038 + 724 against 537 at six rooms, and 117 + 46 against 83 at twelve.
      //
      // **THE TWELVE-ROOM MARGINS SHRANK BY AN ORDER OF MAGNITUDE AT G-043 AND THAT IS THE
      // REPAIR SHOWING, NOT A REGRESSION.** The `lean` arm used to be a rung the party-counting
      // rule left with one amenity of each kind behind sixteen guests, so the extra amenity was
      // rescuing a starved hotel and was worth thousands of basis points. The rung is now
      // provisioned to its own load before this pair starts, so the extra amenity is what it
      // should be — a real but ordinary improvement on a hotel that already works. **The move
      // is still worth making at both room counts**, which is what this arm asserts; what the
      // block above records is a property of the LADDER, a different quantity on a different
      // axis.
      const improved = engagementSharesIn(rich).filter((value, index) => value < engagementSharesIn(lean)[index]!);
      expect(improved, `${rooms} rooms`).toHaveLength(2);
    }
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 12,361ms

  it('and the SUM and the MEAN over the same rows fall — AND SINCE G-023b-ii the MAX falls too', () => {
    // OVER THE SAME ROWS MEANS OVER THE SAME ROWS. Both folds here are ENGAGEMENT-only, which is
    // the set the `max` above is taken over and the set ADR-0034's amendment names. It shipped
    // with the mean folded over all four rows — mixing in the lodging row this file argues at
    // length must be excluded, the largest of the four at six rooms, carrying a quarter of the
    // weight while not moving. The sign survived only because that row happens to be constant
    // across both pairs, which is luck rather than a property.
    for (const rooms of [6, DEMAND]) {
      const [lean, rich] = richer(rooms);
      const total = (summary: RunSummary): number =>
        engagementSharesIn(summary).reduce((sum, value) => sum + value, 0);
      expect(total(rich), `${rooms} rooms`).toBeLessThan(total(lean));
      expect(meanShare(engagementSharesIn(rich)), `${rooms} rooms`).toBeLessThan(
        meanShare(engagementSharesIn(lean)),
      );
    }
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 14,256ms

  it('and at six rooms there is NO CONFOUND: the same guests, the same stays, more capacity', () => {
    // The inversion is not a population effect. Same departure table, same denominator on every
    // row — so nothing about who stayed or how long they stayed is doing the work, and what
    // changed is the hotel and the statistic.
    // ==========================================================================================
    // **AND AT G-040b-ii THE CONFOUND IS NOT ZERO ANY MORE — IT IS ONE GUEST IN 470, AND THAT IS
    // MEASURED RATHER THAN WAIVED.** The lean arm departs 255 checked out / 214 gave up / 1 left
    // dissatisfied; the rich arm departs 256 / 214 / 0. One guest of the shipped party cycle's
    // extra population sits close enough to its dissatisfaction ceiling that the extra amenity
    // is the difference between walking out and completing.
    //
    // The arm's claim survives and is asserted at the size it now has: the POPULATION is
    // identical (470 departures either way, same guests, same arrivals) and one of them changes
    // ROW, against row movements of 1,038 and 724 basis points on the statistic. A one-guest
    // reshuffle cannot manufacture that, and the equality that used to say so is replaced by the
    // two facts that still do rather than by a tolerance.
    // ==========================================================================================
    const [lean, rich] = richer(6);
    const departed = (summary: RunSummary): number =>
      summary.guests.departures.reduce((total, row) => total + row.count, 0);
    expect(departed(rich)).toBe(departed(lean));
    expect(departed(rich)).toBe(470);
    const moved = rich.guests.departures.filter(
      (row, index) => row.count !== lean.guests.departures[index]!.count,
    );
    expect(moved.map((row) => row.reason)).toEqual(['checkedOut', 'leftDissatisfied']);
    expect(moved.map((row) => row.count)).toEqual([256, 0]);
    // AND THE HOTEL REALLY DID GAIN CAPACITY, which is the half that would otherwise be assumed.
    expect(rich.input.amenities).toBe(lean.input.amenities + 1);
    expect(rich.rooms.valid).toBeGreaterThan(lean.rooms.valid);
  });

  /**
   * Which row is the bottleneck, ties going to the lowest index.
   *
   * The tie rule is stated because it has to be somewhere: the shipped rows are distinct at both
   * pairs, so nothing here depends on it today, and a table that produced a tie would otherwise
   * make this arm's subject depend on iteration order.
   */
  const bottleneck = (values: readonly number[]): number =>
    values.reduce((best, value, index) => (value > values[best]! ? index : best), 0);
  /** Its opposite: the need the hotel was serving best, same tie rule. */
  const leastPressed = (values: readonly number[]): number =>
    values.reduce((best, value, index) => (value < values[best]! ? index : best), 0);

  it('AT SIX ROOMS EVERY ROW IMPROVES, AND THE BOTTLENECK STAYS PUT', () => {
    // ========================================================================
    // THE MECHANISM, PINNED AS SUCH. The arm this replaces asserted "some row improved and some
    // row worsened", and BOTH halves of that are ENTAILED by the two arms above: a sum cannot
    // fall with every row non-decreasing, and the row that ends up the maximum must have risen
    // above the old maximum. So it forbade no state its neighbours permitted — and it did not
    // pin what it named, because a build in which the bottleneck was FIXED and a different need
    // collapsed into a bigger maximum passes all of it.
    //
    // What is asserted instead is the row identity: the need that WAS the worst gets worse, and
    // a need that was not the worst gets better. Neither follows from "the max rose" or "the sum
    // fell" — the twelve-room arm below is a live witness that arms 1 and 2 admit the opposite.
    // ========================================================================
    //
    // INVERTED AT G-023b-ii WITH THE ARM ABOVE, AND ITS ROW-IDENTITY CLAIM IS GONE RATHER THAN
    // MOVED. It asserted that the WORST row got worse and the BEST-SERVED row got better — two
    // rows moving in opposite directions, which was the whole content of "you built the wrong
    // thing". With travel on, [197, 937, 1700] becomes [85, 808, 1630]: **all three rows
    // improve**, so there are no opposite directions left to name. What is asserted instead is
    // the stronger statement the new shape supports — EVERY row improves, which forbids the old
    // behaviour and every partial version of it.
    // ==========================================================================================
    // **PART OF THE OPEN G-041 FINDING RECORDED ON `THE SHARE FALLS AT EVERY RUNG` ABOVE — READ
    // THAT BLOCK FIRST.** The amenity axis no longer improves every row: at the re-derived rates
    // service stops being the bottleneck and the WALK to a further-out amenity becomes one, so
    // the row that was already worst gets slightly worse while the other two improve sharply.
    // The claim is asserted as the exact pair of vectors rather than as a direction, so the size
    // of the regression is on the page and cannot be mistaken for the old behaviour returning.
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-040b-ii THE SIX-ROOM RUNG TAKES THE TWELVE-ROOM SHAPE, SO THE TWO RUNGS AGREE
    // AGAIN AND THE ROW IDENTITIES ARE THE OTHER WAY ROUND.** [1,304, 1,176, 368] -> [266, 452,
    // 905]: the row that was the BOTTLENECK improves by 1,038 basis points, the second improves
    // by 724, and the row that was BEST SERVED is the one that regresses, by 537.
    //
    // That is the sentence the twelve-room arm below has carried since G-041, arriving one rung
    // down: with 16 concurrent guests behind ONE amenity of each kind, the extra provider goes
    // where the queue is rather than where there was no shortage, and the need that was cheap
    // to serve is the one that pays for the guest-ticks it takes.
    //
    // **THE ARM'S SUBJECT IS THE ROW IDENTITY AND IT IS RE-ASSERTED, NOT DROPPED.** What must be
    // true for the build move to read honestly is that adding an amenity relieves the bottleneck;
    // that is now the case at both rungs, and it is the first era of this file in which it is.
    // ==========================================================================================
    const [lean, rich] = richer(6);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worst = bottleneck(before);
    const bestServed = leastPressed(before);
    for (const [index, value] of after.entries()) {
      if (index === bestServed) continue;
      expect(value, `row ${index} at 6 rooms`).toBeLessThan(before[index]!);
    }
    // THE BOTTLENECK ROW IMPROVES, by 844 basis points on 1,414 at G-054 (was 1,038 on 1,304)
    // — three fifths of it rather than four fifths. **The DIRECTION is the arm's subject and it
    // is unmoved**: adding an amenity still relieves the row that was queueing worst.
    expect(after[worst]!).toBeLessThan(before[worst]!);
    // 844 -> 993 AT G-046. **The relief the extra amenity buys GROWS by 149 basis points**,
    // because a second copy is somewhere else on the plot and now shortens the journey as well
    // as the queue. The claim is the inequality above and it is untouched.
    // 993 -> 1,151 AT G-046b. **The relief the extra amenity buys GROWS by another 158 basis
    // points**, because a second copy is somewhere else on the plot and a journey now pays a
    // threshold tick at each end, so shortening it is worth more again. The claim is the
    // inequality above and it is untouched.
    expect(before[worst]! - after[worst]!).toBe(1_151);
    // AND THE ROW THAT REGRESSES IS THE ONE THAT WAS BEST SERVED, by 537 on 368: a guest holds
    // ONE provider at a time, so the ticks that go into the relieved rows come out of the row
    // that was not queueing. That is ADR-0034's amendment's mechanism with the row identities
    // swapped, which is what a hotel above its provisioning point does with an extra provider.
    // 537 -> 201 AT G-054, on a row that starts at 302 rather than 368. **The mechanism is
    // unchanged and the size is a third of what it was**: a guest holds ONE provider at a time,
    // so the ticks that go into the relieved rows still come out of the row that was not
    // queueing — but with the tie settled per guest the population was never all queueing for
    // the same thing, so there is less to reallocate.
    expect(after[bestServed]!).toBeGreaterThan(before[bestServed]!);
    // 201 -> 243 AT G-046: the row the extra amenity's guest-ticks come out of loses 42 more.
    // The claim is the inequality above; the reallocation is larger because the relief is.
    // 243 -> 248 AT G-046b: the row the extra amenity's guest-ticks come out of loses five more.
    // The claim is the inequality above; the reallocation is larger because the relief is.
    expect(after[bestServed]! - before[bestServed]!).toBe(248);
    // ------------------------------------------------------------------------------------
    // **"AND THE BOTTLENECK MOVES, TO THE ROW THAT WAS BEST SERVED" — STRUCK AT G-054, AND WHAT
    // IT WAS AN ARTEFACT OF IS THE FINDING.** That clause asserted `bottleneck(after) ===
    // bestServed`, and it held because every guest in the hotel reached for the same need first:
    // one row absorbed the whole queue, the extra amenity emptied it, and the row that had never
    // queued inherited the leftover ticks wholesale. [266, 452, 905] is what a hotel that
    // pursues its needs in one fixed order does with an extra provider.
    //
    // With the tie settled per guest (`needTieBreakRank`, ADR-0078) there is no such row. The
    // rich arm reads [570, 560, 503] — a 1.13x spread where the lean arm's is 4.68x — so
    // **adding an amenity now CONVERGES the three rows rather than swapping which one is
    // starved**, and asking which of 570 and 560 is the argmax is asking about thirteen basis
    // points. The successor claim is the convergence, which is stronger and is what a build move
    // should do: it forbids the old shape, and the old clause did not forbid this one.
    // ------------------------------------------------------------------------------------
    const spread = (rows: readonly number[]): number => Math.max(...rows) / Math.min(...rows);
    expect(spread(after)).toBeLessThan(spread(before));
    // 468/113 -> 561/115 AT G-046. The claim is the inequality above — the spread narrows when
    // the amenity is bought — and the narrowing is sharper because the relief is bigger.
    // 561/115 -> 601/113 AT G-046b. The claim is the inequality above — the spread narrows when
    // the amenity is bought — and the narrowing is sharper again because the relief is.
    expect([Math.round(spread(before) * 100), Math.round(spread(after) * 100)]).toEqual([601, 113]);
  });

  it('AT TWELVE ROOMS THE SAME MOVE NOW PRODUCES THE SAME SHAPE, WHICH IS THE INVERSION', () => {
    // ========================================================================
    // AND THIS IS WHY THE ARM ABOVE NAMES ITS ROOM COUNT. One extra amenity of each kind, the
    // same content, the same cadence — and here the need that was the worst is SERVED BETTER
    // while a different one becomes the new maximum. Same mechanism (a guest holds one provider
    // at a time), opposite row identities.
    //
    // Pinned rather than glossed, because "the worst need gets worse" is the sentence a reader
    // carries away from the arms above and it is FALSE of this rung. A build that swapped the
    // two shapes would go red here, and that is a finding rather than a regression.
    // ========================================================================
    //
    // ==========================================================================================
    // THIS ARM EXISTED TO SAY THE TWO RUNGS DISAGREE, AND AT G-023b-ii THEY AGREE. Its own
    // comment above reads *"'the worst need gets worse' is the sentence a reader carries away
    // from the arms above and it is FALSE of this rung"* — that sentence is now false of BOTH
    // rungs, in the same direction, so the contrast it was drawing has closed.
    //
    // **THE ARM IS KEPT RATHER THAN MERGED INTO ITS SIBLING, AND THE AGREEMENT IS WHAT IT NOW
    // ASSERTS.** Two rungs behaving the same way is a claim that can fail: the day they diverge
    // again — at either rung, in either direction — one of these two arms goes red with its room
    // count in the title. Deleting it would have left the whole amenity axis pinned at one room
    // count, which is the state ADR-0034's amendment was written about.
    // ==========================================================================================
    // ==========================================================================================
    // **PART OF THE OPEN G-041 FINDING RECORDED ON `THE SHARE FALLS AT EVERY RUNG` ABOVE — READ
    // THAT BLOCK FIRST.** The amenity axis no longer improves every row: at the re-derived rates
    // service stops being the bottleneck and the WALK to a further-out amenity becomes one, so
    // the row that was already worst gets slightly worse while the other two improve sharply.
    // The claim is asserted as the exact pair of vectors rather than as a direction, so the size
    // of the regression is on the page and cannot be mistaken for the old behaviour returning.
    // ==========================================================================================
    const [lean, rich] = richer(DEMAND);
    const before = engagementSharesIn(lean);
    const after = engagementSharesIn(rich);
    const worstBefore = bottleneck(before);
    for (const [index, value] of after.entries()) {
      if (index === leastPressed(before)) continue;
      expect(value, `row ${index} at ${DEMAND} rooms`).toBeLessThan(before[index]!);
    }
    // The bottleneck row still improves at this room count; what regresses is the row that was
    // BEST served, and it regresses by more than the bottleneck gains. That is the twelve-room
    // half of the same finding, and it is the direction that makes the rung a net loss.
    expect(after[worstBefore]!).toBeLessThan(before[worstBefore]!);
    expect(after[leastPressed(before)]!).toBeGreaterThan(before[leastPressed(before)]!);
    // AND THE ROW THAT TAKES OVER IS THE ONE THAT WAS BEST SERVED — the same row identity the
    // six-room arm names, pointing the other way. Two clauses that used to sit here are gone
    // because they were entailed: "the argmax moved" follows from the line above plus a rising
    // max, and "the new max got worse" follows from a rising max alone. Neither forbade anything
    // its neighbours permitted.
    // **THE ARGMAX CLAUSE IS STRUCK AT G-054 FOR THE REASON THE SIX-ROOM ARM RECORDS AT LENGTH**
    // — it pinned `bottleneck(after) === 2`, and that identity was a consequence of one row
    // carrying the whole queue because every guest reached for the same need first. The rows
    // converge instead now: [493, 470, 369] -> [428, 401, 393], a 1.34x spread becoming 1.09x.
    // The two directional clauses above are untouched and still carry the rung's finding.
    const spread = (rows: readonly number[]): number => Math.max(...rows) / Math.min(...rows);
    expect(spread(after)).toBeLessThan(spread(before));
    // 134 -> 136 AT G-046 on the `before` arm alone; the `after` arm is byte-identical at 109.
    // The claim is the inequality above — the spread narrows — and it widens slightly.
    // 136 -> 131 and 109 -> 107 AT G-046b, both arms this time. The claim is the inequality
    // above — the spread narrows — and it is unmoved.
    expect([Math.round(spread(before) * 100), Math.round(spread(after) * 100)]).toEqual([131, 107]);
    // 581 -> 653 at G-040b-ii, and the row identity is unmoved: `guest_nourishment` is still the
    // row the extra amenity's guest-ticks come out of at this rung.
    // 653 -> 607 at G-043, with the row identity STILL unmoved through a re-provisioning that
    // moved the lean arm's other two rows by thousands of basis points. The pair now spans a
    // hotel that is already provisioned to its load, so the amenity is bought on top of enough
    // rather than instead of enough — and the same need still pays for it.
    // 607 -> 428 AT G-054, AND THE ROW IDENTITY MOVES FOR THE FIRST TIME — see the struck argmax
    // clause above. It is no longer `guest_nourishment` that pays, because with a per-guest tie
    // no single need was carrying the queue for the extra amenity to take off it. The number is
    // kept as the maximum of the rich arm, which is what it always measured.
    // 428 -> 446 AT G-046, kept as the maximum of the rich arm, which is what it always meant.
    // 446 -> 457 AT G-046b, kept as the maximum of the rich arm, which is what it always meant.
    expect(engagementSharesIn(rich)[bottleneck(after)]).toBe(457);
  });
});

describe('and the phase noise ADR-0033 measured moves the snapshot far more than the share', () => {
  /**
   * THE CADENCE IS PERTURBED BY ONE TICK AND BY SEVEN, at the ladder's top rung.
   *
   * ADR-0033's blocker: at this configuration a one-tick change in `--arrivals` moves the review
   * mean by most of a band, because it moves the phase every guest departs at. An integral over
   * the stay cannot do that — the ticks it counts are the same ticks whichever phase the guest
   * leaves on — and the two spreads below are computed rather than described.
   *
   * BOTH ARE EXPRESSED AGAINST THEIR OWN LADDER EFFECT, which is the only fair comparison: a
   * spread in basis points and a spread in hundredths of a band are not comparable numbers, and
   * comparing them directly is how a ratio gets quoted with the wrong referent.
   */
  const CADENCES = [119, ARRIVALS, 121, 127] as const;
  const top = ROOM_LADDER[ROOM_LADDER.length - 1]!;
  const phases = CADENCES.map((cadence) => at(top, amenitiesFor(top), cadence));

  it('the share moves a fraction of its own ladder effect, and the review is CLAMPED here', () => {
    // ========================================================================
    // WHAT THIS ARM ASSERTED AT G-028a: the review mean's phase spread EXCEEDED the whole
    // ladder effect, which was ADR-0033's blocker — whether the axis held turned on a one-tick
    // change in a cadence nobody derived.
    //
    // IT IS NO LONGER MEASURABLE AT THIS RUNG, AND THAT IS NOT THE SAME AS BEING FIXED.
    // ADR-0034 §3(a) is explicit about this trap and caught an earlier claim of mine in it:
    // **the top rung is SATURATED**, so every guest is in the top band and the spread is zero
    // by clamping rather than by robustness. A ratio taken against a clamped zero would be a
    // number about the ceiling of the scale, not about phase noise.
    //
    // So the review half is asserted as what it IS — a clamp, with the saturation named — and
    // no ratio is claimed from it. The SHARE half is untouched and still carries the finding:
    // the integral is phase-robust where the snapshot was not.
    // ========================================================================
    // ========================================================================================
    // 0 -> 1 HUNDREDTH AT G-039b-alpha, AND THE PARAGRAPH BELOW ALREADY PREDICTED THE MECHANISM.
    // It says *"one guest in 329 does not move a mean rounded to hundredths"*. The spine moved
    // the non-saturated cadence from 127 to 121 and put TWO guests of 346 outside the top band,
    // and two do:
    //
    //     cadence      119        120        121              127
    //     before       5:351      5:348      5:346            4:1, 5:328     spread 0
    //     after        5:351      5:348      4:2, 5:344       5:329          spread 1
    //
    // **THE READING IS UNCHANGED AND IS STILL A CLAMP, NOT ROBUSTNESS.** One hundredth of a band
    // against a ladder review effect of TWO HUNDRED hundredths is the ceiling of the scale
    // showing through, exactly as zero was, and no ratio is claimed from it here either — which
    // is the trap ADR-0034 section 3(a) names and caught an earlier claim in. The bound is
    // asserted as a bound rather than the value as a literal, so a rung that genuinely
    // de-saturated would go red rather than be re-pinned to 2, then 3, then 12.
    // ========================================================================================
    const reviewPhaseSpread = spread(phases.map((summary) => meanReviewHundredths(summary)!));
    // ==========================================================================================
    // 1 -> 68 AT G-041, AND THE READING FLIPS FROM "CLAMPED" TO "NOT SATURATED". The top rung
    // used to sit against the ceiling of the review scale at every cadence — `5:348` and the
    // like — so a one-hundredth spread was the clamp showing rather than robustness, and this
    // arm said so. At the re-derived rates the rung is no longer saturated: measured means
    // 432 / 486 / 470 / 500 at cadences 119 / 120 / 121 / 127, with three of the four spreading
    // across bands 3, 4 and 5. **So the bound is re-derived rather than re-pinned**: the arm's
    // subject is that phase noise is SMALL AGAINST THE LADDER EFFECT, and the ladder effect on
    // this instrument is 318 -> 486, i.e. 168 hundredths. 68 is 40% of that, which is NOT small,
    // and the honest statement is the pair rather than a bound that would now admit anything.
    //
    // **THIS IS THE SAME OPEN FINDING**: the phase sensitivity is large because the top rung has
    // stopped being saturated, which is the other face of the engagement ladder inverting there.
    // A goal that merges G-037a's fold re-takes this arm; if the rung saturates again the clamp
    // reading returns and this becomes `<= 1` once more.
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-040b-ii IT COLLAPSES TO 8, AND IT IS NEITHER A CLAMP NOR ROBUSTNESS.** Measured
    // means 388 / 389 / 384 / 392 at cadences 119 / 120 / 121 / 127. The rung is not saturated —
    // no cadence puts everybody in the top band, and the modal band is 4 at all four — so this
    // is not the ceiling artefact the block above describes. **It is the rung becoming UNIFORM**:
    // with 16 concurrent guests behind one amenity of each kind, every guest gets a bed and no
    // guest gets served, so which tick a guest departs on stops deciding much about its review.
    //
    // The arm's subject is that phase noise is small against the LADDER EFFECT, and the ladder
    // effect on this instrument is 318 -> 389, i.e. 71 hundredths. **8 is 11% of that**, where
    // G-041 read 40% and G-039b-alpha read a clamped 0.5%. That is the honest pair, and no ratio
    // is claimed from a clamp because there is no longer a clamp to claim one from.
    // ==========================================================================================
    // ==========================================================================================
    // **AND AT G-043 IT IS A CLAMP AGAIN, WHICH THIS BLOCK PRE-REGISTERED IN THOSE WORDS.** The
    // G-041 paragraph above says: *"A goal that merges G-037a's fold re-takes this arm; if the
    // rung saturates again the clamp reading returns and this becomes `<= 1` once more."* The
    // rung saturates again — not through the fold, but because the repaired rule gives it the
    // second amenity of each kind its sixteen guests need — and the reading returns exactly as
    // described: every guest in the TOP band at all four cadences, spread zero.
    //
    // **SO NO RATIO IS CLAIMED FROM IT, AGAIN, AND THAT IS THE WHOLE POINT OF THE PARAGRAPHS
    // ABOVE.** A zero here is the ceiling of the scale showing through, not robustness. What
    // carries the arm's subject is the SHARE half below, which is not clamped at either end.
    //
    // **THREE FOLDS OF ONE FACT STOOD HERE AND THERE ARE NOW TWO (ADR-0035).** The occupied
    // DISTRIBUTIONS below, the review MEANS and the SPREAD over those means are the same
    // observation at three depths, and each entails the next: a cadence whose whole population
    // sits in one band has a mean of that band, and four equal means have a spread of zero. The
    // middle one is gone. What is kept is the distributions — the only one of the three that
    // forbids anything the others do not — and the spread, which is this arm's SUBJECT and would
    // otherwise not appear in the arm named for it. It is asserted EXACTLY rather than as a
    // bound, because with the distributions pinned there is no range left for a bound to permit.
    // ==========================================================================================
    expect(reviewPhaseSpread).toBe(0);
    // And it is a clamp BECAUSE the rung is saturated, which is the precondition that makes the
    // reading a clamp. Without this line the bound above reads as robustness.
    //
    // ========================================================================================
    // SATURATION IS NO LONGER PERFECT AT ALL FOUR CADENCES, AND THE PIN IS NOW THE FOUR
    // DISTRIBUTIONS THEMSELVES. With travel on, cadence 127 put ONE guest of 329 in band 4;
    // since G-039b-alpha it is cadence 121 with TWO of 346, and 127 is saturated again:
    //
    //     cadence 119   5:351          120   5:348          121   4:2, 5:344     127   5:329
    //
    // `toHaveLength(1)` therefore fails at 127 while the spread above is still exactly zero —
    // one guest in 329 does not move a mean rounded to hundredths. **A `toHaveLength(2)` would
    // have been the lazy repair and it would say nothing**: it permits any second band at any
    // count, including one big enough to make the zero above a real reading rather than a clamp.
    //
    // WHAT IS ASSERTED INSTEAD: the exact occupied distribution at each cadence, and that the
    // TOP band is the max score. These are deterministic integer counts, so the literals cost
    // nothing and forbid strictly more than any length check — a second band growing by one
    // guest goes red here, which is what keeps "the zero is a clamp" honest.
    // ========================================================================================
    const occupancy = phases.map((summary) =>
      summary.reviews.distribution
        .filter((row) => row.count > 0)
        .map((row) => `${row.score}:${row.count}`)
        .join(','),
    );
    // G-038a-iii-b: cadence 121 is SATURATED AGAIN — `4:2, 5:344` -> `5:346` — so all four
    // cadences put every guest in the top band and the spread above is a clamp at every one of
    // them. The literals are kept at full width rather than collapsed back to a length check,
    // for the reason the block above gives: a second band growing by one guest must go red here.
    // **AND AT G-041 NONE OF THEM IS SATURATED — THREE OF THE FOUR SPREAD ACROSS THREE BANDS.**
    // That is the other face of the finding recorded on `THE SHARE FALLS AT EVERY RUNG`: the top
    // rung of the ladder has stopped putting every guest in the top band, so the clamp reading
    // this whole describe rests on no longer applies and the phase spread above is a real 68
    // hundredths rather than a ceiling artefact. The literals are kept at full width for the
    // reason the block above gives, and they are now the evidence FOR the finding rather than
    // for saturation.
    // G-040b-ii: still none of them saturated, and now all four look ALIKE — three bands each,
    // the mass in band 4, a thin top band of 21 to 30 guests. That uniformity is what makes the
    // spread above 8 rather than 68, and it is the same fact the review mean and the engagement
    // share report from their own ends: a rung where everybody is housed and nobody is served.
    // G-043: SATURATED AT ALL FOUR CADENCES — one band, the top one, at every cadence. The rung
    // is provisioned to its own load in GUESTS now, so every guest that walks in gets a bed AND
    // gets served, and which tick it departs on decides nothing. That is what makes the spread
    // above a clamp rather than robustness, and the literals are kept at full width for the
    // reason the block above gives: a second band growing by one guest must go red here.
    // 5 -> 4 AT G-059 at all four cadences, and the COUNTS are byte-identical. **The clamp this
    // block reports is unchanged in kind and the band it clamps at has moved down one**: the
    // rung is still saturated — one band, every guest, at every cadence — and it is no longer
    // the TOP band, because a hotel with no facility cannot reach the top star tier and its
    // standing caps the score at 4. The literals are kept at full width for the reason the block
    // above gives: a second band growing by one guest must go red here.
    expect(occupancy).toEqual(['4:468', '4:464', '4:461', '4:438']);
    for (const summary of phases) {
      const occupied = summary.reviews.distribution.filter((row) => row.count > 0);
      // THE MODAL BAND IS NO LONGER THE TOP BAND AT EVERY CADENCE (G-041) — at cadence 119 it
      // is band 4, with 218 of 351 guests, and the top band holds 123. That is the clause that
      // used to survive any re-pin of the literals above, and it is the one the finding takes:
      // "saturated" was a property of this rung and it has stopped being one. What is asserted
      // instead is that the modal band is in the TOP HALF of the scale at every cadence, which
      // is what still distinguishes this rung from an under-provisioned one.
      const modal = occupied.reduce((best, row) => (row.count > best.count ? row : best));
      const midpoint = ((summary.reviews.scoreMin ?? 0) + (summary.reviews.scoreMax ?? 0)) / 2;
      expect(modal.score).toBeGreaterThan(midpoint);
    }

    const ladderShareEffect =
      meanShare(sharesIn(LADDER[0]!)) - meanShare(sharesIn(LADDER[LADDER.length - 1]!));
    const sharePhaseSpread = spread(phases.map((summary) => meanShare(sharesIn(summary))));
    expect(sharePhaseSpread).toBeLessThan(ladderShareEffect);
    // AND BY AN ORDER OF MAGNITUDE, not merely by a hair — stated as a multiple of the spread so
    // that a build which lost most of the margin still fails here.
    //
    // ==========================================================================================
    // **THE ORDER OF MAGNITUDE IS GONE AT G-041: 4.4x, NOT 10x.** Measured, same sitting, exact
    // deterministic counts: phase means 900 / 611 / 695 / 482 at cadences 119 / 120 / 121 / 127,
    // spread **418**, against a ladder effect of 2,448 - 611 = **1,837**.
    //
    // WHY, AND IT IS THE SAME FINDING THIS FILE NOW CARRIES IN THREE PLACES: the top rung has
    // stopped being saturated, so its unserved share responds to the arrival phase where it used
    // to sit flat against zero. **Both terms moved and the ladder effect moved MORE** — it was
    // smaller before, because the bottom rung's share was lower. So the ratio narrowing is
    // mostly the numerator growing.
    //
    // THE `x 10` IS NOT RE-CHOSEN TO A SMALLER MULTIPLE, because a multiple picked to fit
    // today's reading is the superstition §2.1 forbids and the original was already a chosen
    // one. **Both quantities are asserted exactly instead**, so any change to either is visible
    // and the ratio can be read off rather than approved. The strict inequality above is the
    // claim; these two are its size.
    // ==========================================================================================
    // G-040b-ii: 418 -> 108 against a ladder effect of 1,837 -> 972, so the multiple goes back
    // from 4.4x to **9.0x** — nearly the order of magnitude the retired `x 10` asked for. Both
    // terms fell and the numerator fell further, which is the same uniformity the review half
    // above records: a top rung whose guests are all housed and all under-served responds less
    // to the arrival phase than one whose guests were being served at different depths.
    // G-043: 108 -> 11 against a ladder effect of 972 -> 2,115, so the multiple goes from 9.0x
    // to 192x and the order of magnitude the retired `x 10` asked for is cleared many times
    // over. **Both terms moved and they moved in opposite directions**, which is the repair
    // rather than luck: the top rung's share collapses when it is provisioned in guests, so the
    // ladder's span grows at the same time as the phase response at its top rung shrinks. The
    // `x 10` is still not re-chosen — the two quantities are asserted exactly and the multiple
    // is read off them.
    // G-043: 11 -> 21 AT G-054, against a ladder effect of 2,115 -> 2,128, so the multiple goes
    // from 192x to **101x** — still many times over the order of magnitude the retired `x 10`
    // asked for, and the reason it halves is the CLAMP this block is careful about: the top rung
    // is a point mass at the top band, and a per-guest tie-break gives its guests slightly
    // different stays, so the arrival phase has ten more basis points of purchase on it. **The
    // `x 10` is still not re-chosen** — the two quantities are asserted exactly and the multiple
    // is read off them.
    // 21 -> 18 AT G-046: the phase spread of the SHARE narrows by three basis points. The claim
    // is the comparison against `ladderShareEffect` below — the phase noise is a fraction of the
    // ladder effect — and it is two orders of magnitude, unmoved.
    // 18 -> 21 AT G-046b: the phase spread of the SHARE widens back by three basis points. The
    // claim is the comparison against `ladderShareEffect` below — the phase noise is a fraction
    // of the ladder effect — and it is two orders of magnitude, unmoved.
    expect(sharePhaseSpread).toBe(21);
    // 2,128 -> 2,162 AT G-046, moving with the ladder rungs above.
    // 2,162 -> 2,156 AT G-046b, moving with the ladder rungs above.
    expect(ladderShareEffect).toBe(2_156);
  });

  it('and the departure counts move with the cadence, so the perturbation is real', () => {
    // ADR-0007's companion: "the share barely moved" says nothing if the four runs were the same
    // run. They are not — a different cadence admits a different number of guests.
    const departed = phases.map((summary) =>
      summary.guests.departures.reduce((total, row) => total + row.count, 0),
    );
    expect(new Set(departed).size).toBeGreaterThan(1);
  });
});

describe('the report divides the two columns once, and the sim bounds them', () => {
  /*
   * `prints a share that is exactly floor(unserved x one whole / stay)` WAS HERE AND WAS DELETED
   * AT SWEEP 2. NAMED, NOT DISCOVERED — the `compareNeedPriority` idiom.
   *
   * It re-spelled `unservedShareBasisPoints`'s body beside a call to it, so the only proposition
   * it could falsify was that a literal equals one whole. Its title claimed to pin "the report
   * divides the two columns once", and that is pinned where the division is OBSERVED rather than
   * re-derived: `report.test.ts` folds forged rows whose share is a third distinct sentinel, and
   * the CLI golden carries the printed line byte for byte. Two places already, neither of them a
   * copy of the arithmetic.
   *
   * What is kept from it is the arm below, which asserts the BOUND rather than the formula.
   */

  it('and no row can report more unserved ticks than it has stay to report them in', () => {
    for (const summary of LADDER) {
      for (const row of summary.needs) {
        expect(row.unservedTicks, row.needId).toBeLessThanOrEqual(row.instanceTicks);
        // The denominator is populated for every row that resolved an instance, which is what
        // makes the share a real quotient rather than a guarded zero.
        expect(row.instanceTicks, row.needId).toBeGreaterThan(0);
        expect(row.met + row.unmet, row.needId).toBeGreaterThan(0);
      }
    }
  });

  it('and a hotel that serves nothing charges itself the whole stay on every engagement need', () => {
    // The extreme, through a real process: no amenities, so no engagement need is ever served
    // and none of them is excused. The lodging row is the control — those guests all get beds.
    const bare = at(DEMAND, 0);
    for (const row of bare.needs.filter((entry) => !entry.lodging)) {
      expect(row.unservedTicks, row.needId).toBe(row.instanceTicks);
      expect(unservedShareBasisPoints(row), row.needId).toBe(10_000);
    }
    expect(unservedShareBasisPoints(bare.needs.find((row) => row.lodging)!)).toBe(0);
  });
});

describe('THE CONTROL: the departures this counter does not decide', () => {
  it('criterion 9 s control run keeps its departures and its revenue', () => {
    // ========================================================================
    // THIS BLOCK WAS G-028a's WRITE-ONLY FENCE AND THREE OF ITS CLAUSES ARE FALSE SINCE G-028b.
    // The diff that falsified them rewrote the comment two lines below and left these.
    //
    //   *"this goal ships an instrument and changes no verdict"*  — the verdict is what G-028b
    //       changed; the review distribution below is re-pinned to prove it.
    //   *"Nothing in `packages/sim` reads `unservedTicks`"*      — `needBandOf` reads it, through
    //       `reviewOf` and `metAtDeparture` (ADR-0037).
    //   *"its need tally is the one HEAD produced"*              — `met` and `unmet` are the
    //       per-need band now and move with the scale.
    //
    // WHAT SURVIVES IS THE HALF THAT MATTERS AND IT IS WHY THE ARM IS KEPT: **no branch in
    // `packages/sim` reads the counter to decide anything DURING a tick.** The departures, the
    // ledger and the build counters are what a decision would move, and they are unmoved — while
    // the distribution, which is a record taken on the way out, moves. If a future edit lets the
    // counter reach a decision, this is still the arm that goes red.
    // ========================================================================
    const control = run(['--days', '30', '--seed', '7', '--rooms', '6', '--amenities', '5']);
    const count = (reason: string): number =>
      control.guests.departures.find((row) => row.reason === reason)?.count ?? 0;
    // G-040b-ii: 192 / 161 / 0 -> 256 / 214 / 0 and 1,632,000p -> 2,176,000p, each exactly four
    // thirds. The fence is what this arm is about and it is untouched: the departures and the
    // ledger move only because the CONTENT declared a party size, which is an input to the
    // simulation rather than a review reaching back across the boundary.
    expect([count('checkedOut'), count('gaveUp'), count('leftDissatisfied')]).toEqual([256, 214, 0]);
    expect(control.money.revenuePennies).toBe(2_176_000);
    // AND THE REVIEW DISTRIBUTION MOVES, WHICH IS THE OTHER HALF OF THE CLAIM AND IS NEW AT
    // G-028b. This arm read `[0, 0, 0, 353, 0]` while the counter was fenced — the snapshot
    // scorer's point mass. The fence is unchanged and the scorer is not: departures and revenue
    // hold, the distribution moves, and asserting only the first would let a goal that shipped
    // nothing pass. `scorer.report.test.ts` carries the same pair as its own criterion.
    // RE-TAKEN AT G-059: [0, 0, 214, 0, 256] -> [214, 0, 0, 256, 0], both occupied bands moving
    // with the DEPARTURES AND THE LEDGER HELD BYTE-IDENTICAL above — which is exactly the pair
    // this arm exists to assert, and the strongest reading of it the file has had. The 214 that
    // never got a room fall to the floor; the 256 that checked out fall 5 -> 4 on a three-star
    // hotel's standing.
    expect(control.reviews.distribution.map((row) => row.count)).toEqual([214, 0, 0, 256, 0]);
  });
});
