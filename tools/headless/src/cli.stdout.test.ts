// Process-level tests for the CLI's stdout contract (G-006).
//
// These spawn the REAL CLI — the same way `bench.mjs` and the determinism gate do —
// because the exit criterion is about processes, not functions: "two runs of the same
// command produce byte-identical stdout". Comparison is `Buffer.equals` on raw bytes,
// never strings, so an encoding or BOM difference cannot hide.
//
// Two different escapes, two different tests:
//
//   RUN-TO-RUN (byte-identity, two spawns) catches anything that varies between runs
//   on one machine: timestamps, durations, unseeded ordering. It CANNOT catch
//   `toLocaleString`, because locale is stable per machine.
//
//   THE GOLDEN (an exact literal) catches machine-dependence: the three-OS CI matrix
//   runs it under different platform locales, so locale-aware formatting diverges
//   from the committed literal on some runner. It also pins the `days` line format
//   that `tools/gates/bench.mjs` string-matches (`days        ${DAYS}`).
//
// The golden's numbers are HAND-CHECKED against closed forms, not captured on faith
// (ADR-0007 — a golden captured rather than verified proves only that the code agrees
// with itself). For --days 2 --seed 42, 3 rooms, one arrival per 120 ticks:
//
//   ticks       2880    = 2 x 1440 (TICKS_PER_DAY)
//   arrived     24      = arrivals at ticks 1, 121, ..., 2761 = floor(2878/120) + 1
//   conservation        : 15 satisfied + 5 gave up + 0 evicted + 4 in hotel = 24
//   revenue     127500p = 15 satisfied stays x 8500p room rate
//   upkeep      -15000p = 2 nights x 3 rooms x 2500p
//   settlements 2       = one per completed night, exactly
//   ledger      17      = 15 payments + 2 settlement transactions
//   balance     112500p = 127500 - 15000
//
// G-007 MOVED THE STATE HASH AND NOTHING ELSE. `World` gained `grid` and every entity
// gained `at`, so `c268d067bad7f5b3` became `a55b468ceea4b928`. Every other line above
// is byte-identical, which is the point worth recording: giving the hotel a floor plan
// changed no simulated outcome — same arrivals, same satisfactions, same money to the
// penny. A grid that had quietly altered who got served would have shown up here first.
//
// G-008 MOVED IT AGAIN, AND AGAIN NOTHING ELSE: `a55b468ceea4b928` -> `40be459fe3a7083b`,
// because the shipped content gained `constructionCostPence` (which moves the fingerprint
// `World.contentHash` records) and `World` gained `buildOutcomes`. Every arrival, every
// satisfaction and every penny above is unchanged, which is the check that matters —
// giving the player a way to spend money must not alter a run in which nobody spends any.
// The report also gained three lines, all reading zero here because `--build` and
// `--demolish` default OFF.
//
// Where tests need content files (the --content contract), they use RUNTIME TEMP
// DIRECTORIES only — nothing content-shaped is committed where `check:content` or a
// future widening of it could trip over fixture data.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { itemTypesSchema, roomTypesSchema } from '@hotelsim/content';
import {
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
  SCENARIOS_PATH,
  STAFF_ROLES_PATH,
  DEMAND_PATH,
  STAR_TIERS_PATH,
} from './content-loader.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

type CliResult = { readonly status: number | null; readonly stdout: Buffer; readonly stderr: Buffer };

function runCli(args: readonly string[]): CliResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: ROOT,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The default 2-day run, spawned once and shared by the tests that compare against it. */
let cachedDefault2Day: CliResult | undefined;
function default2Day(): CliResult {
  cachedDefault2Day ??= runCli(['--days', '2', '--seed', '42']);
  return cachedDefault2Day;
}

