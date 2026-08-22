// G-010 — THE DERIVED INDEX MAY OUTLIVE A TICK, AND EXACTLY WHEN.
//
// Rebuilding the placement index and the grounded set on every tick was 58.9% of tick
// self-time in a profiled 60-room, 365-day run. `ValidityCache` lets a context survive a
// tick in which entity membership did not change. That is a cache of DERIVED state, so
// the only thing that matters about it is whether it can ever be stale — a stale index
// that still hashes perfectly is the drift class this codebase has closed by construction
// five times, and this file is what stops the sixth from being introduced deliberately.
//
// THE FILE IS ORGANISED AROUND ONE TABLE. `tickValidityContext` reuses a cached context
// only when FIVE clauses hold. A clause that can be deleted with the suite still green is
// either unnecessary or untested, and either way it must not ship unexamined — so every
// clause has a case here that goes red when that clause alone is removed. The table is in
// the `describe` below, and the mutation results are recorded in JOURNAL.md.
//
// The equivalence argument sits above all of it: a run WITH a cache and a run WITHOUT one
// must produce the same state hash. That is why `stepTick` takes the cache as an optional
// parameter rather than hiding it inside `run` — a cache you cannot switch off cannot be
// checked by comparison (ADR-0007).
//
// Entity kinds and content ids are camelCase on purpose: a snake_case string literal
// anywhere in packages/sim is a leaked content ID and fails `pnpm check:content`
// (ADR-0003), and that gate scans test files too.

import { describe, expect, it } from 'vitest';
import { createCorridors, withCorridor } from './corridors.js';
import { createStairs, withStair } from './stairs.js';
import type { Stairs } from './stairs.js';
import type { Corridors } from './corridors.js';
import { bindContent } from './content.js';
import { beginEntityDraft, draftDespawn, draftSpawn } from './entities.js';
import type { Entity, EntityStore } from './entities.js';
import { departureCountOf, evictedGuests } from './guests.js';
import { createGridBounds, GROUND_FLOOR, UNIT_FOOTPRINT } from './grid.js';
import type { Cell, GridBounds } from './grid.js';
import { stepTick } from './tick.js';
import {
  createValidityCache,
  isValidRoom,
  roomInvalidity,
  tickValidityContext,
  validRoomsOf,
} from './validity.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';
import type { ScheduledCommand } from './commands.js';

const BOUNDS = createGridBounds();

const content = bindContent({
  roomTypes: [
    { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
    // ^ A PROVIDER FOR THE ENGAGEMENT NEED THAT NOTHING BELOW EVER BUILDS. It exists so
    // `bindContent` can see `snack` is reachable; with no lounge in any store, no guest can
    // engage, so nothing here consumes a bedroom's capacity for anything but lodging.
    {
      id: 'bedroom',
      name: 'bedroom',
      capacity: 1,
      nightlyRatePence: 8_500,
      nightlyUpkeepPence: 100,
      constructionCostPence: 0,
      provides: ['rest'],
      requires: ['bed'],
    },
  ],
  // G-027b — A NEED IS A STOCK. `capacityTicks` is time-to-empty, which is what the deleted
  // `patienceTicks` named, so it is carried; a refill is a whole tick. THE SECOND NEED IS
  // STRUCTURAL: a guest arrives AT its want line, a line of 0 leaves every need full with
  // nothing recorded as having served it (refused at the first commit), and a declared line
  // makes `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need
  // generates. The same room type provides both rather than a second one appearing in a file
  // whose subject is which rooms are USABLE.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 4, refillPerTick: 2 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 4, refillPerTick: 1 },
  ],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or
  // `bindContent` refuses it — a guest holding a room has no other way to leave.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 6, toleranceTicks: 4, wantAtBasisPoints: 2500 },
  ],
  itemTypes: [{ id: 'bed', name: 'bed' }],
});

