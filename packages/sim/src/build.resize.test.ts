// G-036c B4 — A ROOM IS EDITABLE: ITS RECTANGLE AND ITS CONTENTS ARE MUTABLE WORLD STATE.
//
//   pnpm exec vitest run build
//
// ============================================================================
//  WHAT THIS FILE IS THE WITNESS FOR, AND THE THREE RULINGS IT PINS.
//
//  1. A RESIZE IS A NEW COMMAND, NOT A RE-ISSUED DRAW. G-036b made `drawRoom` a second command
//     rather than a widened `buildRoom` because **a command log is a durable artefact (I2):
//     adding a command leaves every recorded log meaning exactly what it meant.** Here the same
//     argument is STRONGER rather than inverted, and the test that says so is
//     `a re-issued drawRoom is still a refusal`: teaching `drawRoom` to resize what is in the
//     way would silently turn every recorded occupied-refusal in the project — including the
//     ones the I2 harness issues on purpose — into an edit.
//
//  2. AN ITEM OUTSIDE A SHRUNK FOOTPRINT IS DROPPED, AND THE DROP IS RECORDED. The block that
//     set this goal named dropped / refused / orphaned and required the other two to be shown
//     worse. Both alternatives are DRIVEN here rather than argued: `orphaned` is shown to
//     produce dead furniture that `placeItem` refuses to create and a free item for the next
//     room drawn over the cell, and `refused` is shown to leave the player with no verb that
//     could ever undo it. See `BuildOutcomes.displaced` for the ruling in full.
//
//  3. AN EDIT MAY BREAK THE ROOM YOU ARE EDITING; IT MAY NOT BREAK A ROOM YOU ARE NOT. That is
//     a deliberate difference from `drawRoom`, which builds a bad room without complaint —
//     `build.ts`'s header says why, and that argument is about the room the player is acting
//     on. Both halves are pinned: a self-inflicted break is ALLOWED, collateral damage is
//     REFUSED AND RECORDED.
//
//  Everything here goes through the real tick, so a rule that only works when called directly
//  fails. Kinds and ids are camelCase: a snake_case literal in packages/sim is a leaked content
//  id (ADR-0003).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { BUILD_REFUSAL_REASONS, totalBuildOutcomes, totalRefusals } from './build.js';
import type { Command } from './commands.js';
import { bindContent } from './content.js';
import { entitiesInOrder, getEntity, NO_ENTITY } from './entities.js';
import type { Entity } from './entities.js';
import type { Cell, Footprint } from './grid.js';
import { deserialise, serialise } from './save.js';
import { run, stepTick } from './tick.js';
import { countInvalidRooms, createValidityCache } from './validity.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const content = bindContent({
  roomTypes: [
    {
      id: 'hall',
      name: 'hall',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['snack'],
      minFootprintCells: 1,
      maxFootprintCells: 8,
      accessRule: 'public',
    },
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 2,
      nightlyRatePence: 8_500,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      provides: ['rest'],
      requires: ['bed'],
      minFootprintCells: 1,
      maxFootprintCells: 8,
      accessRule: 'public',
    },
    {
      id: 'lounge',
      name: 'lounge',
      capacity: 8,
      nightlyRatePence: 0,
      constructionCostPence: 1_000,
      demolitionRefundBasisPoints: 0,
      // PROVIDES NOTHING ITSELF, deliberately: it is the room type used where a test needs the
      // ITEM inside it to be the only provider of a need. `hall` provides `snack` as a room, so
      // a machine standing in a hall ties with its own host at fit 0 and loses on entity id.
      provides: [],
      minFootprintCells: 1,
      maxFootprintCells: 8,
      accessRule: 'public',
    },
  ],
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
  ],
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }, { id: 'machine', name: 'machine', provides: ['snack'] }],
});

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });
const spawn = (entityKind: string, at: Cell, footprint?: Footprint): Command =>
  footprint === undefined
    ? { kind: 'spawnEntity', entityKind, at }
    : { kind: 'spawnEntity', entityKind, at, footprint };
