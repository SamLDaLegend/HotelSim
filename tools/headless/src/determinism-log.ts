// The command log the I2 determinism harness replays.
//
// SPLIT OUT OF `determinism-harness.ts` SO A TEST CAN READ IT (G-009). The harness is a
// script: importing it runs 200,000 ticks and writes to stdout. The log is the part that
// has to be inspectable, because every goal since G-001 has had to prove that the
// 100,000-tick I2 proof actually REACHES the thing that goal built — and a claim about
// what this log exercises, written in a comment above a function nothing can call, is a
// claim no test can refute (ADR-0007).
//
// So `validity.determinism.test.ts` replays exactly this function's output and reads the
// resulting world. One circuit: the gate and the test drive the same log, and there is no
// second copy to drift.

import {
  constructionCostOf,
  isRoomKind,
  demolitionRefundOf,
  firstEconomy,
  findItemType,
  firstRoomTypeProviding,
  lodgingNeedOf,
  minConstructionCostOf,
  needTypesInOrder,
  requiredItemsOf,
  roomTypeServes,
  stayDurationOf,
  toleranceOf,
} from '@hotelsim/sim';
import type { BoundContent, RoomTypeData, ScheduledCommand } from '@hotelsim/sim';

/**
 * HOW OFTEN A GUEST WALKS IN, in ticks — the log's own cadence, named rather than repeated.
 *
 * IT WAS A LITERAL IN ONE PLACE UNTIL θ-b1 AND IS NOW READ IN TWO, which is why it has a name:
 * the amenity pass sizes itself against this log's OCCUPANCY, and occupancy is this number
 * against `stayDurationTicks`. A second copy of `97` would be G-018's duplicated constant with
 * a derivation resting on it.
 *
 * 211 -> 97 AT G-009, and the reason is coverage rather than pacing — see the arrivals pass
 * below, which carries the measurement.
 */
const ARRIVALS_EVERY_TICKS = 97;

/**
 * A fixed command log. Same seed + same log => same hash, forever (I2).
 *
 * It spawns and despawns entities, not just noops, so the 100,000-tick determinism
 * proof actually covers the entity store rather than only the tick counter and the
 * RNG. The passes are appended in separate loops on purpose: the resulting schedule is
 * NOT sorted by tick, which also exercises `run`'s bucketing.
 *
 * Guests arrive here for the same reason (G-004). Without them the 100,000-tick proof
 * would say nothing about the guest loop — the exact hole this harness had at G-001,
 * when it ran only noops and covered no entity at all. Because guests arrive faster
 * than the rooms can serve them, and because the despawn pass removes rooms that are
 * occupied at the time, this log exercises satisfaction, giving up AND eviction over
 * 100,000 ticks in three processes.
 *
 * PLAYER BUILDS AND DEMOLITIONS ARE HERE FOR THE SAME REASON AGAIN (G-008), and the
 * reason has to be restated because it does not follow from G-005's. Settlement was
 * covered by this harness for free, because settlement is UNCONDITIONAL — it runs on
 * every tick whether or not anybody asked. A build happens only if commanded, so a
 * harness that issues no build command proves exactly nothing about builds, however many
 * ticks it runs. The three passes below therefore drive:
 *
 *   - successful builds, and the `construction` transactions they charge;
 *   - occupied refusals, by aiming some builds at cells the spawn pass has already used;
 *   - out-of-bounds refusals, by aiming some off the plot entirely — WHICH IS ALSO A
 *     PROOF INSIDE THE I2 GATE THAT A REFUSAL IS NOT A THROW. If `buildRoom` threw on a
 *     cell off the plot, this harness would not produce a hash at all;
 *   - insufficient-funds refusals, which arise on their own: the hotel opens broke and
 *     the builds are priced against revenue that arrives unevenly;
 *   - noSuchRoom refusals, from demolitions aimed at ids that are not live rooms.
 *
 * So the five counters those passes drive — `built`, `demolished`, and the `occupied`,
 * `outOfBounds`, `noSuchRoom` and `insufficientFunds` refusals — are non-zero by tick 100,000,
 * and all of it is hashed state. Verified by replaying the log and reading the counters
 * (`validity.determinism.test.ts`), not assumed.
 *
 * WHAT THIS LOG DOES *NOT* DRIVE, NAMED RATHER THAN LEFT AS AN IMPLICATION. This paragraph read
 * *"non-zero in EVERY counter"* until G-036c, and it stopped being true at G-036b without
 * anybody noticing — which is the class §5.8 exists for, and the reason it is repaired here
 * rather than quietly widened. The log issues no `drawRoom`, no `placeItem`, no `resizeRoom` and
 * no `moveItem`, so `placed`, `moved`, `resized`, `displaced` and the four refusals those verbs
 * reach are all ZERO in it.
 *
 * That is a deliberate scope line and not a debt to pay by editing this file. **A command log is
 * a durable artefact**: adding a verb to it moves the I2 hash for a reason that says nothing
 * about determinism, and the property those verbs need — that a REFUSAL is recorded rather than
 * thrown, and that an edit is a pure function of the log — is already covered by the unit suites
 * that drive them through the real tick (`build.resize.test.ts`, `build.save.test.ts`). What
 * only this harness can prove is that a hundred thousand ticks of the SAME log agree across
 * three processes, and that claim is about the ticking rather than about which verbs it uses.
 *
 * INVALID ROOMS ARE HERE FOR A REASON THAT IS THE INVERSE OF G-005'S (G-009). Settlement
 * was free to cover because it is unconditional. Validity is the opposite twice over: it
 * is CONDITIONAL on a guest meeting a room, and IT IS NOT HASHED AT ALL — validity is
 * derived, so no field carries it and the state hash can only ever see its CONSEQUENCES,
 * which are guests not being served and guests being evicted. A harness whose rooms all
 * worked would produce a hash that said nothing whatever about the validity rules.
 *
 * So this log deliberately builds a hotel that is part broken:
 *
 *   - the spawn walk climbs a DIAGONAL, so most spawned rooms have nothing beneath them
 *     — `unsupported`, in bulk;
 *   - only every other spawned room is furnished, so `missingItem` occurs too;
 *   - a basement pass spawns TERRACES IN A CROSS, so the middle room of each has a room hard
 *     against all FOUR sides — `noDoor`, arising from a placement rather than from a
 *     demolition, and from geometry rather than from an edge of the world (G-036a);
 *   - and the ground floor carries furnished, supported, doored rooms, so guests are
 *     still served and the proof covers rooms that WORK as well as rooms that do not. A
 *     harness in which nothing worked would prove only that failure is deterministic.
 *
 * Verified by replaying this log and reading the tallies, in
 * `validity.determinism.test.ts` — not assumed here.
 */
/**
 * THE ROWS THE SHIPPED PLOT HAS (G-034a, widened at G-036a).
 *
 * `createGridBounds()` returns a plot eight rows deep — 0..7 — so every cell in this log has
 * to be on it or `applyBuildRoom` refuses the build and `spawnEntity` throws. LITERALS rather
 * than imports of `DEFAULT_MIN_ROW`/`DEFAULT_MAX_ROW`, and the reason is what this log IS: a
 * command log whose whole value is that it does not move. Reading the live constants would
 * silently re-aim every cell in it the next time somebody edits the plot, which would move the
 * I2 hash on a change that says nothing about determinism, and it would move it in a way whose
 * only symptom is a number in four digests. **The day G-034a named has now come and the
 * literal did its job: widening the plot moved these cells only where this file says so.**
 *
 * WHAT DEPENDED ON THE LOG BEING ONE ROW DEEP, AND WHAT REPLACED IT. The terrace waves and the
 * sky tower produce `noDoor` and `unsupported` by SEALING rooms against their neighbours, and
 * on a strip two neighbours were all there were. On a plan a room has FOUR, so a terrace of
 * three in a line acquires a door front and back and stops being sealed at all — measured
 * before this goal changed anything: one extra row on the old log takes `noDoor` from 5 to 0
 * at 40,000 ticks while every other tally holds. The terraces below are therefore CROSSES
 * rather than lines, and `validity.determinism.test.ts` counts the result rather than
 * asserting it is non-zero.
 */
const SHIPPED_FIRST_ROW = 0;
/**
 * The floor a guest walks in on, on the plot this log is written against (G-038c).
 *
 * A LITERAL FOR THE SAME REASON THE ROWS ABOVE ARE LITERALS: this function is handed content
 * and no world, so it cannot call `entranceCell`, and the plot it schedules against is the
 * shipped default. It is named rather than spelled `0` inline because the churn pass below
 * depends on it being the floor `floorChargeFor` treats as free -- which is a fact about the
 * ENTRANCE and not about the number zero.
 */
const SHIPPED_ENTRANCE_FLOOR = 0;
const SHIPPED_LAST_ROW = 7;
/** How many rows the plot above has. Derived from the two literals, never counted twice. */
const SHIPPED_ROWS = SHIPPED_LAST_ROW - SHIPPED_FIRST_ROW + 1;
/**
 * The floors the shipped plot has, as literals, for `SHIPPED_FIRST_ROW`'s reason exactly
 * (G-038a-iii-c). The spawn diagonal walks `spawnIndex % 21` and the terrace waves land on -1
 * and -2, so these two numbers are what this log has ALWAYS been written against; they are
 * named here because the shaft below has to span them and a shaft that stopped short would be
 * a stairwell with floors above it nobody can climb to.
 */
const SHIPPED_LOWEST_FLOOR = -2;
const SHIPPED_HIGHEST_FLOOR = 20;
/** The plot's own left and right edges, as literals, for the same reason. `layCorridor` and
 *  `layStair` both THROW off the plot, and the shaft's column is derived from these two. */
const SHIPPED_FIRST_COLUMN = 0;
const SHIPPED_LAST_COLUMN = 79;