/** A cell on the plot. `row` defaults to 0, the only row the shipped plot has (G-034a). */
const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });

/** A committed store holding exactly these entities, ids ascending in the order given. */
function storeOf(...specs: readonly (readonly [string, Cell])[]): EntityStore {
  return {
    nextId: specs.length + 1,
    list: specs.map(([kind, at], index) => ({ id: index + 1, kind, at, footprint: UNIT_FOOTPRINT })),
  };
}

/** The entity at `index`, or a failure — `noUncheckedIndexedAccess` is on. */
function entityAt(store: EntityStore, index: number): Entity {
  const found = store.list[index];
  if (found === undefined) throw new Error(`test store has no entity at index ${index}`);
  return found;
}

/** One furnished room on the earth, with a free cell beside it: a room that WORKS. */
function workingHotel(): EntityStore {
  return storeOf(
    ['bedroom', cell(GROUND_FLOOR, 0)],
    ['bed', cell(GROUND_FLOOR, 0)],
  );
}

/**
 * Ask a context the one question the guest loop asks, so a stale answer SHOWS.
 *
 * Deliberately goes through `validRoomsOf` rather than reading `ctx.index`: that list is
 * what `findFreeRoom` walks, so it is the thing a stale cache would actually corrupt.
 */
function validRoomIds(
  store: EntityStore,
  bounds: GridBounds,
  cache: ReturnType<typeof createValidityCache> | null,
  corridors: Corridors = createCorridors(),
  stairs: Stairs = createStairs(),
): readonly number[] {
  const draft = beginEntityDraft(store, bounds);
  const ctx = tickValidityContext(cache, content, bounds, corridors, stairs, draft);
  return validRoomsOf(ctx).map((room) => room.id);
}