const resize = (id: number, at: Cell, footprint: Footprint): Command => ({ kind: 'resizeRoom', id, at, footprint });
const move = (id: number, to: Cell): Command => ({ kind: 'moveItem', id, to });

/** A world with money in it, so a priced draw is not refused for the wrong reason. */
const funded = (seed = 4): World => ({
  ...createWorld(seed, content),
  ledger: [{ tick: 0, amount: 100_000, reason: 'roomRevenue' as const }],
});

const at = (world: World, id: number): Entity | undefined => getEntity(world.entities, id);

describe('a room the player already built can be redrawn (B4)', () => {
  it('keeps its ENTITY ID, which is what makes it an edit rather than a rebuild', () => {
    // THE PROPERTY THAT RULES OUT DESPAWN-AND-RESPAWN, and it is not aesthetic: the id is the
    // handle `Guest.roomEntityId`, `Guest.engagement.entityId` and every hosted item hold. A
    // resize that renumbered the room would evict its own guest and orphan its own furniture.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(2, 2))]);
    const room = entitiesInOrder(before.entities)[0];
    expect(room?.footprint).toEqual(fp(2, 2));

    const after = stepTick(before, content, [resize(room!.id, cell(0, 4), fp(3, 2))]);
    const redrawn = at(after, room!.id);
    expect(redrawn?.id).toBe(room!.id);
    expect(redrawn?.kind).toBe('hall');
    expect(redrawn?.footprint).toEqual(fp(3, 2));
    expect(after.entities.nextId).toBe(before.entities.nextId); // no id was consumed
    expect(after.buildOutcomes.resized).toBe(1);
    expect(totalRefusals(after.buildOutcomes)).toBe(0);
  });

  it('moves the ORIGIN as well as the extent, because dragging the near edge does', () => {
    // Half of all resizes are inexpressible without an origin: pulling a room's left or back
    // edge inward moves the rectangle's smallest column or smallest row. This is why the
    // command carries a cell and not only a footprint.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(3, 1))]);
    const room = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [resize(room.id, cell(0, 5), fp(2, 1))]);
    expect(at(after, room.id)?.at).toEqual(cell(0, 5));
    expect(at(after, room.id)?.footprint).toEqual(fp(2, 1));
  });

  it('does not charge, and does not book a transaction', () => {
    // A STATED GAP RATHER THAN A DESIGN — `applyPlaceItem`'s position. There is no per-cell
    // price in content and inventing one would ship a number nobody balanced (ADR-0008). What
    // makes it safe TODAY is checkable rather than hopeful: drawing the room at its final size
    // already costs the same flat `constructionCostPence`, so growing by resize buys exactly
    // what drawing big bought. Booking it as `construction` would also break
    // `countConstructionTransactions(ledger) === built`.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(1, 1))]);
    const room = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [resize(room.id, cell(0, 4), fp(4, 2))]);
    expect(after.ledger).toBe(before.ledger); // BY REFERENCE: nothing was appended
    expect(after.buildOutcomes.built).toBe(before.buildOutcomes.built);
  });

  it('and the redrawn rectangle is what every later rule reads', () => {
    // The edit is not cosmetic: the placement index, the door walk and the grounded set all
    // read the new rectangle on the very next question. A 1x1 room in mid-air on floor 1 is
    // `unsupported`; sliding the room BELOW it under it makes it valid, in one command.
    const before = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(1, 1)),
      spawn('hall', cell(1, 9), fp(1, 1)),
    ]);
    expect(countInvalidRooms(before.entities, before.grid, before.corridors, content).unsupported).toBe(1);
    const lower = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [resize(lower.id, cell(0, 9), fp(1, 1))]);
    expect(countInvalidRooms(after.entities, after.grid, after.corridors, content).unsupported).toBe(0);
  });

  it('and a stale validity cache cannot survive it', () => {
    // THE FAILURE `draftIsClean` HAD TO LEARN ABOUT. A resize adds no entity and removes none,
    // so the pre-G-036c reuse predicate would have handed `runGuests` a context built from the
    // OLD rectangle on the very tick the player redrew it. Driven as an EQUALITY between a run
    // with a cache and a run without one, which is the shape `validity.cache.test.ts` uses:
    // if the cache leaked one stale answer the two hashes would part.
    const schedule = [
      { tick: 0, command: spawn('hall', cell(0, 4), fp(1, 1)) },
      { tick: 0, command: spawn('hall', cell(1, 9), fp(1, 1)) },
      { tick: 1, command: spawn('bedroom', cell(0, 20), fp(1, 1)) },
      { tick: 1, command: spawn('bed', cell(0, 20)) },
      { tick: 2, command: { kind: 'guestArrives' as const } },
      // THE FIRST EDIT PUTS THE GROUND-FLOOR ROOM UNDER THE MID-AIR ONE, so the tick that
      // follows it must see a DIFFERENT validity answer for a room the command never named.
      { tick: 3, command: resize(1, cell(0, 9), fp(1, 1)) },
      // AND THE SECOND WIDENS IT rather than sliding it back: sliding it back out from under
      // the upper room would be refused as `breaksAnotherRoom`, which is correct and is
      // pinned elsewhere — it is not what this case is measuring.
      { tick: 6, command: resize(1, cell(0, 9), fp(2, 2)) },
      { tick: 9, command: { kind: 'guestArrives' as const } },
    ];
    // DRIVEN THROUGH `stepTick` RATHER THAN `run`, because `run` makes its OWN cache per call
    // and does not take one — so the comparison has to be made at the tick loop, which is where
    // `validity.cache.test.ts` makes it too.
    const drive = (cache: ReturnType<typeof createValidityCache> | null): World => {
      let world = funded(9);
      for (let tick = 0; tick < 40; tick += 1) {
        const commands = schedule.filter((entry) => entry.tick === tick).map((entry) => entry.command);
        world = stepTick(world, content, commands, cache);
      }
      return world;
    };
    const cached = drive(createValidityCache());
    const uncached = drive(null);
    expect(hashState(cached)).toBe(hashState(uncached));
    expect(cached.buildOutcomes.resized).toBe(2);
  });
});

