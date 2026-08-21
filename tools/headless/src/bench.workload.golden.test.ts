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

/** Arrivals are a closed form over the schedule, not a number read off a run. */
const EXPECTED_ARRIVALS = Math.floor((TICKS - 1 - 1) / ARRIVAL_EVERY_TICKS) + 1;

describe('the I5 bench workload hashes to a committed literal', () => {
  const plain = runWorkload(0, 0);

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
    expect(hashState(plain)).toBe('418cf36055a3408c');
  });

  it('and its outcomes are the hand-checked ones, so the hash is not the only claim', () => {
    // A hash alone would move for any reason and say nothing about which. These are the
    // facts a reader can re-derive: if the hash moves and these hold, something changed in
    // state that outcomes do not cover; if these move too, the simulation changed.
    expect(plain.guestOutcomes.arrived).toBe(EXPECTED_ARRIVALS);
    // 75 WHERE IT WAS 225: a third of the arrivals, because ADR-0021 tripled the cadence to
    // hold the CONCURRENT population at the fifteen this benchmark was calibrated for.
    // `EXPECTED_ARRIVALS` is derived from `ARRIVAL_EVERY_TICKS` and re-derived itself; this
    // line is the arithmetic written out so a reader can check the derivation rather than
    // trust it.
    expect(plain.guestOutcomes.arrived).toBe(75);
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
    expect(departureCountOf(plain.guestOutcomes, 'checkedOut')).toBe(1);
    expect(departureCountOf(plain.guestOutcomes, 'leftDissatisfied')).toBe(67);
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
    expect(hashState(churn)).toBe('137b3dff76f88a93');
  });

  it('and it really does evict, or this arm is the plain one wearing a different name', () => {
    expect(evictedGuests(churn.guestOutcomes)).toBeGreaterThan(0);
    expect(evictedGuests(churn.guestOutcomes)).toBe(19);
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
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomGone')).toBe(19);
    expect(departureCountOf(churn.guestOutcomes, 'evictedRoomUnusable')).toBe(0);
    // Only a migration writes the third, so a run that never loaded a save must read zero.
    expect(departureCountOf(churn.guestOutcomes, 'evictedCauseUnrecorded')).toBe(0);
  });

  it('and every guest is still accounted for', () => {
    expect(churn.guestOutcomes.arrived).toBe(EXPECTED_ARRIVALS);
    expect(departedGuests(churn.guestOutcomes) + guestCount(churn.guests)).toBe(
      churn.guestOutcomes.arrived,
    );
  });
});