// ============================================================================
// THE GROUND FLOOR'S CIRCULATION, IN THREE PIECES, AND THE SHAFT THAT LEAVES IT
// (G-038a-iii-c).
//
// THE PROBLEM THIS SOLVES, AND IT WAS INVISIBLE UNTIL A STAIRWELL EXISTED. Before this goal
// the ground floor's plan was a scatter of ISLANDS — the corridor pass declares the four
// neighbours of every floor-0 room and nothing else, so the lane beside the room at column 14
// and the lane beside the room at column 18 were never joined. That cost nothing while no
// world declared a stairwell, because `reachableCells` then spends the floor axis from EVERY
// cell: the fill dropped onto floor 0 from the empty air above it, at every column at once,
// and every island was reached from the sky. Declare a shaft and that stops. Measured on this
// log at the gate's own horizon, a full-height shaft at the entrance corner with the plan
// unchanged: **`unreachable` 0 -> 13, `checkedOut` 636 -> 0.** The hotel stopped trading
// because its front door opened onto nothing.
//
// SO THE FLOOR GETS A SPINE, A TOOTH PER ROOM, AND A SHAFT ON THE SPINE:
//
//   THE SPINE   one lane across the whole plot at row 3, and the row is FORCED rather than
//               picked. A lane under a room is not circulation, so the spine has to be on a
//               row no floor-0 room stands on: this log's entrance floor is occupied on rows
//               0, 1, 2, 4, 5 and 7 (the spawn diagonal reaches this floor at
//               `spawnIndex % 21 === 0`, so at rows 0, 5, 2, 7 and 4; the amenity waves, the
//               churn and the seal hosts are row 0; the seal blockers and one terrace arm are
//               row 1; one spawn is row 2), which leaves rows 3 and 6. And the spine may not
//               cross a WITHHELD cell either, or it is cut in two and the far end of the hotel
//               goes with it — the back-of-house pass below sits on row 5, so its withheld
//               neighbours occupy rows 4, 5 and 6. **Row 3 is what is left.**
//   THE TEETH   for every floor-0 room, the cells of its own column between it and the spine.
//               A room on row 0 already has `(column, 1)` declared by the neighbour rule, so
//               its tooth is the single cell `(column, 2)`; a room at the back of the plot
//               gets a longer one. This is what joins each island to the spine, and it is a
//               rule over the schedule rather than a list, exactly as the neighbour pass is.
//   THE SHAFT   THE MIDDLE OF THE PLOT, ON THE SPINE. Both halves are derived rather than
//               chosen. ON THE SPINE, because a stairwell that is not on the lane is a
//               stairwell nobody can walk to: floor 0 is the one floor of this plot that has a
//               PLAN, so the shaft's foot has to be a cell that plan names. IN THE MIDDLE,
//               because stairs are ALIGNED — one column through the plot — so the walk to the
//               stairwell from a cell at column `c` is `|c - X|`, and the worst of those over
//               the plot is `max(X - first, last - X)`, which is least at the midpoint. That
//               is `stairs.ts`' own worst-journey arithmetic applied to the one free variable
//               this log has. `(0 + 79) >> 1` is 39, and it lands on a legal cell without
//               adjustment: the spawn diagonal's row at a given column is always `column % 8`,
//               so column 39 is only ever touched at row 7; the builds walk columns 40..78;
//               the terraces columns 60..74; the sky tower column 79; no floor-0 pass in this
//               log stands anything on row 3 at all.
//
//               AND IT IS DECLARED A CORRIDOR AS WELL AS A STAIR — it is already on the spine,
//               so this costs nothing, but it makes the claim structural rather than
//               incidental: the shaft stands on circulation the plan names, not on
//               `isDeclaredWalkway`'s stair clause alone.
//
// STAIRS ARE ALIGNED (`stairs.ts`), so this is ONE `(column, row)` through the whole plot and
// there is no second shaft to choose.
//
// ==========================================================================================
// WHAT THE SITING COSTS, MEASURED ACROSS EIGHTEEN OF THEM RATHER THAN ARGUED (G-038a-iii-c).
//
// A stairwell makes every cross-floor journey walk to one column first, so this hotel trades
// differently whatever column it goes in — `stairLeg` reads only the stairwell's column and
// row, so no choice of shaft HEIGHT and no choice of which floors declare it can avoid the
// bill. Exact deterministic counts at the gate's horizon, seed 42, `checkedOut`:
//
//   no shaft (before this goal) 636 · column 0 (the entrance's own column) 561 · column 20 663
//   column 32 708 · column 36 713 · **column 39 (this one) 708** · column 44 741 · column 72 716
//
// So the midpoint siting leaves this harness's hotel trading ELEVEN PER CENT MORE than it did
// with no stairwell at all, which is the opposite direction from the one `report.ts` paid at
// G-038a-iii-b — and the reason is that this log's rooms are spread over eighty columns rather
// than gathered on a plate, so halving the walk to the core is worth more than the walk costs.
// ==========================================================================================
const SPINE_ROW = 3;
const SHAFT_COLUMN = (SHIPPED_FIRST_COLUMN + SHIPPED_LAST_COLUMN) >> 1;
const SHAFT_ROW = SPINE_ROW;

// ============================================================================
// BACK OF HOUSE — `noCorridor` GETS A PASS OF ITS OWN (G-038a-iii-c), WHICH IS WHAT EVERY
// OTHER REASON IN THIS LOG ALREADY HAS.
//
// `unsupported` has the sky tower. `noDoor` has the terrace crosses. `missingItem` has the
// unfurnished half of the spawn walk. `noCorridor` had **a hand-written list of nine cells**
// withheld from the plan, chosen so that three rooms OTHER passes happened to spawn came out
// stranded — and one of the three was the room standing on the FRONT DOOR. That list is gone.
// Two reasons, and the second is the one that matters:
//
//   1. IT COULD NOT SURVIVE A SPINE. The front door's own two neighbours were withheld, so a
//      plan that joins the ground floor cannot also strand the room on the mat: the entrance
//      would be sealed off from the building it is the entrance to, and every room on the
//      floor would read `unreachable` — a DIFFERENT reason, and not the one the withholding
//      was for. You cannot strand the front door and still have a hotel.
//   2. IT WAS TUNED TO ROOMS IT DID NOT OWN. The other two cells strand rooms the amenity
//      wave and the spawn diagonal happen to put there, and both of those rooms live and die
//      by the id-walking despawn and demolish passes. Any change to what this hotel EARNS
//      moves how many rooms it BUILDS, which moves every later id, which moves what those
//      walks take away — so the coverage this reason depends on was a function of the
//      economy. Twice over, that is a workload tuned until a number came back.
//
// SO THE REASON IS PRODUCED BY CONSTRUCTION: furnished, grounded, doored lodging rooms on the
// entrance floor whose four neighbours the plan deliberately omits. They are BACK OF HOUSE — a
// room with no lane onto it — and their neighbours are the ONLY cells this log withholds, so
// the withheld list is DERIVED from this list rather than written down beside it.
//
//   TWO OF THEM, EARLY AND LATE, WHICH IS THE TERRACE WAVES' OWN ARGUMENT ONE REASON OVER.
//   A low-id room cannot be relied on to reach the horizon — the despawn walk (1, 4, 7 …), the
//   demolish walk (2, 7, 12 …) and the `underfoot` walk all climb from the bottom, and this
//   file already says of the first terrace wave that its rooms "have been picked apart by tick
//   ~40,000". A high-id room cannot be present at the START. So the reason needs one of each,
//   and neither can do the other's job:
//
//     tick 51       LOW ID, so the reason is present from the first arrival onwards, and it is
//                   a room every arriving guest would otherwise have taken (`findFreeRoom`
//                   walks ascending id). Whether it reaches the horizon is not claimed here —
//                   it is a COUNT in `validity.determinism.test.ts`, at both horizons, and if
//                   an id walk ever swallows it that count is what says so.
//     tick 70,001   ABOVE EVERYTHING the three id walks reach, which is the third terrace
//                   wave's own argument: by then this log has issued far more spawns than the
//                   `3k + 1`, `5k + 2` and `underfoot` walks have ids. So the reason is still
//                   being produced AT THE HORIZON THE GATE COMPARES — the claim a count at
//                   tick 100,000 can check and a comment cannot.
//
//   ROW 5, COLUMNS 25 AND 27. The row is two back from the spine, so withholding the cells
//   `(column, 4)` and `(column, 6)` around each room leaves row 3 whole — a withheld cell ON
//   the spine row would cut the spine in half and take the far end of the hotel with it. The
//   columns are two apart so the single cell between them, `(26, 5)`, is a neighbour of both
//   and is withheld once; and nothing else in this log touches columns 24..28 on floor 0 (the
//   spawn diagonal reaches this floor at columns 0, 21, 42, 63 and 4; the amenity waves start
//   at 10, 44 and 64 and step by two; the seal hosts are 30 and 35; the churn is 70).
//
// AND THE CONSEQUENCE IS REAL, WHICH IS WHAT THE HASH CAN SEE. Validity is derived and no
// field carries it, so a stranded room only reaches the state hash if it is a room a guest
// would otherwise have used. Both of these are lodging rooms on the entrance floor of a hotel
// that turns guests away — `gaveUp` is non-zero at every horizon this log is read at — so a
// working room here would have been slept in.
// ============================================================================
const BACK_OF_HOUSE_ROW = 5;
const BACK_OF_HOUSE: readonly { readonly tick: number; readonly column: number }[] = [
  { tick: 51, column: 25 },
  { tick: 70_001, column: 27 },
];