/** The --json document for the same run, shared by the direct-spawn and through-pnpm tests. */
const GOLDEN_2_DAYS_SEED_42_JSON = {
  schema: 4,
  input: {
    seed: 42,
    ticks: 2880,
    rooms: 3,
    amenities: 1,
    // G-051a. Additive, and ZERO on every invocation this file pins: an amenity makes a hotel
    // work and a facility only climbs the star ladder, so the flag that seeds one defaults off.
    facilities: 0,
    arrivalEveryTicks: 120,
    buildEveryTicks: 0,
    demolishEveryTicks: 0,
    loanEveryTicks: 0,
    // G-051a sweep 1. The star ladder's only PAID rung, and it is OFF here: this golden is the
    // hotel this runner has always described. `stars.report.test.ts` is where it is turned on.
    buyFacilityEveryTicks: 0,
    // G-051b. `commanded` — the LABORATORY CLAMP, which is the default and is what this golden
    // has always been: the host issues one `guestArrives` every 120 ticks and the simulation
    // generates none of its own. Additive, so `SUMMARY_SCHEMA_VERSION` stays 4. **It is the
    // REGIME SLOT of every arrival figure below** (`CLAUDE.md` rule 4): before this key the
    // document could not say which of two experiments it was.
    market: 'commanded',
  },
  world: {
    tick: 2880,
    days: 2,
    // SEVEN SINCE G-051a — the CONTENT TABLE's size, not this building's. Three facility room
    // types joined it and this run seeds none of them, which `entities: 11` below is the check
    // on rather than this comment.
    roomTypes: 7,
    needTypes: 4,
    // 11 rather than 9 since G-013, and the two are ITEMS THAT PROVIDE: an `arm_chair` in
    // the lounge and a `vending_machine` in the games room. Both arrive because their room
    // types `require` them and `seedRoom` furnishes what it seeds — the same one door
    // `buildRoom` uses, which is exactly what makes those items REACHABLE and therefore
    // what makes `guest_comfort` legal content at all (`assertNeedsAreSatisfiable`).
    // Derivation: 3 bedrooms + 3 beds + 3 amenity rooms + 2 provider items.
    entities: 11,
    // MOVED AT G-019 from `83317dc2ebdad0ae`, for two causes and neither is a behaviour
    // change: `guest-rules.json` gains the review scale (so the content fingerprint moves,
    // as it does for every content addition) and `World` gains `reviewOutcomes`, which is
    // hashed state. Every guest, need and money number in this document is UNTOUCHED, which
    // is the hand-checked evidence; `review.boundary.test.ts` is the general form of it.
    //
    // MOVED AGAIN AT G-023a from `d5bf3db9bb6f29ed`, for ONE cause and not a behaviour
    // change: `Guest.at` is hashed state (G-023a). No content moved — this goal ships no
    // content at all — so the fingerprint is the same one. THE EVIDENCE IS THIS DOCUMENT:
    // it is compared field by field, and `stateHash` is the ONLY field in it that differs.
    // Four guests are still in the hotel, 24 still arrived, 15 still satisfied.
    // MOVED AGAIN AT θ-b1 from `e1f94931bdab91b5` (and again inside that goal, when ADR-0026's
    // amendment changed what the stock counts), for TWO causes and neither is a behaviour
    // change IN THIS HOTEL: `Guest.dissatisfaction` is hashed state, and `guest-rules.json`
    // gains two fields so the content fingerprint moves with it. THE EVIDENCE IS THIS
    // DOCUMENT: it is compared field by field, and `stateHash` plus the new zero row are the
    // only things in it that differ. Four guests still in the hotel, 24 still arrived, 4 still
    // checked out, 16 still gave up.
    // MOVED AGAIN AT θ-b2 from `8d173796369a55b2`, for TWO causes and neither is a behaviour
    // change IN THIS HOTEL: the departure table gains a SEVENTH ROW (`visitEnded`), which is
    // hashed state, and `guest-rules.json` gains `visitDurationTicks` so the fingerprint moves
    // with it. **This content declares a lodging need, so no guest under it can be a visitor and
    // the new branch is unreachable at any value of the new field.** THE EVIDENCE IS THIS
    // DOCUMENT, field by field: `stateHash` and the new zero row are the only things that differ.
    // Four guests still in the hotel, 24 still arrived, 4 still checked out, 16 still gave up.
    // MOVED AGAIN AT G-028b from `83070924e2b10af8`, for ONE cause and it IS a behaviour change
    // — the first in this golden's history that is. `reviewOf` and `met` now read how long the
    // hotel left each need unserved rather than where the need stood at the departure instant
    // (ADR-0037), and both `reviewOutcomes` and the `met`/`unmet` columns are hashed state.
    // **THE CONTROL IS NARROWER HERE THAN AT ANY PREVIOUS MOVE AND THAT IS SAID RATHER THAN
    // GLOSSED**: the guest block, the ledger, the rooms and the build counters are compared
    // field by field and are unchanged — 24 still arrived, 4 still checked out, 16 still gave
    // up, four still in the hotel, the same 7 transactions and the same 510,000p balance —
    // while the need rows' met/unmet and the review distribution move because their definition
    // did. `unservedTicks` and `instanceTicks` are counted in ticks and are UNCHANGED, which is
    // what separates a change of unit from the simulation behaving differently.
    // MOVED AGAIN AT G-036c to `2b1ba508644bcf7c`, for TWO hashed-state causes and NO
    // behaviour: `buildOutcomes` gained `resized`, `moved`, `displaced` and two refusal
    // counters (save v20), and `World.contentHash` moved because `room-types.json` gained
    // `accessRule`. **THE CONTROL IS THE FULL DOCUMENT AGAIN** — every other field here is
    // byte-identical, including the need rows and the review distribution that G-028b had to
    // exclude: 24 arrived, 4 checked out, 16 gave up, four still in the hotel, the same 7
    // transactions and the same 510,000p. B6 CAN be inert here and it is checked rather than
    // assumed: the shipped `standard_room` is `guestsOfThisRoom`, and the only need it provides
    // is the LODGING need, which the engagement pass skips by name — so there is nothing in a
    // bedroom for a stranger to be turned away from until a player puts something there.
    // MOVED AGAIN AT G-038c to `3f2e876b38fa4517`, for ONE hashed-state cause, NO behaviour and
    // NO save bump: `World.contentHash` moved because `economy.json` gained
    // `floorConstructionCostPence` and `guest-rules.json` gained `maxLodgingFloorsFromEntrance`
    // (ADR-0047 B8). **NOTHING IN `World` GAINED A FIELD** — a floor charge is a ledger
    // transaction, and the reach is read from content on every lodging search, so neither is
    // state and the schema stays at v20. **THE CONTROL IS THE FULL DOCUMENT AGAIN**: every other
    // field is byte-identical apart from the two new zero counters, and both are zero for
    // structural reasons rather than contingent ones — this run issues no build command, and
    // every seeded room stands on the entrance floor.
    //
    // MOVED AGAIN AT G-038a-ii-alpha to `6f719333f63082c7`, for ONE hashed-state cause and NO
    // behaviour: `World` GAINED `stairs`, an EMPTY array, and the save went to **v21**. The
    // harness declares no stairwell — that is a decision, recorded in
    // `travel.stairs.report.test.ts` — so `stairLeg` in `guests.ts` reads the empty set as *"the
    // floor axis spends unconditionally"* and every guest in this run walks exactly where it
    // walked before. **THE CONTROL IS THE FULL DOCUMENT AGAIN**: every other field of this
    // golden is byte-identical, which is what says the field was added and nothing moved.
    // MOVED AGAIN AT G-039b-alpha to `5103ab9588f8b6e9`, and THIS ONE IS A BEHAVIOUR CHANGE —
    // the first on this golden since G-023b-ii. The seeded plate gained a SPINE at `minRow` and
    // moved one column right and one row back, so the three bedrooms and the three basement
    // amenities all stand somewhere new and every journey in this run is a different journey.
    // The need rows, the review distribution and the mean move with it; **the departure table,
    // the ledger, the revenue, the closing balance, the entity count and the validity block do
    // NOT**, which is the hand-check that says the hotel changed shape rather than changing
    // outcome. See the need-row block above for the numbers.
    //
    // MOVED AGAIN AT G-038a-iii-b to `73ec70f0ec5bf424`, and this one IS a behaviour change:
    // `schedule` now declares a STAIRWELL at `(column 1, row 0)` on every floor of the plot
    // (`shaftCells`), so the floor axis stops spending from wherever a guest stands and every
    // journey between the three bedrooms on floor 0 and the amenity in the basement goes
    // through that column. **This is the change the G-038a-ii-alpha row above promised**: it
    // added `World.stairs` as an EMPTY array and said every guest walks exactly where it
    // walked, which was true until this commit and is the reason the field was inert.
    // **THE CONTROL IS THE SAME CONTROL G-039b-alpha USED, AND IT HOLDS**: the departure table,
    // the ledger, the revenue, the closing balance, the entity count and the validity block are
    // byte-identical — 24 arrived, 4 checked out, 16 gave up, 4 still in the hotel, 7
    // transactions, 510,000p. The need rows, the review distribution and the mean move; see the
    // need-row block above for the numbers and the mechanism.
    //
    // MOVED AGAIN AT G-040a to `72d843e8af79257c`, for ONE hashed-state cause and NO behaviour:
    // every `Guest` GAINED a `partyId`, and the save went to **v22**. The shipped party size is
    // PINNED AT ONE — `stepGuests` writes `partyId = id` and nothing else writes the field — so
    // no room is shared, no arrival is doubled and no journey is different. **THE CONTROL IS THE
    // FULL DOCUMENT AGAIN, AND IT IS THE STRONGEST FORM OF IT THIS GOLDEN HAS CARRIED**: every
    // other field here is byte-identical, and the same claim was taken at the CLI over three
    // separate invocations — `--days 20 --seed 42`, `--days 40 --seed 7`, `--days 10 --seed 1` —
    // where the ONLY line differing from HEAD in a 48-line report is `state hash`. 24 arrived,
    // 4 checked out, 16 gave up, 4 still in the hotel, 7 transactions, 510,000p, the same need
    // rows, the same review distribution and the same mean.
    //
    // AND MOVED AGAIN AT THE G-041/G-042 MERGE to `bed08ab833ca39a4`, WHICH IS RE-MEASURED ON THE
    // MERGED TREE AND IS NEITHER PARENT'S VALUE. `main` took this literal to `72d843e8af79257c`
    // for the `partyId`; the branch took THE SAME literal from THE SAME base to
    // `5081486e2a7ec39a` for the re-derived need rates. **Both parents moved it, so neither
    // value is correct here and hand-merging a hash is not a thing that can be done.**
    //
    // **THE GUEST AND MONEY BLOCKS ARE STILL BYTE-IDENTICAL AND THAT IS THE CONTROL**: 24
    // arrived, 4 checked out, 16 gave up, 4 in the hotel, 7 transactions, 34,000p revenue,
    // -24,000p upkeep, 510,000p balance, 6 valid rooms, the 0/0/0/0/0/0 invalidity tally. The
    // rate half of the cause is the branch's and it moves exactly the three engagement need rows
    // and the review distribution; the party half moves the hash and nothing else. `night_rest`
    // does not move at all — 4 met, 16 unmet, 3,000 ticks unserved — because in this hotel that
    // row counts the sixteen who never get a room, and how fast a bed refills does not give
    // anybody one. `guest-rules.json` moved with the need table (`visitDurationTicks` 208 -> 98,
    // `dissatisfactionCapacityTicks` 431 -> 301, both DERIVED from the need table rather than
    // dialled), so `World.contentHash` moves too.
    //
    // ==========================================================================================
    // AND MOVED AGAIN AT G-040b-ii to `6061c97185a796a5`, WHICH IS A BEHAVIOUR CHANGE AND IS THE
    // FIRST ONE ON THIS GOLDEN WHOSE ONLY CAUSE IS A CONTENT LINE. `guest-rules.json` declares
    // `partySizeWeights: [3, 1]`, whose realised cycle is **1, 1, 2** — two parties arriving
    // alone, then a pair, for ever (ADR-0072; `party.content.test.ts` pins it off a run). So
    // FOUR GUESTS WALK IN FOR EVERY THREE ARRIVAL COMMANDS, and the commands are unchanged:
    // this run issues 24 of them, exactly as it always has, and 24 x 4/3 = **32 arrivals**.
    //
    // **THE PART THAT IS NOT MERELY "A THIRD MORE GUESTS": A PAIR SHARES ONE ROOM.** This hotel
    // has three bedrooms of capacity 2, so where it used to hold three lodgers it can now hold
    // more — and the checkout row rises 4 -> 6 while `arrived` rises by a third. Both halves of
    // `capacity` are visible in one document for the first time since ADR-0053 measured that the
    // field had no reader at all.
    //
    // **THE CONTROL IS THE MONEY, AND IT IS EXACT.** `payForStay` is per GUEST (ADR-0072 ruling
    // 2), so revenue is `checkedOut x nightlyRatePence` and nothing else: 6 x 8,500p =
    // **51,000p**, against 4 x 8,500p = 34,000p before, and the ledger gains exactly two
    // transactions (7 -> 9) for the two extra checkouts. Upkeep is byte-identical at -24,000p —
    // the same six rooms for the same two nights, whoever is asleep in them — which is the
    // sentence ADR-0072 narrowed *"a party is one booking"* into: one booking in the player's
    // language, N transactions in the ledger, and the upkeep side of the margin unmoved.
    //
    // **AND EVERYTHING STRUCTURAL IS UNTOUCHED**: 11 entities, 6 valid rooms, the 0/0/0/0/0/0
    // invalidity tally, 500,000p of capital, 750,000p of scrap, 2 settlements, no debt, and the
    // whole build and loan blocks. No save bump and no new `World` field — the schema is still
    // v22 and `partyId` was already hashed state at G-040a. The hash moves for TWO reasons at
    // once and neither is a code change: `World.contentHash` moves because the content document
    // gained a field, and the run itself is genuinely different.
    // ==========================================================================================
    // ==========================================================================================
    // THE THREE ENGAGEMENT ROWS MOVED AT G-054, AND THIS DOCUMENT IS WHERE THE GOAL IS EASIEST
    // TO READ. Paired, one sitting, the two arms one character apart in `reserve`
    // (`pressure <` against `pressure <=`), exact deterministic counts on this exact invocation:
    //
    //     comfort         22 met /  5 unmet,   944 unserved ticks  ->  17 / 10,  1,573
    //     entertainment   22 met /  5 unmet, 1,026 unserved ticks  ->  19 /  8,  1,371
    //     nourishment     16 met / 11 unmet, 1,476 unserved ticks  ->  23 /  4,    798
    //
    // **NOURISHMENT WENT FROM WORST-SERVED TO BEST-SERVED, AND THAT IS THE DESIGN REASSERTING
    // ITSELF RATHER THAN A NUMBER MOVING.** It is the one need with TWO routes — the café is a
    // room and the vending machine is an item — so on a hotel this starved it ought to be the
    // best-served row, and ADR-0078 recorded that it was the WORST and called the mechanism
    // "inverted". The inversion was the tie-break: every guest reached for `guest_comfort`
    // first because `guest_comfort` sorts first, and nourishment was pursued only by guests
    // that had already got the other two. With the tie settled per guest
    // (`needTieBreakRank`), supply decides again and the row order follows provider count.
    //
    // The `stateHash` moves for ONE cause and it is that behaviour change: no content moved,
    // no `World` field was added, `SAVE_SCHEMA_VERSION` is unchanged at 23 and no migration is
    // owed. Everything structural in this document is untouched.
    // ==========================================================================================
    // ==========================================================================================
    // AND MOVED AGAIN AT G-052a to `614f7b6eda90b4c2`, FOR TWO HASHED-STATE CAUSES AND NO
    // BEHAVIOUR AT ALL. The money loop's third term landed — `CLAUDE.md` defines the loop as
    // *"room revenue against WAGES and upkeep, settled nightly"* and the ledger had nine reasons
    // and none was a wage.
    //
    //   1. `World` GAINED `staff`, an empty payroll, and the save went to **v24**.
    //   2. `World.contentHash` MOVED, because `SimContent` gained a `staffRoles` table and
    //      `Scenario` gained an `openingStaff` key.
    //
    // **AND THE LEDGER GAINED TWO LINES, WHICH IS THE ONLY VISIBLE CHANGE IN THIS DOCUMENT**:
    // settlement books one `wages` transaction a night, unconditionally, exactly as it books one
    // `upkeep` a night — so `ledger` reads 11 where it read 9, and both new lines are ZERO.
    //
    // **THE CONTROL IS THE WHOLE DOCUMENT AND IT IS EXACT.** The shipped scenario employs
    // NOBODY (`openingStaffSchema` carries that ruling and the measurement behind it), so no
    // money moves: 32 arrived, 6 checked out, 21 gave up, 5 in the hotel, 51,000p revenue,
    // -24,000p upkeep, **527,000p balance unchanged to the penny**, the same four need rows, the
    // same review distribution, the same mean, 11 entities, 6 valid rooms, the same 0/0/0/0/0/0
    // invalidity tally, 750,000p of scrap, no debt, and the whole build and loan blocks. A wage
    // of zero is a line in the ledger and not a change to the economy.
    // ==========================================================================================
    // ==========================================================================================
    // MOVED AGAIN AT G-051a to `de29b5283ad28f0c`, FOR ONE HASHED-STATE CAUSE AND NO BEHAVIOUR:
    // `World.contentHash`, because the shipped content gained `star-tiers.json` and three
    // FACILITY room types. **`World` GAINED NO FIELD, the save stayed at v24 and there is no
    // migration** — the star rating is DERIVED at the moment of reporting and stored nowhere,
    // which is I4's own discipline applied one quantity over (see the header of `rating.ts`).
    //
    // **THE CONTROL IS THE WHOLE DOCUMENT AND IT IS EXACT.** A facility serves no need and
    // `--facilities` defaults to 0, so this run seeds none and no guest could reach one if it
    // did; nothing in `packages/sim` reads a rating. 32 arrived, 6 checked out, 21 gave up, 5 in
    // the hotel, 51,000p revenue, -24,000p upkeep, 527,000p balance to the penny, the same four
    // need rows, the same review distribution, the same mean, 11 entities, 6 valid rooms, the
    // same 0/0/0/0/0/0 tally, 750,000p of scrap, no debt, and the whole build and loan blocks.
    // What is NEW in this document is the `rating` block and `input.facilities`, both additive,
    // so `SUMMARY_SCHEMA_VERSION` stays 4.
    // ==========================================================================================
    // MOVED AGAIN AT G-051a SWEEP 1 to `67e13a16221d2082`, ONE cause and no behaviour: two
    // `demolitionRefundBasisPoints` values were repriced (MAJOR 1 — the Spa was dominated net of
    // its residual). **The control is the whole document**, and it is exact: nothing here scraps
    // a room, so no refund is paid and every other field is byte-identical. What is NEW in this
    // document is one key, `input.buyFacilityEveryTicks`, additive, so `SUMMARY_SCHEMA_VERSION`
    // stays 4.
    // MOVED AGAIN AT G-059 to `bf65fd6522ddf4f1`, ONE cause: the review tally is world state and
    // the scorer records different scores. See the `distribution` block below for both halves of
    // the move and the text golden's `state hash` line for the control.
    // MOVED AGAIN AT G-066a to `00000ef70ad7566b`, TWO HASHED-STATE CAUSES AND NO BEHAVIOUR.
    //
    //   1. `World` GAINED `recentRemarks`, a bounded ring of what recent departures said, and
    //      the save went to **v25** with a real 24 -> 25 migration and a `without-remarks.ts`
    //      stripper. That alone moves the hash: `worldToJson` is an identity cast, so a new key
    //      lands in the hashed document whether or not anything is in it.
    //   2. IT IS NOT EMPTY ON THIS RUN. 27 guests depart over two days (6 checked out, 21 gave
    //      up), all 27 of them under the 48 the ring keeps, so the ring holds 27 records.
    //
    // **`World.contentHash` DID NOT MOVE, AND THAT IS THE POINT OF THE WHOLE DESIGN.**
    // `guest-remarks.json` is deliberately outside `bindContent`'s fingerprint (G-065), and what
    // is stored here is the four values a line is made FROM and never the line — so rewording a
    // joke moves nothing in this document, and no id into the remark table can dangle.
    //
    // **THE CONTROL IS THE WHOLE DOCUMENT AND IT IS EXACT.** Nothing in `packages/sim` reads the
    // ring: 32 arrived, 6 checked out, 21 gave up, 5 in the hotel, 51,000p revenue, -24,000p
    // upkeep, 527,000p balance to the penny, the same four need rows, the same review
    // distribution, the same mean, 11 entities, 6 valid rooms, the same 0/0/0/0/0/0 tally,
    // 750,000p of scrap, no debt, the same rating block and the whole build and loan blocks. NO
    // key is added to this document at all, so `SUMMARY_SCHEMA_VERSION` stays 4 — showing the
    // feed is G-066b's, and it is a report line this goal deliberately did not write.
    // G-046: `00000ef70ad7566b` -> `6191199638412542`. PURELY BEHAVIOURAL — no `World` field, no
    // save bump, no migration, `World.contentHash` unmoved. A room is entered through its doorway
    // now, so guests stand in different cells and `Guest.at` is hashed state. Four lines of the
    // text golden move with it and not one other character: three need rows and this hash.
    stateHash: '6191199638412542',
  },
  guests: {
    arrived: 32,
    // SUMMARY SCHEMA 2 (G-015). `satisfied`, `unsatisfied` and `evicted` are GONE — not
    // renamed, not defaulted, absent — and this table stands where they stood. The counts
    // are the same counts, which is what makes the bump a reshape of the report rather
    // than a change to the simulation.
    departures: [
      { reason: 'checkedOut', count: 6 },
      // θ-b2, ADDITIVE AND WITHOUT A SCHEMA BUMP — `report.ts`'s published policy: a new row
      // renames nothing and removes nothing, so every schema-3 consumer still finds every
      // string it knew. Zero here because this content declares a lodging need and a visitor
      // therefore cannot exist under it.
      { reason: 'visitEnded', count: 0 },
      { reason: 'gaveUp', count: 21 },
      // G-038b-i, ADDITIVE AND WITHOUT A SCHEMA BUMP — `report.ts`'s published policy again: a
      // new row renames nothing and removes nothing, so every schema-4 consumer still finds
      // every string it knew. Zero here because `world.lift` is `null` in every world any
      // harness in this project produces, so the branch that writes it is unreachable.
      { reason: 'gaveUpWaitingForLift', count: 0 },
      { reason: 'leftDissatisfied', count: 0 },
      { reason: 'evictedRoomGone', count: 0 },
      { reason: 'evictedRoomUnusable', count: 0 },
      { reason: 'evictedCauseUnrecorded', count: 0 },
    ],
    inHotel: 5,
    stuck: 0,
    orphanedReservations: 0,
    inInvalidRooms: 0,
  },
  // THE NEED VECTOR, PER NEED TYPE (G-012), NOW CARRYING WHAT DELIVERED IT (G-013). Every
  // row sums to the 20 guests that have departed — 15 satisfied plus 5 unsatisfied — which
  // is the conservation law the report checks, and is the reason this block is worth
  // reading rather than glancing at.
  //
  // `metByItem` IS THE ONLY ATTRIBUTION FIELD, and by-room is a subtraction the renderer
  // performs. A `metByRoom` field shipped for one critique round and was removed: carried
  // beside its own source it invited a report violation asserting `metByRoom + metByItem
  // === met`, which is an algebraic identity and could not fail.
  //
  // READ THE `by room` / `by item` COLUMNS: THEY ARE THE WHOLE OF G-013 IN FOUR LINES.
  //
  //   guest_comfort        0 by room (11 - 11), 11 by item — an ITEM-ONLY need. The lounge provides
  //                        nothing; the arm chair in it provides everything. If items had
  //                        stopped providing, this row would read 0 met.
  //   guest_entertainment  10 by room, 0 by item — a ROOM-ONLY need, unchanged in kind
  //                        since G-012.
  //   guest_nourishment    9 by room, 6 by item — THE INTERESTING ONE. The café is a room
  //                        and the vending machine in the games room is an item, and guests
  //                        use both. A registry that had quietly become "rooms, plus a
  //                        special case" could not produce this row.
  //                        THE SPLIT INVERTED AT G-014a (it was 6 by room, 9 by item) and
  //                        that inversion IS the goal: the shipped table now ranks a café
  //                        above a vending machine, so guests eat at the café and fall back
  //                        to the machine when it is busy. WATCH #1 found the opposite —
  //                        five cafés serving nobody for sixty days while everyone queued at
  //                        the machines — because nothing in the data had ever said which
  //                        was the better place to eat.
  //                        AND NOTHING ELSE IN THIS BLOCK MOVED. Every met and unmet count
  //                        here is identical to the one G-013 pinned; the only difference in
  //                        the whole golden is which provider served the same satisfactions
  //                        and the state hash that follows from it. That is the cleanest
  //                        available evidence that G-014a changed WHERE guests go and not
  //                        whether they are served.
  //   night_rest           15 by room, 0 by item — and it can never be anything else: a
  //                        guest lodges in a ROOM, and `bindContent` refuses content in
  //                        which an item provides the lodging need.
  //
  // THE MET/UNMET SPLIT MOVED SINCE G-012, FOR TWO LINKED REASONS. Nourishment gained a
  // second provider (the vending machine), so it is met more often — and that pushed it to
  // met-with-nothing-unmet on G-012's own criterion invocation, leaving only ONE need type
  // straddling where that criterion requires two. `guest_comfort.satisfyTicks` rose 60 ->
  // 150 to restore the second. It is compensation for this goal's registry work, not an
  // independent balance decision, and it has no sweep behind it; see `needTypeSchema`.
  //
  // ============================================================================
  // AND THE MET/UNMET SPLIT MOVED AGAIN AT G-014b, WHICH IS THE FIRST TIME THIS GOLDEN HAS
  // RECORDED THE SIMULATION SERVING **MORE** NEEDS. Cause 1 of the three in
  // `bench.workload.golden.test.ts`'s list — the simulation changed, and here is what and
  // why, measured at this exact invocation:
  //
  //                        G-014a           G-014b     abandoned
  //   guest_comfort        11 met, 9 unmet  13 / 7         3
  //   guest_entertainment  10 met, 10 unmet 14 / 6         1
  //   guest_nourishment    15 met, 5 unmet  16 / 4         5
  //   night_rest           15 met, 5 unmet  15 / 5         0   <- UNCHANGED
  //
  //   36 engagement satisfactions -> 43, over the same 20 departed guests, at the cost of
  //   9 abandonments between them.
  //
  // WHY MORE RATHER THAN FEWER, AND IT IS THE POINT OF THE GOAL RATHER THAN A SURPRISE. A
  // guest that abandons does so for the need with the MOST pressure — the one closest to
  // EMPTY — so with three needs sharing one lodging budget the margin buys
  // triage. Total commitment made a guest finish whatever it started even while another need
  // burned down; the margin lets it switch once the gap is wide enough to be worth the swap.
  //
  // NIGHT_REST IS UNMOVED, AND THAT IS THE CONTROL. The lodging need is never a candidate in
  // the scoring loop, so a change that had accidentally let a guest abandon its ROOM would
  // show here and nowhere else. 15/5 is the same 15/5 G-012, G-013 and G-014a all pinned.
  //
  // THE SAME CHANGE READS THE OTHER WAY IN A STARVED HOTEL, AND THAT IS ASSERTED ELSEWHERE
  // RATHER THAN DESCRIBED HERE. `hysteresis.report.test.ts` owns the era comparison and the
  // amenity sweep; its starved arm asserts that the margin COSTS satisfaction when providers
  // are scarce, and its saturated arm asserts that it changes nothing when they are
  // plentiful. No figure from either is restated in this comment, because nothing in this
  // file pins one.
  // ============================================================================
  needs: [
    // RE-RECORDED AT G-027b, and the direction is the goal's own headline rather than noise:
    // a need is a stock that is refilled and decays again, so a two-day guest is served far
    // more often than one that could finish a task once. Every engagement need moves from
    // roughly half met to four fifths met. `night_rest` does not move at all — 4 met, 16 unmet
    // — because it is capacity that decides it: three rooms against 24 arrivals over two days.
    //
    // AND THE TWO G-028a COLUMNS JOIN THEM WITHOUT MOVING ANY OF THEM. The counters are new
    // state that nothing in the simulation reads, so every figure above and below is the one
    // this golden already carried; what moved is the state hash and these four pairs. The
    // denominator is the same for all four rows because every departed guest in this run
    // carried the whole vector, and `night_rest` carries the largest numerator — three rooms
    // against 24 arrivals is a hotel that mostly cannot give anybody a bed.
    //
    // AND AT G-028b THE `met`/`unmet` SPLIT MOVED BECAUSE ITS QUESTION DID (summary schema 4).
    // It counted instances above their want line at the departure instant; it counts instances
    // whose per-need BAND was the top one — unserved for at most a fifth of that guest's stay.
    // The two tick columns beside it are UNCHANGED, which is the control: the hotel did exactly
    // what it did before, and the column that moved is the one whose definition moved.
    //
    // READ THE COMFORT ROW AGAINST ITS OWN SHARE, because it is the clearest case in the file:
    // 1,539 unserved ticks of 8,640 is nearly a fifth of the stay, so half the instances that
    // used to count as met fall outside the top band. `guest_nourishment`, unserved for less,
    // keeps more of them. That ordering is the whole content of the redefinition.
    //
    // ==========================================================================================
    // RE-RECORDED AT G-023b-ii, WHICH DECLARED `guestCellsPerTick: 3`, AND THE THREE ROWS MOVE
    // IN TWO DIRECTIONS. Read them together or the story is invisible:
    //
    //     row                  met         by item   unserved ticks
    //     guest_comfort        8  -> 12    8 -> 12   1,539 -> 1,207   BETTER
    //     guest_entertainment  8  ->  6    0 ->  0   1,961 -> 1,945   worse
    //     guest_nourishment    12 -> 10    4 ->  4   1,254 -> 1,673   worse
    //     night_rest           4  ->  4    unchanged 3,000 -> 3,000   UNCHANGED
    //
    // **THE LODGING ROW DOES NOT MOVE AT ALL, AND IT IS THE CONTROL.** Three rooms against 24
    // arrivals is decided by capacity; a guest with no room is going nowhere, so travel cannot
    // touch it. That row is the same fact the six-room arm in
    // `dissatisfaction.content.test.ts` reports from the other end.
    //
    // **AND `guest_comfort` GETTING BETTER IS THE FINDING, NOT AN ANOMALY.** The naive reading
    // of travel is "everything a guest must walk to gets worse", and the shipped default hotel
    // refutes it. `metByItem` moves 8 -> 12 with `met`, so all four extra satisfactions are
    // ITEM-served. What travel removes is THRASH: without it a guest re-picks its provider on
    // every tick and can start a new engagement the instant its vector reorders; with it, a
    // guest that has committed to a walk arrives and is served. **Committing costs the guest
    // the time and buys it the completion**, and in a three-room hotel the completion is worth
    // more. The two ROOM-served rows, which have further to go and more competition, pay.
    //
    // The state hash and the review distribution below move with these; the departure table,
    // the ledger, the revenue and the closing balance do NOT — the block at the head of this
    // golden is unchanged from `arrived` to `left evictedCauseUnrecorded`.
    // ==========================================================================================
    // ==========================================================================================
    // RE-RECORDED AT G-038a-iii-b, WHICH DECLARED THE STAIRWELL, AND THE THREE ROWS MOVE IN TWO
    // DIRECTIONS AGAIN:
    //
    //     row                  met         unserved ticks
    //     guest_comfort        12 -> 12    1,254 -> 1,319   worse, and only by ticks
    //     guest_entertainment   4 ->  6    2,223 -> 2,032   BETTER
    //     guest_nourishment    11 -> 10    1,708 -> 1,742   worse
    //     night_rest            4 ->  4    3,000 -> 3,000   UNCHANGED
    //
    // **THE LODGING ROW IS STILL THE CONTROL AND IT STILL DOES NOT MOVE.** Three rooms against
    // 24 arrivals is decided by capacity, and a guest with no room is going nowhere — so a
    // change that only alters HOW a guest travels cannot touch it. That it is byte-identical
    // through a change that moved every other row is the strongest evidence in this golden that
    // the shaft changed journeys and not the hotel.
    //
    // **`guest_entertainment` GETTING BETTER IS THE SAME FINDING G-023b-ii RECORDED ABOUT
    // `guest_comfort`, ONE AXIS OVER**: the amenity is in the BASEMENT, so entertainment is the
    // row every stairwell journey in this run is about. A guest that must walk to the stairs
    // commits to the walk and is served on arrival, where before it re-picked a provider every
    // tick and thrashed. Two more satisfactions, and 191 fewer unserved ticks.
    // ==========================================================================================
    // ==========================================================================================
    // RE-RECORDED AT G-040b-ii, AND **THE LODGING ROW HAS STOPPED BEING THE CONTROL** — which is
    // this goal in one line rather than an inconvenience.
    //
    //     row                  met        unmet      unserved ticks   share (bp)
    //     guest_comfort        20 -> 22    0 ->  5     297 -> 944      343 -> 760   WORSE
    //     guest_entertainment  14 -> 22    6 ->  5     837 -> 1,026    968 -> 826   BETTER
    //     guest_nourishment    10 -> 16   10 -> 11   1,265 -> 1,476  1,464 -> 1,188 BETTER
    //     night_rest            4 ->  6   16 -> 21   3,000 -> 4,020  3,472 -> 3,236 BETTER
    //
    // The denominator moves too — `instanceTicks` 8,640 -> 12,420 — because 27 guests departed
    // where 20 did, so the TICK columns and the SHARE columns can and do point different ways.
    // Read the share column; it is the one that is per-guest.
    //
    // **EVERY EARLIER RE-RECORD ON THIS GOLDEN SAID `night_rest` COULD NOT MOVE**: *"three rooms
    // against 24 arrivals is decided by capacity, and a guest with no room is going nowhere"*.
    // That sentence was true of a hotel in which one guest occupied one room. The dial makes a
    // bedroom hold the PARTY it was always documented as holding, so three bedrooms now sleep up
    // to six people, and the row that was untouchable is the row that improves most in share.
    // Two more guests get a bed out of a third more arriving.
    //
    // **AND `guest_comfort` IS THE ONE THAT PAYS**, which is the same trade the other direction:
    // there is ONE arm chair in this hotel and it now serves a third more guests, so its share
    // more than doubles. Rooms scale with parties; a single item does not.
    // ==========================================================================================
    // MOVED AT G-054 — the paired before/after and the reason nourishment overtakes the other
    // two are at `stateHash` above. `instanceTicks` is UNMOVED at 12,420 on every row, which is
    // what says the population is the same and only its choices differ.
    // ==========================================================================================
    // MOVED AT G-046 — A DOOR BECAME A PLACE — AND ON THIS HOTEL IT MOVED **THESE THREE ROWS AND
    // NOTHING ELSE**. Every departure count, every review band, the mean, the stars, the ledger
    // and the balance are byte-identical; `night_rest` is byte-identical too, because a lodging
    // need is served by the room a guest HOLDS wherever it is standing (ADR-0017 §2) and holding
    // is not walking. **The door costs TRAVEL TIME, and the only rows that can see travel time
    // are the engagement ones.** `instanceTicks` is UNMOVED at 12,420 on every row, which says
    // the population is the same and only how long it spent walking differs.
    //
    // The `metByItem` fall on nourishment (6 -> 4) is the same tick spent differently: two
    // guests reach the cafe's own service instead of a stocked item, because a guest that walks
    // one cell further arrives on a tick when the room can take it.
    // ==========================================================================================
    { needId: 'guest_comfort', lodging: false, met: 17, unmet: 10, metByItem: 17, abandoned: 0, unservedTicks: 1_641, instanceTicks: 12_420 },
    { needId: 'guest_entertainment', lodging: false, met: 18, unmet: 9, metByItem: 0, abandoned: 0, unservedTicks: 1_437, instanceTicks: 12_420 },
    { needId: 'guest_nourishment', lodging: false, met: 22, unmet: 5, metByItem: 4, abandoned: 0, unservedTicks: 822, instanceTicks: 12_420 },
    { needId: 'night_rest', lodging: true, met: 6, unmet: 21, metByItem: 0, abandoned: 0, unservedTicks: 4_020, instanceTicks: 12_420 },
  ],
  // The seeded hotel WORKS (G-009): three rooms, each furnished, each with a corridor
  // beside it, each standing on the ground. Zero invalid rooms here is the assertion that
  // the shipped content and the runner's layout still make a hotel — if `requires` named
  // an item the seeding did not place, or the layout packed rooms shoulder to shoulder,
  // this block is where it would show, and `satisfied` above would collapse with it.
  // THE REVIEW DISTRIBUTION (G-019). One row per score the shipped 1..5 scale admits, zeros
  // included. It conserves against the departure table above — 0 + 5 + 5 + 2 + 8 = 20 = 15
  // satisfied + 5 who gave up — which `buildSummary` asserts as a violation rather than
  // leaving to this literal.
  reviews: {
    scoreMin: 1,
    scoreMax: 5,
    distribution: [
      // RE-RECORDED AT G-027b, AND AGAIN AT G-028b. The distribution moves with the need table
      // above, and at G-028b it moves because the scorer does: a review is the mean of per-need
      // bands over the guest's own stay (ADR-0037) rather than a count of needs met. It still
      // conserves against the departure table — 0 + 9 + 7 + 0 + 4 = 20 = 4 checked out + 16 who
      // gave up — which `buildSummary` asserts rather than leaving to this literal.
      //
      // THE FOUR AT THE TOP ARE THE FOUR THAT CHECKED OUT, which is the shape this scorer
      // produces in a hotel short of beds: the guests it housed were served throughout, and the
      // sixteen it could not house are charged for every tick they went without a room.
      //
      // RE-RECORDED AGAIN AT G-023b-ii: **2:9 -> 2:8 and 3:7 -> 3:8**, one guest moving up a
      // band. It conserves against the same UNCHANGED departure table — 0 + 8 + 8 + 0 + 4 = 20
      // = 4 checked out + 16 who gave up — and the four at the top are still the four that
      // checked out. **One of the sixteen roomless guests scores better because it got its
      // comfort met while it waited**, which is the `guest_comfort` row above arriving in the
      // review. The mean rises 295 -> 300: travel made this hotel's guests very slightly
      // HAPPIER, which is not the direction anybody predicted and is why the need rows carry
      // the mechanism rather than a shrug.
      //
      // RE-RECORDED AGAIN AT G-039b-alpha: **0/8/8/0/4 -> 0/10/6/1/3**, and the interesting cell
      // is the FOURTH BAND, which has never been occupied on this golden before. It conserves
      // against the same UNCHANGED departure table — 0 + 10 + 6 + 1 + 3 = 20 = 4 checked out +
      // 16 who gave up — but **the four at the top are no longer the four that checked out**:
      // one of them scores 4. Its stay was complete and part of it was spent walking, which is
      // exactly what a mean of per-need bands is supposed to notice and what a count of needs
      // met could not. The mean falls 300 -> 285 with it.
      //
      // RE-RECORDED AGAIN AT G-038a-iii-b, WHICH DECLARED THE STAIRWELL: **0/10/6/1/3 ->
      // 0/8/8/0/4**, which is byte-for-byte the distribution G-023b-ii pinned, and the mean
      // goes back to 300. It conserves against the same UNCHANGED departure table — 0 + 8 + 8 +
      // 0 + 4 = 20 = 4 checked out + 16 who gave up — and the fourth band empties again, so the
      // four at the top are once more the four that checked out.
      //
      // **THAT THIS HOTEL GETS BETTER UNDER A STAIRWELL IS THE FINDING, AND IT IS THE SAME
      // MECHANISM `guest_comfort` CARRIES ABOVE.** Three bedrooms on floor 0 against one
      // amenity in the basement: a guest that must walk to the stairs and down COMMITS to that
      // journey, and a committed guest arrives and is served instead of re-picking a provider
      // every tick. `guest_entertainment` met 4 -> 6 is where it shows. The bench workload
      // moves the OTHER way in the same commit (`bench.workload.golden.test.ts`, checkedOut
      // 5 -> 2) — sixty bedrooms behind two amenities is a hotel with a queue, and there the
      // extra walk is time a guest does not have. **The two readings together are the honest
      // account of this mechanic; either alone would be a press release.**
      //
      // RE-RECORDED AGAIN AT G-040b-ii: **0/0/16/0/4 -> 0/0/21/0/6**, and the SHAPE is
      // byte-identical — two occupied bands, the same two, in the same proportion. It conserves
      // against the departure table above, 21 + 6 = 27 = 6 checked out + 21 who gave up, and the
      // six at the top are the six that checked out. The mean rises 340 -> 344 because the ratio
      // of housed to roomless improved slightly: a pair takes one bed between two people, so a
      // third more arrivals produce two more complete stays rather than none.
      //
      // RE-RECORDED AGAIN AT G-059, AND THIS IS THE LARGEST MOVE THE DISTRIBUTION HAS HAD:
      // **0/0/21/0/6 -> 21/0/0/6/0.** Both bands moved, in opposite directions, for two
      // different reasons — and the departure table beneath is UNCHANGED, which is what makes
      // this a scorer move rather than a simulation move. It still conserves: 21 + 6 = 27 = 6
      // checked out + 21 who gave up.
      //
      //   THE 21 FELL FROM 3 TO 1. They are the guests the hotel never found a room for. Under
      //   the agency partition a `gaveUp` stay was scored on what the guest happened to get
      //   while it waited — three of its four bands were top because the lobby has a cafe —
      //   and it left a THREE. On the human's TripAdvisor reading a guest that never got in
      //   does not file three stars, and `isCutShort` now floors it.
      //
      //   THE 6 FELL FROM 5 TO 4, AND THAT IS THE FACILITIES TERM BITING ON A HOTEL WITH NONE.
      //   These six were served throughout and still are: their four need bands are all top.
      //   **This hotel is TWO STARS** — the `stars` line in the text golden says so, and has
      //   since G-051a — so its standing band is 2 of 4, and the mean of five terms is
      //   (4+4+4+4+2)/5 = 3.6, which floors to 3 and scores 4. A two-star hotel can no longer
      //   collect five-star reviews for keeping the guests it managed to house comfortable.
      //   *That sentence is the whole of E-014's second finding, on the smallest run this
      //   project owns.*
      //
      // The mean falls 344 -> 167 with them.
      { score: 1, count: 21 },
      { score: 2, count: 0 },
      { score: 3, count: 0 },
      { score: 4, count: 6 },
      { score: 5, count: 0 },
    ],
  },
  rooms: {
    valid: 6,
    invalid: { missingItem: 0, noCorridor: 0, noDoor: 0, unplaced: 0, unreachable: 0, unsupported: 0 },
  },
  // G-051a. The default hotel is TWO stars of five and is told what the third costs. It is
  // DERIVED here at the moment of reporting — from `world.entities` against the world's own
  // plot, corridors and stairs — and it is stored nowhere, which is why this block arriving
  // moved no save version.
  rating: {
    stars: 2,
    nextStars: 3,
    tiers: 5,
    shortfall: [{ roomTypeIds: ['standard_room'], counting: 'rooms', minimum: 6, have: 3 }],
    // G-051b, AND IT IS THE NUMBER THIS WHOLE GOAL EXISTS TO PRODUCE — ZERO HERE, and the zero
    // is the control for the entire change. This run is CLAMPED: the simulation was handed no
    // demand curve, so this hotel's two stars earned it nobody and its 32 arrivals came from the
    // command log exactly as they always have. Every count in this document is byte-identical to
    // G-051a's and `world.stateHash` did not move. `input.market` above is what says which of
    // the two zeroes this is — nobody asking, rather than a rating worth nothing.
    partiesPerDay: 0,
  },
  money: {
    // 18 rather than 17 since G-011, and the one extra is the opening capital. A hotel
    // cannot start with money unless the money is a transaction — there is no balance
    // field to put it in (I4) — so the capital is a line in the ledger like everything
    // else, and the balance below is the fold that includes it.
    // 9 -> 11 AT G-052a: settlement books a `wages` line every night beside the `upkeep` one,
    // unconditionally, so two nights add two transactions. Both are ZERO — the shipped scenario
    // employs nobody — which is why the balance below does not move.
    transactions: 11,
    revenuePennies: 51000,
    // -24000 rather than -15000 since G-012: three amenity rooms at 1,500p a night for two
    // nights is 9,000p more. They earn nothing — `payForStay` charges for the LODGING room
    // — so an amenity is pure cost until reviews feed demand at M4. That is a real balance
    // consequence of this goal and it is recorded here rather than absorbed silently.
    upkeepPennies: -24000,
    constructionPennies: 0,
    startingCapitalPennies: 500000,
    demolitionRefundPennies: 0,
    // G-038c: what OPENING FLOORS cost. Zero here for a structural reason rather than a
    // contingent one — this run issues no build command at all, and the charge is levied only
    // BY a build. `build.floor.test.ts` is where it is non-zero.
    floorConstructionPennies: 0,
    loanDrawPennies: 0,
    loanFeePennies: 0,
    loanRepaymentPennies: 0,
    // The seeded hotel's scrap value, printed rather than hidden (G-011 critique round 1).
    //
    // THIS COMMENT SAID 375,000p WITH 750000 ON THE LINE BENEATH IT, AND THAT IS THE CLEAREST
    // EVIDENCE IN THE TREE THAT THE CHARTER'S FIGURE WAS WRONG (G-057, ADR-0093 §2). It read
    // "three rooms placed free by `spawnEntity` are still worth 375,000p if scrapped" — but the
    // default seeds NINE rooms, because `--amenities` defaults to 1 and seeds one of EACH of
    // three amenity room types, each scrapping for the same 125,000p as a bedroom. The literal
    // below has been 750000 since amenities landed and nobody read the two together.
    //
    // Both halves of the opening position appear in the report: this, and
    // `startingCapitalPennies` above, which is now the SCENARIO's `openingCapitalPence`.
    liquidationValuePennies: 750000,
    outstandingDebtPennies: 0,
    // G-052a — THE MONEY LOOP'S THIRD TERM. Zero pence over two nights because this scenario
    // employs nobody, and `wageSettlements` is 2 anyway: the cadence has no exceptions, exactly
    // as `settlements` has none, so `countWageTransactions === settlements` is a law a reader
    // checks by putting the two lines side by side rather than a thing this build promises.
    wagesPennies: 0,
    wageSettlements: 2,
    headcount: 0,
    settlements: 2,
    nights: 2,
    balancePennies: 527000,
  },
  // The default run builds nothing: `--build` and `--demolish` are off unless asked for
  // (G-008), which is what keeps this golden and `pnpm sim:bench` measuring the same
  // workload they always have. Zeros here are the assertion that the flags default OFF.
  build: {
    built: 0,
    demolished: 0,
    // G-036b. `placed` and the three new refusal reasons are ADDITIVE, so
    // `SUMMARY_SCHEMA_VERSION` stays at 4 — the policy that constant states, and the call
    // `corridors` got at G-034b. The default run issues neither `drawRoom` nor `placeItem`,
    // so every one of them is zero for a structural reason.
    placed: 0,
    // G-036c. The three edit counters and the two edit refusals are ADDITIVE for the same
    // reason, so `SUMMARY_SCHEMA_VERSION` still stays at 4. The default run issues neither
    // `resizeRoom` nor `moveItem`, so every one of them is zero for a structural reason.
    displaced: 0,
    moved: 0,
    resized: 0,
    refused: {
      breaksAnotherRoom: 0,
      footprintTooLarge: 0,
      footprintTooSmall: 0,
      insufficientFunds: 0,
      noSuchItem: 0,
      noSuchRoom: 0,
      notInRoom: 0,
      occupied: 0,
      outOfBounds: 0,
    },
    constructionTransactions: 0,
    refundTransactions: 0,
    // G-038c: how many times this hotel reached a floor it was not already on. Zero for the
    // same structural reason as `floorConstructionPennies` above.
    floorConstructionTransactions: 0,
  },
  // And the player never borrows unless asked to: `--loan` defaults off exactly as
  // `--build` and `--demolish` do (G-011), so this golden and `pnpm sim:bench` keep
  // measuring the workload they always have.
  loans: {
    drawn: 0,
    refused: { noLoanOffered: 0, notEligible: 0 },
    drawTransactions: 0,
  },
};