describe('a redraw that is not legal is REFUSED AND RECORDED, never thrown', () => {
  it('refuses an id that is not a live room, as noSuchRoom', () => {
    const world = stepTick(funded(), content, [{ kind: 'resizeRoom', id: 404, at: cell(0, 4), footprint: fp(1, 1) }]);
    expect(world.buildOutcomes.refused.noSuchRoom).toBe(1);
    expect(world.buildOutcomes.resized).toBe(0);
  });

  it('refuses an ITEM id with the room tool, so editing furniture with it is not silently effective', () => {
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(1, 1)), spawn('bed', cell(0, 4))]);
    const bed = entitiesInOrder(before.entities)[1]!;
    const after = stepTick(before, content, [resize(bed.id, cell(0, 4), fp(2, 1))]);
    expect(after.buildOutcomes.refused.noSuchRoom).toBe(1);
    expect(at(after, bed.id)?.footprint).toEqual(fp(1, 1));
  });

  it('refuses a rectangle that leaves the plot, and one outside the room TYPE size band', () => {
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(1, 1))]);
    const room = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [
      resize(room.id, cell(0, 78), fp(6, 1)), // off the right-hand edge
      resize(room.id, cell(0, 4), fp(5, 3)), // 15 cells, band is 1..8
    ]);
    expect(after.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(after.buildOutcomes.refused.footprintTooLarge).toBe(1);
    expect(at(after, room.id)?.footprint).toEqual(fp(1, 1));
  });

  it('REFUSES A REDRAW THAT WOULD OVERLAP ANOTHER ROOM, and the test that says the exclusion is right', () => {
    // TWO CLAIMS IN ONE PLACE, AND THE SECOND IS THE ONE A CARELESS IMPLEMENTATION FAILS.
    // Overlapping another room is `occupied`; overlapping ITSELF is not, or no room that kept
    // even one of its own cells could ever be resized. `roomOverlapping`'s `exclude` parameter
    // is exactly that distinction, and both directions are driven here.
    const before = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(2, 1)),
      spawn('hall', cell(0, 8), fp(2, 1)),
    ]);
    const left = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [resize(left.id, cell(0, 4), fp(6, 1))]); // reaches column 9
    expect(after.buildOutcomes.refused.occupied).toBe(1);
    expect(at(after, left.id)?.footprint).toEqual(fp(2, 1));

    // ...and the self-overlap is not an overlap.
    const grown = stepTick(before, content, [resize(left.id, cell(0, 4), fp(3, 1))]);
    expect(grown.buildOutcomes.refused.occupied).toBe(0);
    expect(at(grown, left.id)?.footprint).toEqual(fp(3, 1));
  });

  it('REFUSES A REDRAW THAT WOULD LEAVE THE ROOM ABOVE UNSUPPORTED, as breaksAnotherRoom', () => {
    const before = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(2, 1)),
      spawn('hall', cell(1, 5), fp(1, 1)), // stands on the lower room's second cell
    ]);
    const lower = entitiesInOrder(before.entities)[0]!;
    const upper = entitiesInOrder(before.entities)[1]!;
    expect(countInvalidRooms(before.entities, before.grid, before.corridors, content).unsupported).toBe(0);

    const after = stepTick(before, content, [resize(lower.id, cell(0, 4), fp(1, 1))]);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(1);
    expect(after.buildOutcomes.resized).toBe(0);
    // THE EDIT DID NOT HAPPEN, which is what separates "refused" from "counted and applied".
    expect(at(after, lower.id)?.footprint).toEqual(fp(2, 1));
    expect(countInvalidRooms(after.entities, after.grid, after.corridors, content).unsupported).toBe(0);
    expect(at(after, upper.id)?.at).toEqual(cell(1, 5));
  });

  it('REFUSES A REDRAW THAT WOULD SEAL A NEIGHBOUR IN, as breaksAnotherRoom', () => {
    // The other collateral break, and the one the goal block names second. A room boxed in on
    // all four sides of its floor has no door — and here the box is closed by a room GROWING
    // over the last free cell beside it, which is an edit rather than a build.
    const middle = cell(0, 20, 3);
    const before = stepTick(funded(), content, [
      spawn('hall', middle, fp(1, 1)),
      spawn('hall', cell(0, 19, 3), fp(1, 1)),
      spawn('hall', cell(0, 21, 3), fp(1, 1)),
      spawn('hall', cell(0, 20, 2), fp(1, 1)),
      spawn('hall', cell(0, 20, 5), fp(1, 3)), // one row short of sealing it
    ]);
    expect(countInvalidRooms(before.entities, before.grid, before.corridors, content).noDoor).toBe(0);

    const lid = entitiesInOrder(before.entities)[4]!;
    const after = stepTick(before, content, [resize(lid.id, cell(0, 20, 4), fp(1, 4))]);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(1);
    expect(countInvalidRooms(after.entities, after.grid, after.corridors, content).noDoor).toBe(0);
  });

  it('but a room the player breaks by editing ITSELF is allowed, which is drawRoom’s standing permission', () => {
    // THE OTHER HALF OF THE RULE, AND IT IS WHY THE REFUSAL IS NOT "ANY NEW INVALIDITY".
    // `build.ts`'s header is explicit that a player may build a room that will be invalid — if
    // every buildable room were valid by construction, "an invalid room is not a provider"
    // would inspect nothing and be unfalsifiable (ADR-0007). Refusing a self-inflicted break
    // here would give the simulation two answers to one question depending on the verb used.
    const before = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(2, 1)),
      spawn('hall', cell(1, 4), fp(2, 1)),
    ]);
    const upper = entitiesInOrder(before.entities)[1]!;
    // The upper room slides off its own support. Nothing else is affected.
    const after = stepTick(before, content, [resize(upper.id, cell(1, 40), fp(2, 1))]);
    expect(after.buildOutcomes.resized).toBe(1);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(0);
    expect(countInvalidRooms(after.entities, after.grid, after.corridors, content).unsupported).toBe(1);
  });

  it('and a room that was ALREADY broken does not veto an unrelated edit', () => {
    // The reason the rule is a DIFFERENCE rather than "is anything invalid afterwards". A hotel
    // may legitimately contain a room the player built in mid-air; refusing every later edit
    // because of it would make the editing verbs unusable in exactly the hotels that need
    // editing most.
    const before = stepTick(funded(), content, [
      spawn('hall', cell(1, 40), fp(1, 1)), // in mid-air from the start
      spawn('hall', cell(0, 4), fp(1, 1)),
    ]);
    expect(countInvalidRooms(before.entities, before.grid, before.corridors, content).unsupported).toBe(1);
    const ground = entitiesInOrder(before.entities)[1]!;
    const after = stepTick(before, content, [resize(ground.id, cell(0, 4), fp(2, 2))]);
    expect(after.buildOutcomes.resized).toBe(1);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(0);
  });

  it('a re-issued drawRoom is STILL a refusal, which is why the resize had to be its own command', () => {
    // THE RULING FROM G-036b, RE-APPLIED AND CHECKED RATHER THAN RESTATED. Teaching `drawRoom`
    // to mean "resize whatever is in the way" would silently convert every recorded
    // occupied-refusal in this project into an edit — including the ones `determinism-log.ts`
    // issues ON PURPOSE to exercise `occupied` inside the I2 gate. The bytes of those logs
    // would not change and the hotel they describe would.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(2, 2))]);
    const room = entitiesInOrder(before.entities)[0]!;
    const after = stepTick(before, content, [
      { kind: 'drawRoom', roomType: 'hall', at: cell(0, 4), footprint: fp(3, 2) },
    ]);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
    expect(after.buildOutcomes.resized).toBe(0);
    expect(at(after, room.id)?.footprint).toEqual(fp(2, 2));
  });

  it('a refusal allocates nothing and leaves the ledger by reference', () => {
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(1, 1))]);
    const after = stepTick(before, content, [{ kind: 'resizeRoom', id: 404, at: cell(0, 9), footprint: fp(1, 1) }]);
    expect(after.entities.nextId).toBe(before.entities.nextId);
    expect(after.ledger).toBe(before.ledger);
  });
});

