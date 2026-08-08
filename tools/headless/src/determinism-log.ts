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
  demolitionRefundOf,
  firstEconomy,
  firstRoomTypeProviding,
  lodgingNeedOf,
  minConstructionCostOf,
  needTypesInOrder,
  requiredItemsOf,
  roomTypeProvides,
} from '@hotelsim/sim';
import type { BoundContent, ScheduledCommand } from '@hotelsim/sim';

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
 * So `World.buildOutcomes` is non-zero in every counter by tick 100,000, and all of it is
 * hashed state. Verified by replaying the log and reading the counters, not assumed.
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
 *   - a basement pass spawns TERRACES OF THREE, so the middle room of each has a room
 *     hard against both sides — `noDoor`, arising from a placement rather than from a
 *     demolition;
 *   - and the ground floor carries furnished, supported, doored rooms, so guests are
 *     still served and the proof covers rooms that WORK as well as rooms that do not. A
 *     harness in which nothing worked would prove only that failure is deterministic.
 *
 * Verified by replaying this log and reading the tallies, in
 * `validity.determinism.test.ts` — not assumed here.
 */
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
  const furnish = (tick: number, at: { floor: number; column: number }, into: ScheduledCommand[]): void => {
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
  // ITS CELL IS floor 20, column 0, AND THAT IS NOT INCIDENTAL. The spawn diagonal reaches
  // it only at `spawnIndex` 1,280 (this log reaches ~99 in 100,000 ticks); the build
  // rotation is floors 5..19 and 900; the terraces are floors -1 and -2; the tower is
  // column 79. `buildRoom` would RECORD an occupied collision rather than throw, but a
  // collision would still muddy what this pass is for.
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
    const at = { floor: 20, column: 0 };
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
    const at = { floor: spawnIndex % 21, column: spawnIndex % 80 };
    const furnished = spawnIndex % 2 === 0;
    spawnIndex += 1;
    schedule.push({ tick, command: { kind: 'spawnEntity', entityKind, at } });
    if (furnished) furnish(tick, at, schedule);
  }
  // BASEMENT TERRACES OF THREE (G-009), so the MIDDLE room of each is sealed in on both
  // sides: `noDoor`. Two adjacent rooms would not do it — each still has a free outer
  // side — which is the sort of thing that is obvious only once the rule is written down.
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
  // been opened up again. Measured: `noDoor` peaks at 3 and is 0 by tick 40,000.
  //
  // A reason that is reachable for the first third of the run and gone by the end is a
  // reason the gate's FINAL hash says nothing about. So the second wave lands on floor -2,
  // late, with ids far above anything the despawn pass reaches — sealed-in rooms that are
  // still sealed in at tick 100,000.
  const terraceWave = (firstTick: number, step: number, floor: number, count: number): void => {
    let terrace = 0;
    for (let tick = firstTick; tick < ticks && terrace < count; tick += step) {
      const left = 60 + terrace * 4; // a clear column between terraces, so they stay apart
      for (const column of [left, left + 1, left + 2]) {
        const at = { floor, column };
        schedule.push({ tick, command: { kind: 'spawnEntity', entityKind, at } });
        furnish(tick, at, schedule);
      }
      terrace += 1;
    }
  };
  terraceWave(601, 607, -1, 5);
  terraceWave(20_011, 6_007, -2, 5);
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
  for (const floor of [3, 4, 5, 6]) {
    const at = { floor, column: 79 };
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
  let amenityColumn = 10;
  let amenityEntities = 0;
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === entityKind) continue;
    let providesEngagement = false;
    for (const needType of needTypesInOrder(content)) {
      if (needType.id === lodgingNeed?.id) continue;
      if (roomTypeProvides(content, roomType.id, needType.id)) providesEngagement = true;
    }
    if (!providesEngagement) continue;
    const at = { floor: 0, column: amenityColumn };
    amenityColumn += 2;
    schedule.push({ tick: 47, command: { kind: 'spawnEntity', entityKind: roomType.id, at } });
    amenityEntities += 1;
    for (const itemId of requiredItemsOf(content, roomType.id)) {
      schedule.push({ tick: 47, command: { kind: 'spawnEntity', entityKind: itemId, at } });
      amenityEntities += 1;
    }
  }
  // Some of these target ids that are not live yet, or are already gone. That is
  // deliberate: a despawn of an unknown id must be a deterministic no-op.
  for (let tick = 2_003; tick < ticks; tick += 4_001) {
    const id = Math.floor((tick - 2_003) / 4_001) * 3 + 1;
    schedule.push({ tick, command: { kind: 'despawnEntity', id } });
  }
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
  for (let tick = 101; tick < ticks; tick += 97) {
    schedule.push({ tick, command: { kind: 'guestArrives' } });
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
        ? { floor: 5 + (buildIndex % 15), column: 40 + (buildIndex % 39) }
        : buildIndex % 3 === 1
          ? { floor: buildIndex % 21, column: buildIndex % 80 }
          : { floor: 900, column: 0 };
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
  return schedule;
}