const GOLDEN_2_DAYS_SEED_42 =
  [
    'seed        42',
    'ticks       2880',
    'days        2',
    // SEVEN SINCE G-051a: the four this hotel is built from, plus the three FACILITIES the star
    // ladder's top two tiers ask for. `--facilities` defaults to 0, so none of them is seeded
    // and `entities`, `rooms ok` and every count below are unchanged — this line is the CONTENT
    // TABLE's size and not this building's.
    'room types  7',
    'need types  4',
    'entities    11',
    'rooms ok    6',
    'rooms bad   0 unplaced, 0 unsupported, 0 no door, 0 no corridor, 0 no route, 0 no item',
    'arrived     32',
    // G-027a: `satisfied` and `gaveUpWaiting` became `checkedOut` and `gaveUp` (ADR-0017),
    // and the SPLIT moved with them — 4 and 16 where it was 15 and 5. A stay is 1,440 ticks
    // rather than 480, so three rooms serve three guests in two days instead of fifteen and
    // the rest give up waiting. Same simulation, three times the stay.
    'left checkedOut             6',
    // θ-b2: the seventh row, ZERO here for a structural reason rather than a contingent one —
    // this content declares a lodging need, so every guest books a room and NO guest under it
    // can be a visitor at all. Where `leftDissatisfied`'s zero below is "it did not happen in
    // this hotel", this one is "it cannot happen under this content".
    'left visitEnded             0',
    'left gaveUp                 21',
    // G-038b-i: the EIGHTH row, and it is ZERO for the strongest structural reason any zero in
    // this table has. `world.lift` is `null` in every world any harness in this project
    // produces — no content declares a lift and no scenario installs one — so the branch that
    // writes this row is unreachable on this run and on every other shipped run. That is what
    // "inert on shipped content" means, stated as a number a reader can check. **Every other
    // count in this document is unchanged**, which is the hand-checked half of the same claim.
    'left gaveUpWaitingForLift   0',
    // θ-b1: the sixth row, and it is ZERO here — which is the golden earning its keep. In a
    // three-room hotel almost nobody gets a bed, and a guest with no bed leaves as `gaveUp`
    // long before its dissatisfaction could saturate (`assertDissatisfactionOutlastsTheLobby`
    // is what makes that ordering a rule rather than a coincidence). **Every other count in
    // this document is unchanged**, which is the hand-checked evidence that the row was added
    // and no behaviour in THIS hotel moved.
    'left leftDissatisfied       0',
    'left evictedRoomGone        0',
    'left evictedRoomUnusable    0',
    'left evictedCauseUnrecorded 0',
    'in hotel    5',
    'stuck       0',
    'orphan res  0',
    'in bad room 0',
    // G-023b-ii, and these three are the SAME MOVE the JSON golden's need rows carry with its
    // mechanism — travel removes thrash, so the item-served row improves and the two room-served
    // rows pay. The `bp unserved` column is a SHARE and the JSON's is a TICK COUNT, so they are
    // two views of one measurement and both are re-recorded here rather than one being derived
    // from the other. `night_rest` below is unchanged, which is this pair's control.
    // G-038a-iii-b re-records all three again, and the `night_rest` line below is STILL the
    // control at 3472 bp: the stairwell moves how a guest travels and nothing about how many
    // beds there are. See the JSON golden's need-row block for the mechanism.
    // The three rows below move at G-054 — see the note at `stateHash` above for the paired
    // before/after and why nourishment overtaking the other two is the finding.
    'need       guest_comfort 17 met, 10 unmet (0 by room, 17 by item), 0 abandoned, 1321 bp unserved',
    'need       guest_entertainment 18 met, 9 unmet (18 by room, 0 by item), 0 abandoned, 1157 bp unserved',
    'need       guest_nourishment 22 met, 5 unmet (18 by room, 4 by item), 0 abandoned, 661 bp unserved',
    'need L     night_rest 6 met, 21 unmet (6 by room, 0 by item), 0 abandoned, 3236 bp unserved',
    // G-023b-ii: one guest moves 2 -> 3 and the mean rises with it. See the JSON golden's
    // distribution above for why a hotel whose guests must now WALK reviews slightly better.
    // G-038a-iii-b: back to G-023b-ii's own distribution, and the mean back to 300, when the
    // walk gains a vertical leg. The JSON golden carries why.
    // G-059: **1:21 and 4:6**, both bands moving, the departure table unchanged. The JSON
    // golden's distribution block carries the two mechanisms — the floor for a guest that never
    // got a room, and a two-star hotel's standing capping its housed guests at four.
    'reviews     1:21, 2:0, 3:0, 4:6, 5:0',
    'mean x100   167',
    // TWO LINES ADDED AT G-051a, AND THE SECOND ONE IS THE POINT. The default hotel is TWO
    // stars and is told exactly what the third costs: three more bedrooms. A rating with no
    // price tag is a number; a rating with one is a currency.
    'stars       2 of 5, next 3',
    'to climb    3/6 rooms of [standard_room]',
    // ONE LINE ADDED AT G-051b, AND IT CARRIES ITS OWN REGIME. It reads ZERO because this run is
    // CLAMPED — the simulation was handed no demand curve, so this hotel's rating earned it
    // nobody and its 32 arrivals came from the command log exactly as they always have.
    // **Every count in this document is unchanged and the state hash did not move**, which is
    // the control for the whole goal: under the clamp the injected content is missing a KEY
    // rather than carrying an empty one, so it fingerprints as it always did (see `Market`).
    'demand      0 parties/day at 2 stars, CLAMPED — arrivals commanded every 120 ticks',
    'ledger      11 transactions',
    'revenue     51000p',
    'upkeep      -24000p',
    // G-052a: beside upkeep, because the money loop sets revenue against the two of them
    // together. Zero pence and nobody on the payroll — see the JSON golden's money block.
    'wages       0p, 0 on the payroll, 2 nights',
    'built       0',
    'demolished  0',
    // G-036b: TWO NEW LINES AND FOUR NEW COLUMNS, and neither is a behaviour change. `placed`
    // is `placeItem`'s counter and the refusal line gains the three reasons the size rules and
    // `placeItem` introduced. Every one reads 0 here for a structural reason rather than a
    // contingent one: this run issues no `drawRoom` and no `placeItem` at all, so no size rule
    // and no host rule can fire. A CLI that could not PRINT a refusal reason would be a rule
    // nobody running the harness could see — the condition `noCorridor` was in before G-035.
    'placed      0',
    'refused     0 too big, 0 too small, 0 funds, 0 not in room, 0 occupied, 0 off plot, 0 no room',
    'building    0p',
    'capital     500000p',
    'refunds     0p',
    // G-038c: the report gains ONE column, and it reads zero because this run builds nothing.
    'floors      0 opened, 0p',
    'loans       0 drawn, 0 not needed, 0 not offered',
    'borrowed    0p, fees 0p, repaid 0p',
    'scrap value 750000p',
    'debt        0p',
    'settlements 2',
    'balance     527000p',
    // G-034a: THE ONLY LINE THAT MOVED, AND THAT IS THE FINDING RATHER THAN THE REPAIR.
    // `f49ac2f2ffefe35e` -> `69840e789db92894`, because `Cell` gained `row` and `GridBounds`
    // gained `minRow`/`maxRow`, and all three are hashed state (ADR-0046 §4.1). Every other
    // line above is BYTE-IDENTICAL — the same 6 valid rooms, the same 0/0/0/0 invalidity
    // tallies, the same 24 arrivals and 4/16 split, the same 7 transactions and the same
    // balance — which is the control for the claim that this goal changed the SHAPE of the
    // state and nothing the simulation does. It holds because the shipped plot stays ONE ROW
    // DEEP: no journey is longer, and the new 4-neighbour door rule degenerates to the old
    // 2-neighbour one through `isWithinBounds` when front and back are off the plot.
    //
    // G-034b: TWO LINES MOVED, AND THE SECOND ONE IS THE SAME CONTROL AGAIN.
    // `69840e789db92894` -> `609eab77f24306e3`, because `World` gained `corridors` and the
    // seeded hotel now DECLARES the corridor it always had — both hashed state. `rooms bad`
    // gained a column and reads 0 in it. **Every other line is byte-identical**: the same 6
    // valid rooms, the same 24 arrivals, the same 4/16 split, the same 7 transactions, the
    // same 510,000p. The shipped hotel is laid out one room, one corridor, so declaring
    // that corridor changes no verdict — which is the whole argument that this goal changed
    // the RULES without changing what the shipped hotel does.
    //
    // G-036a: ONE LINE MOVED AGAIN, AND THE CONTROL IS THE STRONGEST IT HAS BEEN.
    // `609eab77f24306e3` -> `9256cb64df99e768`, because the shipped PLOT gained depth and
    // `minRow`/`maxRow` are hashed state. **NOTHING ELSE IN THIS RUN MOVED AT ALL** — not one
    // cell, not one corridor, not one entity id: the seeded plate wraps into the depth only
    // when a row of it is FULL, and this hotel is three rooms wide, so the three bedrooms and
    // the three basement amenities stand on exactly the cells they have stood on since G-006
    // and the lanes are the lanes G-034b declared.
    //
    // So every other line is byte-identical: the same 6 valid rooms, the same 0/0/0/0/0
    // invalidity tally, the same 24 arrivals, the same 4/16 split, the same 7 transactions and
    // the same 510,000p. **THIS LINE IS THE PLOT'S TWO NEW EDGES AND NOTHING ELSE**, which is
    // the tightest control this golden has carried: the hotel is identical and the world it
    // stands in is two integers bigger.
    //
    // G-036b: ONE LINE MOVED FOR THE STATE AND TWO WERE ADDED FOR THE REPORT, AND THE CONTROL
    // SEPARATES THEM. `9256cb64df99e768` -> `4ca14d55f98ad071`, and the hash moves for TWO
    // hashed-state reasons at once: every entity gained a `footprint` and `buildOutcomes`
    // gained `placed` plus three refusal counters (save v19), AND `World.contentHash` moved
    // because `room-types.json` gained `minFootprintCells` and `maxFootprintCells` — the
    // largest content-field addition this project has made.
    //
    // **EVERY COUNT ABOVE IS BYTE-IDENTICAL** — the same 6 valid rooms, the same 0/0/0/0/0
    // invalidity tally, the same 24 arrivals, the same 4/16 split, the same four need rows to
    // the basis point, the same 7 transactions and the same 510,000p. That is the control, and
    // it is what makes "this goal changed the SHAPE of a room and nothing this hotel does" a
    // checked claim: the shipped CLI hotel draws nothing, places nothing, and every room in it
    // is one cell, so a footprint-aware placement index gives it the answers the origin-keyed
    // one gave. The two ADDED lines are new columns of the same report, both reading 0.
    //
    // G-036c: ONE LINE MOVED AND NOT ONE OTHER CHARACTER OF THIS GOLDEN CHANGED.
    // `4ca14d55f98ad071` -> `2b1ba508644bcf7c`, for two hashed-state causes and no behaviour:
    // `buildOutcomes` gained three edit counters and two refusal counters (save v20), and
    // `World.contentHash` moved because `room-types.json` gained `accessRule`. **The printed
    // report did not gain a column this time** — the new build counters are reported in `--json`
    // and the printed table is unchanged — so the control here is every line above this one,
    // literally: the same 6 valid rooms, the same 0/0/0/0/0 tally, the same 24 arrivals, the
    // same 4/16 split, the same four need rows to the basis point, the same 7 transactions and
    // the same 510,000p. B6 is INERT on this hotel for a structural reason rather than by luck:
    // the only need `standard_room` provides is the lodging need, which the engagement pass
    // skips by name, and nothing else in this run stands inside a bedroom.
    //
    // G-038c: ONE LINE ADDED, ONE LINE MOVED, AND EVERY COUNT ABOVE THEM IS BYTE-IDENTICAL.
    // `2b1ba508644bcf7c` -> `3f2e876b38fa4517`, for ONE hashed-state cause and NO behaviour and
    // NO save bump: `World.contentHash` moved because `economy.json` gained
    // `floorConstructionCostPence` and `guest-rules.json` gained `maxLodgingFloorsFromEntrance`
    // (ADR-0047 B8). **Nothing in `World` gained a field** — the floor charge is a ledger
    // transaction and the reach is read from content on every lodging search, so neither is
    // state and neither owes a migration.
    //
    // BOTH RULES ARE INERT ON THIS HOTEL FOR STRUCTURAL REASONS, WHICH IS WHY THE CONTROL IS
    // THE WHOLE DOCUMENT ABOVE. The run issues no `buildRoom` at all, and the charge is levied
    // only BY a build — so `floors` reads `0 opened, 0p` and the ledger still has its 7
    // transactions and its 510,000p. And every seeded room in this hotel stands on the entrance
    // floor, so no lodging candidate is more than zero floors from the door and a reach of 2
    // cannot turn anybody away. Same 6 valid rooms, same 0/0/0/0/0 tally, same 24 arrivals,
    // same 4/16 split, same four need rows to the basis point.
    //
    // G-038b-i: ONE LINE ADDED, ONE LINE MOVED, AND EVERY COUNT ABOVE THEM IS BYTE-IDENTICAL —
    // the same shape as G-038c above, and for a stricter reason. `6061c97185a796a5` ->
    // `e3c3857d7108fc79`, for TWO hashed-state causes and NO behaviour: `World` gained `lift`
    // (`null`) and `liftQueue` (empty), and `guestOutcomes.departures` gained a zero row at
    // index 3 (save v23). **`World.contentHash` did NOT move** — no content file changed, which
    // is what makes this the narrowest golden move in the file's history: the hash carries two
    // new fields and one new row, and nothing else.
    //
    // THE MECHANISM IS INERT AND THAT IS STRUCTURAL RATHER THAN LUCKY. A queue can only form
    // where `world.lift !== null`, `installLift` is the only thing that can set it, and no
    // harness in this repository issues that command. So the same 6 valid rooms, the same
    // 0/0/0/0/0/0 tally, the same 32 arrivals, the same 6/21 split, the same four need rows to
    // the basis point, the same 9 transactions, the same 51,000p and the same 527,000p.
    //
    // G-057: THE HASH LINE MOVES AND NOTHING ELSE IN THIS DOCUMENT DOES — the narrowest golden
    // move in this file's history, narrower even than G-038b-i's. `e3c3857d7108fc79` ->
    // `110b25ef862153fb`, for ONE cause: `World.contentHash`. The shipped content gained
    // `scenarios.json` and `economy.json` lost `startingCapitalPence`, so the FINGERPRINT moves
    // (G-002's design — a run under different content hashes differently from tick 0, loudly),
    // and the world's shape does not: no `World` field, no save bump, no migration.
    //
    // AND THE OPENING BALANCE IS THE SAME 500,000p, WHICH IS THE POINT OF THE GOAL RATHER THAN
    // A COINCIDENCE. G-057 moved that number between content tables and did not re-size it —
    // re-sizing is a balance decision and belongs to M4 (`HOTELSIM.md` section 8). The shipped
    // `seededStock` is `supplementsCapital`, which is what every build before this goal did, so
    // the same 6 valid rooms, the same 32 arrivals, the same 6/21 split, the same four need rows
    // to the basis point, the same 9 transactions, the same 51,000p and the same 527,000p.
    //
    // G-051a: THE HASH LINE MOVES, TWO LINES ARE ADDED, ONE LINE MOVES FOR THE CONTENT TABLE'S
    // SIZE, AND NOT ONE COUNT ABOUT THIS BUILDING CHANGES. `614f7b6eda90b4c2` ->
    // `de29b5283ad28f0c`, for ONE hashed-state cause: `World.contentHash`. The shipped content
    // gained `star-tiers.json` and three facility room types, so the FINGERPRINT moves and the
    // world's shape does not — NO `World` field, NO save bump, NO migration, because the star
    // rating is DERIVED at the moment of reporting and stored nowhere (see `rating.ts`).
    //
    // THE MECHANISM IS INERT ON THIS HOTEL FOR STRUCTURAL REASONS RATHER THAN LUCKY ONES, which
    // is what makes every line above the control. A facility SERVES NO NEED, so no guest can
    // ever walk to one; `--facilities` defaults to 0, so this run seeds none; and NOTHING in
    // `packages/sim` reads a rating, so no arrival, price, review or need can consult it. The
    // same 6 valid rooms, the same 0/0/0/0/0/0 tally, the same 32 arrivals, the same 6/21
    // split, the same four need rows to the basis point, the same 11 transactions, the same
    // 51,000p and the same 527,000p.
    //
    // G-051a SWEEP 1: THE HASH LINE MOVES AND NOT ONE OTHER CHARACTER OF THIS GOLDEN DOES —
    // narrower than this goal's own first move, which added two lines. `de29b5283ad28f0c` ->
    // `67e13a16221d2082`, for ONE cause: `World.contentHash`, because MAJOR 1 repriced two
    // `demolitionRefundBasisPoints` values so that no facility is dominated net of its residual.
    // A refund is money only when a room is SCRAPPED, and this run scraps nothing and owns no
    // facility, so the same 6 valid rooms, the same 32 arrivals, the same 6/21 split, the same
    // four need rows to the basis point, the same 11 transactions, the same 51,000p and the same
    // 527,000p — and the same two `stars` lines, because the ladder did not move.
    // G-059: `67e13a16221d2082` -> `bf65fd6522ddf4f1`. THE REVIEW TALLY IS WORLD STATE, so a
    // scorer that records different scores hashes differently — and that is the ONLY cause here.
    // The control is the whole document: the same 32 arrivals, the same 6/21 split, the same
    // four need rows to the basis point, the same 11 transactions, the same 51,000p, the same
    // 527,000p, the same 6 valid rooms and the same two `stars` lines. `SAVE_SCHEMA_VERSION`
    // does not move — no field was added to `World` — and neither does `SUMMARY_SCHEMA_VERSION`.
    // G-066a: `bf65fd6522ddf4f1` -> `00000ef70ad7566b`. `World` GAINED `recentRemarks` — a
    // bounded ring of the last 48 departures, holding the four values a remark is derived FROM
    // and never the sentence — so the hashed document gained a key AND that key is non-empty
    // here: this run departs 27 guests. **SAVE_SCHEMA_VERSION MOVES TO 25** with a real 24 -> 25
    // migration, which is the FIRST cause on this golden ever to be a save bump rather than a
    // scorer or a fingerprint. `World.contentHash` does NOT move and `SUMMARY_SCHEMA_VERSION`
    // does not either. The control is the whole document, and it is the whole document: the same
    // 32 arrivals, the same 6/21 split, the same four need rows to the basis point, the same 11
    // transactions, the same 51,000p, the same 527,000p, the same 6 valid rooms, the same review
    // distribution and mean, and the same two `stars` lines. NOT ONE OTHER CHARACTER MOVES,
    // because showing the feed is G-066b's and this goal wrote no report line for it.
    'state hash  6191199638412542',
  ].join('\n') + '\n';