describe('what happens to an item outside a shrunk footprint: IT IS DROPPED, AND THE DROP IS RECORDED', () => {
  /** A 3x1 hall with a vending machine standing in its far cell. */
  function furnished(): { world: World; room: number; machine: number } {
    const world = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(3, 1)),
      { kind: 'placeItem', itemType: 'machine', at: cell(0, 6) },
    ]);
    const [room, machine] = entitiesInOrder(world.entities);
    return { world, room: room!.id, machine: machine!.id };
  }

  it('drops it, counts it in `displaced`, and leaves the resize itself successful', () => {
    const { world, room, machine } = furnished();
    expect(at(world, machine)?.at).toEqual(cell(0, 6));
    const after = stepTick(world, content, [resize(room, cell(0, 4), fp(2, 1))]);
    expect(after.buildOutcomes.resized).toBe(1);
    expect(after.buildOutcomes.displaced).toBe(1);
    expect(at(after, machine)).toBeUndefined();
  });

  it('leaves an item that is still INSIDE the new rectangle exactly where it was', () => {
    // The companion ADR-0007 asks for: without it, "drops what falls outside" would pass just
    // as well if the command dropped every item in the room.
    const { world, room, machine } = furnished();
    const kept = stepTick(world, content, [
      { kind: 'placeItem', itemType: 'machine', at: cell(0, 4) },
      resize(room, cell(0, 4), fp(2, 1)),
    ]);
    expect(kept.buildOutcomes.displaced).toBe(1);
    expect(at(kept, machine)).toBeUndefined();
    const survivor = entitiesInOrder(kept.entities).find((entity) => entity.kind === 'machine');
    expect(survivor?.at).toEqual(cell(0, 4));
  });

  it('WHY NOT ORPHANED: the alternative is furniture that serves nobody and then furnishes the next room free', () => {
    // ===================================================================================
    // THE FIRST REJECTED CANDIDATE, DRIVEN RATHER THAN ARGUED. Under `orphaned` the machine
    // would still be standing at column 6 after the shrink. This test states both consequences
    // as facts about the shipped rules:
    //
    //   (a) it would serve nobody, because an item's provision is borrowed entirely from the
    //       room it stands in — which is the state `placeItem` REFUSES to create (`notInRoom`).
    //       One verb refusing what another silently produces is two definitions of one rule.
    //   (b) a new room drawn over the freed cell would inherit it FREE, which is the exploit
    //       `applyDemolishRoom` already closes by taking a room's furniture with it.
    //
    // (a) is checked by placing an item on bare plot and finding it refused. (b) is checked by
    // showing that the cell IS drawable afterwards, so the exploit's second step is real.
    // ===================================================================================
    const { world, room } = furnished();
    const after = stepTick(world, content, [resize(room, cell(0, 4), fp(2, 1))]);
    // (a) the state `orphaned` would have produced is one no player verb can reach.
    const refused = stepTick(after, content, [{ kind: 'placeItem', itemType: 'machine', at: cell(0, 6) }]);
    expect(refused.buildOutcomes.refused.notInRoom).toBe(1);
    // COMPARED AGAINST THE COUNTER AS IT STOOD, not against zero: `furnished()` already placed
    // one item through the real verb, so a bare `toBe(0)` here would be asserting about the
    // wrong world and would go red for a reason that has nothing to do with this rule.
    expect(refused.buildOutcomes.placed).toBe(after.buildOutcomes.placed);
    // (b) and the freed cell really is free to build on, so the free-furniture step is not
    //     hypothetical — it is one `drawRoom` away.
    const redrawn = stepTick(after, content, [
      { kind: 'drawRoom', roomType: 'hall', at: cell(0, 6), footprint: fp(1, 1) },
    ]);
    expect(redrawn.buildOutcomes.built).toBe(1);
    expect(redrawn.buildOutcomes.refused.occupied).toBe(0);
  });

  it('WHY NOT REFUSED: there is no verb that removes an item, so the player would be stuck for good', () => {
    // THE SECOND REJECTED CANDIDATE. Under `refused`, a hall with a machine in its third cell
    // could never be shrunk to two cells again — for the life of the save, reachable by one
    // ordinary click. The only exit would be demolishing the whole room, which is asserted here
    // as the fact it is: `demolishRoom` takes the furniture with it, and nothing else does.
    const { world, room, machine } = furnished();
    const razed = stepTick(world, content, [{ kind: 'demolishRoom', id: room }]);
    expect(at(razed, machine)).toBeUndefined();
    expect(at(razed, room)).toBeUndefined();
    // And `moveItem` is what makes DROPPED a choice rather than a forfeit: move it first, and
    // the shrink costs nothing.
    const saved = stepTick(world, content, [move(machine, cell(0, 4)), resize(room, cell(0, 4), fp(2, 1))]);
    expect(saved.buildOutcomes.displaced).toBe(0);
    expect(at(saved, machine)?.at).toEqual(cell(0, 4));
  });

  it('and a guest engaged with the dropped item is released on the same tick, by the existing path', () => {
    // The three release causes `isProviding` already carries (G-013) gain no fourth: a dropped
    // item is `draftGet` returning undefined, which is the same event as a demolished host.
    // Without this the guest's engagement would dangle and `assertGuestStoreInvariants` would
    // throw at the commit boundary.
    let world = stepTick(funded(11), content, [
      spawn('bedroom', cell(0, 0), fp(1, 1)),
      spawn('bed', cell(0, 0)),
      // A LOUNGE RATHER THAN A HALL, because a hall provides `snack` ITSELF: the guest would
      // engage the room and the machine inside it would never be chosen, so the drop would
      // release nothing and this test would pass while inspecting nothing (ADR-0007).
      spawn('lounge', cell(0, 4), fp(3, 1)),
      spawn('machine', cell(0, 6)),
    ]);
    const machine = entitiesInOrder(world.entities).find((entity) => entity.kind === 'machine')!;
    const hall = entitiesInOrder(world.entities).find((entity) => entity.kind === 'lounge')!;
    // SCHEDULED AT `world.tick`, NOT AT 0: the setup above already consumed tick 0, and `run`
    // buckets a schedule by ABSOLUTE tick — a command aimed at a tick that has gone never
    // fires, and the guest would simply never arrive.
    world = run(world, content, 1, [{ tick: world.tick, command: { kind: 'guestArrives' } }]);
    const engaged = world.guests.list.find((guest) => guest.engagement?.entityId === machine.id);
    expect(engaged).toBeDefined();

    const after = stepTick(world, content, [resize(hall.id, cell(0, 4), fp(2, 1))]);
    expect(after.buildOutcomes.displaced).toBe(1);
    expect(after.guests.list.every((guest) => guest.engagement === null)).toBe(true);
    // And the world it produced is a world that loads: the invariants ran at the commit.
    expect(hashState(deserialise(serialise(after)))).toBe(hashState(after));
  });
});