describe('the cache is a memo, not a second record — a hit answers what a miss would', () => {
  it('reuses the very same context object across a tick that changed nothing', () => {
    const cache = createValidityCache();
    const store = workingHotel();
    const first = tickValidityContext(cache, content, BOUNDS, createCorridors(), createStairs(), beginEntityDraft(store, BOUNDS));
    const second = tickValidityContext(cache, content, BOUNDS, createCorridors(), createStairs(), beginEntityDraft(store, BOUNDS));
    // Identity, not equality: an equal-looking rebuild would be the cache failing to work
    // while still being correct, which is the outcome this whole goal exists to avoid.
    expect(second).toBe(first);
  });

  it('answers identically with a cache and without one, over the same store', () => {
    const store = workingHotel();
    expect(validRoomIds(store, BOUNDS, createValidityCache())).toEqual(validRoomIds(store, BOUNDS, null));
  });

  it('does not cache a context built over a draft that staged a spawn', () => {
    const cache = createValidityCache();
    const store = workingHotel();
    const dirty = beginEntityDraft(store, BOUNDS);
    draftSpawn(dirty, 'bedroom', cell(GROUND_FLOOR, 4));
    tickValidityContext(cache, content, BOUNDS, createCorridors(), createStairs(), dirty);
    // The context just built describes a world no commit boundary will ever see. Storing
    // it would hand the NEXT tick an answer about a draft.
    expect(cache.context).toBeNull();
    expect(cache.builtFrom).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------
// THE CLAUSE-MUTATION TABLE.
//
// Each case below is the witness for one clause of the reuse predicate in
// `tickValidityContext`. Delete that clause alone and this case must go red. Recorded so
// the next person to touch the predicate finds out immediately which guarantee they broke.
// ---------------------------------------------------------------------------------------

describe('clause 1 — `cache.builtFrom === draft.base`: committed membership is the same object', () => {
  it('a room demolished between ticks stops being a valid room', () => {
    const cache = createValidityCache();
    const before = workingHotel();
    expect(validRoomIds(before, BOUNDS, cache)).toEqual([1]);
    // The committed store the next tick sees is a NEW object with the room gone — the
    // shape `commitEntityDraft` produces. Without this clause the cache would keep
    // answering from the building that used to be there.
    const after: EntityStore = { nextId: 3, list: [] };
    expect(validRoomIds(after, BOUNDS, cache)).toEqual([]);
  });

  it('a room built between ticks starts being a valid room', () => {
    const cache = createValidityCache();
    expect(validRoomIds({ nextId: 1, list: [] }, BOUNDS, cache)).toEqual([]);
    expect(validRoomIds(workingHotel(), BOUNDS, cache)).toEqual([1]);
  });
});

describe('clause 2 — `draftIsClean`: this tick has staged no spawn', () => {
  it('a room spawned earlier in THIS tick is visible to the guest loop in this tick', () => {
    const cache = createValidityCache();
    const store = workingHotel();
    // Warm the cache on the clean world, exactly as a quiet tick would.
    expect(validRoomIds(store, BOUNDS, cache)).toEqual([1]);
    // Now a tick that spawns. `applyCommands` runs before `runGuests`, so the guest loop
    // must see the new room — that is the "a room built this tick can be occupied this
    // tick" promise in tick.ts's header.
    const draft = beginEntityDraft(store, BOUNDS);
    const roomId = draftSpawn(draft, 'bedroom', cell(GROUND_FLOOR, 4));
    draftSpawn(draft, 'bed', cell(GROUND_FLOOR, 4));
    const ctx = tickValidityContext(cache, content, BOUNDS, createCorridors(), createStairs(), draft);
    expect(validRoomsOf(ctx).map((r) => r.id)).toEqual([1, roomId]);
  });
});

describe('clause 3 — `draftIsClean`: this tick has staged no despawn', () => {
  it('a room demolished earlier in THIS tick is gone to the guest loop in this tick', () => {
    const cache = createValidityCache();
    const store = workingHotel();
    expect(validRoomIds(store, BOUNDS, cache)).toEqual([1]);
    const draft = beginEntityDraft(store, BOUNDS);
    expect(draftDespawn(draft, 1)).toBe(true);
    const ctx = tickValidityContext(cache, content, BOUNDS, createCorridors(), createStairs(), draft);
    // Without the `removed.size` half of the clean check, the cached context would still
    // offer room 1 and a guest would reserve a room that is being demolished this tick.
    expect(validRoomsOf(ctx).map((r) => r.id)).toEqual([]);
  });
});

describe('clause 4 — `context.content === content`: the same injected content', () => {
  it('a cache carried to different content does not answer under the old rules', () => {
    const cache = createValidityCache();
    // Under `content` a bedroom needs a bed, and this store has one: valid.
    const store = workingHotel();
    expect(validRoomIds(store, BOUNDS, cache)).toEqual([1]);
    // Under content that requires a bed AND a lamp, the same store is `missingItem`. A
    // cache that ignored content identity would report the room as working.
    const stricter = bindContent({
      roomTypes: [
      { id: 'lounge', name: 'lounge', capacity: 8, nightlyRatePence: 0, provides: ['snack'] },
        {
          id: 'bedroom',
          name: 'bedroom',
          capacity: 1,
          nightlyRatePence: 8_500,
          nightlyUpkeepPence: 100,
          constructionCostPence: 0,
          provides: ['rest'],
          requires: ['bed', 'lamp'],
        },
      ],
      // G-027b — A NEED IS A STOCK. `capacityTicks` is time-to-empty, which is what the deleted
  // `patienceTicks` named, so it is carried; a refill is a whole tick. THE SECOND NEED IS
  // STRUCTURAL: a guest arrives AT its want line, a line of 0 leaves every need full with
  // nothing recorded as having served it (refused at the first commit), and a declared line
  // makes `assertLodgingBecomesWanted` demand away-ticks, which only an ENGAGEMENT need
  // generates. The same room type provides both rather than a second one appearing in a file
  // whose subject is which rooms are USABLE.
  needTypes: [
    { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 4, refillPerTick: 2 },
    { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 4, refillPerTick: 1 },
  ],
      // G-027a: content declaring a lodging need must say how long a stay lasts, or
      // `bindContent` refuses it — a guest holding a room has no other way to leave.
      guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 6, toleranceTicks: 4, wantAtBasisPoints: 2500 },
  ],
      itemTypes: [
        { id: 'bed', name: 'bed' },
        { id: 'lamp', name: 'lamp' },
      ],
    });
    const draft = beginEntityDraft(store, BOUNDS);
    const ctx = tickValidityContext(cache, stricter, BOUNDS, createCorridors(), createStairs(), draft);
    expect(validRoomsOf(ctx)).toEqual([]);
    expect(roomInvalidity(ctx, entityAt(store, 0))).toBe('missingItem');
  });
});

describe('clause 5 — `boundsEqual`: the same plot', () => {
  it('a cache carried to a narrower plot does not answer under the old plot', () => {
    const cache = createValidityCache();
    // Two rooms side by side at columns 0 and 1. On a WIDE plot, room 3 has column 2 free
    // to its right: a door. (Room 1 is sealed either way — the plot edge on its left, room
    // 3 on its right — which is what makes room 3 the single thing that moves.)
    const wide: GridBounds = { minFloor: 0, maxFloor: 4, minColumn: 0, maxColumn: 4, minRow: 0, maxRow: 0 };
    const store = storeOf(['bedroom', cell(0, 0)], ['bed', cell(0, 0)], ['bedroom', cell(0, 1)], ['bed', cell(0, 1)]);
    expect(validRoomIds(store, wide, cache)).toEqual([3]);
    // On a plot exactly two columns wide, room 3's only free side is off the edge of the
    // world, so it is `noDoor` too. A save carries its own plot (`GridBounds`), so a host
    // stepping two worlds with one cache can reach exactly this.
    const narrow: GridBounds = { minFloor: 0, maxFloor: 4, minColumn: 0, maxColumn: 1, minRow: 0, maxRow: 0 };
    expect(validRoomIds(store, narrow, cache)).toEqual([]);
  });
});

describe('clause 6 — the same CORRIDOR PLAN (G-034b)', () => {
  it('a cache carried past a `layCorridor` does not answer under the old plan', () => {
    // THE CLAUSE THE MEMBERSHIP CLAUSES CANNOT SEE, and that is the whole reason it exists.
    // Drawing a corridor stages no spawn and no despawn, so `builtFrom === draft.base` and
    // `draftIsClean(draft)` are BOTH still true — every earlier clause holds while the answer
    // has changed. And `applyCommands` runs before `runGuests`, so the stale context would be
    // consulted on the very tick the player drew.
    const cache = createValidityCache();
    const store = workingHotel();
    const openPlan = createCorridors();
    // Open plan: the room works, because free space is circulation where nothing is drawn.
    expect(validRoomIds(store, BOUNDS, cache, openPlan)).toEqual([1]);
    // One cell declared elsewhere on the same floor, and the floor is planned: the same room,
    // in the same store, with the same membership, now reaches nothing.
    const elsewhere = withCorridor(openPlan, cell(GROUND_FLOOR, 40));
    expect(validRoomIds(store, BOUNDS, cache, elsewhere)).toEqual([]);
    // And back again, so the clause is not simply "any second call misses".
    expect(validRoomIds(store, BOUNDS, cache, withCorridor(elsewhere, cell(GROUND_FLOOR, 1)))).toEqual([1]);
  });

  it('AND IT NOW GUARDS A SECOND ANSWER: a corridor that joins a stranded room to the door', () => {
    // ======================================================================================
    // G-038a-ii-beta. Clause 6 was written when a corridor decided ONE thing — whether a room
    // has a walkway beside it. It now decides TWO: the reachable component is a function of
    // the same plan, so a `layCorridor` can flip a room from `unreachable` to valid WITHOUT
    // touching `noCorridor` at all.
    //
    // That is why this arm exists rather than resting on the one above. The existing arm
    // drives `noCorridor`, so deleting clause 6 goes red there too — but a reader would then
    // have no witness that the COMPONENT is cached, and a future refactor that cached the fill
    // somewhere with its own lifetime would keep the suite green. The arm below fails for the
    // reachability answer specifically: `noCorridor` is satisfied in BOTH halves of it.
    //
    // A STAIRWELL IS DECLARED, because without one the floor axis spends from every cell and
    // nothing on a finite plot is out of reach (ADR-0059). One cell, on the door.
    // ======================================================================================
    const cache = createValidityCache();
    const store = storeOf(['bedroom', cell(GROUND_FLOOR, 3)], ['bed', cell(GROUND_FLOOR, 3)]);
    const stairs = withStair(createStairs(), cell(GROUND_FLOOR, 0));
    // The door is circulation, and so is the cell to the room's right — so the room HAS a
    // walkway and is not `noCorridor`. Between them, two undeclared cells on a planned floor.
    const stranded = withCorridor(withCorridor(createCorridors(), cell(GROUND_FLOOR, 0)), cell(GROUND_FLOOR, 4));
    expect(validRoomIds(store, BOUNDS, cache, stranded, stairs)).toEqual([]);
    // Draw the two cells between and the room is reached. Same store, same membership, same
    // stair plan, same plot: only the corridor plan moved, and only the ROUTE answer moved
    // with it.
    const joined = withCorridor(withCorridor(stranded, cell(GROUND_FLOOR, 1)), cell(GROUND_FLOOR, 2));
    expect(validRoomIds(store, BOUNDS, cache, joined, stairs)).toEqual([1]);
    // And back, so the clause is not simply "any second call misses".
    expect(validRoomIds(store, BOUNDS, cache, stranded, stairs)).toEqual([]);
  });

  it('and a `layCorridor` on a cell already declared KEEPS the cache, by identity', () => {
    // The other half, and the reason `withCorridor` returns its argument by reference: a host
    // issuing `layCorridor` on a blind cadence — the way `drawLoan` is issued — must not drop
    // the derived index on every tick. Identity is exact here rather than conservative.
    const cache = createValidityCache();
    const store = workingHotel();
    const plan = withCorridor(createCorridors(), cell(GROUND_FLOOR, 1));
    const first = tickValidityContext(cache, content, BOUNDS, plan, createStairs(), beginEntityDraft(store, BOUNDS));
    const again = withCorridor(plan, cell(GROUND_FLOOR, 1));
    const second = tickValidityContext(cache, content, BOUNDS, again, createStairs(), beginEntityDraft(store, BOUNDS));
    expect(second).toBe(first);
  });
});

describe('clause 7 — the same STAIR PLAN (G-038a-ii-alpha)', () => {
  // ==========================================================================================
  // THIS CLAUSE'S ABSENCE IS INVISIBLE TO EVERY GATE, WHICH IS WHY IT HAS A TEST OF ITS OWN AND
  // WHY THAT TEST IS THE FIRST THING WRITTEN ABOUT IT.
  //
  //   I2 CANNOT SEE IT. `tools/gates/determinism.mjs` compares runs TO EACH OTHER and holds no
  //   reference hash, so a CONSISTENTLY stale answer leaves the gate green — and G-038a-i
  //   measured the sharper version of the same limit: the determinism log's state re-converges
  //   before the gate's horizon, so a change visible at 5,000 ticks is invisible at 20,000.
  //
  //   I6 CANNOT SEE IT. A save round-trips ONE moment and carries no cache at all; a host
  //   reusing a cache across a load meets a different `EntityStore` object, misses, and
  //   rebuilds. There is nothing about staleness for `test:save` to notice.
  //
  // So the clause's whole witness is here, in exactly the shape the six clauses above have:
  // delete `cached.stairs === stairs` from `tickValidityContext` and the first arm goes red.
  // ==========================================================================================

  it('a cache carried past a `layStair` does not answer under the old plan', () => {
    // A DECLARED STAIR IS A DECLARED WALKWAY (`isDeclaredWalkway`), so laying one changes which
    // rooms are valid while staging no spawn and no despawn — `builtFrom === draft.base` and
    // `draftIsClean(draft)` are both still true, and every earlier clause holds while the
    // answer has moved. `applyCommands` runs before `runGuests`, so the stale context would be
    // consulted on the very tick the player drew.
    const cache = createValidityCache();
    const store = workingHotel();
    // A lane declared elsewhere on the floor: the floor is PLANNED, and the room reaches no
    // circulation, so it is `noCorridor`. This is the state clause 6 above leaves it in.
    const elsewhere = withCorridor(createCorridors(), cell(GROUND_FLOOR, 40));
    expect(validRoomIds(store, BOUNDS, cache, elsewhere)).toEqual([]);
    // NOW A STAIRWELL BESIDE THE ROOM, and nothing else changes. The stair cell is a declared
    // walkway, the room opens onto it, and the room works again — the rule is a UNION and a
    // stair only ever adds to it.
    const stairwell = withStair(createStairs(), cell(GROUND_FLOOR, 1));
    expect(validRoomIds(store, BOUNDS, cache, elsewhere, stairwell)).toEqual([1]);
    // And back to the empty set, so the clause is not simply "any second call misses".
    expect(validRoomIds(store, BOUNDS, cache, elsewhere, createStairs())).toEqual([]);
  });

  it('and a `layStair` on a cell already declared KEEPS the cache, by identity', () => {
    // The other half, and the reason `withStair` returns its argument by reference: a host
    // issuing `layStair` on a blind cadence must not drop the derived index every tick.
    const cache = createValidityCache();
    const store = workingHotel();
    const plan = withStair(createStairs(), cell(GROUND_FLOOR, 1));
    const first = tickValidityContext(cache, content, BOUNDS, createCorridors(), plan, beginEntityDraft(store, BOUNDS));
    const again = withStair(plan, cell(GROUND_FLOOR, 1));
    const second = tickValidityContext(cache, content, BOUNDS, createCorridors(), again, beginEntityDraft(store, BOUNDS));
    expect(second).toBe(first);
  });

  it('and the two plans are INDEPENDENT clauses: a stair change alone drops the cache', () => {
    // The discriminating half. If `stairs` were folded into the corridor comparison — or if the
    // clause read `corridors` twice, which is the copy-paste this file exists to catch — this
    // arm would return the cached context because the corridor plan is the very same object.
    const cache = createValidityCache();
    const store = workingHotel();
    const corridors = withCorridor(createCorridors(), cell(GROUND_FLOOR, 40));
    const first = tickValidityContext(cache, content, BOUNDS, corridors, createStairs(), beginEntityDraft(store, BOUNDS));
    const second = tickValidityContext(
      cache,
      content,
      BOUNDS,
      corridors,
      withStair(createStairs(), cell(GROUND_FLOOR, 1)),
      beginEntityDraft(store, BOUNDS),
    );
    expect(second).not.toBe(first);
  });
});

// ---------------------------------------------------------------------------------------
// AND THE WHOLE THING, END TO END, THROUGH THE REAL TICK.
// ---------------------------------------------------------------------------------------

/**
 * A schedule that churns membership hard: spawns, despawns, builds, demolitions and a
 * steady stream of guests, so a stale index has every opportunity to show.
 */
function churn(ticks: number): readonly ScheduledCommand[] {
  const out: ScheduledCommand[] = [];
  for (let i = 0; i < 6; i += 1) {
    const at = cell(GROUND_FLOOR, i * 2);
    out.push({ tick: 0, command: { kind: 'spawnEntity', entityKind: 'bedroom', at } });
    out.push({ tick: 0, command: { kind: 'spawnEntity', entityKind: 'bed', at } });
  }
  for (let tick = 1; tick < ticks; tick += 3) {
    out.push({ tick, command: { kind: 'guestArrives' } });
  }
  // A room comes and goes, repeatedly, on a cell a guest would otherwise be using.
  for (let tick = 7; tick < ticks; tick += 11) {
    out.push({ tick, command: { kind: 'buildRoom', roomType: 'bedroom', at: cell(GROUND_FLOOR + 1, 0) } });
  }
  for (let tick = 13; tick < ticks; tick += 11) {
    out.push({ tick, command: { kind: 'demolishRoom', id: 1 } });
    out.push({ tick, command: { kind: 'despawnEntity', id: 3 } });
  }
  return out;
}

/** Run the schedule tick by tick with whatever cache we are given. */
function runWith(cache: ReturnType<typeof createValidityCache> | null, ticks: number): World {
  const byTick = new Map<number, ScheduledCommand['command'][]>();
  for (const entry of churn(ticks)) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  let world = createWorld(9, content);
  for (let i = 0; i < ticks; i += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? [], cache);
  }
  return world;
}

describe('the acceptance bar: a pure optimisation must not move the state hash', () => {
  it('600 ticks of churn hash identically with a cache and without one', () => {
    const withCache = runWith(createValidityCache(), 600);
    const without = runWith(null, 600);
    expect(hashState(withCache)).toBe(hashState(without));
    // And the run has to have DONE something, or the equality above is two empty worlds
    // agreeing (ADR-0007). Every one of these is a path a stale index could corrupt.
    expect(departureCountOf(withCache.guestOutcomes, 'checkedOut')).toBeGreaterThan(0);
    expect(evictedGuests(withCache.guestOutcomes)).toBeGreaterThan(0);
    expect(withCache.buildOutcomes.built).toBeGreaterThan(0);
    expect(withCache.buildOutcomes.demolished).toBeGreaterThan(0);
  });

  it('a cache reused across two DIFFERENT worlds keeps them apart', () => {
    // A host holding one cache and stepping two saves is the sharpest form of the staleness
    // question, because the two worlds' entity stores are unrelated objects.
    const cache = createValidityCache();
    const a = runWith(cache, 200);
    const b = runWith(cache, 200);
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).toBe(hashState(runWith(null, 200)));
  });
});