/**
 * WHY THE GOLDEN MOVED AT G-008, AND WHY EVERY NUMBER IN IT DID NOT.
 *
 * `state hash` moved for two reasons, both deliberate and both hand-checked: the shipped
 * content gained `constructionCostPence`, which moves the content fingerprint that
 * `World.contentHash` records (G-002's design — a run under different content has a
 * different hash from tick 0, loudly), and `World` gained `buildOutcomes`.
 *
 * EVERY OTHER NUMBER IS UNCHANGED, character for character: 24 arrived, 15 satisfied,
 * 5 unsatisfied, 17 transactions, 127500p revenue, -15000p upkeep, 112500p balance. That
 * is the check worth making — adding a price to content and a counter to the world must
 * not alter what the hotel DOES when nobody builds. If a guest number had moved here, the
 * build loop would have leaked into the guest loop and this is where it would show.
 *
 * The three new lines read 0 because the flags default off. `building 0p` is the sum of a
 * reason with no transactions, not an absent field.
 *
 * WHY IT MOVED AGAIN AT G-009, AND WHY THE SAME NUMBERS STILL DID NOT.
 *
 * `state hash` moved for the same two kinds of reason: the shipped content gained
 * `requires` and an `item-types.json`, which moves the fingerprint `World.contentHash`
 * records, and the seeded hotel is now laid out with a corridor between its rooms
 * (columns 0, 2, 4 rather than 0, 1, 2) because a room with a neighbour hard against both
 * sides has no door. `entities` moved 3 -> 6: each room now stands beside its bed, and a
 * bed is an entity.
 *
 * AND EVERY GUEST AND MONEY NUMBER IS AGAIN UNCHANGED, character for character: 24
 * arrived, 15 satisfied, 5 unsatisfied, 17 transactions, 127500p revenue, -15000p upkeep,
 * 112500p balance. THAT is the check worth making. Room validity is a rule about which
 * rooms are providers, and the shipped hotel's rooms are all providers, so a hotel that
 * worked before must do exactly as much business now. If `satisfied` had fallen here, the
 * rule would have broken the shipped content rather than described it — which is the one
 * way this goal could have gone quietly wrong.
 *
 * WHY IT MOVED AT G-041, AND WHICH HALF OF THIS DOCUMENT DID NOT.
 *
 * `73ec70f0ec5bf424` -> `5081486e2a7ec39a`, and the cause is the need RATES (ADR-0054,
 * ADR-0057). `refillPerTick` is now the rate a FULLY APPOINTED room reaches and the table was
 * re-derived so it sits above the bare one; this tree has no quality fold in it yet, so every
 * room in this three-room hotel serves at that ceiling. `guest-rules.json` moved with the need
 * table — `visitDurationTicks` 208 -> 98 and `dissatisfactionCapacityTicks` 431 -> 301, both
 * DERIVED from the need table rather than dialled — so `World.contentHash` moves too.
 *
 * **THE GUEST AND MONEY BLOCKS ARE BYTE-IDENTICAL AND THAT IS THE CONTROL.** 24 arrived, 4
 * checked out, 16 gave up, 4 in the hotel, 7 transactions, 34,000p revenue, -24,000p upkeep,
 * 510,000p balance, 6 valid rooms, the 0/0/0/0/0/0 invalidity tally. What moved is exactly the
 * three need rows and the review distribution: `guest_comfort` 12/8 -> 20/0 with its unserved
 * share 1,526bp -> 343bp, `guest_entertainment` 6/14 -> 14/6, `guest_nourishment` unchanged in
 * met/unmet with a smaller unserved share, and the reviews `2:8 3:8` -> `3:16`. **The same
 * guests, the same money, the same rooms, served faster.** `night_rest` does not move at all —
 * 4 met, 16 unmet, 3,000 ticks unserved — because in this hotel the sixteen who never get a
 * room are what that row counts, and how fast a bed refills does not give anybody one.
 *
 * WHY IT MOVED AGAIN AT G-011, AND WHAT DID AND DID NOT MOVE WITH IT.
 *
 * `state hash` moved for both kinds of reason at once: the shipped content gained
 * `demolitionRefundBasisPoints` and a whole `economy.json`, which moves the fingerprint
 * `World.contentHash` records, and `World` gained `loanOutcomes`.
 *
 * THE MONEY MOVED, DELIBERATELY, AND IT IS THE ONLY THING THAT DID. `ledger` 17 -> 18 and
 * `balance` 112500p -> 612500p, both accounted for by one transaction: the 500,000p of
 * opening capital ADR-0011 gives every hotel. Nothing else in the money loop fired,
 * because the default run builds nothing, demolishes nothing and borrows nothing — the
 * five new money lines are all 0p, and `loans 0 drawn` is the assertion that `--loan`
 * defaults off.
 *
 * AND EVERY GUEST NUMBER IS AGAIN UNCHANGED, CHARACTER FOR CHARACTER: 24 arrived, 15
 * satisfied, 5 unsatisfied, 0 evicted, 4 in hotel, 127500p revenue, -15000p upkeep. THAT
 * is the check worth making for a goal that gives the player money: capital, a refund and
 * a loan must change what a player CAN DO and not what the hotel DOES when nobody uses
 * them. If `satisfied` had moved here, the money loop would have leaked into the guest
 * loop, and this is the line where it would show.
 */