describe('an item can be moved (B4), and a move that would break a room is refused', () => {
  function furnishedBedroom(): { world: World; room: number; bed: number } {
    const world = stepTick(funded(), content, [
      { kind: 'drawRoom', roomType: 'bedroom', at: cell(0, 4), footprint: fp(2, 1) },
    ]);
    const [room, bed] = entitiesInOrder(world.entities);
    return { world, room: room!.id, bed: bed!.id };
  }

  it('moves it inside its own room and counts it', () => {
    const { world, bed } = furnishedBedroom();
    expect(at(world, bed)?.at).toEqual(cell(0, 4));
    const after = stepTick(world, content, [move(bed, cell(0, 5))]);
    expect(after.buildOutcomes.moved).toBe(1);
    expect(at(after, bed)?.at).toEqual(cell(0, 5));
    expect(at(after, bed)?.footprint).toEqual(fp(1, 1)); // an item is still one cell (ADR-0047 A3)
  });

  it('refuses a destination NO ROOM COVERS, as notInRoom — placeItem’s rule, word for word', () => {
    const { world, bed } = furnishedBedroom();
    const after = stepTick(world, content, [move(bed, cell(0, 40))]);
    expect(after.buildOutcomes.refused.notInRoom).toBe(1);
    expect(after.buildOutcomes.moved).toBe(0);
    expect(at(after, bed)?.at).toEqual(cell(0, 4));
  });

  it('refuses a destination off the plot, and an id that is not a live item', () => {
    const { world, bed } = furnishedBedroom();
    const after = stepTick(world, content, [
      move(bed, cell(0, 900)),
      move(404, cell(0, 4)),
    ]);
    expect(after.buildOutcomes.refused.outOfBounds).toBe(1);
    expect(after.buildOutcomes.refused.noSuchItem).toBe(1);
  });

  it('refuses a live ROOM id as noSuchItem, because a room is redrawn rather than carried', () => {
    const { world, room } = furnishedBedroom();
    const after = stepTick(world, content, [move(room, cell(0, 5))]);
    expect(after.buildOutcomes.refused.noSuchItem).toBe(1);
    expect(at(after, room)?.at).toEqual(cell(0, 4));
  });

  it('REFUSES CARRYING THE LAST REQUIRED ITEM OUT OF A ROOM, as breaksAnotherRoom', () => {
    // The room the item LEAVES is a room the player was not editing, so nothing is exempt here
    // — unlike a resize, which may break the room it is redrawing. Carrying the only bed out of
    // a bedroom would make it `missingItem`: it houses nobody while still costing upkeep, and
    // the guest asleep in it is evicted on the next tick.
    const { world, bed } = furnishedBedroom();
    const hall = stepTick(world, content, [
      { kind: 'drawRoom', roomType: 'hall', at: cell(0, 10), footprint: fp(1, 1) },
    ]);
    expect(countInvalidRooms(hall.entities, hall.grid, hall.corridors, content).missingItem).toBe(0);

    const after = stepTick(hall, content, [move(bed, cell(0, 10))]);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(1);
    expect(after.buildOutcomes.moved).toBe(0);
    expect(at(after, bed)?.at).toEqual(cell(0, 4));
    expect(countInvalidRooms(after.entities, after.grid, after.corridors, content).missingItem).toBe(0);
  });

  it('but a SPARE item may leave, so the rule is about the requirement and not about the room', () => {
    // The companion the check above needs, or "refuses a move out of a room" would pass just as
    // well if `moveItem` refused every move between rooms.
    const { world, bed } = furnishedBedroom();
    const stocked = stepTick(world, content, [
      { kind: 'drawRoom', roomType: 'hall', at: cell(0, 10), footprint: fp(1, 1) },
      { kind: 'placeItem', itemType: 'bed', at: cell(0, 5) },
    ]);
    const spare = entitiesInOrder(stocked.entities).find(
      (entity) => entity.kind === 'bed' && entity.id !== bed,
    )!;
    const after = stepTick(stocked, content, [move(spare.id, cell(0, 10))]);
    expect(after.buildOutcomes.moved).toBe(1);
    expect(after.buildOutcomes.refused.breaksAnotherRoom).toBe(0);
    expect(at(after, spare.id)?.at).toEqual(cell(0, 10));
  });
});