describe('validRoomsOf is the same choice the old every-entity scan made', () => {
  it('keeps rooms in ascending id order and leaves items out entirely', () => {
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 0)],
      ['bed', cell(GROUND_FLOOR, 0)],
      ['bedroom', cell(GROUND_FLOOR, 2)],
      ['bed', cell(GROUND_FLOOR, 2)],
    );
    const draft = beginEntityDraft(store, BOUNDS);
    const ctx = tickValidityContext(null, content, BOUNDS, createCorridors(), createStairs(), draft);
    expect(validRoomsOf(ctx).map((r) => r.id)).toEqual([1, 3]);
  });

  it('leaves an INVALID room out, so the guest loop never has to ask twice', () => {
    // Room 3 is furnished but floating: nothing at floor 0 beneath it.
    const store = storeOf(
      ['bedroom', cell(GROUND_FLOOR, 0)],
      ['bed', cell(GROUND_FLOOR, 0)],
      ['bedroom', cell(GROUND_FLOOR + 1, 4)],
      ['bed', cell(GROUND_FLOOR + 1, 4)],
    );
    const draft = beginEntityDraft(store, BOUNDS);
    const ctx = tickValidityContext(null, content, BOUNDS, createCorridors(), createStairs(), draft);
    expect(validRoomsOf(ctx).map((r) => r.id)).toEqual([1]);
    expect(isValidRoom(ctx, entityAt(store, 2))).toBe(false);
  });
});