export function commandLog(ticks: number, content: BoundContent): readonly ScheduledCommand[] {
  // The kind comes from the LOADED CONTENT, not from a literal. So the 100,000-tick
  // determinism proof now covers the content path end to end: if the loader broke, or
  // if the injected registry were empty, this harness would not produce a hash at all.
  //
  // IT IS THE LODGING ROOM, NOT `roomTypes[0]` (G-012). That expression was "the lowest
  // id", which was the room guests sleep in only while there was exactly one room type.
  // The amenities this goal adds sort BELOW it — `games_room` and `hotel_cafe` both come
  // before `standard_room` — so this whole log would have become a hotel of cafés: no
  // guest served, every claim in the comments below quietly false, AND THE I2 GATE STILL
  // GREEN, because it compares runs to each other and holds no reference hash. Asking for
  // the room by what it provides is what keeps this log about the thing it says it is.
  const lodgingNeed = lodgingNeedOf(content);
  const entityKind = lodgingNeed === undefined ? undefined : firstRoomTypeProviding(content, lodgingNeed.id)?.id;
  if (entityKind === undefined) {
    throw new Error('determinism harness: the injected content defines no room type guests can stay in');
  }
  // What a room of this kind needs to work, from the room type's own `requires` — never
  // from a literal (I3, ADR-0003).
  const furniture = requiredItemsOf(content, entityKind);
  const furnish = (tick: number, at: { floor: number; column: number; row: number }, into: ScheduledCommand[]): void => {
    for (const itemId of furniture) {
      into.push({ tick, command: { kind: 'spawnEntity', entityKind: itemId, at } });
    }
  };

  const schedule: ScheduledCommand[] = [];
  for (let tick = 0; tick < ticks; tick += 997) {
    schedule.push({ tick, command: { kind: 'noop' } });
  }

  // ============================================================================
  // THE HOTEL CHURNS ITS CAPITAL AWAY AND HAS TO BORROW (G-011).
  //
  // Loans are the inverse of settlement and the same shape as builds: settlement was free
  // to cover because it is UNCONDITIONAL, whereas a loan happens only if commanded AND
  // only if the hotel is stuck. A harness that issues no draw proves nothing about draws,
  // and — this is the part that needed engineering — a harness that issues draws while
  // solvent proves only that they are refused. Measured on this log before this pass: the
  // hotel is never once eligible, because it opens with capital and then accumulates rooms
  // whose refund value alone keeps it able to act.
  //
  // So the log deliberately does what a player would have to do to get stuck: build a room
  // and immediately scrap it, over and over. Each cycle burns exactly
  // `constructionCost - refund`, which is the arithmetic the demolition refund is bounded
  // by, so this pass is also the upkeep dodge's economics running inside the I2 gate.
  //
  // THE NUMBER OF CYCLES IS DERIVED FROM CONTENT, NOT WRITTEN DOWN. Reserves start at the
  // opening capital and fall by the round-trip loss each cycle; the hotel is stuck once
  // they drop below the cheapest room it could build (`canDrawLoan`). Deriving it means a
  // designer who changes the capital, the price or the refund gets a harness that still
  // reaches the state — and `recovery.determinism.test.ts` asserts a draw was actually
  // GRANTED, so if this ever stops working it fails loudly rather than going quiet.
  //
  // ITS CELL IS THE ENTRANCE FLOOR, COLUMN 1, AND IT MOVED THERE AT G-038c BECAUSE THE
  // DERIVATION ABOVE WOULD OTHERWISE HAVE BECOME FALSE PROSE.
  //
  // It was floor 20, column 0. Under ADR-0047 B8 the build that puts the FIRST room on a
  // floor the hotel does not occupy pays `floorConstructionCostPence` on top of the room, and
  // the churn DEMOLISHES its room every cycle -- so every cycle re-opened floor 20 and the
  // real round trip was `constructionCost + floorCharge - refund`, not the
  // `constructionCost - refund` this pass computes and the demolition refund is bounded by.
  //
  // AND IT DID NOT MERELY COST MORE, IT STOPPED THE PASS DEAD. The shipped floor charge is
  // derived to exceed the shipped opening capital (see `floorConstructionCostPenceSchema`),
  // so the FIRST cycle was refused for want of funds, nothing was ever burned, the hotel was
  // never stuck, and `recovery.determinism.test.ts` went red on
  // `loanOutcomes.drawn > 0`: measured, one draw at a charge of 250,000p and ZERO at
  // 500,000p or above, with the I2 gate still green throughout. **A LOAN PATH THAT THE
  // 100,000-TICK PROOF NO LONGER REACHES**, which is the ADR-0007 class this whole file
  // exists to keep closed.
  //
  // THE ENTRANCE FLOOR IS NEVER CHARGED, so the round trip there really is
  // `constructionCost - refund` and the derivation above is exactly true again rather than
  // carrying a new term. It is also what a player would actually do: churning stock to raise
  // cash happens on the floor you are standing on, and opening a storey in order to knock it
  // down again is not a move anybody makes.
  //
  // COLUMN 70 IS CHOSEN, not incidental, and it is the same collision argument the old cell
  // had -- plus one the old cell never had to make. The spawn diagonal is
  // `(spawnIndex % 21, spawnIndex % 80, spawnIndex % 8)`, so on the entrance floor it lands on
  // columns 0, 21, 42, 63 and 4 at the indices this log reaches (~99); the amenity waves start
  // at columns 10, 44 and 64 and step by two; the seal hosts are 42 and 54; the sky tower is
  // column 79; the build rotation is floors 5..19 and 900; the terraces are floors -1 and -2.
  // 70 and its two column-neighbours are free of all of them.
  //
  // THE EXTRA ARGUMENT, AND IT IS WHY COLUMN 1 WAS TRIED AND DROPPED: the corridor pass at the
  // bottom of this file declares a corridor beside EVERY floor-0 room in the schedule, and the
  // churn is now a floor-0 room. At column 1 that meant three new corridor cells at columns
  // 0..2 -- inside the region `WITHHELD_CELLS` tunes by hand to keep `noCorridor` alive. At 70
  // the three cells it adds are in a stretch of the plot nothing else touches, so the pass
  // stays additive and the withheld region is untouched. The corridors OUTLIVE the churn rooms,
  // and that is `layCorridor`'s own semantics rather than a leak: a corridor is a declaration
  // about a cell, not a thing standing on it.
  //
  // Every churn room is built and demolished inside ticks 1..2N and the first arrival is tick
  // 101, so a churn room -- which on this floor is GROUNDED and therefore VALID, where the old
  // one was `unsupported` -- can never be lodged in.
  //
  // IT RUNS FIRST, SO IT SHIFTS EVERY LATER ENTITY ID, and G-010 left a warning saying
  // exactly that would happen ("a pass inserted before tick 47 would move that, and the
  // sky-tower test is what would say so"). `churnEntities` below is added into the
  // `underfoot` walk's offset for that reason — derived, never a literal.
  // ============================================================================
  const economy = firstEconomy(content);
  const roundTripLoss = constructionCostOf(content, entityKind) - demolitionRefundOf(content, entityKind);
  const cheapestRoom = minConstructionCostOf(content);
  const churnCycles =
    economy === undefined || roundTripLoss <= 0 || !Number.isFinite(cheapestRoom)
      ? 0
      : Math.max(0, Math.ceil((economy.startingCapitalPence - cheapestRoom + 1) / roundTripLoss));
  let churnTick = 1;
  let churnRoomId = 1;
  for (let cycle = 0; cycle < churnCycles; cycle += 1) {
    const at = { floor: SHIPPED_ENTRANCE_FLOOR, column: 70, row: SHIPPED_FIRST_ROW };
    schedule.push({ tick: churnTick, command: { kind: 'buildRoom', roomType: entityKind, at } });
    schedule.push({ tick: churnTick + 1, command: { kind: 'demolishRoom', id: churnRoomId } });
    churnTick += 2;
    // One room plus its furniture per cycle; `buildRoom` furnishes what it places (G-009).
    churnRoomId += 1 + furniture.length;
  }
  const churnEntities = churnCycles * (1 + furniture.length);
  // The draw that is GRANTED, on the first tick after the churn. Everything above has
  // reduced the hotel to no rooms and less cash than the cheapest one costs, which is the
  // state ADR-0011 calls unrecoverable — so this command is the exit from it, exercised
  // inside the 100,000-tick determinism proof rather than only in a unit test.
  if (churnCycles > 0) {
    schedule.push({ tick: churnTick, command: { kind: 'drawLoan' } });
  }
  // AND DRAWS THAT ARE REFUSED. Once the spawn passes below have given the hotel rooms,
  // its liquidation value alone keeps it able to act, so every one of these is a recorded
  // `notEligible` — which is what proves INSIDE THE I2 GATE that an ineligible draw is a
  // recorded outcome and not a throw. If it threw, this harness would produce no hash at
  // all, and that is something the gate can genuinely see.
  for (let tick = 4_111; tick < ticks; tick += 4_111) {
    schedule.push({ tick, command: { kind: 'drawLoan' } });
  }
  // Ids are handed out from a monotonic counter, so the nth spawn always has id n.
  //
  // Each spawn lands on its OWN cell (G-007), walking the plot rather than stacking on
  // one square, so the 100,000-tick determinism proof covers positions in hashed state
  // as well as membership. The walk is a pure function of the spawn index — no RNG draw
  // — so the hash stays a function of the seed and the command log, and of nothing else.
  //
  // Every other one is FURNISHED and the rest are not (G-009), so `missingItem` and a
  // furnished room both occur in the same pass, and the ones that land on floor 0 are
  // rooms that genuinely work.
  let spawnIndex = 0;
  for (let tick = 13; tick < ticks; tick += 1009) {
    // THE DIAGONAL WALKS ALL THREE AXES SINCE G-036a. The row modulus divides the column
    // modulus (8 divides 80), so two spawns share a cell exactly when they shared one before
    // — the walk is no less injective for having a third coordinate, and `spawnEntity` still
    // THROWS on an occupied cell, which is what makes that claim loud rather than hopeful.
    const at = { floor: spawnIndex % 21, column: spawnIndex % 80, row: spawnIndex % SHIPPED_ROWS };
    const furnished = spawnIndex % 2 === 0;
    spawnIndex += 1;
    schedule.push({ tick, command: { kind: 'spawnEntity', entityKind, at } });
    if (furnished) furnish(tick, at, schedule);
  }
  // BASEMENT TERRACES (G-009), so the MIDDLE room of each is sealed in: `noDoor`. Two
  // adjacent rooms would not do it — each still has a free outer side — which is the sort of
  // thing that is obvious only once the rule is written down.
  //
  // FLOOR -1 IS CHOSEN, not incidental. It must be at or below ground, or the terrace
  // would report `unsupported` first and never reach the door rule at all; and no other
  // pass in this file touches a negative floor — the spawn walk is `spawnIndex % 21`, the
  // builds are floors 5..19 and 900 — so a terrace can never collide with one, which
  // matters because `spawnEntity` THROWS on an occupied cell rather than refusing.
  // Furnished, so the reason reported is the door rather than the bed.
  // They come in TWO WAVES, and the second is not padding. The first wave lands early, on
  // floor -1, and is what makes the hotel earn anything at all — the outer room of each
  // terrace works, so guests are served and revenue eventually pays for a build. But those
  // rooms take LOW IDS, and the despawn and demolish passes below walk ids upward from 1,
  // so by tick ~40,000 they have been picked apart and every sealed-in middle room has
  // been opened up again. (The figure that used to sit here was measured against terraces of
  // three on a one-row plot and is not restated for a cross on an eight-row one;
  // `validity.determinism.test.ts` counts what the tally actually is.)
  //
  // A reason that is reachable for the first third of the run and gone by the end is a
  // reason the gate's FINAL hash says nothing about. So the second wave lands on floor -2,
  // late, with ids far above anything the despawn pass reaches — sealed-in rooms that are
  // still sealed in at tick 100,000.
  //
  // AND SINCE G-036a A TERRACE IS A CROSS RATHER THAN A LINE, BECAUSE THE PLOT HAS DEPTH.
  // A line of three seals its middle room only where the front and back neighbours are off
  // the plot; on an eight-row plot they are real cells, so the whole wave would have gone
  // valid — measured at 5 -> 0 before this goal touched the layout. Five rooms in a plus
  // shape put a room hard against ALL FOUR sides of the middle one, which is the same
  // player mistake asked of a plan: the four arms keep their own doors (each has three free
  // sides), the centre has none, and `noDoor` is produced by geometry rather than by an
  // edge of the world.
  const terraceWave = (
    firstTick: number,
    step: number,
    floor: number,
    count: number,
    firstColumn = 60,
  ): void => {
    let terrace = 0;
    for (let tick = firstTick; tick < ticks && terrace < count; tick += step) {
      const left = firstColumn + terrace * 4; // a clear column between terraces, so they stay apart
      const middle = left + 1;
      const row = SHIPPED_FIRST_ROW + 1; // one row in, so the centre has a real cell in FRONT of it
      const cells = [
        { floor, column: left, row },
        { floor, column: middle, row },
        { floor, column: left + 2, row },
        { floor, column: middle, row: row - 1 },
        { floor, column: middle, row: row + 1 },
      ];
      for (const at of cells) {
        schedule.push({ tick, command: { kind: 'spawnEntity', entityKind, at } });
        furnish(tick, at, schedule);
      }
      terrace += 1;
    }
  };
  // THREE CROSSES A WAVE RATHER THAN FIVE TERRACES, SO THE BASEMENT HOLDS THE SAME NUMBER OF
  // ROOMS IT ALWAYS DID (G-036a). A cross is five rooms where a line was three, and five of
  // them would put twenty-five rooms a wave in the basement instead of fifteen — MEASURED, and
  // it is not a rounding: the extra upkeep took the hotel's balance from -209,500 to
  // -1,401,500 over 100,000 ticks and left 156,500p of the loan UNREPAID at the horizon, so
  // `recovery.determinism.test.ts`'s claim that the final partial repayment runs inside the
  // gate stopped being true. THE ROOM BUDGET IS THE THING THE LOG WAS TUNED AROUND; the shape
  // of a seal is not. Three crosses still put three sealed rooms in each wave.
  terraceWave(601, 607, -1, 3);
  terraceWave(20_011, 6_007, -2, 3);
  // ============================================================================
  // A THIRD WAVE, ONE CROSS, VERY LATE — AND IT IS THE WAVE THAT MAKES THIS PASS'S OWN CLAIM
  // TRUE FOR THE FIRST TIME (G-036a).
  //
  // The second wave's paragraph says it lands "with ids far above anything the despawn pass
  // reaches — sealed-in rooms that are still sealed in at tick 100,000". **MEASURED ON THE
  // TREE BEFORE THIS GOAL TOUCHED IT, THAT WAS FALSE**: replaying the shipped log to 100,000
  // ticks gives `noDoor` 0. The demolish walk (`id = 5k + 2`) reaches id 182 by the horizon and
  // the wave-2 ids sit under it, so its centres were opened up again — a claim in a comment
  // that no test pinned, which is ADR-0007's own shape, in the file written to close it.
  //
  // It is repaired rather than restated, and cheaply: ONE cross, spawned so late that every
  // id-walking pass is far below it, on the floor wave 1 uses and in a column band nothing
  // else on the plot touches (72..74 — the spawn diagonal never reaches a negative floor, the
  // builds are floors 5..19 and 900, the churn is floor 20, and the amenities are floor 0).
  // Five rooms of upkeep for the last twenty days of the run, which is inside the margin the
  // loan repayment needs (`recovery.determinism.test.ts`); the debt reaches zero by tick
  // 60,000, well before this lands. `validity.determinism.test.ts` counts the tally at the
  // gate's own horizon rather than trusting this paragraph.
  // ============================================================================
  terraceWave(70_001, 6_007, -1, 1, 72);
  // A SKY TOWER: four furnished storeys stacked at column 79, starting at floor 3, with
  // NOTHING AT FLOOR 2 UNDER THEM (G-009 critique round 1).
  //
  // This pass exists because the transitive-support fix did NOT MOVE THE I2 HASH without
  // it. Every other room in this log either sits on the earth or has nothing directly
  // below it at all, so "the cell below holds a room" and "the chain reaches the earth"
  // gave identical answers everywhere and the gate could not see the difference. Under the
  // old rule the top three of these four were VALID PROVIDERS serving guests in mid-air;
  // under the fixed rule all four are `unsupported`. That is the whole point of a
  // determinism harness that covers what a goal built (the G-004 lesson), and reverting
  // transitivity now moves the hash.
  //
  // COLUMN 79 IS CHOSEN, not incidental: the spawn diagonal reaches it only at
  // `spawnIndex` 79 (floor 16), and neither build destination can produce it — the clean
  // branch is columns 40..78 and the occupied branch is `buildIndex % 80` with
  // `buildIndex` never reaching 79 in 100,000 ticks. `spawnEntity` THROWS on an occupied
  // cell, so a collision would fail the gate loudly rather than quietly.
  //
  // SPAWNED AT TICK 47, WHICH IS THE WHOLE TRICK. A tower placed late changed nothing:
  // guests take the LOWEST-ID valid free room, this hotel is almost never short of one
  // (5 guests give up in 100,000 ticks), and a high-id tower is simply never reached — so
  // whether its upper storeys counted as valid had no consequence and the hash was
  // IDENTICAL under both rules. Verified by mutation, not assumed: reverting
  // `groundedRooms` to the local rule with a late tower reproduced the hash exactly.
  //
  // At tick 47 the hotel is one room old and guests start arriving at tick 101 every 97
  // ticks, so the queue is real and these rooms are the next ones a guest would take.
  // Under the local rule the top three served those guests; under the transitive rule
  // none of them does. That difference is what the state hash records.
  //
  // ITS ROW IS THE PLOT'S BACK EDGE SINCE G-036a, AND THAT IS THE `unsupported` CASE BEING
  // KEPT HONEST RATHER THAN A COSMETIC MOVE. Support is `cellBelow`, which preserves BOTH
  // horizontal axes, so a tower at row 7 needs floor 2 EMPTY AT ROW 7 — the same claim in a
  // world where the row is a real coordinate rather than the only one. Nothing else in this
  // log reaches (floor 2, column 79, row 7): the spawn diagonal touches column 79 only at
  // `spawnIndex` 79, which is floor 16, and neither build destination can produce column 79.
  for (const floor of [3, 4, 5, 6]) {
    const at = { floor, column: 79, row: SHIPPED_LAST_ROW };
    schedule.push({ tick: 47, command: { kind: 'spawnEntity', entityKind, at } });
    furnish(47, at, schedule);
  }
  // ============================================================================
  // SOMEWHERE TO EAT, SIT AND PLAY (G-012) — one room per ENGAGEMENT need.
  //
  // The need vector is the third feature in this file whose coverage does not follow from
  // the passes above, and the reason is the G-009 reason rather than the G-005 one.
  // Settlement was free to cover because it is UNCONDITIONAL. An engagement need is
  // conditional twice over: a guest only pursues it if a provider EXISTS, and the tally it
  // moves is written only when that guest departs. A log whose hotel is all bedrooms
  // produces guests that form four needs, satisfy one, and fail three every single time —
  // so `needOutcomes` would be hashed state carrying nothing but a constant, and the 100k
  // proof would say nothing about engagement, reservation or release.
  //
  // With these three the log covers, over 100,000 ticks: engagements taken and released,
  // needs MET and needs UNMET for the same need type, urgency ordering deciding which
  // provider a guest walks to first, and the second reservation field round-tripping
  // through every hash. `needs.determinism.test.ts` replays this log and asserts it rather
  // than trusting this comment (ADR-0007).
  //
  // FLOOR 0, COLUMNS 10/12/14, AND NONE OF THAT IS INCIDENTAL. Floor 0 is the earth, so
  // they are grounded and stay valid for the whole run; the odd columns between them are
  // the doors. No other pass can reach these cells: the spawn diagonal touches floor 0
  // only at columns 0, 4, 21, 42 and 63 (`spawnIndex % 21` and `% 80` over ~99 spawns),
  // the build rotation's occupied branch needs `buildIndex % 21 === 0` AND
  // `buildIndex % 3 === 1`, which no integer satisfies, and the terraces are below ground.
  // `spawnEntity` THROWS on an occupied cell, so a collision would fail the gate loudly.
  //
  // THEY SPAWN AT TICK 47, WITH THE TOWER AND BEFORE THE FIRST GUEST AT TICK 101, and they
  // therefore SHIFT EVERY LATER ID — which is exactly what G-010's warning and G-011's
  // churn pass are about. `underfoot` below adds their entity count, derived rather than
  // written down.
  // ============================================================================
  // ============================================================================
  // AND THERE HAS TO BE ENOUGH OF THEM (θ-b1) — ONE OF EACH IS NOT A HOTEL, IT IS A QUEUE.
  //
  // ADR-0017 4(b) landed and this log's hotel turned out to be the pathological case: one
  // provider per engagement need against ~15 concurrent guests. Measured on this log, with the
  // rule off and on: **`checkedOut` 880 -> 10, `leftDissatisfied` 0 -> 1,057**, and the knock-on
  // was worse than the number — ten fewer builds could be afforded, so twenty fewer entity ids
  // were handed out, so the despawn and demolish walks reached further and took away the very
  // states two coverage tests exist to assert. `provider.determinism.test.ts` said so by name.
  //
  // **A HARNESS'S HOTEL MUST NOT BE THE THING UNDER TEST.** This log exists to make release
  // causes, migrations and the money loop occur inside the 100,000-tick proof; a hotel in which
  // 95% of guests walk out before anything interesting happens covers less of all three. That is
  // §6.1's "a need that cannot be satisfied is a bug, not difficulty" applied to a scenario
  // rather than to content, and it is the same argument `assertNeedDemandIsServiceable` makes.
  //
  // THE COUNT IS DERIVED, NOT CHOSEN, and from a relation this codebase already owns. A need is
  // served for `1/(1 + refillPerTick)` of the time in steady state — `needShareBasisPoints`'s
  // duty cycle — so ONE PROVIDER SUSTAINS `1 + refillPerTick` CONCURRENT GUESTS. This log's
  // occupancy is its own two numbers: a stay of `stayDurationTicks` against an arrival every
  // `ARRIVALS_EVERY_TICKS`. Hence:
  //
  //     copies = ceil( (stayDurationTicks / ARRIVALS_EVERY_TICKS) / (1 + refillPerTick) )
  //
  // On the shipped tables that is `ceil((1440 / 97) / 8)` = `ceil(1.86)` = **2**, and it is
  // computed rather than written down so that a designer who changes the stay, the cadence or a
  // refill rate gets a harness that still covers what it claims to.
  //
  // IT IS A CEILING AND NOT A FLOOR, deliberately: the arm that would go quiet is the one where
  // guests are starved, and this pass exists to stop that. The opposite failure — a hotel so
  // well provisioned that nobody is ever dissatisfied — is covered elsewhere and would show up
  // as `leftDissatisfied` falling to zero, which `needs.determinism.test.ts` asserts against.
  //
  // COLUMNS STAY EVEN AND KEEP THE SAME STRIDE, so the odd columns between them are still the
  // doors and the claim above still holds: the spawn diagonal touches floor 0 only at columns
  // 0, 4, 21, 42 and 63, and 21 is odd. Six rooms reach column 20 rather than 14.
  // ============================================================================
  const arrivalsEveryTicks = ARRIVALS_EVERY_TICKS;
  const concurrentGuests = (stayDurationOf(content) ?? 0) / arrivalsEveryTicks;
  const copiesFor = (roomType: RoomTypeData): number => {
    let copies = 1;
    for (const needType of needTypesInOrder(content)) {
      if (needType.id === lodgingNeed?.id) continue;
      if (!roomTypeServes(content, roomType.id, needType.id)) continue;
      copies = Math.max(copies, Math.ceil(concurrentGuests / (1 + needType.refillPerTick)));
    }
    return copies;
  };

  // ============================================================================
  // AND THEY COME IN TWO WAVES, FOR THE REASON THE TERRACES DO — MEASURED, NOT ASSUMED.
  //
  // The first wave spawns at tick 47 and takes LOW IDS, and the despawn walk (`id = 3k + 1`)
  // and the demolish walk (`id = 5k + 2`) both climb from the bottom. Sampled across a replay
  // of this log, live providers per need at ticks 1,000 / 25,000 / 50,000 / 75,000 / 99,999:
  //
  //     guest_entertainment    2 -> 1 -> 0 -> 0 -> 0
  //
  // **A need with no provider at all for the second half of the run**, which is the state
  // `assertNeedsAreSatisfiable` refuses in CONTENT and which a scenario can still produce
  // dynamically. It was invisible before θ-b1 because nothing made a guest act on it; now every
  // guest in that half saturates, and the log's own claim to cover "needs MET and needs UNMET
  // for the same need type" over 100,000 ticks was resting on the two needs that happened to
  // survive.
  //
  // The second wave lands late, above everything both walks reach, in the terrace pass's own
  // words: *"a reason that is reachable for the first third of the run and gone by the end is a
  // reason the gate's FINAL hash says nothing about."* Same sentence, one subject over.
  //
  // COLUMNS 44 UPWARD, AND NONE OF THAT IS INCIDENTAL EITHER: the spawn diagonal touches floor 0
  // only at columns 0, 4, 21, 42 and 63; the seal hosts are at 29..31 and 34..36; the build
  // rotation cannot reach floor 0 at all (`buildIndex % 21 === 0` AND `% 3 === 1` has no
  // solution). `spawnEntity` THROWS on an occupied cell, so a collision fails the gate loudly.
  // ============================================================================
  const AMENITY_WAVES: readonly {
    readonly tick: number;
    readonly firstColumn: number;
    readonly copies?: number;
  }[] = [
    { tick: 47, firstColumn: 10 },
    { tick: 30_011, firstColumn: 44 },
    // A THIRD WAVE, LATE AND DELIBERATELY THIN — ONE OF EACH RATHER THAN THE DERIVED TWO.
    // Two more of each at this tick made the hotel WORK too well: `leftDissatisfied` stopped at
    // 60,046 and the final 40 % of the gate's run carried no instance of the row this goal
    // exists to add. One of each keeps the hotel trading to the horizon while leaving it short
    // enough that guests still walk out — which is the balance the census below measures rather
    // than the one this comment asserts.
    { tick: 62_003, firstColumn: 64, copies: 1 },
  ];

  let amenityEntities = 0;
  for (const wave of AMENITY_WAVES) {
    amenityEntities += spawnAmenities(wave.tick, wave.firstColumn, wave.copies);
  }

  function spawnAmenities(tick: number, firstColumn: number, copies?: number): number {
  let amenityColumn = firstColumn;
  let spawned = 0;
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === entityKind) continue;
    // `roomTypeServes`, NOT `roomTypeProvides` (G-013): a room type can serve a need
    // through an item it requires without providing anything itself, and asking the
    // narrower question silently drops such a room type out of this log — which is exactly
    // what it did to `hotel_lounge` the first time this ran, taking `guest_comfort`'s whole
    // coverage with it. Same trap, same fix, as `amenityRoomTypesOf` in `report.ts`.
    let servesEngagement = false;
    for (const needType of needTypesInOrder(content)) {
      if (needType.id === lodgingNeed?.id) continue;
      if (roomTypeServes(content, roomType.id, needType.id)) servesEngagement = true;
    }
    if (!servesEngagement) continue;
    for (let copy = 0; copy < (copies ?? copiesFor(roomType)); copy += 1) {
      const at = { floor: 0, column: amenityColumn, row: SHIPPED_FIRST_ROW };
      amenityColumn += 2;
      schedule.push({ tick, command: { kind: 'spawnEntity', entityKind: roomType.id, at } });
      spawned += 1;
      for (const itemId of requiredItemsOf(content, roomType.id)) {
        schedule.push({ tick, command: { kind: 'spawnEntity', entityKind: itemId, at } });
        spawned += 1;
      }
    }
  }
  return spawned;
  }
  // ============================================================================
  // AN ITEM THAT OUTLIVES THE ROOM IT SERVES IN (G-013) — MEASURED TO BE MISSING, THEN ADDED.
  //
  // An engagement with an ITEM can end three ways: its room is demolished (the item goes
  // with it), the ITEM is despawned, or THE ROOM STOPS BEING VALID WHILE THE ITEM STANDS
  // THERE. The first two are the old shapes wearing new clothes; the third is the one this
  // goal introduced, because an item's provision is borrowed from its host.
  //
  // Before this pass existed, a replay of this log classified every engagement that ended
  // and found the first two causes present and THE THIRD ABSENT — not rare, absent. So the
  // 100,000-tick proof covered every release cause except the one the goal introduced. That
  // is the G-009 sky-tower situation exactly — a rule the gate could not see — and it is
  // fixed the same way: give the log a world in which the state occurs.
  //
  // THE COUNTS THAT ESTABLISHED THAT ARE NOT REPEATED HERE, AND THAT IS A RULE RATHER THAN
  // AN OMISSION (ADR-0007, G-013): a comment offered as evidence may not carry a figure no
  // test pins. Prose may describe; it may not measure. This paragraph carried figures three
  // times and was wrong three times, in three different ways — a world the code does not
  // build, a denominator spanning a window in which the event was impossible, and a
  // retraction whose stated cause did not reproduce. The qualitative claims survived every
  // one of those corrections. What pins the coverage now is `provider.determinism.test.ts`,
  // which counts the causes and asserts them.
  //
  // ONE THING WORTH RECORDING, BECAUSE IT POINTS THE OTHER WAY. The last correction — the
  // one that found the wrong denominator — made the gap between the two waves WIDER, not
  // narrower: the thin one is thinner than the bad figure said and the robust one is closer
  // to always-in-use. A retraction that strengthens the claim it corrects is unusual, and it
  // is mild evidence that the underlying reading was sound and only the framing was broken.
  // Which is the argument for deleting the figures rather than the conclusion.
  //
  // HOW IT IS REACHED, WITHOUT DESPAWNING ANYTHING. A second copy of an amenity room stands
  // at (0, 30), carrying the item its type requires; later, rooms are placed either side of
  // it, so it loses its DOOR and becomes invalid while every entity in it is untouched. The
  // item is still live, still placed, still in the same cell — and serves nobody. No id
  // arithmetic is involved, which is why this pass cannot drift when another one is
  // inserted before it.
  //
  // WHICH ROOM AND WHICH ITEM IS DECIDED BY `secondHost` BELOW, AND ITS RULE AND ITS
  // DEPENDENCIES ARE STATED THERE RATHER THAN HERE. Two versions of that account have now
  // been wrong in this spot — one naming the lounge when the code chose the games room, and
  // one still naming the games room after G-014a moved the choice to the lounge — so it is
  // written once, beside the `find` that decides it, and nowhere else.
  //
  // THE CELLS ARE CHOSEN, NOT INCIDENTAL, and every pass they have to miss is in this file:
  // the spawn diagonal walks `spawnIndex % 21` against `spawnIndex % 80` and so touches
  // floor 0 only at columns 0, 4, 21, 42 and 63; the first-set amenities hold 10, 12 and 14;
  // the terraces are below ground; the builds are floors 5..19 and 900; the tower is column
  // 79 and the churn is floor 20. Columns 29-31 and 34-36 are touched by none of them.
  //
  // AND THAT CLAIM IS PINNED BY CONSTRUCTION RATHER THAN BY A COUNT: `spawnEntity` THROWS on
  // an occupied cell rather than refusing, so a collision produces no hash at all and the
  // I2 gate goes red. That is the strongest shape a witness can have, and it is why no
  // measurement belongs in this paragraph.
  // WHICH HOST GETS SEALED, AND THE ONE DEPENDENCY THE PASS HAS. THIS IS THE ONLY ACCOUNT OF
  // IT IN THIS FILE.
  //
  // The pass only produces a release if the sealed item is OCCUPIED on the tick its door
  // closes. Until G-014a the rule was "the lowest-id host whose required item provides
  // anything" — the games room and its vending machine — and it depended on that item's need
  // staying oversubscribed so a second-choice provider was in use. G-014a ordered provider
  // choice by `fitBasisPoints`, the shipped table ranks a café above a vending machine, and
  // an item that shares its need with a room became a last resort rather than a busy second
  // choice. One of the two waves stopped catching anybody and `provider.determinism.test.ts`
  // went red.
  //
  // SO THE PASS NOW PREFERS A HOST WHOSE ITEM IS THE SOLE PROVIDER OF ITS NEED, which removes
  // the dependency rather than re-tuning it: an item nothing else can substitute for is in
  // use whenever anybody wants that need, whatever any ranking says. On the shipped table
  // that is `hotel_lounge` carrying an `arm_chair`, the only thing in the game that serves
  // `guest_comfort`, and the stranded item is therefore a chair.
  //
  // THE FALLBACK IS THE OLD RULE, for content in which no such item exists: the lowest-id
  // host whose required item provides anything. THE ORDER-DEPENDENCE HAZARD LIVES THERE AND
  // ONLY THERE — add a room type sorting below the current fallback host that requires a
  // providing item, and the fallback silently moves to it. The preferred branch is chosen by
  // a PROPERTY rather than by id order, so it does not move for that reason.
  //
  // Both branches are guarded by the same test, which counts the release cause and goes red
  // if it stops firing.
  const hostsAProvidingItem = (roomType: RoomTypeData): boolean =>
    roomType.id !== entityKind &&
    requiredItemsOf(content, roomType.id).some((itemId) => (findItemType(content, itemId)?.provides ?? []).length > 0);
  // "SOLE PROVIDER" MEANS SOLE, AND BOTH TABLES HAVE TO BE ASKED. An earlier version checked
  // only that no ROOM TYPE provides the need, which would have called an item sole while a
  // second item type served the same need — and a second provider is exactly what makes an
  // item idle at the tick its door closes. Rooms and items are one candidate pool
  // (`providersFor`), so the question has to be asked of the pool.
  const soleProviderNeedOf = (roomType: RoomTypeData): boolean =>
    roomType.id !== entityKind &&
    requiredItemsOf(content, roomType.id).some((itemId) =>
      (findItemType(content, itemId)?.provides ?? []).some(
        (needId) =>
          !content.content.roomTypes.some((other) => (other.provides ?? []).includes(needId)) &&
          !(content.content.itemTypes ?? []).some(
            (other) => other.id !== itemId && (other.provides ?? []).includes(needId),
          ),
      ),
    );
  const secondHost =
    content.content.roomTypes.find(soleProviderNeedOf) ?? content.content.roomTypes.find(hostsAProvidingItem);
  //
  // IT COMES IN TWO WAVES, AND THE SECOND IS NOT PADDING — IT IS THE TERRACE PASS'S OWN
  // ARGUMENT, A HUNDRED LINES ABOVE, APPLIED AGAIN. That pass says it plainly: "a reason
  // that is reachable for the first third of the run and gone by the end is a reason the
  // gate's FINAL hash says nothing about." A door closes once, so each sealing yields one
  // release; and the early room is later taken away by the despawn pass, so the state it
  // produced is gone before the horizon the gate compares.
  //
  // WAVE 1 IS EARLY, while the hotel is busiest, and is the THIN one: its host stands only
  // until the despawn pass reaches its id, so it sees far fewer engagements than wave 2 and
  // its seal fires without much margin. WAVE 2 IS LATE, with ids above anything the despawn
  // (1, 4, 7 …), demolish (2, 7, 12 …) and `underfoot` walks reach; its item is in use for
  // the great majority of its pre-seal life, and the sealed room and its stranded item are
  // both still standing at the end of the run. So wave 2 is what puts the state into the
  // FINAL hash, and wave 1 is what reaches it while the hotel is busiest.
  //
  // THE FOUR TICKS ARE THE CALL ARGUMENTS BELOW AND ARE WRITTEN NOWHERE ELSE IN THIS FILE.
  // A table of them here was wrong within one goal of being written — it still named the two
  // seal ticks that G-014a replaced — and a reader who trusts it re-aims the wrong numbers.
  // If a future change silences either wave, `provider.determinism.test.ts` goes red; none of
  // this draws randomness, so the failure is loud rather than flaky, and that test rather
  // than this comment is what holds the coverage.
  if (secondHost !== undefined) {
    const seal = (host: number, spawnTick: number, sealTick: number): void => {
      const at = { floor: 0, column: host, row: SHIPPED_FIRST_ROW };
      schedule.push({ tick: spawnTick, command: { kind: 'spawnEntity', entityKind: secondHost.id, at } });
      // Only entities that exist BEFORE the `underfoot` walk starts at tick 1,601 are ones
      // that walk has to step over, so wave 2 contributes nothing to the offset.
      if (spawnTick < 1_601) amenityEntities += 1;
      for (const itemId of requiredItemsOf(content, secondHost.id)) {
        schedule.push({ tick: spawnTick, command: { kind: 'spawnEntity', entityKind: itemId, at } });
        if (spawnTick < 1_601) amenityEntities += 1;
      }
      // Two lodging rooms hard against its sides take its DOOR away. Nothing is despawned:
      // the item stands untouched in a room that has stopped working, which is the whole of
      // cause (b). Furnished, so the blockers are valid rooms rather than a second kind of
      // broken thing.
      // THREE BLOCKERS RATHER THAN TWO SINCE G-036a. The host stands on the plot's FRONT row,
      // so the cell in front of it is off the plot and is skipped by the door rule exactly as
      // it always was; the cells left, right and BEHIND are real, and all three have to hold a
      // room or the host keeps a door and this pass stops producing a release at all.
      for (const beside of [
        { floor: 0, column: host - 1, row: SHIPPED_FIRST_ROW },
        { floor: 0, column: host + 1, row: SHIPPED_FIRST_ROW },
        { floor: 0, column: host, row: SHIPPED_FIRST_ROW + 1 },
      ]) {
        schedule.push({ tick: sealTick, command: { kind: 'spawnEntity', entityKind, at: beside } });
        furnish(sealTick, beside, schedule);
      }
    };
    // BOTH SEALING TICKS MOVED AT G-014a, AND THE REASON IS WORTH MORE THAN THE NUMBERS.
    // THE SEALING TICK HAS TO LAND WHILE THE ROOM IS ALIVE AND ITS ITEM IS BEING USED — a
    // fact about this log, not something the code can assert, which is why the census test
    // measures the outcome rather than trusting this paragraph. G-014a changed which item
    // gets stranded (see `secondHost` above) and therefore when it is busy, and the two
    // inherited ticks both landed in gaps: 7,001 sat after the last engagement its host ever
    // sees, and 60,013 missed a long engagement by ONE TICK. Neither pass was broken; both
    // were aimed at a schedule that had moved under them. Both ticks below were then chosen
    // by measuring when each host's item is actually occupied and landing inside a window,
    // which is what the census test verifies rather than trusts.
    //
    seal(30, 47, 6_800); // WAVE 1 — early and thin; see above.
    seal(35, 20_011, 59_900); // WAVE 2 — late and robust; the one the final hash carries.
  }
  // Some of these target ids that are not live yet, or are already gone. That is
  // deliberate: a despawn of an unknown id must be a deterministic no-op.
  for (let tick = 2_003; tick < ticks; tick += 4_001) {
    const id = Math.floor((tick - 2_003) / 4_001) * 3 + 1;
    schedule.push({ tick, command: { kind: 'despawnEntity', id } });
  }
  // ============================================================================
  // AN ITEM TAKEN OUT FROM UNDER A GUEST USING IT (θ-b1) — release cause (c), AIMED.
  //
  // It used to arrive for free: the walk above removes every third id, and with 1,109 guests
  // engaging low-id amenities for most of the run, one of those despawns always landed inside
  // somebody's engagement. θ-b1 changed when guests are busy — they leave earlier and engage
  // less — and the coincidence stopped happening. `provider.determinism.test.ts` said so by
  // name, which is the whole reason that census exists (G-013).
  //
  // SO IT IS AIMED RATHER THAN HOPED FOR, exactly as the two sealing waves above are, and for
  // the reason their comment gives: *the tick has to land while the item is being used*, which
  // is a fact about this log that no code here can assert. MEASURED on a replay — every window
  // in which an item is engaged, sorted by length — item 24 is engaged over ticks
  // 97,240..97,371 and this despawn lands in the middle of it.
  //
  // RE-AIMED AT SWEEP 1, TWICE OVER, AND THE RE-AIMING IS THE COST OF AIMING: ADR-0026's
  // amendment changed when guests are busy, and the third amenity wave changed which entity ids
  // exist. Both moved the window out from under the previous tick, and `provider.determinism`'s
  // census said so by name each time — which is the arrangement working. A LATE window is
  // chosen deliberately, so that this release cause is one the gate's FINAL hash can carry.
  //
  // A DESPAWN SHIFTS NO IDS, which is what makes aiming safe here where it would not be for a
  // spawn: `nextId` only ever rises, so nothing before this tick moves and the window stays
  // where it was measured. `provider.determinism.test.ts` verifies the outcome rather than
  // trusting this paragraph — if a future goal moves the schedule under it, that census fails
  // by name instead of the coverage disappearing quietly.
  schedule.push({ tick: 97_300, command: { kind: 'despawnEntity', id: 24 } });
  // ARRIVALS. THE CADENCE MOVED FROM 211 TO 97 AT G-009, and the reason is not pacing —
  // it is that the log has to keep affording a build. Revenue here is capped by ARRIVALS,
  // not by rooms, while upkeep grows with every room the spawn pass adds; once half the
  // spawned rooms were unfurnished and most were unsupported, the hotel earned too little
  // to ever reach `constructionCostPence` and `buildOutcomes.built` fell to ZERO at every
  // horizon — silently taking G-008's whole build-coverage claim with it. At 97 the
  // hotel builds again (4-5 rooms by tick 100,000).
  //
  // The old comment here claimed the give-up path was "exercised as hard as the satisfied
  // one". IT NEVER WAS, at either cadence, and the number is worth writing down rather
  // than the adjective: replaying this log to tick 100,000 gives arrived 1,030, satisfied
  // 1,009, unsatisfied 5, evicted 11 — at 211 it was 474 / 466 / 1 / 5. So both paths
  // occur and are covered, the faster cadence covers them BETTER in absolute terms, and
  // "as hard as" was never true of either. Guests give up rarely because the working rooms
  // outnumber the guests waiting for them, which is a property of this log rather than a
  // fault in it: `validity.determinism.test.ts` asserts each outcome is non-zero, which is
  // what the I2 proof actually needs.
  for (let tick = 101; tick < ticks; tick += ARRIVALS_EVERY_TICKS) {
    schedule.push({ tick, command: { kind: 'guestArrives' } });
  }

  // ============================================================================
  // AND A RUSH IN THE LAST QUARTER, SO THE GIVE-UP PATH IS EXERCISED BY CONSTRUCTION
  // RATHER THAN BY LUCK (G-023b-ii).
  //
  // The paragraph above is right that rare give-ups are a property of this log rather than a
  // fault in it — and `validity.determinism.test.ts` then adds a requirement the paragraph
  // does not meet: every departure reason must still be FIRING AT THE END, because *"a reason
  // that is reachable for the first third of the run and gone by the end is a reason the
  // gate's FINAL hash says nothing about."*
  //
  // MEASURED, NOT SUSPECTED. Stepping this log to 100,000 ticks, `gaveUp` reaches 64 by tick
  // 41,895 and then fires EXACTLY ONCE MORE in the remaining 58,000 ticks, at 98,446. **That
  // single crossing is the whole of what put the tree over the bar.** At tick 99,000 the hotel
  // holds two roomless guests whose longest wait is 153 ticks against a tolerance of 180 —
  // permanently just short of giving up. The assertion was passing on a coin-flip, and it was
  // found because G-023b-i's travel probe perturbed the flip and it came up tails.
  //
  // SO THE LOG NOW CREATES THE PRESSURE INSTEAD OF HOPING FOR IT: arrive every tick, for
  // longer than a guest's patience, starting in the last quarter.
  //
  //   - ONE PER TICK outruns any finite hotel. The room-freeing rate is bounded by
  //     `rooms / stayDurationTicks` however many rooms this log has built, so a queue forms
  //     without this pass having to know that number — which is the point, because a designer
  //     who changes the build schedule must not silently un-cover the path again.
  //   - FOR `2 x toleranceTicks`, because a guest gives up after `toleranceTicks` of waiting
  //     and the window must contain a whole wait plus the room for it to start in.
  //   - STARTING AT THREE QUARTERS, the same fraction the assertion measures against, so the
  //     give-ups land inside the window being asserted rather than near it.
  //
  // Every term is content or the test's own bar. Nothing here is a chosen number.
  // ============================================================================
  const tolerance = toleranceOf(content);
  if (tolerance !== undefined) {
    const rushStarts = Math.floor((ticks * 3) / 4);
    for (let tick = rushStarts; tick < Math.min(ticks, rushStarts + 2 * tolerance); tick += 1) {
      schedule.push({ tick, command: { kind: 'guestArrives' } });
    }
  }
  // THE PLAYER BUILDS (G-008). Three destinations on a rotation, so all three placement
  // outcomes occur and none of them depends on how much money happens to be in the bank:
  //
  //   0 -> floor 5 upward, columns the spawn pass never touches: a clean cell. Succeeds
  //        when there is cash, refused for funds when there is not. Since G-009 it also
  //        arrives FURNISHED and floating, which is an `unsupported` room the player paid
  //        for — the trap being real inside the I2 gate.
  //   1 -> a cell the spawn pass walks (`floor = i % 21`, `column = i % 80`), so it is
  //        occupied whenever that room is still live: an `occupied` refusal.
  //   2 -> floor 900, which no plot contains: an `outOfBounds` refusal, EVERY TIME, which
  //        is what proves inside the I2 gate that this records rather than throws.
  //
  // A pure function of the build index — no RNG draw — so the hash stays a function of
  // the seed and the command log, and of nothing else.
  let buildIndex = 0;
  for (let tick = 307; tick < ticks; tick += 1_303) {
    const at =
      buildIndex % 3 === 0
        ? { floor: 5 + (buildIndex % 15), column: 40 + (buildIndex % 39), row: buildIndex % SHIPPED_ROWS }
        : buildIndex % 3 === 1
          ? // THE OCCUPIED BRANCH STILL LANDS ON THE SPAWN WALK, AND THE ROW DOES NOT WEAKEN
            // THAT (G-036a): both walks take the same index through the same three moduli, so
            // they agree on all three axes exactly where they used to agree on two.
            { floor: buildIndex % 21, column: buildIndex % 80, row: buildIndex % SHIPPED_ROWS }
          : { floor: 900, column: 0, row: SHIPPED_FIRST_ROW };
    buildIndex += 1;
    schedule.push({ tick, command: { kind: 'buildRoom', roomType: entityKind, at } });
  }
  // AND DEMOLISHES. Some of these name live rooms and some name ids that never existed or
  // are already gone — the `noSuchRoom` refusal, which must be a recorded outcome rather
  // than the silent no-op `despawnEntity` gives.
  for (let tick = 3_701; tick < ticks; tick += 2_609) {
    const id = Math.floor((tick - 3_701) / 2_609) * 5 + 2;
    schedule.push({ tick, command: { kind: 'demolishRoom', id } });
  }
  // A DEMOLITION UNDER THE NOSE OF AN ARRIVING GUEST (G-010), and the reason is the sky
  // tower's reason one goal later.
  //
  // G-010 lets the derived placement index SURVIVE a tick in which entity membership did
  // not change. The predicate that decides "did not change" has five clauses, and each was
  // deleted in turn to see what noticed.
  //
  // BEFORE THIS PASS, NONE OF THEM REDDENED THE GATE — and the reason is worth stating,
  // because the tempting weaker version of it is false. Deleting two of the clauses MOVES
  // the state hash, which looks like a witness and is not: `determinism.mjs` compares runs
  // to each other and holds no reference hash, so a hash that changes CONSISTENTLY passes
  // every check it makes. A moved hash is a witness only to a human who happens to be
  // comparing against a number written down in GOALS.md.
  //
  // The clause `draft.removed.size === 0` is the one that can do better, because breaking it
  // does not merely change an answer — it makes the simulation THROW. The log demolishes
  // plenty already, but never on a tick where the demolished room was the very room the next
  // guest through the door would have taken, so a stale index was never actually READ for a
  // room that had just gone. The gate was blind to it exactly as it was blind to the
  // floating tower at G-009.
  //
  // The failure it now exposes is loud rather than subtle: a guest reserves a room that is
  // despawned at the commit boundary, and `assertGuestStoreInvariants` throws on the same
  // tick — the harness produces no hash at all, which IS something the gate can see. That is
  // the strongest shape a witness can have, and it is the cache's only gate-level witness of
  // any kind. It is reachable only because the ARRIVAL and the DEMOLITION land together.
  // An arrival is pushed explicitly rather than relying on the 97-tick cadence to coincide,
  // because "these two series happen to share a tick sometimes" is not a guarantee.
  //
  // THE WALK STARTS ABOVE THE SKY TOWER, AND THAT IS NOT A DETAIL. Aimed from id 1 it ate
  // ids 3..10 — which ARE the tower — and G-009's "the gate can see that support is
  // transitive" went red. A witness for this goal that quietly deletes the witness for the
  // last one is a bad trade, and the only reason it was not made is that the earlier goal
  // left a test which failed loudly.
  //
  // The offset is DERIVED from the same `furniture` the rest of this file uses, not written
  // as a literal: the tick-13 pass emits one furnished room and the tick-47 tower emits
  // four, so the first five furnished spawns are the ones to step over. A pass inserted
  // before tick 47 would move that, and the sky-tower test is what would say so.
  //
  // G-011 INSERTED EXACTLY SUCH A PASS, and this is the line that pays for it: the churn
  // above consumes `churnEntities` ids before tick 13, so the walk starts that much higher.
  // Derived from the same computation that produced them, so the two cannot drift.
  //
  // G-012 INSERTED ANOTHER SUCH PASS, and this line pays for it too: the amenities spawn
  // at tick 47 alongside the tower, so their ids sit between the tower and the first
  // terrace. Derived from the same loop that produced them, so the two cannot drift — and
  // if they ever do, it is the sky-tower test and the amenity test that say so.
  const perFurnishedRoom = 1 + furniture.length;
  let underfoot = churnEntities + 5 * perFurnishedRoom + amenityEntities + 1;
  for (let tick = 1_601; tick < ticks; tick += 1_261) {
    schedule.push({ tick, command: { kind: 'guestArrives' } });
    schedule.push({ tick, command: { kind: 'demolishRoom', id: underfoot } });
    underfoot += 1;
  }
  // THE BACK-OF-HOUSE PAIR — `noCorridor`'s own pass. See `BACK_OF_HOUSE` above for why it
  // exists and why its cells are where they are. FURNISHED, because `computeRoomInvalidity`
  // asks for the bed BEFORE it asks for the lane: an unfurnished room here would report
  // `missingItem` and this pass would cover nothing at all.
  //
  // IT RUNS AFTER EVERY OTHER SPAWNING PASS AND BEFORE THE CORRIDOR PLAN, and both halves of
  // that are load-bearing. After, so it shifts no id in any pass above it. Before, so the
  // corridor pass below reads these rooms out of the schedule with all the others — which is
  // what makes the withheld list a DERIVATION rather than a second copy of these cells.
  for (const room of BACK_OF_HOUSE) {
    const at = { floor: SHIPPED_ENTRANCE_FLOOR, column: room.column, row: BACK_OF_HOUSE_ROW };
    schedule.push({ tick: room.tick, command: { kind: 'spawnEntity', entityKind, at } });
    furnish(room.tick, at, schedule);
  }
  // ============================================================================
  // WHERE PEOPLE WALK ON THE GROUND FLOOR (G-034b), AND THE CELLS DELIBERATELY LEFT OFF
  // THE PLAN.
  //
  // THE FOURTH INVALIDITY REASON HAS THE SAME COVERAGE PROBLEM THE OTHER THREE HAVE, AND THE
  // SKY TOWER'S ANSWER APPLIES TO IT WORD FOR WORD. Validity is DERIVED, so no field carries
  // `noCorridor` and the state hash can only ever see its CONSEQUENCE: a room a guest would
  // have taken and cannot. A disconnected room nobody would have reached anyway is a room
  // whose rule the gate cannot witness — *"a tower placed late changed nothing, because guests
  // take the lowest-id valid free room and this hotel is almost never short of one."*
  //
  // SO THE GROUND FLOOR IS PLANNED, AND THE ONLY CELLS WITHHELD FROM THE PLAN ARE THE FOUR
  // NEIGHBOURS OF EACH BACK-OF-HOUSE ROOM. That pass is above, with its whole argument;
  // what belongs here is only the consequence for the plan, and it is one sentence: the
  // withheld list is a FUNCTION of `BACK_OF_HOUSE`, so a cell can be withheld only because a
  // room this log deliberately strands stands beside it. **Nothing is withheld to keep a
  // count where it was** (G-038a-iii-c), which is what the nine hand-chosen cells here before
  // this goal were for.
  //
  // EVERYTHING ELSE ON THE GROUND FLOOR KEEPS ITS EXACT VERDICT. Declaring any corridor on
  // floor 0 makes the WHOLE FLOOR planned — open plan is a per-floor property
  // (`isDeclaredWalkway`) — so every other ground-floor room needs its door declared or it changes
  // reason for a change this goal did not intend. Both horizontal neighbours are declared, not
  // one: the seal pass's blockers at columns 29 and 31 open OUTWARD, away from the host they
  // wall in, so a lane on one side only would report them `noCorridor` while the thing they
  // exist to seal reported the same. And a declared cell with a room standing on it is not
  // circulation, so the seal still seals: the host at column 30 is valid until tick 6,800 and
  // `noDoor` after it, exactly as before this goal.
  //
  // DERIVED FROM THIS LOG'S OWN COMMANDS, NOT FROM A HAND-WRITTEN COLUMN LIST, AND THAT IS A
  // CORRECTION RATHER THAN A PREFERENCE. The list was written first, from the passes above,
  // and it was WRONG: it missed the three amenity waves at columns 18 and 44..54, so six
  // engagement providers lost their doors at once and the hotel's checkouts fell from 187 to
  // 12 over 40,000 ticks — while every `toBeGreaterThan(0)` in `validity.determinism.test.ts`
  // stayed green, because each reason still occurred somewhere. That is the θ-b1 failure mode
  // exactly, and a pass added by a later goal would have reproduced it silently. Reading the
  // schedule is not the `SHIPPED_FIRST_ROW` hazard: that one is about reading a LIVE CONSTANT which
  // can move without this log moving, and this reads the log itself — the same thing `furnish`
  // already does by placing furniture wherever a room is placed.
  //
  // AT TICK 0, BEFORE ANYTHING IS BUILT ON IT: the ground floor's circulation is planned once,
  // never edited, so the corridor set is constant for the whole run and every ground-floor
  // verdict is a function of what was built rather than of when the plan was drawn.
  // ============================================================================
  // ==========================================================================================
  // WITHHELD CELLS, NOT WITHHELD COLUMNS (G-036a). A room on a plan has FOUR neighbours, so
  // withholding the two beside it leaves the two behind and in front of it declared and the
  // room connected — `noCorridor` would have gone to zero while this list still looked right.
  //
  // SO IT IS EVERY ON-PLOT NEIGHBOUR OF EVERY BACK-OF-HOUSE ROOM, DERIVED (G-038a-iii-c). The
  // list of nine hand-chosen cells that stood here is gone; `BACK_OF_HOUSE` above carries the
  // whole argument for which rooms are stranded and why, and this is the one place that turns
  // those rooms into cells. A cell one back-of-house room needs withheld is a cell ALL of them
  // need withheld — `(26,5)` is a neighbour of both — so the set is a union and the duplicate
  // costs nothing.
  //
  // AND A BACK-OF-HOUSE ROOM'S OWN CELL IS NEVER WITHHELD FROM ITSELF. Two of them placed one
  // column apart would each name the other's cell, and withholding it would change nothing
  // (a room stands there, so the plan's opinion of it is moot) — but the set would then say
  // something false about what this pass omits, and the `add` below reads it. Kept as the
  // postcondition of "two apart" rather than as evidence anything was checked.
  // ==========================================================================================
  const WITHHELD_CELLS: readonly { readonly column: number; readonly row: number }[] = BACK_OF_HOUSE.flatMap(
    (room) => [
      { column: room.column - 1, row: BACK_OF_HOUSE_ROW },
      { column: room.column + 1, row: BACK_OF_HOUSE_ROW },
      { column: room.column, row: BACK_OF_HOUSE_ROW - 1 },
      { column: room.column, row: BACK_OF_HOUSE_ROW + 1 },
    ],
  ).filter((cell) => !BACK_OF_HOUSE.some((room) => room.column === cell.column && cell.row === BACK_OF_HOUSE_ROW));
  // The plot's own edges — module constants since G-038a-iii-c, because the shaft's column is
  // derived from them and a second copy here would be G-018's duplicated constant with a
  // derivation resting on it.
  const FIRST_COLUMN = SHIPPED_FIRST_COLUMN;
  const LAST_COLUMN = SHIPPED_LAST_COLUMN;
  // KEYED BY `column:row` AND NEVER ITERATED IN INSERTION ORDER (I2) — see the sort below.
  const planned = new Set<string>();
  const withheld = (column: number, row: number): boolean =>
    WITHHELD_CELLS.some((cell) => cell.column === column && cell.row === row);
  /** Put one cell on the plan, if it is on the plot and not withheld. Every rule below goes
   *  through it, so "withheld" means the same thing to all three. */
  const declare = (column: number, row: number): void => {
    if (column < FIRST_COLUMN || column > LAST_COLUMN) return;
    if (row < SHIPPED_FIRST_ROW || row > SHIPPED_LAST_ROW) return;
    if (withheld(column, row)) return;
    planned.add(`${column}:${row}`);
  };
  const groundFloorRooms: { readonly column: number; readonly row: number }[] = [];
  for (const entry of schedule) {
    const command = entry.command;
    const at = command.kind === 'spawnEntity' ? command.at : command.kind === 'buildRoom' ? command.at : undefined;
    const kind = command.kind === 'spawnEntity' ? command.entityKind : command.kind === 'buildRoom' ? command.roomType : undefined;
    if (at === undefined || kind === undefined) continue;
    if (at.floor !== SHIPPED_ENTRANCE_FLOOR || !isRoomKind(content, kind)) continue;
    groundFloorRooms.push({ column: at.column, row: at.row });
  }
  // RULE 1 — ALL FOUR NEIGHBOURS, BECAUSE THE DOOR RULE PROBES ALL FOUR. Two would declare
  // half the circulation a ground-floor room can open onto and report the other half
  // `noCorridor` — a whole floor changing verdict for a reason this goal did not intend.
  for (const at of groundFloorRooms) {
    declare(at.column - 1, at.row);
    declare(at.column + 1, at.row);
    declare(at.column, at.row - 1);
    declare(at.column, at.row + 1);
  }
  // RULE 2 — THE SPINE. One lane across the whole plot at `SPINE_ROW`; see its docblock for
  // why row 3 and for what a floor of disconnected islands cost the moment a shaft existed.
  for (let column = FIRST_COLUMN; column <= LAST_COLUMN; column += 1) declare(column, SPINE_ROW);
  // RULE 3 — A TOOTH PER ROOM. The cells of a room's own column between it and the spine, so
  // its island is joined to the lane. The room's OWN cell is skipped: a corridor under a room
  // is a legal declaration and an inert one, but declaring it would say this plan runs through
  // the room rather than up to it. A room already ON the spine row gets no tooth, and a room
  // whose tooth is withheld keeps its island to itself — which is exactly what strands the
  // back-of-house pair.
  for (const at of groundFloorRooms) {
    const from = at.row < SPINE_ROW ? at.row : SPINE_ROW;
    const to = at.row < SPINE_ROW ? SPINE_ROW : at.row;
    for (let row = from; row <= to; row += 1) {
      if (row === at.row) continue;
      declare(at.column, row);
    }
  }
  // RULE 4 — THE SHAFT'S FOOT IS ON THE PLAN. A stair is a declared walkway in its own right
  // (`isDeclaredWalkway`'s third clause), so this changes no verdict — what it changes is the
  // claim: the stairwell stands on circulation the plan names, on the one floor of this plot
  // that HAS a plan, rather than on the stair clause alone.
  declare(SHAFT_COLUMN, SHAFT_ROW);
  // SORTED ASCENDING WITH AN EXPLICIT COMPARATOR before anything is emitted. `layCorridor` is
  // idempotent and the corridor plan sorts itself, so the world would be identical either way
  // — but a Set walked in insertion order is a habit this project does not keep (I2), and the
  // command log is the artefact whose stability the whole gate rests on. Column first, then
  // row, which is `compareCells`'s own order once the floor is fixed.
  const cells = [...planned].map((key) => {
    const [column, row] = key.split(':').map(Number) as [number, number];
    return { column, row };
  });
  cells.sort((a, b) => (a.column !== b.column ? (a.column < b.column ? -1 : 1) : a.row < b.row ? -1 : a.row > b.row ? 1 : 0));
  for (const cell of cells) {
    schedule.push({
      tick: 0,
      command: { kind: 'layCorridor', at: { floor: SHIPPED_ENTRANCE_FLOOR, column: cell.column, row: cell.row } },
    });
  }
  // ============================================================================
  // AND THE SHAFT, AT TICK 0, FULL HEIGHT (G-038a-iii-c).
  //
  // FULL HEIGHT AND NOT "the floors this log builds on", which is `report.ts`'s own ruling one
  // harness over: `stairLeg` reads only the stairwell's column and row, so which floors declared
  // a stair changes nothing about travel — what it changes is which cells `reachableCells`
  // admits. A shaft that stopped at the last seeded floor would be a building whose stairs end
  // below its top storey, and this log puts rooms on all twenty-one of them.
  //
  // ASCENDING, so the array `withStair` builds is in insertion order as well as in sorted
  // order. It sorts on the way in either way (`stairs.ts`), so this is legibility rather than
  // correctness — but the command log is the artefact the whole gate rests on, and a reader
  // should not have to check.
  //
  // AT TICK 0, BEFORE ANYTHING STANDS ON IT, for the corridor plan's own reason: the plan is
  // drawn once and never edited, so every verdict in this run is a function of what was built
  // rather than of when the plan was drawn.
  // ============================================================================
  for (let floor = SHIPPED_LOWEST_FLOOR; floor <= SHIPPED_HIGHEST_FLOOR; floor += 1) {
    schedule.push({
      tick: 0,
      command: { kind: 'layStair', at: { floor, column: SHAFT_COLUMN, row: SHAFT_ROW } },
    });
  }
  return schedule;
}
