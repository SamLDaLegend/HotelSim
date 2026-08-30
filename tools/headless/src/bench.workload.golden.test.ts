// G-016 — THE OPTIMISATION MUST NOT MOVE THE STATE HASH, AND THIS IS WHAT WITNESSES IT.
//
//   pnpm exec vitest run bench.workload
//
// WHY THIS FILE EXISTS: THE I2 GATE STRUCTURALLY CANNOT WITNESS CRITERION 3.
// `tools/gates/determinism.mjs` compares runs TO EACH OTHER and holds no reference hash, so
// an optimisation that changes the simulation CONSISTENTLY leaves it green. That is not a
// gap to be fixed here — run-to-run identity is what I2 is for — but it does mean "the
// optimisation did not move the hash" needs a different witness, and the only kind that
// works is a LITERAL committed before the change. G-010 collected a MAJOR for a comment
// claiming the gate saw something it cannot; this file is the corrected version of that
// claim.
//
// WHAT IT COVERS THAT THE 2-DAY GOLDEN IN `cli.stdout.test.ts` DOES NOT.
// That golden runs THREE rooms, one arrival per 120 ticks, for two days, and it is pinned
// for a different purpose (stdout formatting and locale-independence). It never reaches:
//
//   - THE BENCH'S OWN HOTEL. Sixty rooms at `workload.mjs`'s cadence is the workload
//     `bench.mjs` measures and the workload G-016 optimised. A hash pinned on a three-room
//     toy would not have been evidence about the thing that changed.
//     *(This read "an arrival every 32 ticks" until G-032a, naming a cadence `bench.mjs` has
//     not passed since ADR-0021 moved it to 96 — in the file `bench.mjs` cites BY NAME as the
//     record of what its workload is. Both halves of that citation were stale at once.)*
//   - THE EXHAUSTED SHORT-CIRCUIT in `findFreeRoom`. It needs a need with no free provider;
//     with one amenity of each type against this hotel's measured occupancy
//     (`workload.mjs`'s `TARGET_CONCURRENT_HUNDREDTHS`), the engagement needs are
//     oversubscribed on nearly every tick here and barely at all there. *(It said "~15
//     concurrent guests" — the arithmetic proxy θ-b1 proved blind, which read 15 at three
//     different populations.)*
//   - EVICTION. Nothing is demolished in either default run, so `evicted` is 0 and the whole
//     step-3 path in `stepGuests` — including the `depart` this goal rewrote — is never
//     taken. THE CHURN ARM BELOW EXISTS FOR THAT ONE REASON and evicts 19 guests.
//   - A FOUR-ROW NEED TALLY. The 2-day golden's content predates none of it, but the tally
//     only proves anything once several rows have moved.
//
// THE NUMBERS ARE HAND-CHECKED, NOT CAPTURED (ADR-0007 — a golden captured rather than
// verified proves only that the code agrees with itself):
//
//   ticks     7200 = 5 x 1440 (TICKS_PER_DAY)
//   arrived        = arrivals at ticks 1, 1+c, ... < 7200 = floor((7199 - 1) / c) + 1, for
//                    the shipped cadence c. DERIVED BELOW rather than spelled here: the
//                    literal "225 ... / 32" survived the cadence move by three goals.
//   conservation   : every departure row summed + still here = arrived, both arms
//   need rows    4 = one per need type in the shipped content
//
// AND THE ARRIVAL FIGURE IS NOW DERIVED FROM THE NUMBER THE GATE ACTUALLY USES, not from a
// second copy of it declared here. See the block below `const GATES`.
//
// IF A HASH BELOW MOVES, STOP. There are now THREE causes, and G-020a added the third:
//
//   1. the simulation changed — in which case say what and why, as G-007 and G-008 did
//      for the other golden;
//   2. an "optimisation" was not one;
//   3. SOMEBODY RE-SIZED THE GATE'S HOTEL in `tools/gates/workload.mjs`. That is the
//      reddening this file exists to produce and it is not a regression — before G-020a
//      this file declared its OWN `ROOMS` and `ARRIVAL_EVERY_TICKS` and the gate's could be
//      changed with every test in the repo staying green. If cause 3 is why you are here,
//      the question is whether the workload should have moved, not whether to re-pin.
//
// The gate's RUN LENGTH is deliberately not in that list: this file owns its own `DAYS`.
// See the note on that constant for why sharing it with the instrument was a mistake.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  createWorld,
  departedGuests,
  departureCountOf,
  evictedGuests,
  firstGuestRules,
  guestCount,
  hashState,
  run,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { evaluateGateModule } from './gate-module.js';
import { schedule } from './report.js';

const content = loadContent();

/**
 * THE GATE'S OWN FIGURES, READ OUT OF THE GATE'S OWN MODULE (G-020a).
 *
 * Until G-020a this file declared its own `ROOMS = 60` and `ARRIVAL_EVERY_TICKS = 32`
 * under a comment saying they were "`bench.mjs`'s own figures, so this pin and that gate
 * describe the same building" — and never read `bench.mjs`. `sim-critic` showed what that
 * comment was worth: mutating the GATE's `ROOMS` to 3, or its `ARRIVAL_EVERY_TICKS` to
 * 3200, left every assertion in this file and every other test in the repo green. The
 * golden pinned a workload nothing connected to the workload that ran. It was the
 * duplicated-constant shape G-018 removed from the budget, still live one file over, with
 * a comment asserting the property it lacked.
 *
 * Now there is one copy, in `tools/gates/workload.mjs`, and both the gate and this pin
 * import it — so changing it moves the hashes below, which is what a pin is for.
 */
const GATES = resolve(dirname(fileURLToPath(import.meta.url)), '../../gates');
const workload = evaluateGateModule(join(GATES, 'workload.mjs'), ['ROOMS', 'ARRIVAL_EVERY_TICKS', 'SEED']);

/**
 * Five simulated days of the I5 bench's hotel. ~100ms per arm, so the suite can afford it.
 *
 * THIS ONE IS DELIBERATELY *NOT* READ FROM THE GATE MODULE, and the distinction is the
 * point: the HOTEL is shared, the RUN LENGTH is not. A first version took this from
 * `workload.mjs`'s `MEASURE_DAYS`, which is `sim:measure`'s arm length — so lengthening the
 * instrument's arm, the likeliest response to its ±10% noise floor, would have moved both
 * hashes below and every hand-checked count with them. A golden that gets re-pinned
 * whenever a tool is retuned is not evidence. `pnpm check:measure`
 * (`tools/gates/check-measure.mjs`, a standalone gate — not part of `pnpm test`) witnesses
 * that the instrument's arm and this pin describe the same history, at whatever length the
 * instrument uses, by computing the hash rather than by sharing a constant. It reads this
 * constant and the hashes below OUT OF THIS FILE, so re-pinning here cannot leave the two
 * describing different histories while both stay green.
 */
const DAYS = 5;
const TICKS = DAYS * 1440;
const SEED = workload.SEED;
const ROOMS = workload.ROOMS;
const ARRIVAL_EVERY_TICKS = workload.ARRIVAL_EVERY_TICKS;

function runWorkload(buildEveryTicks: number, demolishEveryTicks: number): World {
  const world = createWorld(SEED, content);
  const commands = schedule(
    TICKS,
    content,
    world.grid,
    ROOMS,
    ARRIVAL_EVERY_TICKS,
    buildEveryTicks,
    demolishEveryTicks,
  );
  return run(world, content, TICKS, commands);
}

/** Arrival COMMANDS are a closed form over the schedule, not a number read off a run. */
const EXPECTED_ARRIVALS = Math.floor((TICKS - 1 - 1) / ARRIVAL_EVERY_TICKS) + 1;

/**
 * AND GUESTS ARE NOT COMMANDS SINCE G-040b-ii, WHICH IS WHY THIS SECOND CONSTANT EXISTS.
 *
 * `guest-rules.json` declares `partySizeWeights: [3, 1]`, and the table is read as a CYCLE over
 * the guest-id line rather than as a probability: a party consumes one ordinal per member, so
 * the realised sequence is **1, 1, 2** — three parties, four guests, four ordinals (ADR-0072).
 * `party.content.test.ts` pins that off a real run.
 *
 * The 4/3 is written here rather than walked, and the guard against it going stale is the
 * assertion below it: if the shipped table ever changes, this file goes red at the constant
 * rather than at a golden three hundred lines down.
 */
const GUESTS_PER_COMMAND_NUMERATOR = 4;
const GUESTS_PER_COMMAND_DENOMINATOR = 3;
const EXPECTED_GUESTS = (EXPECTED_ARRIVALS * GUESTS_PER_COMMAND_NUMERATOR) / GUESTS_PER_COMMAND_DENOMINATOR;