describe('the counters the editing verbs move', () => {
  it('records exactly one outcome per command, which is the per-tick law', () => {
    // `applyCommands` asserts this itself on every tick; this is the direct reading of it for
    // the two new verbs, including their refusals. `displaced` is deliberately OUTSIDE the sum
    // — it counts items, not commands — and the next case is what pins that.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(2, 1))]);
    const room = entitiesInOrder(before.entities)[0]!;
    const start = totalBuildOutcomes(before.buildOutcomes);
    const after = stepTick(before, content, [
      resize(room.id, cell(0, 4), fp(3, 1)),
      resize(404, cell(0, 4), fp(1, 1)),
      move(404, cell(0, 4)),
    ]);
    expect(totalBuildOutcomes(after.buildOutcomes) - start).toBe(3);
  });

  it('keeps `displaced` out of the per-command sum, because one resize can drop several items', () => {
    const before = stepTick(funded(), content, [
      spawn('hall', cell(0, 4), fp(3, 1)),
      spawn('machine', cell(0, 5)),
      spawn('machine', cell(0, 6)),
    ]);
    const room = entitiesInOrder(before.entities)[0]!;
    const start = totalBuildOutcomes(before.buildOutcomes);
    const after = stepTick(before, content, [resize(room.id, cell(0, 4), fp(1, 1))]);
    expect(after.buildOutcomes.displaced).toBe(2);
    // ONE command, ONE outcome, TWO items — which is the whole reason the sum excludes it.
    expect(totalBuildOutcomes(after.buildOutcomes) - start).toBe(1);
  });

  it('and both new refusal reasons are camelCase members of the closed union', () => {
    // A snake_case literal in packages/sim is a leaked content id (ADR-0003), and
    // `check:content` judges by shape — so a refusal reason spelled `breaks_another_room` would
    // fail an INVARIANT gate rather than a style check.
    expect(BUILD_REFUSAL_REASONS).toContain('breaksAnotherRoom');
    expect(BUILD_REFUSAL_REASONS).toContain('noSuchItem');
    for (const reason of BUILD_REFUSAL_REASONS) expect(reason).not.toMatch(/_/);
  });

  it('and NO_ENTITY is not a room a resize can find', () => {
    // `roomOverlapping`'s exclusion defaults to `NO_ENTITY`, which must exclude nothing: ids
    // start at 1, so the default can never accidentally hide a real room from a `drawRoom`.
    const before = stepTick(funded(), content, [spawn('hall', cell(0, 4), fp(1, 1))]);
    expect(entitiesInOrder(before.entities).every((entity) => entity.id !== NO_ENTITY)).toBe(true);
    const after = stepTick(before, content, [
      { kind: 'drawRoom', roomType: 'hall', at: cell(0, 4), footprint: fp(1, 1) },
    ]);
    expect(after.buildOutcomes.refused.occupied).toBe(1);
  });
});