describe('byte-identical stdout across runs (G-006 exit criterion, verbatim)', () => {
  it('two runs of --days 30 --seed 42 produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42']);
    const second = runCli(['--days', '30', '--seed', '42']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stderr.length).toBe(0);
    // Raw bytes, two real processes. A timestamp, a duration, or any run-varying
    // value anywhere in the report makes this red.
    expect(first.stdout.equals(second.stdout)).toBe(true);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 14,439ms

  it('two runs of --days 30 --seed 42 --json produce byte-identical stdout', () => {
    const first = runCli(['--days', '30', '--seed', '42', '--json']);
    const second = runCli(['--days', '30', '--seed', '42', '--json']);
    expect(first.status).toBe(0);
    expect(second.status).toBe(0);
    expect(first.stdout.equals(second.stdout)).toBe(true);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 17,924ms
});

describe('the golden literal', () => {
  it('--days 2 --seed 42 prints exactly the golden, byte for byte', () => {
    const result = default2Day();
    expect(result.status).toBe(0);
    expect(result.stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });

  it('the golden carries the exact `days` line format bench.mjs string-matches', () => {
    // tools/gates/bench.mjs asserts stdout.includes(`days        ${DAYS}`) — label,
    // eight spaces, value. If the report's column layout changes, this fails here,
    // in the same commit, rather than as a mysteriously red I5 gate.
    expect(GOLDEN_2_DAYS_SEED_42).toContain('days        2\n');
  });

  it('--days 2 --seed 42 --json prints the same numbers as the golden, as one JSON document', () => {
    const result = runCli(['--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout.toString('utf8'))).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });
});

describe('the DOCUMENTED invocation, through pnpm itself', () => {
  // Every other test here (and bench.mjs, and the determinism gate) spawns the CLI
  // directly, bypassing pnpm — but the invocation the file headers document is the
  // pnpm one, and pnpm prints its own script banner to STDOUT, which without
  // `--silent` prepends four lines of noise to the "machine-readable" document and
  // fails JSON.parse. These tests keep the documented path and the tested path on the
  // same circuit: they spawn `pnpm --silent sim:run ...` exactly as the headers show
  // it, and assert the output is clean.
  //
  // `shell: true` because on Windows pnpm is pnpm.cmd, which Node refuses to spawn
  // directly (and cannot resolve without a shell); on POSIX the shell resolves the
  // same name. No argument here contains spaces, so shell quoting is not in play.
  function runPnpm(args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('pnpm', args, {
      cwd: ROOT,
      shell: true,
      encoding: 'utf8',
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }

  it('pnpm --silent sim:run --json yields exactly one parseable JSON document', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--json']);
    expect(result.status).toBe(0);
    // JSON.parse of the WHOLE stdout: a banner line anywhere in front makes this throw.
    expect(JSON.parse(result.stdout)).toEqual(GOLDEN_2_DAYS_SEED_42_JSON);
  });

  it('pnpm --silent sim:run --quiet yields the state hash alone', () => {
    const result = runPnpm(['--silent', 'sim:run', '--days', '2', '--seed', '42', '--quiet']);
    expect(result.status).toBe(0);
    // Read from the golden rather than repeated as a second literal: two copies of one
    // hash is two places to update and one of them will be missed.
    expect(result.stdout).toBe(`${GOLDEN_2_DAYS_SEED_42_JSON.world.stateHash}\n`);
  });
});

describe('seed honesty', () => {
  it('two seeds differ ONLY in the seed line and the state-hash line', () => {
    // THIS TEST IS THE PARKED --seed CAVEAT, WRITTEN AS AN ASSERTION: the guest loop draws no
    // randomness, so the seed changes nothing but its own echo and the RNG stream carried in
    // hashed state.
    //
    // ==========================================================================================
    // ~~"until M4's demand model…"~~ ~~"TO WHOEVER LANDS THE M4 DEMAND MODEL: this test going red
    // is its DESIGNED RETIREMENT, not a regression… delete the test deliberately, and say so in
    // the goal's journal entry. Do not 'fix' it."~~ **STRUCK AT G-051b, WHICH IS THE GOAL THAT
    // INSTRUCTION WAS ADDRESSED TO.**
    //
    // **M4's DEMAND MODEL LANDED AND THIS TEST DID NOT GO RED**, because `demand.ts` draws
    // nothing: `partiesArrivingAt` is integer arithmetic on the tick counter, and ADR-0103 §3
    // records that as a decision made for an EVIDENCE reason rather than a stylistic one.
    // Following the instruction as written would have **deleted a guard that had just become
    // PERMANENTLY valid instead of expiring** — the worst outcome available, and the only one the
    // paragraph offered.
    //
    // **THE DOCBLOCK ALREADY CARRIED THE RIGHT TRIGGER FOUR LINES BELOW THE WRONG ONE**: *"the
    // moment GUEST BEHAVIOUR READS THE RNG, the caveat this test pins stops being true."* That is
    // the real condition and it is restated here as the only one. A milestone is not an event
    // this test can observe; a guest drawing from the stream is.
    //
    // **SO THE RETIREMENT CONDITION IS: `stepGuests`, or anything it calls, takes a draw.** Until
    // then this test is a live guard on a property the whole economy rests on — every economic
    // figure in this repository is a READING rather than one sample of a distribution, and this
    // is what says so at the CLI. If it ever goes red, read `demand.ts`'s header first: the
    // decision not to draw is recorded there, and a red row here means somebody reversed it.
    // ==========================================================================================
    const seed42 = default2Day();
    const seed43 = runCli(['--days', '2', '--seed', '43']);
    expect(seed42.status).toBe(0);
    expect(seed43.status).toBe(0);

    const lines42 = seed42.stdout.toString('utf8').split('\n');
    const lines43 = seed43.stdout.toString('utf8').split('\n');
    expect(lines43).toHaveLength(lines42.length);
    const differing = lines42.filter((line, i) => line !== lines43[i]);
    expect(differing).toEqual(['seed        42', `state hash  ${GOLDEN_2_DAYS_SEED_42_JSON.world.stateHash}`]);
    expect(lines43).toContain('seed        43');
  });
});

describe('workload flags leave the default run untouched', () => {
  it('--rooms 3 --arrivals 120 explicitly is byte-identical to no flags at all', () => {
    const explicit = runCli(['--days', '2', '--seed', '42', '--rooms', '3', '--arrivals', '120']);
    expect(explicit.status).toBe(0);
    expect(explicit.stdout.equals(default2Day().stdout)).toBe(true);
  });
});

describe('the --content contract', () => {
  const tempDirs: string[] = [];
  const makeTempDir = (): string => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-content-'));
    tempDirs.push(dir);
    return dir;
  };
  afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  it('a copy of the shipped content produces byte-identical output to the default', () => {
    const dir = makeTempDir();
    copyFileSync(ROOM_TYPES_PATH, join(dir, 'room-types.json'));
    copyFileSync(NEED_TYPES_PATH, join(dir, 'need-types.json'));
    // Three files since G-009, four since G-011, FIVE since G-014b. A `--content` directory
    // missing any of them is a content set the loader refuses.
    //
    // THAT CLAIM WAS A COMMENT WITH NOTHING BEHIND IT UNTIL G-014b, AND IT SAID SO IN THE
    // COMMENT. It read "which the next test but one pins"; the next test but one pins that
    // GARBAGE content is refused — `room-types.json` containing `not json {{{` — which is a
    // different fact about a file that is present. Nothing anywhere drove a MISSING file.
    // ADR-0007's amendment: a comment offered as evidence makes a checkable claim and is
    // subject to the same rule as an assertion. It is checked now, one describe below, for
    // every one of the five and by NAME.
    copyFileSync(ITEM_TYPES_PATH, join(dir, 'item-types.json'));
    copyFileSync(ECONOMY_PATH, join(dir, 'economy.json'));
    copyFileSync(GUEST_RULES_PATH, join(dir, 'guest-rules.json'));
    // SIX FILES SINCE G-057: what the hotel OPENS with is a table of its own.
    copyFileSync(SCENARIOS_PATH, join(dir, 'scenarios.json'));
    // SEVEN SINCE G-052a: who it can employ, and what one of them costs for a night.
    copyFileSync(STAFF_ROLES_PATH, join(dir, 'staff-roles.json'));
    copyFileSync(STAR_TIERS_PATH, join(dir, 'star-tiers.json'));
    // NINE SINCE G-051b: how many parties a day each rating earns. Required whether or not this
    // run is handed it (`Market`) — the file is read and validated on both paths.
    copyFileSync(DEMAND_PATH, join(dir, 'demand.json'));
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.equals(default2Day().stdout)).toBe(true);
  });

  // ==========================================================================
  // G-013 CRITERION 3, AS A REAL CONTENT FIXTURE RATHER THAN AN INSPECTION.
  //
  //   "content declaring a need whose only provider is an item that NO room type requires
  //   is REFUSED at bindContent, naming the need"
  //
  // Both halves are real JSON on disk, through the real loader, the real zod schema and the
  // real CLI — the shipped files with ONE FACT changed. `provider.content.test.ts` drives
  // the same rule at the unit level; this is the one that proves a designer editing files
  // gets the refusal, with exit 1 and empty stdout, rather than a hotel that quietly
  // disappoints every guest forever.
  //
  // THE PAIR IS THE POINT. The refusal alone would also pass against a validator that
  // rejected everything; the accepting half differs from it by a single `requires` entry.
  // ==========================================================================
  /** The shipped four files, copied into a scratch directory the caller may then edit. */
  const shippedCopy = (): string => {
    const dir = makeTempDir();
    copyFileSync(ROOM_TYPES_PATH, join(dir, 'room-types.json'));
    copyFileSync(NEED_TYPES_PATH, join(dir, 'need-types.json'));
    copyFileSync(ITEM_TYPES_PATH, join(dir, 'item-types.json'));
    copyFileSync(ECONOMY_PATH, join(dir, 'economy.json'));
    copyFileSync(GUEST_RULES_PATH, join(dir, 'guest-rules.json'));
    // SIX FILES SINCE G-057: what the hotel OPENS with is a table of its own.
    copyFileSync(SCENARIOS_PATH, join(dir, 'scenarios.json'));
    // SEVEN SINCE G-052a: who it can employ, and what one of them costs for a night.
    copyFileSync(STAFF_ROLES_PATH, join(dir, 'staff-roles.json'));
    copyFileSync(STAR_TIERS_PATH, join(dir, 'star-tiers.json'));
    // NINE SINCE G-051b: how many parties a day each rating earns. Required whether or not this
    // run is handed it (`Market`) — the file is read and validated on both paths.
    copyFileSync(DEMAND_PATH, join(dir, 'demand.json'));
    return dir;
  };

  /**
   * The shipped content with the arm chair's host stripped of its `requires`, so the chair
   * — the only thing that provides `guest_comfort` — becomes unreachable.
   *
   * Nothing is invented: this is the shipped table minus one array entry. The lounge's
   * `requires` is exactly what makes `guest_comfort` legal content today, which is why
   * removing it is the smallest possible statement of the defect.
   */
  const unreachableProviderContent = (): { dir: string; needId: string; itemId: string } => {
    const dir = shippedCopy();
    const items = JSON.parse(readFileSync(join(dir, 'item-types.json'), 'utf8')) as {
      id: string;
      provides: string[];
    }[];
    const rooms = JSON.parse(readFileSync(join(dir, 'room-types.json'), 'utf8')) as {
      id: string;
      provides?: string[];
      requires: string[];
    }[];
    // The item whose need NOTHING ELSE provides — found rather than named, so this file
    // carries no snake_case content id (ADR-0003) and a content rename cannot silently
    // retire the case.
    const soleProvider = items.find(
      (item) =>
        item.provides.length > 0 &&
        item.provides.every((needId) => !rooms.some((room) => (room.provides ?? []).includes(needId))),
    );
    if (soleProvider === undefined) throw new Error('the shipped content no longer has an item-only need');
    const host = rooms.find((room) => room.requires.includes(soleProvider.id));
    if (host === undefined) throw new Error('the shipped content no longer requires that item anywhere');
    writeFileSync(
      join(dir, 'room-types.json'),
      JSON.stringify(
        rooms.map((room) =>
          room.id === host.id ? { ...room, requires: room.requires.filter((id) => id !== soleProvider.id) } : room,
        ),
        null,
        2,
      ),
      'utf8',
    );
    return { dir, needId: soleProvider.provides[0]!, itemId: soleProvider.id };
  };

  it('REFUSES content whose only provider for a need is an item no room requires, naming the need', () => {
    const { dir, needId } = unreachableProviderContent();
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(1);
    // The no-run half of the consumer contract: nothing was simulated, so nothing is on
    // stdout. A half-report here would be worse than the refusal it is reporting.
    expect(result.stdout.length).toBe(0);
    const stderr = result.stderr.toString('utf8');
    expect(stderr).toContain(needId);
    expect(stderr).toContain('no provider a player can reach');
  });

  it('ACCEPTS the shipped content it was derived from — the pair, one array entry apart', () => {
    // Without this, the refusal above would be satisfied by a loader that refused
    // everything. The only difference between the two directories is one `requires` entry.
    const dir = shippedCopy();
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(0);
    expect(result.stdout.equals(default2Day().stdout)).toBe(true);
  });

  it('and the refused content is otherwise VALID: it passes the schema that guards the files', () => {
    // The point of the fixture. This content is well-formed JSON, every id is snake_case,
    // every price is an integer, `check:content` is happy with it and `roomTypeSchema`
    // parses it — everything a file-level gate can see is fine. The only thing wrong with
    // it is a cross-reference between two files, which is precisely what `bindContent` was
    // strengthened to catch and what nothing else in the toolchain can.
    const { dir } = unreachableProviderContent();
    const rooms = JSON.parse(readFileSync(join(dir, 'room-types.json'), 'utf8')) as unknown;
    const items = JSON.parse(readFileSync(join(dir, 'item-types.json'), 'utf8')) as unknown;
    expect(() => roomTypesSchema.parse(rooms)).not.toThrow();
    expect(() => itemTypesSchema.parse(items)).not.toThrow();
  });

  it('garbage content exits 1 with EMPTY stdout and one legible line on stderr (text mode)', () => {
    // The no-run half of the contract in report.ts: a consumer who sees exit 1 and
    // empty stdout knows nothing was simulated. Never half a document.
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    const stderr = result.stderr.toString('utf8');
    expect(stderr).toContain('room-types.json');
    expect(stderr.trim().split('\n')).toHaveLength(1);
  });

  it('garbage content exits 1 with EMPTY stdout in --json mode too', () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, 'room-types.json'), 'not json {{{', 'utf8');
    const result = runCli(['--days', '2', '--seed', '42', '--content', dir, '--json']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  // ==========================================================================
  //  EVERY ONE OF THE EIGHT FILES IS REQUIRED, AND UNTIL G-014b NOTHING SAID SO.
  //
  //  `loadContent` reads five fixed filenames and `readContentFile` throws on a missing
  //  one, so silence is refused rather than defaulted. That matters most for the file this
  //  goal added: `guest-rules.json`'s ABSENCE is a true statement about HISTORY — content
  //  from before the margin, read as total commitment — and a directory somebody assembled
  //  today is not history. A loader that shrugged would hand a designer who forgot the file
  //  a hotel whose guests silently stopped changing their minds, with every gate green.
  //
  //  DRIVEN ONCE PER FILE, BY DELETING IT FROM AN OTHERWISE COMPLETE DIRECTORY, so the pair
  //  is the evidence: the same directory loads when the file is there and is refused when it
  //  is not. A single missing-file case would also pass against a loader that refused
  //  everything.
  // ==========================================================================
  describe('every one of the nine content files is required, by name', () => {
    const FILES = [
      'room-types.json',
      'need-types.json',
      'item-types.json',
      'economy.json',
      'guest-rules.json',
      // SIXTH SINCE G-057, and it earns the same argument the five above it earn. Absence would
      // read as "no declared opening capital" — TRUE of content that predates G-011 and a silent
      // zero for a directory somebody assembled today. Since G-057 this is the only table that
      // declares an opening balance, so a shrug here is exactly the failure `HOTELSIM.md`
      // section 8's M4 prerequisite is about.
      'scenarios.json',
      // SEVENTH SINCE G-052a, and it earns the same argument. Absence would read as "nobody can
      // be employed" — TRUE of content that predates the money loop's third term, and a silent
      // empty payroll for a directory somebody assembled today, whose scenario would then be
      // refused for naming a role its own directory defines.
      'staff-roles.json',
      // EIGHTH SINCE G-051a, and it earns the same argument. Absence would read as "nobody
      // inspects anything" — TRUE of content that predates the star rating, and a silent UNRATED
      // for a directory somebody assembled today: every hotel reported at zero stars, with no
      // line anywhere saying the file was missing.
      'star-tiers.json',
      // NINTH SINCE G-051b, and it earns the same argument with the sharpest version of it.
      // Absence would read as "the host decides who turns up" — TRUE of every content set that
      // predates the demand curve, and for a directory somebody assembled today a hotel whose
      // rating silently earns it nothing, reported as a hotel whose rating earns it nothing.
      'demand.json',
    ] as const;

    it('the complete directory loads, or the refusals below are refusals of nothing', () => {
      const result = runCli(['--days', '2', '--seed', '42', '--content', shippedCopy()]);
      expect(result.status).toBe(0);
    });

    for (const missing of FILES) {
      it(`refuses a directory with no ${missing}, naming the file`, () => {
        const dir = shippedCopy();
        rmSync(join(dir, missing));
        const result = runCli(['--days', '2', '--seed', '42', '--content', dir]);
        expect(result.status).toBe(1);
        expect(result.stdout.length).toBe(0);
        const stderr = result.stderr.toString('utf8');
        expect(stderr).toContain(missing);
        expect(stderr).toContain('Could not read content file');
      });
    }
  });
});

describe('mode exclusivity', () => {
  it('--json --quiet is a parse error: exit 1, empty stdout', () => {
    const result = runCli(['--days', '2', '--json', '--quiet']);
    expect(result.status).toBe(1);
    expect(result.stdout.length).toBe(0);
    expect(result.stderr.toString('utf8')).toContain('not both');
  });
});


// G-008 — THE EXIT CRITERION, RUN AS A COMMAND RATHER THAN DESCRIBED.
//
//   pnpm sim:run --days 30 --seed 7 with a build schedule reports construction
//   transactions and a balance equal to the fold of its own log
//
// Every number below is HAND-DERIVED from a closed form and then compared against the
// real process, never captured on faith (the G-006 discipline). The derivation:
//
//   CAPITAL    500,000p, booked once at tick 0 (G-011). The hotel no longer opens broke.
//   ATTEMPTS   `--build 2880` fires at ticks 1 + 2880k for k = 0..14 -> 15 attempts.
//   OUTCOMES   10 succeed, 5 are refused for funds. They INTERLEAVE rather than failing
//              first and succeeding after: the hotel spends what it has on a room, is
//              broke, saves up, spends again. Each refusal is a player who could not
//              afford the thing at that moment, which is the mechanic working — and the
//              FIRST attempt now SUCCEEDS, at tick 1, because of the capital.
//   BUILDING   10 x 250,000p = 2,500,000p, one `construction` transaction each.
//   REVENUE    350 satisfied x 8,500p = 2,975,000p.
//   UPKEEP     rooms live at the 30 settlement ticks are
//              4,4,5,5,6,6,6,6,7,7,8,8,8,8,9,9,10,10,10,10,11,11,11,11,12,12,13,13,13,13
//              = 266 room-nights x 2,500p = 665,000p.
//   BALANCE    500,000 + 2,975,000 - 665,000 - 2,500,000 = 310,000p.
//   ENTITIES   (3 inherited + 10 built) x 2, a bed apiece = 26.
//
// The point of the arithmetic is that a reader with a calculator and no access to the
// simulation can check it.
//
// WHAT G-011 MOVED HERE, AND WHY EVERY MOVEMENT IS THE CAPITAL. Ten builds rather than
// nine, five refusals rather than six, one more room-night sequence entry at every step:
// all of it is 500,000p of opening capital buying the first room at tick 1 and shifting
// the whole savings cycle two builds earlier. Nothing about the refusal MECHANIC changed —
// `built + refused` is still exactly 15, one recorded outcome per attempt — and the
// balance still folds from its own published reasons. The refusal path is still driven by
// a real run, which was G-008's reason for leaving the hotel broke; it is now driven by
// the hotel outrunning its income rather than by never having had any.
/**
 * Read a schema-2 outcome table the way an EXTERNAL CONSUMER has to: off a parsed JSON
 * document, by reason string, with no help from the sim's types (G-015).
 *
 * `-1` FOR A MISSING ROW, NOT `0`, AND THAT IS THE WHOLE POINT OF THE SCHEMA BUMP. A
 * consumer that defaults a missing count to zero turns a schema break into a hotel where
 * nobody was ever satisfied; a negative sentinel makes the same mistake fail the assertion
 * that reads it. `assertSummarySchema` is the version this file's spawned runs go through.
 */
const departures = (guests: { departures: { reason: string; count: number }[] }): number =>
  guests.departures.reduce((total, row) => total + row.count, 0);
const left = (
  guests: { departures: { reason: string; count: number }[] },
  reason: string,
): number => guests.departures.find((row) => row.reason === reason)?.count ?? -1;
const evicted = (guests: { departures: { reason: string; count: number }[] }): number =>
  guests.departures
    .filter((row) => row.reason.startsWith('evicted'))
    .reduce((total, row) => total + row.count, 0);

describe('G-008 exit criterion: a build schedule, and a balance that folds', () => {
  type Summary = {
    world: { entities: number };
    guests: {
      arrived: number;
      /** Summary schema 2 (G-015): three counters became a table by reason. */
      departures: { reason: string; count: number }[];
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
      inInvalidRooms: number;
    };
    rooms: {
      valid: number;
      invalid: { missingItem: number; noCorridor: number; noDoor: number; unplaced: number; unreachable: number; unsupported: number };
    };
    money: {
      revenuePennies: number;
      upkeepPennies: number;
      constructionPennies: number;
      startingCapitalPennies: number;
      demolitionRefundPennies: number;
      floorConstructionPennies: number;
      loanDrawPennies: number;
      balancePennies: number;
    };
    build: {
      built: number;
      demolished: number;
      constructionTransactions: number;
      floorConstructionTransactions: number;
      refused: { insufficientFunds: number; noSuchRoom: number; occupied: number; outOfBounds: number };
    };
  };

  const BUILD_ARGS = ['--days', '30', '--seed', '7', '--build', '2880'];
  let cached: Summary | undefined;
  const summary = (): Summary => {
    cached ??= JSON.parse(runCli([...BUILD_ARGS, '--json']).stdout.toString('utf8')) as Summary;
    return cached;
  };

  it('exits 0 and reports CONSTRUCTION TRANSACTIONS, not merely a balance that happens to fold', () => {
    // The half that makes this a test of construction cost rather than a re-run of
    // G-005's balance check: without a build loop both numbers below are 0, and a
    // criterion satisfied by two zeros measures nothing.
    const result = runCli([...BUILD_ARGS, '--json']);
    expect(result.status).toBe(0);
    expect(result.stderr.length).toBe(0);
    // THREE ROOMS BUILT WHERE TEN WERE, AND THAT IS THE MARGIN COLLAPSE G-027a SHIPPED. A
    // room bills once per 1,440-tick stay rather than once per 480, so revenue per room-day
    // falls to roughly a third and the cash test refuses far more builds. `build.refused`
    // below is the same fact from the other side: 12 refusals where there were 5. This is
    // pricing behaviour changing because the STAY changed, which is exactly the trap
    // `stayDurationTicksSchema` warns about, and it is NOT a licence to raise the rate.
    // FOUR WHERE THERE WERE THREE, AND IT IS THE LAYOUT RATHER THAN THE PRICE (G-034b). The
    // player's walk now packs into blocks between its own corridors, offset one column from
    // the plot's edge, so the rooms it builds first sit OVER the inherited hotel rather than
    // over the gaps between it — two of them work where none did, the hotel earns more, and
    // the cash test lets one more build through. Nothing about construction cost moved.
    // ONE WHERE THERE WERE FOUR AT G-038c, AND IT IS THE SINK RATHER THAN THE PRICE (ADR-0047
    // B8). `builtRoomStartFloor` puts this walk on floor 1, so its FIRST build pays
    // `floorConstructionCostPence` (500,000p) on top of the room's 250,000p — three quarters of
    // a million pence out of a 500,000p opening balance plus thirty days of a three-room hotel's
    // trade. The wallet reaches it once and never again. **The construction PRICE is untouched**,
    // which is what the third assertion checks: 250,000p apiece, one build, one transaction.
    // ONE -> TWO AT G-040b-ii, AND IT IS THE MONEY LOOP RESPONDING TO THE DIAL RATHER THAN A
    // PRICE MOVING. `partySizeWeights: [3, 1]` puts four guests in this hotel for every three
    // arrival commands and sleeps a pair in ONE bedroom, so the three inherited rooms complete
    // 128 stays where they completed 96 and the trade pays for a second build. **The
    // construction PRICE is untouched, and the third assertion is what says so**: 250,000p
    // apiece, two builds, two transactions, -500,000p. The floor is still bought once — a walk
    // that reaches floor 1 pays for the floor on its FIRST build and never again.
    expect(summary().build.built).toBe(2);
    expect(summary().build.constructionTransactions).toBe(2);
    expect(summary().money.constructionPennies).toBe(-500_000);
    // AND THE FLOOR IS ITS OWN REASON, WHICH IS THE HALF THAT MAKES THE LEDGER READABLE. A
    // charge folded into `construction` would have left `constructionTransactions === built`
    // (G-008's cross-subsystem law) reading 1 against a 750,000p spend and no way to tell why.
    expect(summary().money.floorConstructionPennies).toBe(-500_000);
    expect(summary().build.floorConstructionTransactions).toBe(1);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 11,480ms

  it('matches the hand-derived closed form, penny for penny', () => {
    const s = summary();
    const satisfied = s.guests.departures.find((row) => row.reason === 'checkedOut')?.count ?? -1;
    expect(satisfied * 8_500).toBe(s.money.revenuePennies);
    // G-038c: 1,088,000 -> 816,000, which is 96 x 8,500 rather than 128 x 8,500. Three fewer
    // rooms are built (see above), so three fewer stays complete. The closed form is what makes
    // this a check: the two numbers moved together and the multiplier did not.
    // G-040b-ii: 816,000 -> 1,088,000, which is 128 x 8,500 rather than 96 x 8,500. THE
    // MULTIPLIER IS THE ASSERTION AND IT DID NOT MOVE — `payForStay` charges per GUEST
    // (ADR-0072 ruling 2), so a pair pays twice against one room's upkeep and the closed form
    // stays `checkedOut x nightlyRatePence`. Thirty-two more stays complete because a bedroom
    // now sleeps the party it was always documented as holding.
    expect(s.money.revenuePennies).toBe(1_088_000);
    // TWO ROOM TYPES PAY UPKEEP SINCE G-012, so the closed form has two terms: the
    // bedrooms at 2,500p and the three inherited amenities at 1,500p, standing for all 30
    // nights. The bedroom term is 154 room-nights at G-027a, down from 262, because only
    // three rooms are ever built and they arrive later — a room-night is only paid once the
    // room exists. Both terms are derived rather than captured, which is what makes this a
    // check and not a snapshot.
    // 154 -> 166 ROOM-NIGHTS AT G-034b, for the reason `build.built` moved: one more room is
    // built, and it is built earlier, so there are more room-nights to pay for. The two terms
    // are still derived rather than captured, which is what makes this a check.
    // 166 -> 102 ROOM-NIGHTS AT G-038c, and it is derived rather than captured: the three
    // inherited bedrooms stand for all 30 nights (90) and the single room the player can now
    // afford stands for 12 (102). One fewer room, built later, is fewer room-nights to pay for.
    // 102 -> 114 ROOM-NIGHTS AT G-040b-ii, and it is derived rather than captured: the three
    // inherited bedrooms stand for all 30 nights (90) and the TWO rooms this wallet can now
    // afford stand for 24 between them (114). The amenity term is untouched — the dial adds
    // guests, not rooms — which is what keeps this a two-term check.
    expect(s.money.upkeepPennies).toBe(114 * -2_500 + 3 * 30 * -1_500);
    expect(s.money.upkeepPennies).toBe(-420_000);
    // The capital is a transaction like any other, and it is the only one of G-011's new
    // reasons this run produces: nothing is demolished, so nothing is refunded, and the
    // hotel is never stuck, so nothing is borrowed.
    expect(s.money.startingCapitalPennies).toBe(500_000);
    expect(s.money.demolitionRefundPennies).toBe(0);
    expect(s.money.loanDrawPennies).toBe(0);
    expect(s.build.built * -250_000).toBe(s.money.constructionPennies);
    // Thirteen rooms and thirteen beds since G-009 — a built room arrives furnished, and a
    // bed is an entity — plus three amenity rooms, TWO OF WHICH NOW CARRY A PROVIDER ITEM
    // (G-013): the lounge's arm chair and the games room's vending machine. The café
    // requires nothing, so the amenities contribute 3 rooms + 2 items rather than 3 + 0.
    // `rooms.valid` is the number a reader wants, and it is neither 13 nor 31.
    // (3 + 1) rather than (3 + 4) at G-038c: three inherited bedrooms and ONE built one, each
    // with its bed, plus the three amenity rooms and their two provider items.
    // (3 + 2) rather than (3 + 1) at G-040b-ii: three inherited bedrooms and TWO built ones,
    // each with its bed, plus the three amenity rooms and their two provider items.
    expect(s.world.entities).toBe((3 + 2) * 2 + 3 + 2);
    expect(s.world.entities).toBe(15);
    // AND EIGHT OF THE TEN ROOMS THE PLAYER BUILT DO NOT WORK. The player's walk packs
    // rooms onto the floor above, over the corridors of the hotel below, so most of them
    // have nothing underneath — and with ten built rather than nine, two are now adjacent
    // and one of THOSE is sealed in as well. `rooms.valid` is still 5, and satisfied still
    // sits just under the ~350 demand saturates at, because the five that work are enough.
    // That is the trap ADR-0009 describes, and G-011's capital makes it arrive SOONER: the
    // player now pays 250,000p apiece for eight rooms that house nobody and still cost
    // 2,500p a night each. Recovery money buys a bigger mistake faster; the terminator for
    // that spiral is still M4's.
    //
    // G-034b MOVED WHICH ONES FAIL AND WHY, and the shape is the point rather than the
    // numbers: the player's blocks are offset so their end rooms land over the inherited
    // hotel, so TWO of the four now work and three of the ten cells the walk touched are in
    // mid-air. `noDoor` is 0 here because this run never builds two rooms hard against each
    // other — the criterion invocation in `validity.report.test.ts` is where packing happens.
    // G-038c: 3 -> 1. The three that stood in mid-air were the second, third and fourth builds,
    // and the floor charge means they never happen. The one room the player does build is still
    // over a corridor of the hotel below, so it is still a dud — the ADR-0009 trap is unchanged
    // in shape and smaller in size.
    // ==========================================================================================
    // G-039b-alpha: THE DUD IS STILL A DUD AND ITS REASON MOVED — `unsupported` 1 -> 0,
    // `noCorridor` 0 -> 1, `rooms.valid` UNCHANGED at 6. That is one room changing which rule it
    // fails, and it is the seeded plate's shift arriving here.
    //
    // The seeded plate moved to the ODD columns, so `playerCorridorCells`' block offset moved
    // with it (see `report.ts`, which measures why: leaving it would have put both of every
    // block's working rooms in mid-air). The one room this wallet can afford therefore lands
    // OVER AN INHERITED BEDROOM instead of over a lane — supported at last — and away from the
    // player's own corridor stub, which is what `noCorridor` is for.
    //
    // **ADR-0009's TRAP IS UNCHANGED IN SHAPE AND UNCHANGED IN SIZE**: 750,000p for a room that
    // houses nobody and still costs 2,500p a night. What moved is which of the five reasons
    // says so, and that is worth recording rather than smoothing, because the two reasons teach
    // a player different things — *"you built in mid-air"* against *"you built somewhere nobody
    // can walk to"*.
    // ==========================================================================================
    // ==========================================================================================
    // G-038a-iii-a: AND IT MOVES STRAIGHT BACK — `unsupported` 0 -> 1, `noCorridor` 1 -> 0,
    // `rooms.valid` STILL 6. The same one room, the same 750,000p, the third reason it has
    // carried in three goals. **Everything else in this invocation is byte-identical**: built 1,
    // refused 14 on funds, revenue 816,000p, upkeep -390,000p, 96 checkouts, 260 gave up.
    //
    // WHY, EXACTLY, BECAUSE "IT MOVED BACK" IS NOT A REASON. The player's plate now starts at
    // `minRow + 1`, so the one build this wallet can afford — index 9, the tenth ATTEMPT — lands
    // at (column 3, row 2) where it used to land at (column 3, row 1). This invocation seeds
    // only THREE rooms, and all three stand on floor 0 row 1. So the cell underneath the built
    // room is bare plot rather than an inherited bedroom, and `unsupported` is checked first.
    //
    // **THE ROW OFFSET IS NOT A DEFECT AND THIS IS NOT EVIDENCE OF ONE**, which is worth saying
    // because "the dud got worse" is the available misreading. It is a three-room hotel: the
    // seeded plate is one row deep because there are only three rooms to bank, so ANY offset on
    // the row axis takes the player's walk off it. At `--rooms 40` (the criterion) the plate is
    // five rows deep and `unsupported` FELL, 17 -> 13, for the same offset.
    //
    // ADR-0009's trap is unchanged in shape and unchanged in size, for the third time: 750,000p
    // for a room that houses nobody and still costs 2,500p a night.
    // ==========================================================================================
    // 1 -> 2 AT G-040b-ii: the second build this wallet can now afford lands in mid-air beside
    // the first, for the reason the block above gives — this invocation seeds three rooms in one
    // row, so the player's plate is off it. **ADR-0009's trap is unchanged in shape and is now
    // TWICE the size**: 1,000,000p spent on two rooms that house nobody and cost 2,500p a night
    // each. A dial that hands the player more money hands them a bigger version of the same
    // mistake, which is the sentence G-011's capital earned here and this goal repeats.
    expect(s.rooms.invalid.unsupported).toBe(2);
    expect(s.rooms.invalid.noDoor).toBe(0);
    expect(s.rooms.invalid.noCorridor).toBe(0);
    // Three inherited bedrooms that work, plus the three basement amenities, which always
    // do. All three of the player's builds are duds — the ratio of waste to spend is what
    // ADR-0009 describes, and a thinner margin does not make the walk any wiser.
    // Three inherited bedrooms, three basement amenities, and ONE of the player's four —
    // 3 + 3 until this goal, and the extra one is a room the player built over the hotel it
    // inherited rather than over the gaps in it.
    // G-038c: 3 + 3 + 1 -> 3 + 3 + 0. G-034b's "+1" was the SECOND room this walk built, the one
    // that landed over the inherited hotel rather than over a gap in it; with only one build
    // affordable, the walk never reaches that cell. **The claim that a player's build CAN work
    // is not lost from the suite** — `validity.report.test.ts`'s criterion invocation builds 26
    // rooms and 65 are valid — it is lost from THIS invocation, which is now a hotel that spent
    // 750,000p on one dud room and is the cleaner illustration of ADR-0009's trap for it.
    expect(s.rooms.valid).toBe(3 + 3 + 0);
    expect(s.guests.inInvalidRooms).toBe(0);
  });

  it('reports a balance equal to the fold of its own log', () => {
    // The exit criterion's own words. Folded here from the three reason totals the report
    // prints — a SECOND computation of the same quantity, from published numbers, which is
    // exactly what `balanceOf` against `sumByReason` does inside the sim.
    const s = summary();
    const folded =
      s.money.startingCapitalPennies +
      s.money.revenuePennies +
      s.money.upkeepPennies +
      s.money.constructionPennies +
      s.money.floorConstructionPennies;
    // G-038c: THE FOLD GAINS A FOURTH TERM, and that is the assertion rather than the number.
    // `floorConstructionPennies` is money the balance must account for; a fold that omitted it
    // would disagree with `balanceOf` by exactly 500,000p, which is what this line would catch.
    expect(folded).toBe(s.money.balancePennies);
    // G-040b-ii: 176,000 -> 168,000. The hotel earns 272,000p more and spends 250,000p of it on
    // a second dud room and 30,000p on its upkeep, so the closing balance is very slightly
    // WORSE. That is not a contradiction of the revenue rise above; it is ADR-0009's trap,
    // priced.
    expect(folded).toBe(168_000);
  });

  it('records refusals as OUTCOMES on a real run, without ever exiting non-zero', () => {
    // Six refusals, from a live process, on the documented exit-criterion invocation. A
    // `buildRoom` that threw on an unaffordable build would make this exit 1 with a stack
    // trace; one that silently skipped would report 0 here. THIS IS THE EXIT CRITERION'S
    // "refusal is a recorded outcome rather than a throw", measured through the CLI.
    // G-038c: 11 -> 14. THE SUM IS THE INVARIANT AND IT IS UNMOVED AT 15 — the walk still emits
    // exactly fifteen build commands, and three that used to succeed are now refused for money.
    // That pairing is what makes this a re-record of a cost rather than a change to the walk.
    // G-040b-ii: 14 -> 13. THE SUM IS STILL THE INVARIANT AND IT IS STILL 15 — the walk emits
    // the same fifteen build commands and one more of them is affordable, which is the same
    // pairing read from the refusal side.
    expect(summary().build.refused.insufficientFunds).toBe(13);
    expect(summary().build.built + summary().build.refused.insufficientFunds).toBe(15);
    expect(runCli(BUILD_ARGS).status).toBe(0);
  });

  it('accounts for every guest, with capacity growth visible in the outcome', () => {
    // Conservation still closes with a hotel that changes size underneath it. THE SECOND
    // HALF OF THIS TEST'S TITLE IS RETIRED AT G-027a: it read "3 rooms serve 267 guests over
    // this window, 13 rooms serve 350", and neither number survives a 1,440-tick stay. Six
    // working rooms now serve 97, and the three the player built are duds anyway. Capacity
    // growth is asserted where it is real — `build.built` above — rather than through a
    // guest count that a stay-length change moves for a different reason.
    const g = summary().guests;
    expect(departures(g) + g.inHotel).toBe(g.arrived);
    // 360 -> 480 AT G-040b-ii, AND IT IS EXACTLY FOUR THIRDS. The schedule emits the same 360
    // arrival COMMANDS it always did; the shipped cycle 1, 1, 2 turns three of them into four
    // guests. `arrived` counts GUESTS since G-040b-i, which is what makes the conservation law
    // above close at all.
    expect(g.arrived).toBe(480);
    // G-040b-ii: 96 -> 128. Two more rooms exist and a bedroom sleeps two, so a third more
    // stays complete; conservation still closes above, which is what this test is actually for.
    expect(left(g, 'checkedOut')).toBe(128);
    expect(g.stuck).toBe(0);
    expect(g.orphanedReservations).toBe(0);
  });

  it('is byte-identical across two real processes (I2, through the new commands)', () => {
    const first = runCli(BUILD_ARGS);
    const second = runCli(BUILD_ARGS);
    expect(first.stdout.equals(second.stdout)).toBe(true);
    expect(first.status).toBe(0);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 12,706ms
});

describe('G-008: --demolish, and the eviction path a real run can finally reach', () => {
  const DEMOLISH_ARGS = ['--days', '30', '--seed', '7', '--build', '2880', '--demolish', '5760', '--json'];
  type DemolishSummary = {
    guests: {
      arrived: number;
      /** Summary schema 2 (G-015): three counters became a table by reason. */
      departures: { reason: string; count: number }[];
      inHotel: number;
      stuck: number;
      orphanedReservations: number;
    };
    build: { demolished: number; refused: { noSuchRoom: number } };
  };
  let cached: DemolishSummary | undefined;
  const summary = (): DemolishSummary => {
    cached ??= JSON.parse(runCli(DEMOLISH_ARGS).stdout.toString('utf8')) as DemolishSummary;
    return cached;
  };

  it('produces a NON-ZERO evicted count, which no run before this could', () => {
    // `evicted` has been 0 in every CLI run since G-004 built the path, because nothing a
    // host could do would remove an OCCUPIED room — the seeded hotel was never demolished.
    // That made it a counter proven only by unit tests. Demolishing under a guest is the
    // player action that reaches it, and the reservation must not leak on the way out.
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
    expect(evicted(summary().guests)).toBeGreaterThan(0);
    expect(summary().guests.orphanedReservations).toBe(0);
    expect(summary().guests.stuck).toBe(0);
    expect(summary().build.demolished).toBeGreaterThan(0);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 10,769ms

  it('closes conservation with rooms disappearing underneath people', () => {
    const g = summary().guests;
    expect(departures(g) + g.inHotel).toBe(g.arrived);
    // 360 -> 480 at G-040b-ii, for the reason the arm above gives: the same 360 arrival commands
    // bring four guests for every three of them.
    expect(g.arrived).toBe(480);
  });

  it('records a demolish of a room that is not there rather than crashing on it', () => {
    // A FASTER CADENCE THAN THE BLOCK'S, AND G-011 IS WHY. At `--demolish 5760` this run
    // used to walk past the end of the hotel and record `noSuchRoom`; with 500,000p of
    // opening capital the hotel is bigger sooner, every one of those eight attempts now
    // finds a real room, and the counter is 0. That is the hotel being healthier, not the
    // refusal path disappearing — so the claim is re-pointed at a walk that still outruns
    // the building rather than being quietly dropped or asserted at a horizon where it is
    // vacuous (ADR-0007).
    //
    // `--demolish 1440` fires 30 times against ids 1, 3, 5, ... 59, and the hotel never
    // reaches 59 entities, so 23 of them name nothing. `buildRoom`'s sibling refusal is
    // still recorded rather than thrown, which is what this measures: a throw would make
    // the process exit non-zero with a stack trace, and it exits 0.
    const fast = JSON.parse(
      runCli(['--days', '30', '--seed', '7', '--build', '2880', '--demolish', '1440', '--json'])
        .stdout.toString('utf8'),
    ) as DemolishSummary;
    expect(fast.build.refused.noSuchRoom).toBeGreaterThan(0);
    expect(fast.build.demolished).toBeGreaterThan(0);
    expect(runCli(DEMOLISH_ARGS).status).toBe(0);
    // And the original invocation still demolishes real rooms — it simply no longer misses.
    expect(summary().build.demolished).toBeGreaterThan(0);
    expect(summary().build.refused.noSuchRoom).toBe(0);
  }, 60_000); // G-055, derived in vitest.config.ts: 3x the worst of 9 in-suite readings, 10,533ms

  it('leaves the default run untouched: the flags are OFF unless asked for', () => {
    // The reason `pnpm sim:bench` still measures the workload it always has, in the goal
    // immediately before G-010 fixes tick cost.
    expect(default2Day().stdout.toString('utf8')).toBe(GOLDEN_2_DAYS_SEED_42);
  });
});