describe('the I5 bench workload hashes to a committed literal', () => {
  const plain = runWorkload(0, 0);

  it('THE SHIPPED PARTY CYCLE IS THE ONE `EXPECTED_GUESTS` ASSUMES', () => {
    // The guard the constant's docblock promises. `EXPECTED_GUESTS` multiplies the schedule's
    // command count by 4/3, which is true of the cycle `[3, 1]` emits and of nothing else — so
    // the shipped table is read back out of content here, and a goal that turns the dial goes
    // red at this line rather than at a hash three hundred lines down.
    expect(firstGuestRules(content)?.partySizeWeights).toEqual([3, 1]);
    expect([GUESTS_PER_COMMAND_NUMERATOR, GUESTS_PER_COMMAND_DENOMINATOR]).toEqual([4, 3]);
    expect(EXPECTED_GUESTS).toBe(100);
    expect(Number.isInteger(EXPECTED_GUESTS)).toBe(true);
  });

  it('PLAIN: the exact workload pnpm sim:bench runs', () => {
    // MOVED AT G-014a, and the reason is the whole of that goal: providers are chosen by
    // `fitBasisPoints` — a designer's ranking — rather than by lowest entity id, so in a
    // hotel with a café and a vending machine the guests now eat at the café. The content
    // fingerprint `World.contentHash` records also moves, because the shipped table gained
    // the field. Was `958d60390c5e019d` at G-013, `eb2855a89abd539c` at G-016.
    //
    // WHAT DID NOT MOVE IS THE EVIDENCE THAT THIS IS A SELECTION CHANGE AND NOT A LOSS: every
    // hand-checked outcome below is identical to the one G-013 pinned. The same 225 guests
    // arrive, the same 210 complete a stay, nobody is evicted, and the tally still has four
    // rows. A change that had broken service would have moved those first.
    //
    // MOVED AGAIN AT G-015, AND FOR A REASON THAT IS NOT A SIMULATION CHANGE AT ALL:
    // `World.guestOutcomes` stopped being four counters and became a table, so the hashed
    // document has a different shape carrying the same numbers. Was `a1e1c0d5360cf999` at
    // G-014a. THE SAME EVIDENCE APPLIES AND IS STRONGER HERE: 225 arrive, 210 complete a
    // stay, nobody is evicted, four tally rows — every hand-checked figure below is
    // untouched. And `outcome.save.test.ts` carries the general form of that argument, by
    // migrating a v7 world forward and asserting it hashes identically to a v8 world that
    // lived the same history — which is what makes ~30 moved pins in this change evidence
    // rather than thirty separate acts of faith.
    //
    // MOVED AGAIN AT G-014b, FOR TWO CAUSES AT ONCE, AND THEY ARE SEPARATED RATHER THAN
    // LUMPED. Was `cc1fe09f93c19e53` at G-015.
    //
    //   1. THE CONTENT FINGERPRINT. `guest-rules.json` is a fifth content table, so
    //      `World.contentHash` moves for every run under the shipped content whether or not
    //      any guest behaves differently. Not a simulation change.
    //   2. ONE ABANDONMENT — ASSERTED BELOW rather than described here, so this paragraph
    //      carries no figure that nothing pins (ADR-0007's amendment). One guest, in five
    //      simulated days, out of 210 that completed a stay. This hotel is STARVED — 60 rooms
    //      against four providers — and abandonment structurally needs a FREE provider for
    //      the challenger, so scarcity suppresses it. That is the opposite of the intuition
    //      the goal started with, and it is why the goal's own criterion invocation is a
    //      different, better-supplied hotel: `hysteresis.report.test.ts` owns the era
    //      comparison and pins all three margins at a configuration where the margin bites.
    //
    // MOVED AGAIN AT G-019, FOR TWO CAUSES AND NEITHER IS A BEHAVIOUR CHANGE. Was
    // `f652a2a1901310a5` at G-014b.
    //
    //   1. THE CONTENT FINGERPRINT, again: `guest-rules.json` gains the review scale, so
    //      `World.contentHash` moves for every run under the shipped content.
    //   2. A NEW HASHED FIELD. `World.reviewOutcomes` is part of hashed state, and 210
    //      completed stays put 210 reviews in it.
    //
    // AND THE EVIDENCE THAT THIS IS NOT A SIMULATION CHANGE IS STRONGER THAN AT ANY PREVIOUS
    // BUMP, because this goal built an instrument for exactly this question: two runs whose
    // content differs ONLY in the review scale produce identical guests, needs, ledgers and
    // build counters (`review.boundary.test.ts`). The hand-checked outcomes below are the
    // local form of the same statement and every one of them is untouched.
    //
    // MOVED AGAIN AT G-023a, FOR ONE CAUSE, AND IT IS NOT A BEHAVIOUR CHANGE. Was
    // `527c415de4e03d39` at G-019.
    //
    //   A NEW HASHED FIELD ON EVERY GUEST. `Guest.at` is part of hashed state, so every
    //   guest alive at the end of this run contributes a cell to the hash. NOTHING ELSE
    //   MOVED: the content fingerprint is untouched (this goal ships no content change at
    //   all), and every hand-checked outcome below is the same number it was — 225 arrived,
    //   210 satisfied, 0 evicted, 4 need rows, 1 abandonment. That is the evidence, and it
    //   is stronger here than a hash can be on its own: a guest's position is written from
    //   what the guest already holds, so nothing in the simulation reads it and nothing it
    //   decides can change.
    // MOVED AT G-027a, and this is the first cause since G-023a that is a BEHAVIOUR change
    // MOVED TWICE INSIDE G-027a, and the two causes are different and both stated:
    //
    //   `13cbef2f4b4e199b` -> `362eb3575c4a25a3`   ADR-0017 replaced the terminator, so this
    //                                              workload's guests leave and pay at
    //                                              different ticks. A BEHAVIOUR change, and
    //                                              the first cause since G-023a that is not
    //                                              a state-shape one.
    //   `362eb3575c4a25a3` -> `a9fa0b1054f2b5e4`   ADR-0021 moved `ARRIVAL_EVERY_TICKS` 32 ->
    //                                              96 to restore the benchmark's calibrated
    //                                              occupancy of fifteen concurrent guests,
    //                                              which the first change had silently
    //                                              redefined to forty-five. A WORKLOAD change
    //                                              — this file's own reason 3 — and exactly
    //                                              the kind its header says must be
    //                                              deliberate rather than discovered.
    //
    // MOVED A THIRD TIME AT G-027b, AND IT IS A BEHAVIOUR CHANGE WITH A PREDICTED DIRECTION:
    //
    //   `a9fa0b1054f2b5e4` -> `0f013923e178c187`   ADR-0017 §1/§2 made a need a STOCK. Every
    //                                              guest in this run is served, decays and is
    //                                              served again where it used to finish a task
    //                                              once, so the ticks on which providers are
    //                                              taken and released all move. NOT a workload
    //                                              change and NOT a state-shape change: the
    //                                              workload constants are untouched and the
    //                                              only field the vector lost is one of two
    //                                              countdowns.
    //
    // THE HAND-CHECKED COLUMNS ARE THE CONTROL AND THEY HELD. 75 arrived, 60 checked out, 0
    // evicted, 4 need rows — all unchanged across this move, which is what says the hash moved
    // because guests were SERVED differently rather than because the hotel was built or
    // populated differently. The one column that did move is the abandonment count, and it has
    // its own argument below.
    //   `0f013923e178c187` -> `5a8cec719d1e9e95`   θ-b1 made dissatisfaction a STOCK a guest
    //   acts on (ADR-0017 4(b)). TWO causes at once: `Guest.dissatisfaction` is hashed state and
    //   `guest-rules.json` gains two fields, so the content fingerprint moves too — and unlike
    //   every earlier move on this row, THE OUTCOMES MOVED AS WELL. This benchmark's hotel is
    //   sixty bedrooms against ONE of each amenity, which is the provider cliff ADR-0026
    //   measured: **64 of its 75 guests** now walk out rather than checking out. That is the
    //   benchmark's hotel being a bad hotel, not the benchmark breaking — see
    //   `workload.concurrency.test.ts`, which pins the occupancy this workload actually holds
    //   and asserts, by name, that it has diverged from the campaign's calibrated fifteen.
    //   `5a8cec719d1e9e95` -> `bab5925fb9c5df13`   θ-b2 made lodging OPTIONAL. TWO causes, and
    //   they are separable here in a way ADR-0026's amendment records they were not at θ-b1:
    //   the departure table gains a SEVENTH ROW (`visitEnded`), which is hashed state and moves
    //   the hash for every world whatever it did; and `guest-rules.json` gains
    //   `visitDurationTicks`, which moves the content fingerprint. **NEITHER IS A BEHAVIOUR
    //   CHANGE HERE**: this benchmark's content declares a lodging need, so every guest books a
    //   room, no guest can be a visitor, and the new branch is unreachable at any value of the
    //   new field. The control is the outcome block below — arrivals, checkouts, evictions and
    //   the need rows are all unmoved, which is what says the shape moved and the simulation
    //   did not.
    //   `bab5925fb9c5df13` -> `b42ccbb81e1539c4`   G-028a gave every need a counter for how
    //   long the hotel leaves it unserved, and gave every tally row that counter and its
    //   denominator. ONE cause, and it is a state-SHAPE change with no behaviour in it: nothing
    //   in `packages/sim` reads any of the three fields, the content files are untouched so the
    //   fingerprint does not move, and the outcome block below — arrivals, checkouts, evictions,
    //   the need rows — is unchanged. That block is the control, and it is the whole argument
    //   that this move is the shape and not the simulation.
    //   `b42ccbb81e1539c4` -> `ebb9c3924e373c1e`   G-028b made the review and `met` read that
    //   counter (ADR-0037). ONE cause and it IS a behaviour change, unlike every move above it:
    //   `reviewOutcomes` and the `met`/`unmet` columns of `needOutcomes` are both hashed state
    //   and both are computed differently now. **The control is therefore a NARROWER block than
    //   it has been at any previous move, and that is stated rather than glossed**: arrivals,
    //   checkouts, evictions and the departure table are unchanged — nothing decides anything
    //   from a review, which `review.boundary.test.ts` enforces from two directions — while the
    //   need rows' met/unmet legitimately move. The outcome assertions below are what say which
    //   half is which.
    //   `ebb9c3924e373c1e` -> `0c34f5daea71e8de`   G-034a gave the grid a third axis
    //   (ADR-0046 §4.1). ONE cause, and it is a state-SHAPE change with NO BEHAVIOUR IN IT:
    //   `Cell` gains `row` and `GridBounds` gains `minRow`/`maxRow`, so every cell and the plot
    //   itself are two and one integers wider in hashed state. **The shipped plot stays ONE ROW
    //   DEEP**, which is what makes the no-behaviour claim checkable rather than asserted:
    //   every cell in this workload has `row: 0`, `stepTowards` walks an axis whose gap is
    //   always zero, and the 4-neighbour door rule degenerates to the 2-neighbour one through
    //   `isWithinBounds` because front and back are off the plot. The content files are
    //   untouched so the fingerprint does not move. THE CONTROL IS THE FULL BLOCK AGAIN, not
    //   the narrow one G-028b needed: arrivals, checkouts, evictions, the departure table AND
    //   the need rows are all unchanged, which is the whole argument that the shape moved and
    //   the simulation did not.
    //   `0c34f5daea71e8de` -> `c7a049822580b39e`   G-034b made a cell able to be a CORRIDOR
    //   (ADR-0047 B2). TWO causes, both shape: `World` gained `corridors`, and this runner's
    //   seeded hotel now DECLARES the corridor it has always had — the empty column between
    //   every pair of rooms, which `report.ts` has called a corridor in a comment since G-009.
    //   **THE CONTROL IS THE FULL BLOCK AGAIN AND IT IS THE WHOLE ARGUMENT**: arrivals,
    //   checkouts, `leftDissatisfied`, evictions, the departure table, the need rows and the
    //   abandonment count are every one of them unchanged, because a room that already had a
    //   free cell beside it keeps its verdict when that cell is named. The plain arm builds
    //   nothing, so the player's own corridor blocks (`playerCorridorCells`) never fire here;
    //   the churn arm below is where they do, and its 19 evictions are unchanged too.
    //   `c7a049822580b39e` -> `fbbb35b464f13368`   G-036a gave the shipped PLOT depth and
    //   spread the seeded layout into it. TWO causes, both shape: `minRow`/`maxRow` are hashed
    //   and they moved, and this runner's 60 rooms are now banked into a SQUARE PLATE — eight
    //   room-columns by eight rows, all on floor 0 — where they used to be forty along floor 0
    //   and twenty along floor 1. **THE CONTROL IS THE FULL BLOCK AGAIN AND IT IS THE WHOLE
    //   ARGUMENT**: arrivals, checkouts, `leftDissatisfied`, evictions, the departure table,
    //   the need rows and the abandonment count are every one of them UNCHANGED. They can be,
    //   because the shipped content of THAT ERA declared no `guestCellsPerTick` — travel was
    //   instantaneous, so a room's distance from the door cost nothing — and because every room
    //   in the plate has the same free lane beside it that it had when the plate was a line.
    //   Sixty rooms in a different arrangement, serving the same guests in the same order.
    //   **(G-023b-ii declared that field, so the clause is fenced as the era fact it is: the
    //   plate's shape now DOES cost a guest time, and the row for that goal below is where the
    //   departure table finally moves.)**
    //   `fbbb35b464f13368` -> `4955bc697f128ae5`   G-036b gave a room INSTANCE a footprint.
    //   TWO causes, both shape and neither behavioural: every entity gained a `footprint` and
    //   `buildOutcomes` gained `placed` plus three refusal counters (save v19), AND
    //   `World.contentHash` moved because `room-types.json` gained `minFootprintCells` and
    //   `maxFootprintCells` — the largest content-field addition this project has made.
    //   **THE CONTROL IS THE FULL BLOCK AGAIN**: arrivals, checkouts, `leftDissatisfied`,
    //   evictions, the departure table, the need rows and the abandonment count are every one
    //   of them UNCHANGED. They can be, because every room this workload builds is ONE CELL —
    //   `--rooms` seeds through `spawnEntity` with no footprint and `--build` dispatches
    //   `buildRoom`, which IS `drawRoom` at `UNIT_FOOTPRINT` — so a footprint-aware placement
    //   index returns exactly what the origin-keyed one returned, cell for cell.
    //   `4955bc697f128ae5` -> `013816cc3168aee0`   G-036c made a room EDITABLE and gave it an
    //   ACCESS RULE. TWO causes, both shape and neither behavioural: `buildOutcomes` gained
    //   `resized`, `moved`, `displaced` and two refusal counters (save v20), AND
    //   `World.contentHash` moved because `room-types.json` gained `accessRule`.
    //   **THE CONTROL IS THE FULL BLOCK AGAIN**: arrivals, checkouts, `leftDissatisfied`,
    //   evictions, the departure table, the need rows and the abandonment count are every one
    //   of them UNCHANGED. They can be for two structural reasons rather than by luck. B4:
    //   this workload issues no `resizeRoom` and no `moveItem`, so all five new counters are
    //   zero and no entity in it moves — the v19 -> v20 step rewrites no entity at all, which
    //   is what shipping the footprint mutable-capable at G-036b bought. B6: the shipped
    //   `standard_room` is `guestsOfThisRoom`, and the ONLY need it provides is the lodging
    //   need, which the engagement pass skips by name (`reserve`) — while the lounge and the
    //   games room, which are what guests here engage, are `public`. So the rule is live and
    //   there is nothing in this hotel for it to turn anybody away from.
    //   `013816cc3168aee0` -> `5846043bcd849207`   G-038c gave a floor a PRICE and a guest a
    //   height it will not climb (ADR-0047 B8). **ONE cause, and it is the narrowest this row
    //   has ever recorded**: `World.contentHash` moved because `economy.json` gained
    //   `floorConstructionCostPence` and `guest-rules.json` gained
    //   `maxLodgingFloorsFromEntrance`. **NOTHING IN `World` GAINED A FIELD** — a floor charge
    //   is a ledger transaction and the reach is read from content on every lodging search, so
    //   the save schema stays at v20 and no migration is owed.
    //   **THE CONTROL IS THE FULL BLOCK AGAIN, AND THE LEDGER TOO**: arrivals, checkouts,
    //   `leftDissatisfied`, evictions, the departure table, the need rows and the abandonment
    //   count are every one of them UNCHANGED, and so is the closing balance — measured at
    //   -238,500p under content that declares neither field and -238,500p under content that
    //   declares both. Both rules are inert here for STRUCTURAL reasons rather than by luck:
    //   this arm issues no build command at all, and the charge is levied only BY a build; and
    //   all sixty of its rooms are banked on floor 0, which is the entrance floor, so no
    //   lodging candidate is more than zero floors from the door.
    //   `5846043bcd849207` -> `ddfe4e4000bf1dc4`   G-023b-ii DECLARED `guestCellsPerTick: 3`,
    //   so going somewhere takes time in the hotel anybody actually runs. **ONE cause and IT IS
    //   BEHAVIOURAL — the first time in this row's history that the control block below does
    //   NOT hold**, and it is stated first rather than buried, because every previous entry
    //   here ends "the departure table is unchanged" and this one cannot.
    //   **checkedOut 4 -> 1, leftDissatisfied 64 -> 67.** Sixty bedrooms share ONE lounge and
    //   ONE games room; a provider serves one guest at a time; and a guest now spends part of
    //   its turn walking to that provider instead of appearing in it. Three of the four guests
    //   who used to complete a 1,440-tick stay now saturate the 431-tick dissatisfaction
    //   ceiling first. **The conservation still closes: 1 + 67 + 7 still in the hotel = 75
    //   arrived**, and `arrived`, `evictedGuests`, the abandonment count and the seven-row
    //   departure table's SHAPE are all unchanged.
    //   **AND THIS IS THE STARVED END OF THE MEASUREMENT, NOT A REPRESENTATIVE ONE.** The same
    //   change measured on a hotel with enough amenities — `--days 30 --seed 7 --rooms 6
    //   --amenities 5` — moves NO outcome at all: checkedOut 192, gaveUp 161, revenue
    //   1,632,000p and closing balance 1,007,000p identical with travel off and on, and only
    //   the unserved integrals move. **Travel costs satisfaction; it costs OUTCOMES only where
    //   the hotel was already failing**, and 60 bedrooms behind two amenities is that hotel.
    //   (Closing balance here moves -238,500p -> -264,000p, which is the three lost stays.)
    //   `ddfe4e4000bf1dc4` -> `418cf36055a3408c`   G-038a-ii-alpha added `World.stairs` and took
    //   the save to **v21**. **ONE cause, and it is a FIELD rather than a behaviour**: the
    //   harness declares no stairwell, so `stairLeg` reads the empty set as *"the floor axis
    //   spends unconditionally"* and every guest walks exactly where it walked. **THE CONTROL
    //   BLOCK BELOW HOLDS IN FULL** — every counter, every departure row, every need row and the
    //   closing balance are byte-identical — which is what says the hash moved because the world
    //   grew a key and not because the hotel changed.
    //   `418cf36055a3408c` -> `5cfb73ca16c3463e`   G-039b-alpha gave the seeded plate a SPINE
    //   and moved every seeded room one column right and one row back. **This one IS a
    //   behaviour change and the control block below moves with it** — see the outcome arm: the
    //   bench completes FIVE stays where it completed one. `check:stamp` reads this literal out
    //   of the tree, so the digest's measure-golden line moves with it.
    //   `5cfb73ca16c3463e` -> `760558b631beb552`   G-038a-iii-b DECLARED THE STAIRWELL. **ONE
    //   cause and it is BEHAVIOURAL, and it is the cause `418cf36055a3408c`'s row promised**:
    //   that row moved the hash for a FIELD and said the harness declares no stairwell, so
    //   `stairLeg` read the empty set as *"the floor axis spends unconditionally"* and every
    //   guest walked exactly where it walked. It does not any more. `schedule` emits `layStair`
    //   on every floor at `(column 1, row 0)` (`shaftCells`), so a guest going to the basement
    //   walks to that column first — and this workload's amenities are ALL in the basement.
    //   **checkedOut 5 -> 2, leftDissatisfied 61 -> 64**, the still-in-the-hotel column unmoved
    //   at 9, and the conservation closes: **2 + 64 + 9 = 75 arrived.** `arrived`,
    //   `evictedGuests`, the abandonment count and the departure table's seven-row SHAPE are
    //   unchanged. `check:stamp` reads this literal out of the tree, so the digest's
    //   measure-golden line moves with it.
    //
    //   *(Those three lines are the tail of the G-038a-iii-b entry above. The G-041 branch
    //   inserted its own entry BETWEEN `arrived,` and `evictedGuests,` — mid-sentence, mid-list —
    //   and the merge put the sentence back together. Its entry follows, in its own place.)*
    //
    //   `760558b631beb552` -> `c7212353b3d1784f`   G-040a gave every guest a `partyId` and took
    //   the save to **v22**. **ONE cause, and it is a FIELD rather than a behaviour** — the
    //   `418cf36055a3408c` row's shape exactly, and this time it is checked over three
    //   invocations rather than one: `pnpm sim:run` at `--days 20 --seed 42`, `--days 40 --seed
    //   7` and `--days 10 --seed 1` each print a 48-line report in which **the only line that
    //   differs from HEAD is `state hash`.** Every arrival, every departure row, every need row,
    //   every review, the revenue, the upkeep and the closing balance are byte-identical.
    //   **THE CONTROL BLOCK BELOW HOLDS IN FULL**, which is what says the hash moved because the
    //   world grew a key and not because the hotel changed. `check:stamp` reads this literal out
    //   of the tree, so the digest's measure-golden line moves with it.
    //
    //   `760558b631beb552` -> `cba13e62265ed196` AT G-041, ON THE BRANCH, and the cause is the
    //   need RATES (ADR-0054, ADR-0057). Every rate in `need-types.json` is now the ceiling a
    //   fully appointed room reaches, and this tree has no quality fold in it yet — so every room
    //   in this workload serves at that ceiling and the sixty-bedroom / two-amenity hotel this
    //   benchmark is deliberately starved at stops being starved of SERVICE. **THAT LITERAL IS
    //   NOT IN THIS FILE AND MUST NOT BE**: it was measured on `faf8747`, which does not contain
    //   G-040a, and both branches moved this one literal off the same base. The merged value is
    //   the row below. (The branch's own entry stated the still-in-the-hotel column both
    //   "unmoved at 9" and "moving 9 -> 13" in consecutive sentences; the merged tree's four
    //   columns are re-measured and asserted below rather than reconciled in prose.)
    //
    // - `c7212353b3d1784f` -> `1e44f2c872a33aa4` AT THE G-041/G-042 MERGE, WITH TWO CAUSES IN
    //   ONE LITERAL, AND IT IS RE-MEASURED ON THE MERGED TREE RATHER THAN TAKEN FROM A PARENT.
    //   `main` moved this literal to `c7212353b3d1784f` (G-040a's `partyId`) and the branch moved
    //   THE SAME literal from THE SAME base to `cba13e62265ed196` (G-041's need rates), so
    //   **neither parent's value is correct on this tree and a hash cannot be hand-merged.** The
    //   behavioural half of the move is entirely the branch's; the party half moves the hash and
    //   nothing else, which is what the control block below re-checks on the merged tree.
    //   **checkedOut 2 -> 33, leftDissatisfied 64 -> 29, still-in-the-hotel 9 -> 13**, the
    //   conservation closing on **33 + 29 + 13 = 75 arrived**; `arrived`, `evictedGuests` and
    //   `gaveUp` at zero and the departure table's seven-row SHAPE unchanged. `check:stamp`
    //   reads this literal out of the tree, so the digest's measure-golden line moves with it.
    //
    // - `1e44f2c872a33aa4` -> `917662dc0a756888` AT G-040b-ii, AND THE CAUSE IS ONE CONTENT LINE.
    //   `guest-rules.json` declares `partySizeWeights: [3, 1]`, realised cycle **1, 1, 2**, so
    //   this workload's 75 arrival COMMANDS bring **100 guests** and a pair shares a bedroom.
    //   Two things move the hash at once and neither is code: `World.contentHash` moves because
    //   the content document gained a field, and the run is genuinely different.
    //   **checkedOut 33 -> 22, leftDissatisfied 29 -> 64, still-in-the-hotel 13 -> 14**, the
    //   conservation closing on **22 + 64 + 14 = 100 arrived**; `gaveUp` and `evictedGuests` are
    //   still zero and the departure table's seven-row SHAPE is unchanged. `check:stamp` reads
    //   this literal out of the tree, so the digest's measure-golden line moves with it.
    //
    // - `917662dc0a756888` -> `6a3bc5aa1383196e` AT G-038b-i, AND NO CONTENT AND NO BEHAVIOUR
    //   MOVED WITH IT. `World` gained `lift` (`null`) and `liftQueue` (empty), and
    //   `guestOutcomes.departures` gained a zero row at index 3 (save v23). `World.contentHash`
    //   is UNCHANGED — no content document was touched — so this is the narrowest cause this
    //   literal has ever moved for: two new fields and one new row in the hashed shape.
    //   **checkedOut 22, leftDissatisfied 64, still-in-the-hotel 14, conservation still closing
    //   on 100 arrived, `gaveUp` and `evictedGuests` still zero**, and the new row is zero too
    //   — a queue can only form where `world.lift !== null`, which no harness here sets. The
    //   departure table's SHAPE is eight rows rather than seven, which is the one thing about
    //   this bump that a consumer can see. `check:stamp` reads this literal out of the tree, so
    //   the digest's measure-golden line moves with it.
    //
    // - `6a3bc5aa1383196e` -> `c0b590c8d85d0d9c` AT G-057, AND THE CAUSE IS `World.contentHash`
    //   ALONE. `HOTELSIM.md` section 8's M4 hard prerequisite: the shipped content gained
    //   `scenarios.json` and `economy.json` lost `startingCapitalPence`, so the content document
    //   is a different document and fingerprints as one (G-002's design). **No `World` field, no
    //   save bump, no migration, and NO BEHAVIOUR** — the shipped `seededStock` is
    //   `supplementsCapital`, which is exactly what every build before this goal did, and the
    //   opening balance is the same 500,000p at its new address. **checkedOut 22,
    //   leftDissatisfied 64, still-in-the-hotel 14, conservation still closing on 100 arrived,
    //   `gaveUp` and `evictedGuests` still zero**, and the departure table's eight-row shape is
    //   untouched — all of which the outcome test below re-checks rather than this comment
    //   asserting it. `check:stamp` reads this literal out of the tree, so the digest's
    //   measure-golden line moves with it.
    // - `c0b590c8d85d0d9c` -> `289a56519ced9655` AT G-054, AND THE CAUSE IS BEHAVIOUR, WHICH IS
    //   the first time in this list that it is. `reserve` no longer settles an exact tie between
    //   equally-pressed needs by ascending content id; it settles it per guest
    //   (`needTieBreakRank`, ADR-0078). **No content document was touched, so `World.contentHash`
    //   is UNCHANGED; no `World` field was added, `SAVE_SCHEMA_VERSION` is still 23 and no
    //   migration is owed.** The guests of this hotel reach for different things first, so they
    //   queue differently and the run ends in a different state. **checkedOut 22 -> 27,
    //   leftDissatisfied 64 -> 59, still-in-the-hotel 14, conservation still closing on 100
    //   arrived, `gaveUp` and `evictedGuests` still zero** — the outcome test below re-checks
    //   that rather than this comment asserting it. `check:stamp` reads this literal out of the
    //   tree, so the digest's measure-golden line moves with it.
    // - `289a56519ced9655` -> `856ade18e3ed8264` AT G-052a, AND THERE ARE TWO CAUSES AT ONCE,
    //   NEITHER OF THEM BEHAVIOUR. The money loop's third term landed: `World` GAINED an empty
    //   `staff` payroll and the save went to **v24**, and `World.contentHash` MOVED because the
    //   shipped content gained `staff-roles.json` and `scenarios.json` gained an `openingStaff`
    //   key. The ledger also gains one zero-amount `wages` line per simulated night, which is
    //   hashed state like every other transaction. **NO BEHAVIOUR**: the shipped scenario
    //   employs NOBODY (`openingStaffSchema` carries that ruling and its measurement), so not a
    //   penny moves and no guest does anything differently. **checkedOut 27, leftDissatisfied
    //   59, still-in-the-hotel 14, conservation still closing on 100 arrived, `gaveUp` and
    //   `evictedGuests` still zero** — the outcome test below re-checks that rather than this
    //   comment asserting it. `check:stamp` reads this literal out of the tree, so the digest's
    //   measure-golden line moves with it.
    // - `856ade18e3ed8264` -> `94e4da7a5e60acf6` AT G-051a, AND THERE IS EXACTLY ONE CAUSE, WHICH
    //   IS NOT BEHAVIOUR AND IS NOT A `World` FIELD. The star rating is DERIVED and stored
    //   nowhere, so `World` gained no key and the save stayed at **v24** with no migration. What
    //   moved is `World.contentHash`: the shipped content gained `star-tiers.json` and three
    //   FACILITY room types. **NO BEHAVIOUR**: nothing in the tick loop reads a rating, a
    //   facility serves no need, and `--facilities` defaults to 0 so this workload seeds none.
    //   **checkedOut 27, leftDissatisfied 59, still-in-the-hotel 14, conservation still closing
    //   on 100 arrived, `gaveUp` and `evictedGuests` still zero** — the outcome test below
    //   re-checks that rather than this comment asserting it, and it did not move.
    // - `94e4da7a5e60acf6` -> `a57925e09896e3a4`. G-051a SWEEP 1 MOVES IT AGAIN, FOR THE SAME ONE CAUSE AND STILL NOT BEHAVIOUR:
    //   `World.contentHash`, because MAJOR 1 repriced two `demolitionRefundBasisPoints` values in
    //   `room-types.json` (`hotel_spa` 5,000 -> 7,000bp, `conference_hall` 8,000 -> 6,000bp) so
    //   that no facility is dominated NET OF THE RESIDUAL the game already treats as money. No
    //   `World` field, no save bump, no migration, no ledger line — and no refund is ever PAID on
    //   this arm, because `--facilities` and `--buy-facility` both default to 0 and it seeds and
    //   buys none.
    //   **checkedOut 27, leftDissatisfied 59, still-in-the-hotel 14, 100 arrived, `gaveUp` and
    //   `evictedGuests` zero** — the outcome test below re-checks that and did not move.
    // - `a57925e09896e3a4` -> `ce9bc72375ddd24f` AT G-059, AND THIS ONE **IS** BEHAVIOUR, which
    //   is what separates it from the four moves above. The review scorer changed and the review
    //   tally is world state. NO `World` FIELD, so the save stays at **v24** with no migration,
    //   and `World.contentHash` did NOT move — no content file was touched. **checkedOut 27,
    //   leftDissatisfied 59, still-in-the-hotel 14, 100 arrived, `gaveUp` and `evictedGuests`
    //   zero** — the outcome test below re-checks that and did NOT move, which is the control:
    //   the same guests did the same things and were scored differently for it. Fifty-nine of
    //   this workload's hundred guests stormed out and used to review like contented checkouts;
    //   they review at the floor now.
    // - `ce9bc72375ddd24f` -> `612531853a713e01` AT G-066a, AND THIS ONE IS **STRUCTURAL AND
    //   BEHAVIOURAL AT ONCE**, which is a third kind and is worth separating from both above.
    //   `World` gains `recentRemarks`, so the hashed document gains a key — that alone moves this
    //   number even on a world where nobody departs. It ALSO fills, because this arm departs 86
    //   guests, and a bounded ring of the last 48 of them is real hashed state. **SAVE BUMPS TO
    //   v25** with a real 24 -> 25 migration, a `without-remarks.ts` stripper and an
    //   `assertWorldShape` clause. `World.contentHash` did NOT move: `guest-remarks.json` is
    //   deliberately outside `bindContent`'s fingerprint, and nothing this goal touched is
    //   injected content. **checkedOut 27, leftDissatisfied 59, still-in-the-hotel 14, 100
    //   arrived, `gaveUp` and `evictedGuests` zero** — the outcome test below re-checks that and
    //   did NOT move, which is the control: the same guests did the same things, and what changed
    //   is that the hotel now keeps a note of what the last few of them said.
    // - `612531853a713e01` -> `7a19fc0f9477a733` AT G-046, AND IT IS PURELY BEHAVIOURAL. No
    //   `World` field, no save bump, no migration, and `World.contentHash` unmoved — a door is a
    //   PLACE now (the human's ruling), so every guest walks to a room's doorway and stands in it
    //   for a tick before it turns in. Journeys are one cell and one tick longer, which on this
    //   workload — sixty bedrooms behind TWO amenities, the most starved arm in the project —
    //   turns five completed stays into walk-outs. The outcome test below carries the split.
    // - `7a19fc0f9477a733` -> `186f1a5f3a22ff2b` AT G-060, AND IT IS `World.contentHash` AND
    //   NOTHING ELSE. ADR-0107 re-tabled `star-tiers.json` so that a tier's amenity clause counts
    //   COMPLETE SETS, and the fingerprint hashes the injected content whether or not this
    //   workload's rating reads it — nothing in `packages/sim` does. No `World` field, no save
    //   bump, no migration. **THE OUTCOME TEST BELOW DID NOT MOVE, WHICH IS THE CONTROL**: the
    //   same 100 arrived, 27 checked out, 59 dissatisfied, 14 still in the hotel.
    // - `186f1a5f3a22ff2b` -> `fe487876ca239a92` AT G-046b, AND IT IS PURELY BEHAVIOURAL AGAIN.
    //   No `World` field, no save bump, no migration, `World.contentHash` unmoved. A room is
    //   LEFT through its door now as well as entered through it, so a journey costs a tick at
    //   BOTH thresholds instead of one. On this arm — sixty bedrooms behind TWO amenities, the
    //   most starved workload in the project — that second tick turns three more completed stays
    //   into walk-outs. The outcome test below carries the split, and it is the same trade in
    //   the same direction the door made at G-046.
    // - `fe487876ca239a92` -> `3966fdfed81b8dea` AT G-068, AND IT IS THE CONTENT AND THE LEDGER
    //   AND NOTHING ELSE. ADR-0108 raised `openingCapitalPence` 500,000 -> 1,000,000, so
    //   `World.contentHash` moves AND the opening `startingCapital` transaction is 500,000p
    //   larger. No `World` field, no save bump, no migration. **THE OUTCOME TEST BELOW DID NOT
    //   MOVE, WHICH IS THE CONTROL** and it is the strongest form of it this hash has carried:
    //   this arm builds NOTHING and demolishes NOTHING, so a purse it never spends cannot reach
    //   a single guest. Same 100 arrived, same split, same everything but the money.
    // - `3966fdfed81b8dea` -> `5b8e6d7760ba8e0b` AT G-069, AND IT IS `World.contentHash` AND
    //   NOTHING ELSE - the narrowest cause this hash has ever moved for. G-069 re-derived
    //   `floorConstructionCostPence` 500,000 -> 750,001 in `economy.json` (E-016), and the
    //   fingerprint hashes the injected content whether or not this workload ever reads the
    //   field. **THIS ARM NEVER OPENS A FLOOR**: it builds nothing, so no `floorConstruction`
    //   transaction exists to move and the LEDGER IS BYTE-IDENTICAL, including the opening
    //   `startingCapital` line that moved at G-068. No `World` field, no save bump, no
    //   migration. **THE OUTCOME TEST BELOW DID NOT MOVE, WHICH IS THE CONTROL**: same 100
    //   arrived, 27 checked out, 59 dissatisfied, 14 still in the hotel.
    // - `5b8e6d7760ba8e0b` -> `fce3fdb5e8c00e69` AT G-070, AND IT IS `World.contentHash` AND
    //   NOTHING ELSE FOR THE SECOND GOAL RUNNING. ADR-0109 put `floorConstructionCostPence` at
    //   1,000,000 in `economy.json` (the round `4 x cheapestRoom`, closing E-016), and the
    //   fingerprint hashes the injected content whether or not this workload ever reads the
    //   field. **THIS ARM NEVER OPENS A FLOOR**: it builds nothing, so no `floorConstruction`
    //   transaction exists to move and the LEDGER IS BYTE-IDENTICAL. No `World` field, no save
    //   bump, no migration. **THE OUTCOME TEST BELOW DID NOT MOVE, WHICH IS THE CONTROL**: same
    //   100 arrived, 27 checked out, 59 dissatisfied, 14 still in the hotel.
    // - `fce3fdb5e8c00e69` -> `4d6050fd9a1ad339` AT G-075a, AND IT IS `World.contentHash` AND
    //   NOTHING ELSE FOR THE THIRD GOAL RUNNING. ADR-0111 put a `purchaseCostPence` on every row
    //   of `item-types.json`, and the fingerprint hashes the injected content whether or not this
    //   workload ever reads the field. **THIS ARM PLACES NO ITEM**: `placeItem` is issued by no
    //   scenario, no harness workload and no player — that is the whole reason the charge could
    //   land before the button — so no `itemPurchase` transaction exists and the LEDGER IS
    //   BYTE-IDENTICAL. No `World` field, no save bump, no migration. **THE OUTCOME TEST BELOW
    //   DID NOT MOVE, WHICH IS THE CONTROL**: same 100 arrived, 27 checked out, 59 dissatisfied,
    //   14 still in the hotel.
    expect(hashState(plain)).toBe('4d6050fd9a1ad339');
  });

  it('and its outcomes are the hand-checked ones, so the hash is not the only claim', () => {
    // A hash alone would move for any reason and say nothing about which. These are the
    // facts a reader can re-derive: if the hash moves and these hold, something changed in
    // state that outcomes do not cover; if these move too, the simulation changed.
    // GUESTS, NOT COMMANDS, SINCE G-040b-ii — `arrived` counts guests (G-040b-i) and the
    // schedule's closed form counts commands, so the two are related by the shipped cycle rather
    // than equal. Both are asserted: the command count is what the schedule emits and has not
    // moved, and the guest count is what the hotel received.
    expect(EXPECTED_ARRIVALS).toBe(75);
    expect(plain.guestOutcomes.arrived).toBe(EXPECTED_GUESTS);
    // 75 WHERE IT WAS 225: a third of the arrivals, because ADR-0021 tripled the cadence to
    // hold the CONCURRENT population at the fifteen this benchmark was calibrated for.
    // `EXPECTED_ARRIVALS` is derived from `ARRIVAL_EVERY_TICKS` and re-derived itself; this
    // line is the arithmetic written out so a reader can check the derivation rather than
    // trust it.
    // 75 -> 100 AT G-040b-ii: the same 75 commands, four guests for every three of them.
    expect(plain.guestOutcomes.arrived).toBe(100);
    // 60 of those 75 complete a stay inside five simulated days; the other 15 are the ones
    // still in the hotel at the end, which is the steady-state occupancy by construction.
    // 60 -> 4 AT θ-b1, and the missing 56 are in the new row: `leftDissatisfied` 64. Sixty
    // bedrooms share one lounge and one games room, one provider serves one guest at a time,
    // and a guest that is never served saturates at 431 of its 1,440 ticks. The hand-check is
    // the CONSERVATION of the three, and it is the arithmetic the assertions below execute:
    // **4 + 64 + 7 still in the hotel = 75 arrived.**
    // 4 + 64 -> 1 + 67 AT G-023b-ii, and the CONSERVATION is what survives: **1 + 67 + 7 still
    // in the hotel = 75 arrived**, which is what the assertion two lines down executes. Three
    // guests moved from one row to the other because a walk to the single lounge now costs
    // ticks they did not have. The arithmetic in the paragraph above is re-spelled here rather
    // than left stale.
    //
    // ==========================================================================================
    // 1 + 67 -> 5 + 63 AT G-039b-alpha, AND IT IS THE FIRST TIME THIS ROW HAS GONE THE OTHER
    // WAY. **The I5 benchmark completes five stays where it completed one**, and the direction
    // is the finding rather than the size: every previous move on this row has been downward,
    // from 60 at G-010 to 4 at theta-b1 to 1 at G-023b-ii, each for a good reason and each
    // making the benchmark a slightly worse witness for the loop it is supposed to exercise.
    //
    // THE CAUSE IS CIRCULATION RATHER THAN DISTANCE, which is what makes it an improvement and
    // not a shorter walk. Sixty bedrooms behind two amenities is a starved hotel and this goal
    // did not feed it; what changed is that the plate's nine lanes are JOINED, so a guest whose
    // provider is on the far side of the floor can now reach it at all instead of walking
    // within one lane until its dissatisfaction ceiling saturates. Four more guests get served
    // enough to complete.
    //
    // **THE CONSERVATION STILL CLOSES: 5 + 61 + 9 still in the hotel = 75 arrived**, and
    // `arrived`, `evictedGuests`, the abandonment count and the seven-row departure table's
    // SHAPE are all unchanged — which is what says the guests moved between rows rather than
    // appearing from anywhere. **The still-in-the-hotel column moves 7 -> 9 as well**, and that
    // is the same fact from the other side: a guest that is being served is a guest still in
    // residence at the horizon rather than one that has already walked out.
    //
    // (`G-041` will move this row again by re-deriving the rates, and the branch
    // `g037a-quality-fold` records that this benchmark completed ZERO stays over a simulated
    // year. Neither is discharged here; this is four guests, not a fix.)
    //
    // ==========================================================================================
    // 5 + 61 -> 2 + 64 AT G-038a-iii-b, AND IT GOES BACK DOWN. **THE PRICE OF THE STAIRWELL,
    // STATED AS THE THING THE PREVIOUS PARAGRAPH CALLED A FINDING RATHER THAN QUIETLY RE-PINNED
    // ONE GOAL LATER.** G-039b-alpha's row above reads *"the first time this row has gone the
    // other way"* and *"the direction is the finding rather than the size"*; this goal spends
    // three of its four guests back.
    //
    // THE CAUSE IS VERTICAL DISTANCE, WHICH IS THE COST HALF OF THE SAME MECHANIC. Every one of
    // this workload's amenities is in the BASEMENT and every one of its sixty bedrooms is on
    // floor 0, so every engagement in it is a cross-floor journey. Before the shaft a guest
    // spent the floor axis from wherever it stood; now it walks to `(column 1, row 0)` first
    // and out again on the other side — `travel.stairs.report.test.ts` measures move events on
    // this same shape at **910 -> 1,948** — and three more of the sixty saturate the 431-tick
    // dissatisfaction ceiling before they are served.
    //
    // **IT IS NOT A DEFECT AND IT IS NOT TUNED AWAY.** The hotel is the same hotel; the journey
    // is the one a building with one stairwell actually imposes, and the previous row's own
    // last paragraph says this benchmark is *"the starved end of the measurement, not a
    // representative one"* — sixty bedrooms behind two amenities. Making the workload kinder to
    // keep this number high is precisely what G-039b-alpha refused by name.
    //
    // **THE CONSERVATION STILL CLOSES: 2 + 64 + 9 still in the hotel = 75 arrived**, and the
    // still-in-the-hotel column is UNMOVED at 9 — the guests moved between the two departure
    // rows and nowhere else.
    // ==========================================================================================
    // ==========================================================================================
    // 33 + 29 -> 22 + 64 AT G-040b-ii, AND THE ROW THAT MATTERS FALLS WHILE THE POPULATION RISES.
    // **RE-ARGUED RATHER THAN RE-PINNED**, because "more guests" predicts the opposite:
    //
    //   arrived            75 -> 100     four guests per three commands, exactly
    //   checkedOut         33 ->  22     FEWER completed stays out of a THIRD MORE arrivals
    //   leftDissatisfied   29 ->  64     and the missing ones are all here
    //   still in the hotel 13 ->  14
    //   gaveUp              0 ->   0     nobody fails to get a BED, then or now
    //
    // **THE MECHANISM IS CONCURRENCY, NOT HEAD COUNT, AND `gaveUp` AT ZERO IS THE PROOF.** Sixty
    // bedrooms of capacity 2 can sleep a hundred and twenty people, so no guest in this hotel
    // ever waits for a room — what a pair does is put TWO guests in one bedroom, so the
    // building holds more residents at once and every one of them wants the same two amenities.
    // `workload.mjs`'s occupancy pin reads the same fact from the other side: 12.03 -> 12.75
    // concurrent guests, a 6% rise from a 33% bigger population, because the extra guests reach
    // their dissatisfaction ceiling and leave instead of accumulating.
    //
    // **THIS BENCHMARK IS THE STARVED END OF THE MEASUREMENT AND IT IS NOT TUNED BACK.** The
    // G-038a-iii-b row above says so in as many words — *"making the workload kinder to keep
    // this number high is precisely what G-039b-alpha refused by name"* — and that is exactly as
    // binding here, where the fall is eleven stays rather than three.
    //
    // **WHAT IS NOT CLAIMED**: nothing here says the game got worse. The same dial makes the
    // three-room and six-room hotels complete MORE stays (`cli.stdout.test.ts` 4 -> 6,
    // `dissatisfaction.report.test.ts` 192 -> 256) because those hotels have amenities in
    // proportion. It is this workload's deliberate two-amenity starvation that turns extra
    // residents into walk-outs, and the pair of readings is the honest account of the dial.
    // ==========================================================================================
    // 22 -> 27 AND 64 -> 59 AT G-054, AND THE DIRECTION IS THE ONE THE BLOCK ABOVE PREDICTED
    // FOR THE OPPOSITE DIAL. **Five more guests complete a stay in the project's most starved
    // workload — sixty bedrooms behind TWO amenities — and five fewer walk out.** Nothing was
    // added to the hotel: the guests stopped all reaching for the same need first, so the two
    // amenities serve a wider slice of the population instead of the same slice repeatedly.
    // **That is the goal's own claim showing up in an outcome column rather than in a
    // statistic**, and it is the workload ADR-0078 would least have expected it on.
    // 27 -> 22 AT G-046, AND IT IS THE OPPOSITE DIRECTION FROM G-054 ON THE SAME COLUMN. The
    // door costs every journey a tick, and on the workload with the least service capacity per
    // guest that tick comes straight out of the time a guest was willing to wait. **Five fewer
    // guests complete a stay and five more walk out** — the same trade G-054 made in the other
    // direction, and the honest price of the door on the arm least able to pay it.
    // 22 -> 19 AT G-046b, the same column moving the same way for the same reason one goal on.
    // The exit costs a second tick per journey and this arm has the least slack in the project
    // to pay it with; three more stays end in a walk-out.
    expect(departureCountOf(plain.guestOutcomes, 'checkedOut')).toBe(19);
    // 61 -> 65 AT G-046, the other side of `checkedOut` 27 -> 22 and the same four guests.
    // 65 -> 69 AT G-046b, the other side of `checkedOut` 22 -> 19 and the one guest that was
    // still in the building at the horizon.
    expect(departureCountOf(plain.guestOutcomes, 'leftDissatisfied')).toBe(69);
    // AND THE STILL-IN-THE-HOTEL COLUMN IS WHAT MOVED, 9 -> 13, WHICH IS THE FOURTH NUMBER THE
    // CONSERVATION NEEDS AND THE ONE THIS ARM HAD NEVER PINNED. 33 + 29 + 13 = 75, every other
    // departure row is zero, and `gaveUp` is still zero — nobody in this hotel fails to get a
    // room, they are served faster and more of them finish. Pinned so the next reader who finds
    // three columns that do not add up has the fourth in front of them.
    expect(departureCountOf(plain.guestOutcomes, 'gaveUp')).toBe(0);
    // 13 -> 14 at G-040b-ii. 22 + 64 + 14 = 100, every other departure row is zero, and `gaveUp`
    // is still zero — sixty bedrooms of capacity 2 cannot run out of beds at this cadence.
    // 14 -> 12 AT G-054. 27 + 61 + 12 = 100, the conservation still closes, and `gaveUp` is
    // still zero for the same reason it always was.
    // 12 -> 13 AT G-046: 22 + 65 + 13 = 100 arrived, and the conservation still closes.
    // 13 -> 12 AT G-046b: 19 + 69 + 12 = 100 arrived, and the conservation still closes.
    expect(plain.guests.list.length).toBe(12);
    expect(
      departedGuests(plain.guestOutcomes) + plain.guests.list.length,
    ).toBe(plain.guestOutcomes.arrived);
    expect(evictedGuests(plain.guestOutcomes)).toBe(0);
    expect(plain.needOutcomes).toHaveLength(4);
    // AND THE ABANDONMENT COUNT IS HAND-CHECKED TOO (G-014b), because it is now part of what
    // this hash covers. ONE, in five simulated days over 210 completed stays: this hotel is
    // starved of providers, and a guest can only abandon towards a FREE one. If this ever
    // climbs, the hash above moved because guests started changing their minds rather than
    // because a content table did.
    // ONE -> TWENTY-ONE, and it is not a thrash: the CONCURRENT population is the same
    // fifteen it was, and each guest now lives 1,440 ticks rather than 480, so it re-scores
    // its vector three times as often before leaving. Per guest-lifetime this is the same
    // rate of mind-changing spread over three times the stay. If it ever climbs without the
    // stay moving, the hash above moved because guests started dithering rather than because
    // a content table did — which is what this assertion is for.
    //
    // TWENTY-ONE -> TEN AT G-027b, AND THE FALL WAS PREDICTED BEFORE IT WAS READ. Two
    // independent brakes, both consequences of the stock model rather than of any number:
    //
    //   THE GAP OPENS FROM ONE END NO LONGER. A served need's patience used to sit pinned at
    //   its cap, so its pressure was 0 and only the challenger moved. A served STOCK is being
    //   refilled, so the incumbent's pressure FALLS towards the challenger's rise — the gap
    //   still opens, but the incumbent is climbing out of the comparison at the same time, and
    //   it reaches FULL and releases itself long before a 6,000-basis-point gap can form.
    //   A CHALLENGER MUST BE WANTED. `isNeedWanted` is a Schmitt trigger: a need below its
    //   want line is not pursued at all, so a need that was recently served cannot challenge
    //   anything until it has decayed back to the line.
    //
    // Both say FEWER switches at the same margin, and ten is fewer. It is still non-zero, which
    // matters: the mechanism is live in this 60-room hotel even though the 3-room default run
    // now records none at all (`report.test.ts` carries that reading and its two-sided control).
    // TEN -> ZERO AT θ-b1, AND IT IS THE SAME TWO BRAKES ONE TURN FURTHER ON. Abandoning needs
    // a guest to be here long enough for a SECOND need to drift a margin's width past the one
    // being served; in this hotel a guest that is not being served now leaves at 431 ticks
    // instead of waiting out 1,440, so the drift has less time to happen and the population it
    // could happen to is smaller. **Zero is a loss of coverage on this row and it is recorded
    // as one rather than absorbed**: the mechanism is still asserted live at
    // `hysteresis.report.test.ts`'s contended arm, which is the arm that exists for it.
    expect(plain.needOutcomes.reduce((total, row) => total + row.abandoned, 0)).toBe(0);
  });

  it('and every guest is accounted for', () => {
    expect(departedGuests(plain.guestOutcomes) + guestCount(plain.guests)).toBe(
      plain.guestOutcomes.arrived,
    );
  });
});

describe('the same workload with the player churning the building', () => {
  // THE ARM THAT REACHES EVICTION. `--demolish` takes rooms out from under guests who are
  // in them, which is the only way `stepGuests` step 3 runs — the path that departs a guest
  // holding BOTH a bedroom and an amenity, releasing both. G-016 rewrote `depart`, so a
  // pinned hash that never evicted anybody would have been a pin over the easy half.
  const churn = runWorkload(240, 360);

  it('CHURN: hashes to a committed literal', () => {
    // Moved at G-014a for the reasons the plain hash did, and with the same control: the
    // eviction count below is unchanged at 19, so the path this arm exists to cover is
    // reached exactly as often as before. Was `847daaaa084b1ae6` at G-013,
    // `a3622b36bb17436a` at G-016, `9f1c8229e03d71d5` at G-014a.
    //
    // Moved at G-015 with the plain arm, for the shape change described above — and this arm
    // carries the sharper control: it EVICTS, and the eviction count below is still exactly
    // 19. G-015 splits eviction into two reasons, so a change that had altered when a guest
    // is evicted (rather than only what is recorded about it) would move that number.
    //
    // Moved at G-014b with the plain arm, for the two causes described there — the fifth
    // content table and one abandonment. Was `45ad064fabc409cb` at G-015. The control holds
    // and is the sharp one: 19 evictions, unchanged, so the release path a guest takes when
    // its room is demolished mid-engagement is reached exactly as often as before, in a goal
    // that added a SECOND way for an engagement to end.
    //
    // Moved at G-019 with the plain arm, for the two causes described there — the review
    // scale in the content document and the new hashed field. Was `6e9b2d38dfa01134` at
    // G-014b. The sharp control holds again: 19 evictions, unchanged, in the goal that made
    // an eviction the one departure the review scale treats differently from every other.
    //
    // Moved at G-023a with the plain arm, for the one cause described there — `Guest.at` is
    // hashed state. Was `8773494528412341` at G-019. The sharp control holds for the fifth
    // time: 19 evictions, unchanged, in a goal that gives the evicted guest a position to be
    // evicted FROM.
    // Moved at G-027a with the plain arm, twice and for the same two causes it lists.
    // `5536dd68a2cfe25c` -> `e35df7062bea43aa` -> `a8976e5fe2d15acb`.
    //
    // Moved a THIRD time at G-027b with the plain arm, for the one cause stated there — a need
    // became a STOCK, so every guest is served, decays and is served again where it used to
    // finish once: `a8976e5fe2d15acb` -> `0cbe3a1234affebe`. THE SHARP CONTROL HOLDS FOR THE
    // SIXTH TIME: 19 evictions, unchanged, in a goal that changed what being served MEANS and
    // nothing about which rooms the churn schedule demolishes.
    // SEVENTH TIME AT θ-b1: `0cbe3a1234affebe` -> `dc043d95d351ba49`, for the two causes the
    // PLAIN row above gives — a new hashed field and a moved content fingerprint.
    //   `dc043d95d351ba49` -> `6a2bcb431c45e2f7`   θ-b2, for the reason the plain arm moved:
    //   a seventh departure row in hashed state and a new content field in the fingerprint,
    //   with no reachable behaviour change under content that declares a lodging need.
    // MOVED AT G-028a WITH ITS SIBLING ABOVE, for the same one reason and with the same control:
    // the churn arm's own outcome assertions below are unchanged.
    // MOVED AGAIN AT G-028b WITH ITS SIBLING, `0a083a4acfd22026` -> `5a359e8723c227f3`, for the
    // one cause the plain row gives — the scorer and `met` now read the unserved counter. THE
    // SHARP CONTROL HOLDS FOR THE EIGHTH TIME: 19 evictions, unchanged, in a goal that changed
    // what a review MEANS and nothing about which rooms the churn schedule demolishes.
    // MOVED AT G-034a WITH ITS SIBLING, `5a359e8723c227f3` -> `92e656437b7c1b07`, for the one
    // cause the plain row gives — a cell gained a third coordinate and the plot gained two
    // edges, with the shipped plot still one row deep so nothing behavioural can differ. THE
    // SHARP CONTROL HOLDS FOR THE NINTH TIME: 19 evictions, unchanged, in a goal that rewrote
    // the door rule's arity and nothing about which rooms the churn schedule demolishes.
    // MOVED AT G-034b WITH ITS SIBLING, `92e656437b7c1b07` -> `09496f8d672da4e9`, for the two
    // causes the plain row gives PLUS one this arm alone reaches: it builds, so the player lays
    // a corridor on each floor it builds on and packs rooms between them. THE SHARP CONTROL
    // HOLDS FOR THE TENTH TIME: 19 evictions, unchanged, in the goal that made connectivity a
    // validity rule — the churn schedule demolishes the same rooms out from under the same
    // guests, and the rooms it demolishes were connected before and after.
    // MOVED AT G-036a WITH ITS SIBLING, `09496f8d672da4e9` -> `c06e0719c4b65235`, for the two
    // causes the plain row gives PLUS one this arm alone reaches: it builds, so the player's
    // lanes now run the full depth of the plot and its rooms pack into every row between them.
    // THE SHARP CONTROL HOLDS FOR THE ELEVENTH TIME: 19 evictions, unchanged, in the goal that
    // gave the plot depth and re-laid every layout in the tree — the churn schedule demolishes
    // the same rooms out from under the same guests.
    // MOVED AT G-036b WITH ITS SIBLING, `c06e0719c4b65235` -> `eb25a99e0fbedbc2`, for the two
    // causes the plain row gives and no third one: this arm builds, but it builds through
    // `buildRoom`, which is `drawRoom` at one cell, so not one rectangle in this workload is
    // wider than the rectangles it has always had. THE SHARP CONTROL HOLDS FOR THE TWELFTH
    // TIME: 19 evictions, unchanged, in the goal that made a room a rectangle — the churn
    // schedule demolishes the same rooms out from under the same guests.
    // MOVED AT G-036c WITH ITS SIBLING, `eb25a99e0fbedbc2` -> `62aebaef31a6b85b`, for the two
    // causes the plain row gives and no third one: this arm builds and demolishes, but it
    // issues no `resizeRoom` and no `moveItem`, so its five new counters are zero exactly as
    // the plain arm's are. THE SHARP CONTROL HOLDS FOR THE THIRTEENTH TIME: 19 evictions,
    // unchanged, in the goal that made a room editable — the churn schedule demolishes the same
    // rooms out from under the same guests, and no bedroom in it holds anything a guest engages.
    // MOVED AT G-038c WITH ITS SIBLING, `62aebaef31a6b85b` -> `f0c6311efe764342`, for the one
    // cause the plain row gives PLUS one this arm alone reaches, and this is the FIRST TIME IN
    // FOURTEEN MOVES THAT THE THIRD CAUSE IS BEHAVIOURAL. This arm builds, and
    // `builtRoomStartFloor` puts its walk on floor 1 — so its first build pays
    // `floorConstructionCostPence` as well as the room, and two of the nine rooms it used to
    // afford are now refused: **built 9 -> 7, insufficientFunds 21 -> 23, one
    // `floorConstruction` row of -500,000p, closing balance 107,000p -> 132,000p.** Demolitions
    // are unchanged at 20.
    //
    // THE SHARP CONTROL HOLDS FOR THE FOURTEENTH TIME AND IT IS SHARPER HERE THAN ANYWHERE: 19
    // evictions and 0 `evictedRoomUnusable`, unchanged, IN A GOAL THAT CHANGED WHAT THIS ARM
    // BUILDS. The churn schedule demolishes rooms by id from the bottom, and the two rooms it
    // can no longer afford are at the TOP of the walk — so the same rooms come down out from
    // under the same guests, and the counter that has held at 19 through thirteen shape changes
    // holds through a behavioural one.
    // MOVED AT G-023b-ii WITH ITS SIBLING, `f0c6311efe764342` -> `4bf093bbce011c4f`, for the one
    // cause the plain row gives and no third one this arm reaches: the build walk is unchanged
    // at **built 7, demolished 20, insufficientFunds 23**, because a guest that walks does not
    // change what a room costs. What moved is the same thing that moved there — **checkedOut
    // 7 -> 0, leftDissatisfied 42 -> 51**, with the balance following at 132,000p -> 72,500p —
    // and the conservation closing on both sides, 7+42+19 departed +7 in hotel and 0+51+19 +5.
    // **THIS ARM LOSES EVERY CHECKOUT IT HAD**, which is sharper than the plain arm's 4 -> 1 and
    // has the same cause one turn worse: it is the plain hotel with rooms being demolished under
    // it, so a guest that must now walk to the single lounge is competing for it against guests
    // whose own rooms keep vanishing. **It is the starved case, and it is recorded as the
    // starved case** — see the plain row for the well-provisioned measurement, where no outcome
    // moves at all.
    //
    // THE SHARP CONTROL HOLDS FOR THE FIFTEENTH TIME AND THIS IS THE HARDEST ONE IT HAS FACED:
    // **19 evictions and 0 `evictedRoomUnusable`, unchanged, IN THE GOAL THAT MADE GUESTS WALK.**
    // An eviction happens when `--demolish 360` takes a room out from under an OCCUPIED guest,
    // so it is a joint fact about the demolition schedule and about where guests are — and
    // where guests are is exactly what this goal changed. The count holding says the guests
    // being evicted are guests IN THEIR ROOMS, whose position travel does not move: a lodger
    // walks to its bed once and stays there. It is travel's own claim, tested by the one
    // counter in this file that could have refuted it.
    //
    // ==========================================================================================
    // MOVED AT G-038a-i, `4bf093bbce011c4f` -> `17c163b7169e3e03`, AND IT MOVES ALONE. **THE
    // PLAIN ARM'S HASH DOES NOT MOVE AT ALL** — `ddfe4e4000bf1dc4` on both sides — so this is the
    // first divergence in this file's history where the two siblings part company, and the
    // reason is the whole shape of the change.
    //
    // A WALL CANNOT CHANGE HOW FAR A GUEST GETS, ONLY WHICH CELL IT LANDS ON. Every candidate
    // landing spends the same budget, so arrival ticks are untouched — and **every counter in
    // this arm is byte-identical**: checkedOut 0, leftDissatisfied 51, evictedRoomGone 19,
    // insufficientFunds 23, built 7, demolished 20, five guests in the hotel at the horizon.
    // Measured paired, in one sitting, against `6b536e3`. What moved is `Guest.at` and nothing
    // else, which is exactly what a hash catches and no counter can.
    //
    // AND THE PLAIN ARM STAYS PUT BECAUSE ITS GUESTS NEVER FACE A CHOICE. `--build 240` packs
    // the player's rooms into blocks that fill every row of floor 1, so a journey there has a
    // row gap AND a column gap and there are several ways to spend one tick's budget; the
    // seeded plate the plain arm walks offers exactly one on every journey it produces. That is
    // the same geometric fact `travel.walls.report.test.ts` pins as the CLI default's control.
    //
    // THE SHARP CONTROL HOLDS FOR THE SIXTEENTH TIME: 19 evictions, 0 `evictedRoomUnusable`.
    // ==========================================================================================
    // MOVED AGAIN AT G-038a-ii-alpha, `17c163b7169e3e03` -> `137b3dff76f88a93`, AND THIS TIME
    // THE TWO SIBLINGS MOVE TOGETHER — which is itself the reading. G-038a-i's divergence was
    // behavioural and landed on the arm with a choice to make; this one is `World.stairs`, an
    // empty array on every world, so it moves every hash in the repo and no counter anywhere.
    // Every control in this arm still holds: checkedOut 0, leftDissatisfied 51, evictedRoomGone
    // 19, insufficientFunds 23, built 7, demolished 20, five guests at the horizon.
    //
    // MOVED AGAIN AT G-039b-alpha, `137b3dff76f88a93` -> `86a99eadfabb3e19`, AND THE SIBLINGS
    // MOVE TOGETHER AGAIN — for the third time, and for a third distinct reason. This one is
    // the SPINE: the seeded plate is a different plate, so the churn arm's player builds land
    // over different ground and the plain arm's guests can reach providers they could not.
    // **Unlike the last two, this one moves counters** — on the plain arm (see above). The
    // controls asserted below this line are what say which of them moved on THIS arm.
    //
    // ==========================================================================================
    // MOVED AGAIN AT G-038a-iii-a, `86a99eadfabb3e19` -> `18b389412e4f9365`, AND THIS TIME THE
    // SIBLINGS PART COMPANY AGAIN — THE PLAIN ARM DOES NOT MOVE AT ALL.
    //
    // That is the reading, and it is the change's own scope stated as a hash: this goal touched
    // ONLY the layout the PLAYER builds on. `roomCell`, `amenityCell` and `seededSpineCells` are
    // untouched, so a workload with no `--build` in it produces a byte-identical world. The
    // churn arm builds, so two things move in it: `World.corridors` gains the player's spine —
    // hashed state, and enough on its own — and every room the player builds sits one row
    // further back, because the near row is now that spine.
    //
    // **AND NOT ONE COUNTER MOVES ON THIS ARM.** checkedOut 0, leftDissatisfied 51,
    // evictedRoomGone 19, evictedRoomUnusable 0, insufficientFunds 23, built 7, demolished 20,
    // five guests at the horizon — every one of them asserted below this line and every one of
    // them unchanged. A hash that moves while every counter holds is exactly what this literal
    // is for: `Guest.at`, `Entity.at` and the corridor plan are state no counter reports.
    // ==========================================================================================
    // `18b389412e4f9365` -> `4ca40a2319b272bf` AT G-038a-iii-b, for the plain arm's cause: the
    // runner declares a stairwell and every basement journey is routed through it. Eviction is
    // this arm's subject and it still evicts — 19 -> 18, one guest fewer standing in a room at
    // the moment it is demolished, because the guests are elsewhere on the way to the stairs.
    // `4ca40a2319b272bf` -> `29c600242aed7db8` AT G-040a: `Guest.partyId` is hashed state and
    // every guest now carries one. **NOT ONE COUNTER MOVES**, which on this arm is the whole
    // claim — eviction is its subject and it still evicted exactly 18 on the tree that
    // paragraph was written against, and every counter named in the block above was asserted
    // below this line unchanged. **THAT SENTENCE IS NOW HISTORY: the assertion three lines down
    // reads 19, for the reason in the next paragraph.**
    //
    // `29c600242aed7db8` -> `daf4823b3fdaa4f7` AT THE G-041/G-042 MERGE, and this literal is
    // RE-MEASURED ON THE MERGED TREE rather than carried from either parent. **Both parents
    // moved this same literal from the same base** — `main` to `29c600242aed7db8` for G-040a's
    // `partyId`, the branch to `c37756a85a3f4f8c` for the re-derived need rates — so neither
    // parent's value can be correct here and hand-merging a hash is not a thing that can be
    // done. The two causes are independent and both are in this tree.
    //
    // **THE COUNTER THAT MOVES IS EVICTION, AND IT MOVES BACK: 18 -> 19.** The rates, not the
    // party: G-041 shortened `visitDurationTicks` 208 -> 98, so guests spend less of the day
    // walking to the basement and more of it standing in a room — and standing in a room at the
    // moment the player demolishes it is precisely what this arm counts. 19 is also the value
    // this arm carried before G-038a-iii-b's stairwell took it to 18; the stairwell's mechanism
    // (guests are elsewhere, on the stairs) is simply outweighed by the shorter errand.
    //
    // `daf4823b3fdaa4f7` -> `b1619296eccfbc0a` AT G-040b-ii, ONE CAUSE AND IT IS THE CONTENT LINE
    // the PLAIN arm's row describes. **THE COUNTER THAT MOVES IS EVICTION, 19 -> 24, AND THE
    // MECHANISM IS SPECIFIC TO THIS GOAL RATHER THAN A RESTATEMENT OF "MORE GUESTS".**
    //
    // A demolition evicts whoever is standing in the room. Until this goal a bedroom held ONE
    // lodger, so one demolition could cost at most one eviction; a pair shares a bedroom, so a
    // single `demolishRoom` can now take TWO guests at once. The counter is in GUESTS, so it
    // rises faster than the population does: +26% against +33% more arrivals, and its
    // neighbours move the other way (checkedOut 20, leftDissatisfied 43) as guests are removed
    // from the hotel before either clock can finish.
    //
    // **THE CONSERVATION CLOSES: 20 + 43 + 24 + 13 still in the hotel = 100 arrived**, and
    // `gaveUp` is zero here too.
    //
    // G-038b-i MOVES THIS LITERAL FOR THE SHAPE AND NOT FOR THE RUN: `b1619296eccfbc0a` ->
    // `1f87907208053fbe`, two new `World` fields and one new zero departure row (save v23), no
    // content and no behaviour. **20 + 43 + 24 + 13 still in the hotel = 100 arrived, exactly as
    // above**, and the new row is zero — this arm installs no lift either.
    //
    // G-057 MOVES THIS LITERAL FOR THE CONTENT DOCUMENT AND NOT FOR THE RUN:
    // `1f87907208053fbe` -> `2af307ac42e1fb88`, one cause, `World.contentHash`. The shipped
    // content gained `scenarios.json` and `economy.json` lost `startingCapitalPence`; the
    // opening balance is the same 500,000p at its new address and the shipped `seededStock` is
    // `supplementsCapital`, which is what the structural door always did. **20 + 43 + 24 + 13
    // still in the hotel = 100 arrived, exactly as above**, and `gaveUp` is still zero.
    // G-054 MOVES THIS LITERAL FOR THE RUN AND NOT FOR THE CONTENT:
    // `2af307ac42e1fb88` -> `fe199f507b18536c`, one cause, and it is the per-guest need
    // tie-break (`needTieBreakRank`, ADR-0078). `World.contentHash` is unchanged, no save bump,
    // no migration. **20 + 43 + 24 -> the evictions rise to 25, and 100 arrived still closes**,
    // and `gaveUp` is still zero.
    // G-052a MOVES THIS LITERAL FOR THE SHAPE AND NOT FOR THE RUN:
    // `fe199f507b18536c` -> `7da8674748116abb`, two causes and neither is behaviour — a new
    // `World.staff` field (save **v24**) and a `World.contentHash` that moves because the
    // shipped content gained `staff-roles.json`, plus one zero-amount `wages` line per night in
    // the ledger. The shipped scenario employs nobody, so no money moves. **20 + 43 + 25 and
    // 100 arrived still closes, exactly as above**, and `gaveUp` is still zero.
    // G-051a MOVES THIS LITERAL FOR THE CONTENT FINGERPRINT AND NOTHING ELSE:
    // `7da8674748116abb` -> `66a20aa1cda81bb5`, one cause — `World.contentHash`, because the
    // shipped content gained a star-tier table and three facility room types. No `World` field,
    // no save bump, no migration, and no ledger line. **20 + 43 + 25 and 100 arrived still
    // closes, exactly as above**, and `gaveUp` is still zero.
    // `66a20aa1cda81bb5` -> `3b5b0daf2b1790db`. G-051a SWEEP 1 MOVES IT AGAIN, FOR THE SAME ONE CAUSE AND STILL NOT BEHAVIOUR:
    //   `World.contentHash`, because MAJOR 1 repriced two `demolitionRefundBasisPoints` values in
    //   `room-types.json` (`hotel_spa` 5,000 -> 7,000bp, `conference_hall` 8,000 -> 6,000bp) so
    //   that no facility is dominated NET OF THE RESIDUAL the game already treats as money. No
    //   `World` field, no save bump, no migration, no ledger line — and no refund is ever PAID on
    //   this arm, because `--facilities` and `--buy-facility` both default to 0 and it seeds and
    //   buys none.
    //   **20 + 43 + 25 and 100 arrived still closes**, and `gaveUp` is still zero.
    // `3b5b0daf2b1790db` -> `8d8d01695c3b5fa5` AT G-059, AND IT **IS** BEHAVIOUR: the review
    //   scorer changed and the tally is world state. No `World` field, no save bump, no
    //   migration, no ledger line, and `World.contentHash` unmoved. **20 + 43 + 25 and 100
    //   arrived still closes**, and `gaveUp` is still zero — so the twenty-five evictions this
    //   arm exists to produce still happen, and still review at the floor as they always did.
    // `8d8d01695c3b5fa5` -> `6e6193cd6c82e881` AT G-066a: `World` gains `recentRemarks`, so the
    //   hashed document gains a key, and this arm's 88 departures fill the ring. **Save bumps to
    //   v25** with a real migration; `World.contentHash` unmoved, because the remark table is not
    //   injected content. **20 + 43 + 25 and 100 arrived still closes**, and `gaveUp` is still
    //   zero — so the twenty-five evictions this arm exists to produce still happen, and now say
    //   so out loud.
    // `6e6193cd6c82e881` -> `fb0f09a36a1d24d7` AT G-046: the door as a place, purely behavioural,
    //   no `World` field and no save bump. The eviction count this arm exists to produce moves by
    //   one (25 -> 24) because a guest spends its stay in slightly different places, and the
    //   conservation still closes.
    // `fb0f09a36a1d24d7` -> `cc271243434506ff` AT G-060: `World.contentHash` and nothing else,
    //   because ADR-0107 re-tabled `star-tiers.json`. No `World` field, no save bump, no
    //   migration, and the eviction count this arm exists to produce is unmoved.
    // `cc271243434506ff` -> `fff8c100622117ac` AT G-046b: a room is LEFT through its door,
    //   purely behavioural, no `World` field and no save bump. **The eviction count this arm
    //   exists to produce is UNMOVED at 24**, which is the control — the player still knocks the
    //   same rooms down under the same guests, and what moved is how long they took to walk
    //   there. 16 + 48 + 24 + 12 = 100 and the conservation still closes.
    // `fff8c100622117ac` -> `c72a686c74a425b8` AT G-068: `World.contentHash` plus a 500,000p
    //   larger opening `startingCapital` line (ADR-0108). No `World` field, no save bump, no
    //   migration. **The eviction count this arm exists to produce is UNMOVED at 24**, which is
    //   the control: this arm's player demolishes on a cadence and builds nothing, so a bigger
    //   purse changes which numbers are in the ledger and not which rooms come down.
    // `c72a686c74a425b8` -> `55bed0e72f7f3b43` AT G-069: `World.contentHash` and NOTHING else,
    //   because E-016's re-derivation moved `floorConstructionCostPence` 500,000 -> 750,001. No
    //   `World` field, no save bump, no migration, and no ledger line - this arm's player
    //   demolishes on a cadence and BUILDS NOTHING, so it never opens a floor and never pays the
    //   charge at either value. **The eviction count this arm exists to produce is UNMOVED at
    //   24**, which is the control.
    // `55bed0e72f7f3b43` -> `9d07bfcb1da0362f` AT G-070: `World.contentHash` and NOTHING else,
    //   because ADR-0109 moved `floorConstructionCostPence` 750,001 -> 1,000,000. No `World`
    //   field, no save bump, no migration, and no ledger line - this arm's player demolishes on a
    //   cadence and BUILDS NOTHING, so it never opens a floor and never pays the charge at any of
    //   its three values. **The eviction count this arm exists to produce is UNMOVED at 24**,
    //   which is the control.
    // `9d07bfcb1da0362f` -> `2c6b89636bc9890f` AT G-075a: `World.contentHash` and NOTHING else,
    //   because ADR-0111 put a `purchaseCostPence` on every row of `item-types.json`. No `World`
    //   field, no save bump, no migration, and no ledger line - this arm's player demolishes on a
    //   cadence and PLACES NO ITEM, so it never pays the new charge. **The eviction count this
    //   arm exists to produce is UNMOVED at 24**, which is the control.
    expect(hashState(churn)).toBe('2c6b89636bc9890f');
  });

  it('and it really does evict, or this arm is the plain one wearing a different name', () => {
    expect(evictedGuests(churn.guestOutcomes)).toBeGreaterThan(0);
    // 24 -> 25 AT G-054. One more guest is in a room at the tick the demolish walk takes it,
    // because guests now spend their stays in different places.
    // 25 -> 24 AT G-046. One fewer guest is in a room at the tick the demolish walk takes it,
    // because a guest that is walking to a doorway is out of its room for one tick longer.
    expect(evictedGuests(churn.guestOutcomes)).toBe(24);
    expect(hashState(churn)).not.toBe(hashState(runWorkload(0, 0)));
  });

  it('and G-015 says WHICH KIND, which this workload could not report before', () => {
    // ============================================================================
    // NINETEEN AND ZERO, UNCHANGED ACROSS G-027a — AND THE ROUTE BACK TO IT IS THE EVIDENCE.
    //
    // The split held at 19 / 0 for five goals. It went to 19 / 16 the moment ADR-0017 tripled
    // the stay: at an arrival every 32 ticks the hotel then held forty-five guests instead of
    // fifteen, so a room on floor 1 was far more likely to be OCCUPIED on the tick
    // `--demolish 360` took the ground-floor room beneath it away. The demolition rate did
    // not change; the occupancy it landed on did.
    //
    // ADR-0021 restored the occupancy to fifteen, and the sixteen went away exactly. **That
    // is an independent confirmation of the mechanism the tick-cost ruling was made on**,
    // from a different instrument, measured rather than argued: a counter that only moves
    // with the concurrent population, moving back when the population does.
    //
    // The split earned its keep twice over. A single `evicted` counter would have gone 19 ->
    // 35 -> 19 and said nothing about which half did it.
    // ============================================================================
    // 19 -> 24 AT G-040b-ii, AND THE SPLIT IS UNCHANGED — every eviction in this run is still a
    // room that GONE rather than one made unusable, which is what the demolish walk does. The
    // block on the hash above carries why the count moved: a bedroom holding a pair loses two
    // guests to one demolition.
    // 24 -> 25 AT G-054, AND THE SPLIT IS UNCHANGED — every eviction in this run is still a
    // room that is GONE rather than one made unusable, which is what the demolish walk does.
    // 25 -> 24 AT G-046, AND THE SPLIT IS UNCHANGED — every eviction in this run is still a
    // room that is GONE rather than one made unusable, which is what the demolish walk does.
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomGone')).toBe(24);
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    // Only a migration writes the third, so a run that never loaded a save must read zero.
    expect(departureCountOf(churn.guestOutcomes, 'evictedCauseUnrecorded')).toBe(0);
  });

  it('and every guest is still accounted for', () => {
    expect(churn.guestOutcomes.arrived).toBe(EXPECTED_GUESTS);
    expect(departedGuests(churn.guestOutcomes) + guestCount(churn.guests)).toBe(
      churn.guestOutcomes.arrived,
    );
  });
});
