// G-036c B6 — A ROOM HAS AN ACCESS RULE, AND IT BITES.
//
//   pnpm exec vitest run validity
//
// ============================================================================
//  THE STANDARD THIS FILE HAS TO MEET, AND IT IS THE ONE THE PROJECT SET ITSELF ONE GOAL AGO.
//
//  `forbidden adjacencies` was refused at G-036b with a one-line reason: **"a content field
//  shipped here with no consumer is a field that ships unexercised."** B6 is a content field
//  shipped here, so it owes the same thing — and the specific form the goal block asks for is a
//  DISCRIMINATING TEST: *the same hotel, same seed, with and without the rule, producing
//  different engagement.* That is `THE DISCRIMINATING EXPERIMENT` below, and it is run through
//  the real tick with two content sets that differ in ONE STRING.
//
//  WHY IT STOPPED BEING AN EDGE CASE. The rule was parked for thirteen goals because a stranger
//  walking into a bedroom was a CONTENT ACCIDENT — nothing a designer would author. Player-drawn
//  rooms turn it into a certainty: **somebody will put a vending machine in a bedroom on
//  purpose**, and G-036b made `placeItem` the primary verb for doing exactly that.
//
//  THE VALUES ARE camelCase AND THAT WAS RULED AT PLAN. `guests_of_this_room` and `staff_only`
//  are snake_case, which is ADR-0003's convention for a CONTENT ID, and the sim must branch on
//  them — so the literals would appear in `packages/sim` and `pnpm check:content`, an INVARIANT
//  gate, would fire. `RoomInvalidityReason`'s `noDoor`/`missingItem` is the precedent.
//
//  Kinds and ids here are camelCase for the same reason.
// ============================================================================

import { describe, expect, it } from 'vitest';
import type { Command } from './commands.js';
import { accessRuleOf, bindContent, isRoomAccessRule, ROOM_ACCESS_RULES } from './content.js';
import type { BoundContent, RoomAccessRule, RoomTypeData } from './content.js';
import { entitiesInOrder, getEntity, NO_ENTITY } from './entities.js';
import type { Entity } from './entities.js';
import type { Cell, Footprint } from './grid.js';
import { run, stepTick } from './tick.js';
import { createValidityContext, guestAccessTo, isProviding, storeEntities } from './validity.js';
import { createWorld, hashState } from './world.js';
import type { World } from './world.js';

const cell = (floor: number, column: number, row = 0): Cell => ({ floor, column, row });
const fp = (columns: number, rows: number): Footprint => ({ columns, rows });

/**
 * THE ONE HOTEL BOTH ARMS ARE BUILT FROM, and the only thing that differs between them is
 * `bedroom.accessRule`. Two bedrooms, a machine standing inside the SECOND one, and nothing
 * else that serves `snack`.
 */
const roomTypes = (bedroomAccess: RoomAccessRule): RoomTypeData[] => [
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
    accessRule: bedroomAccess,
  },
  {
    id: 'kiosk',
    name: 'kiosk',
    capacity: 8,
    nightlyRatePence: 0,
    constructionCostPence: 1_000,
    demolitionRefundBasisPoints: 0,
    // PROVIDES NOTHING ITSELF. The machine inside it is what serves `snack`, so the access rule
    // under test is read through `hostRoomOf` — the borrowed-validity path — rather than off the
    // provider directly. `assertNeedsAreSatisfiable` still passes because `bedroom` requires
    // `bed` and the kiosk exists to hold the machine a player placed.
    provides: [],
    requires: ['machine'],
    minFootprintCells: 1,
    maxFootprintCells: 8,
    accessRule: 'public',
  },
];

const contentWith = (bedroomAccess: RoomAccessRule): BoundContent =>
  bindContent({
    roomTypes: roomTypes(bedroomAccess),
    needTypes: [
      { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 12, refillPerTick: 1 },
      { id: 'snack', name: 'snack', role: 'engagement', capacityTicks: 12, refillPerTick: 3 },
    ],
    guestRules: [
      { id: 'houseRules', name: 'House Rules', stayDurationTicks: 20, toleranceTicks: 12, wantAtBasisPoints: 2_000 },
    ],
    itemTypes: [{ id: 'bed', name: 'bed' }, { id: 'machine', name: 'machine', provides: ['snack'] }],
  });

const PUBLIC_BEDROOMS = contentWith('public');
const PRIVATE_BEDROOMS = contentWith('guestsOfThisRoom');

/**
 * THE HOTEL. Two bedrooms at columns 0 and 4 — the lower id is the one a guest takes first,
 * because `validRoomsProviding` is ascending by id — and a vending machine standing inside the
 * SECOND bedroom, which is the room the first guest will NOT be lodging in.
 *
 * Seeded through `spawnEntity`, the structural door, so no money is involved and the two arms
 * cannot differ through the ledger.
 */
const SEED_HOTEL: readonly Command[] = [
  { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(0, 0) },
  { kind: 'spawnEntity', entityKind: 'bed', at: cell(0, 0) },
  { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(0, 4), footprint: fp(2, 1) },
  { kind: 'spawnEntity', entityKind: 'bed', at: cell(0, 4) },
  // THE VENDING MACHINE SOMEBODY PUT IN A BEDROOM ON PURPOSE, in its second cell.
  { kind: 'spawnEntity', entityKind: 'machine', at: cell(0, 5) },
];

const SEED = 11;

/** One arm: the same hotel, the same seed, one guest, run for `ticks`. */
function arm(content: BoundContent, ticks: number): World {
  const seeded = stepTick(createWorld(SEED, content), content, [...SEED_HOTEL]);
  return run(seeded, content, ticks, [{ tick: seeded.tick, command: { kind: 'guestArrives' } }]);
}

const machineIn = (world: World): Entity =>
  entitiesInOrder(world.entities).find((entity) => entity.kind === 'machine')!;

describe('THE DISCRIMINATING EXPERIMENT: the same hotel and seed, with and without the rule', () => {
  // ==========================================================================================
  // THE TWO ARMS DIFFER IN ONE STRING IN ONE CONTENT FILE AND IN NOTHING ELSE. Same seed, same
  // spawn commands, same entity ids, same need table, same guest. If the access rule did
  // nothing, these two worlds would be byte-identical apart from `contentHash`.
  // ==========================================================================================
  const open = arm(PUBLIC_BEDROOMS, 1);
  const closed = arm(PRIVATE_BEDROOMS, 1);

  it('is the same hotel in both arms, or the comparison is between two different worlds', () => {
    // The control, first, and it is the one that makes everything below mean something.
    expect(entitiesInOrder(open.entities).map((entity) => `${entity.id}:${entity.kind}`)).toEqual(
      entitiesInOrder(closed.entities).map((entity) => `${entity.id}:${entity.kind}`),
    );
    expect(open.guests.list).toHaveLength(1);
    expect(closed.guests.list).toHaveLength(1);
    // Both guests took the SAME bedroom — the lower id — so the difference below cannot be
    // "they are standing in different rooms".
    expect(open.guests.list[0]?.roomEntityId).toBe(closed.guests.list[0]?.roomEntityId);
    expect(open.guests.list[0]?.roomEntityId).toBe(1);
  });

  it('WITHOUT the rule the guest walks into somebody else’s bedroom and uses the machine', () => {
    expect(open.guests.list[0]?.engagement).toEqual({ entityId: machineIn(open).id, needId: 'snack' });
  });

  it('WITH the rule it does not, and that is the whole of B6', () => {
    expect(closed.guests.list[0]?.engagement).toBeNull();
  });

  it('and the two runs diverge in STATE, not only in a predicate', () => {
    // The strongest form of the claim: the state hashes part. A rule that changed a verdict
    // without changing the simulation would leave these equal.
    expect(hashState(open)).not.toBe(hashState(closed));
  });

  it('and the difference persists into the OUTCOME table, which is what a player would feel', () => {
    // Run both arms out to a whole stay. The need the machine serves is met in one arm and left
    // unserved in the other — `snack`'s `unservedTicks` is the measured consequence, and it is
    // the number a review reads (ADR-0037).
    const openStay = arm(PUBLIC_BEDROOMS, 30);
    const closedStay = arm(PRIVATE_BEDROOMS, 30);
    const snackOf = (world: World): { met: number; unmet: number } => {
      const row = world.needOutcomes.find((entry) => entry.needId === 'snack')!;
      return { met: row.met, unmet: row.unmet };
    };
    expect(snackOf(openStay).met).toBeGreaterThan(0);
    expect(snackOf(closedStay).met).toBe(0);
    expect(snackOf(closedStay).unmet).toBeGreaterThan(0);
  });

  it('and the guest that DOES lodge in that bedroom may use it, so the rule is not a blanket ban', () => {
    // ========================================================================================
    // THE OTHER HALF, AND WITHOUT IT `guestsOfThisRoom` WOULD BE INDISTINGUISHABLE FROM
    // `staffOnly`. A second guest arrives, takes the second bedroom — the one with the machine
    // in it — and engages the machine under the very content that refused the first guest.
    // ========================================================================================
    const seeded = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    const two = run(seeded, PRIVATE_BEDROOMS, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    const machine = machineIn(two);
    const lodgers = two.guests.list.map((guest) => guest.roomEntityId);
    expect(lodgers).toEqual([1, 3]); // the two bedrooms, in id order
    // The guest in bedroom 1 is turned away; the guest in bedroom 3 — which COVERS the
    // machine's cell — is not.
    expect(two.guests.list[0]?.engagement).toBeNull();
    expect(two.guests.list[1]?.engagement).toEqual({ entityId: machine.id, needId: 'snack' });
  });

  it('and one guest’s refusal does not exhaust the need for everybody, which is a per-tick memo bug', () => {
    // ========================================================================================
    // THE SUBTLE ONE, AND IT IS THE REASON `guestAccessTo` RETURNS THREE VERDICTS RATHER THAN
    // TWO. `findFreeRoom` memoises "no free provider of this need" once per TICK and every
    // later guest reads it. Guest 1 is denied for a reason that is about GUEST 1; if that
    // denial marked `snack` exhausted, guest 2 would be told there is nothing to eat — a guest
    // standing in the lobby beside its own vending machine.
    //
    // The case above already fails if the memo is wrong, because guests are visited in
    // ascending id and the denied one is FIRST. This states it as its own claim so a future
    // reordering cannot quietly retire the coverage.
    // ========================================================================================
    const seeded = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    const two = run(seeded, PRIVATE_BEDROOMS, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    expect(two.guests.list.filter((guest) => guest.engagement !== null)).toHaveLength(1);
  });
});

describe('the predicate itself', () => {
  const ctxOf = (world: World, content: BoundContent) =>
    createValidityContext(content, world.grid, world.corridors, world.stairs, storeEntities(world.entities));

  it('reads absence as `public`, which is the exact historical reading and not a default', () => {
    // Content written before access rules restricted nobody, so every provider in every world
    // those bytes can describe was reachable by every guest. `public` STATES that; it does not
    // choose it. This is what keeps the frozen v1 fixture loadable and its fingerprint still.
    const silent = bindContent({
      roomTypes: [
        {
          id: 'plainRoom',
          name: 'plainRoom',
          capacity: 2,
          nightlyRatePence: 1,
          constructionCostPence: 1,
        },
      ],
    });
    expect(accessRuleOf(silent, 'plainRoom')).toBe('public');
    // And a room type this content does not define reads the same way, which is a postcondition
    // of every caller having established the kind rather than a fourth answer.
    expect(accessRuleOf(silent, 'noSuchRoomType')).toBe('public');
  });

  it('exempts the LODGING search from `guestsOfThisRoom`, or no bedroom carrying it is bookable', () => {
    // ========================================================================================
    // THE ONE ASYMMETRY IN THE RULE, RULED AT PLAN. **Lodging is HOW a guest becomes a guest of
    // the room.** A search that demanded the guest already be one would read "only the occupant
    // may become the occupant", and the shipped `standard_room` — which IS `guestsOfThisRoom` —
    // would be unbookable, so the hotel would have no beds. `staffOnly` has no such
    // circularity and is NOT exempt.
    // ========================================================================================
    const world = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    const ctx = ctxOf(world, PRIVATE_BEDROOMS);
    const bedroom = getEntity(world.entities, 1)!;
    expect(guestAccessTo(ctx, bedroom, NO_ENTITY, true)).toBe('allowed');
    expect(guestAccessTo(ctx, bedroom, NO_ENTITY, false)).toBe('reservedForItsOwnGuest');
    expect(guestAccessTo(ctx, bedroom, bedroom.id, false)).toBe('allowed');
  });

  it('closes a `staffOnly` room to every guest, lodging included', () => {
    // A LINEN STORE BESIDE A BOOKABLE BEDROOM, because `assertSomeLodgingRoomAdmitsGuests`
    // refuses content whose only lodging rooms are staff-only — so the value has to be
    // exercised on a room type that is not the hotel's last bed. That refusal is itself
    // asserted at the bottom of this file.
    const staffContent = bindContent({
      roomTypes: [
        ...roomTypes('public'),
        {
          id: 'linenStore',
          name: 'linenStore',
          capacity: 1,
          nightlyRatePence: 0,
          constructionCostPence: 1_000,
          demolitionRefundBasisPoints: 0,
          // IT PROVIDES LODGING TOO, deliberately: a staff dormitory is a bed a guest may not
          // book, and asserting `closedToGuests` on the LODGING search only means something
          // when the room could otherwise have been chosen for it.
          provides: ['rest'],
          requires: ['bed'],
          minFootprintCells: 1,
          maxFootprintCells: 8,
          accessRule: 'staffOnly',
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
    const world = stepTick(createWorld(SEED, staffContent), staffContent, [
      { kind: 'spawnEntity', entityKind: 'linenStore', at: cell(0, 0) },
      { kind: 'spawnEntity', entityKind: 'bed', at: cell(0, 0) },
      { kind: 'spawnEntity', entityKind: 'bedroom', at: cell(0, 4) },
      { kind: 'spawnEntity', entityKind: 'bed', at: cell(0, 4) },
    ]);
    const ctx = ctxOf(world, staffContent);
    const store = getEntity(world.entities, 1)!;
    const bedroom = getEntity(world.entities, 3)!;
    expect(guestAccessTo(ctx, store, NO_ENTITY, true)).toBe('closedToGuests');
    expect(guestAccessTo(ctx, store, store.id, false)).toBe('closedToGuests');
    // AND IT BITES ON THE LODGING SEARCH THROUGH THE REAL TICK: the linen store has the LOWER
    // id, so "lowest id wins" would put the guest in it — the guest takes the bedroom instead.
    const stayed = run(world, staffContent, 1, [{ tick: world.tick, command: { kind: 'guestArrives' } }]);
    expect(stayed.guests.list[0]?.roomEntityId).toBe(bedroom.id);
  });

  it('AN ITEM BORROWS ITS HOST ROOM’S RULE, which is why ItemTypeData gains no field', () => {
    // `isProviding`'s argument, one field over: an item has no validity of its own and no access
    // rule of its own. A machine is reachable exactly when the room it stands in is.
    const world = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    const ctx = ctxOf(world, PRIVATE_BEDROOMS);
    const machine = machineIn(world);
    // It IS providing — hostedness and access are separate questions, and this pins that.
    expect(isProviding(ctx, machine)).toBe(true);
    expect(guestAccessTo(ctx, machine, NO_ENTITY, false)).toBe('reservedForItsOwnGuest');
    expect(guestAccessTo(ctx, machine, 3, false)).toBe('allowed'); // the room that covers its cell
  });

  it('and it is the COVERING room, not the originating one, that decides', () => {
    // The machine stands at column 5; bedroom 3's ORIGIN is column 4. A rule read off the origin
    // cell would give this item no host and answer `allowed` for everybody — which is the
    // origin-keyed index failure G-036b repaired, arriving through a new door.
    const world = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    const machine = machineIn(world);
    expect(machine.at).toEqual(cell(0, 5));
    expect(getEntity(world.entities, 3)?.at).toEqual(cell(0, 4));
  });

  it('and an engagement this predicate allowed cannot become disallowed while it is held', () => {
    // ========================================================================================
    // WHY THERE IS NO RELEASE CONDITION FOR ACCESS, stated as a checked fact rather than as a
    // paragraph. The verdict depends on `Guest.roomEntityId`, which moves exactly once — from
    // `NO_ENTITY` when the guest books — because `reserve` never reassigns a room a guest
    // already holds, and a guest that LOSES its lodging room departs on the same tick. So the
    // check at acquisition is the whole rule.
    // ========================================================================================
    const seeded = stepTick(createWorld(SEED, PRIVATE_BEDROOMS), PRIVATE_BEDROOMS, [...SEED_HOTEL]);
    let world = run(seeded, PRIVATE_BEDROOMS, 1, [
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
      { tick: seeded.tick, command: { kind: 'guestArrives' } },
    ]);
    const lodger = world.guests.list[1]!;
    expect(lodger.engagement).not.toBeNull();
    const room = lodger.roomEntityId;
    // Ten more ticks: the room it holds never changes, so the verdict it was given never can.
    world = run(world, PRIVATE_BEDROOMS, 10, []);
    const later = world.guests.list.find((guest) => guest.id === lodger.id);
    if (later !== undefined) expect(later.roomEntityId).toBe(room);
  });
});

describe('the union itself', () => {
  it('is exhaustive, sorted, camelCase and free of a __proto__ hole', () => {
    expect([...ROOM_ACCESS_RULES]).toEqual([...ROOM_ACCESS_RULES].sort());
    expect(ROOM_ACCESS_RULES).toHaveLength(3);
    expect(isRoomAccessRule('public')).toBe(true);
    expect(isRoomAccessRule('guestsOfThisRoom')).toBe(true);
    expect(isRoomAccessRule('staffOnly')).toBe(true);
    // ========================================================================================
    // THE SNAKE_CASE SPELLINGS ARE NOT WRITTEN OUT IN THIS FILE, AND THAT IS THE RULING BEING
    // ENFORCED RATHER THAN A GAP IN THE TEST.
    //
    // The first draft of this case asserted `isRoomAccessRule('staff_only') === false` — and
    // `pnpm check:content`, an INVARIANT gate, went red on it: **ADR-0003 judges a snake_case
    // string literal in `packages/sim` by SHAPE, not by what the surrounding code does with
    // it.** That is the gate being right. Weakening it to admit a literal that happens to sit
    // inside an `expect(...).toBe(false)` would be editing a gate to make a build pass (§9),
    // and it is the precise mechanism the PLAN predicted would fire if the values had shipped
    // snake_case.
    //
    // So the proof lives in the layer where such a literal is legal: `roomTypeSchema` refuses
    // both spellings at the boundary, asserted in `packages/content/src/registry.test.ts`
    // ("takes only the three the sim branches on"), which is outside the gate's CODE_ROOTS.
    // Nobody can author them, so the sim never has to recognise them — and this line is the
    // shape rule that keeps it that way from this side.
    // ========================================================================================
    for (const rule of ROOM_ACCESS_RULES) expect(rule).not.toMatch(/_/);
    expect(isRoomAccessRule('__proto__')).toBe(false);
    expect(isRoomAccessRule('toString')).toBe(false);
    expect(isRoomAccessRule('anyoneAtAll')).toBe(false);
  });

  it('is refused at bind time when a raw host offers something else', () => {
    // The `cloneNeedType` discipline: a value the simulation has no branch for dies here, with
    // the room type named, rather than being silently read as "not staffOnly" by every later
    // comparison — and the value a typo degrades to is the PERMISSIVE one, which is the worse
    // direction of the two.
    const bad = (): unknown =>
      bindContent({
        roomTypes: [
          {
            id: 'oddRoom',
            name: 'oddRoom',
            capacity: 1,
            nightlyRatePence: 1,
            constructionCostPence: 1,
            // camelCase-but-unknown, deliberately: the snake_case spellings cannot be written
            // in this package at all (see above), and what this case is about is a value the
            // simulation has no branch for rather than one particular typo.
            accessRule: 'anyoneAtAll' as RoomAccessRule,
          },
        ],
      });
    expect(bad).toThrow(/accessRule/);
    expect(bad).toThrow(/oddRoom/);
  });

  it('and content whose only lodging rooms are staffOnly is refused, because nobody could book', () => {
    // ========================================================================================
    // THE MIRROR OF `assertNeedsAreSatisfiable`, ONE FIELD OVER. It asks whether a need has a
    // provider a PLAYER can reach; this asks whether the lodging need has one a GUEST can
    // reach — a different question the moment `staffOnly` exists. Without it every guest would
    // form a lodging need, queue for a bed it may not use and leave without checking in, for
    // the whole run, with `pnpm verify` green.
    // ========================================================================================
    expect(() => contentWith('staffOnly')).toThrow(/staffOnly/);
    expect(() => contentWith('staffOnly')).toThrow(/lodging/);
    // AND THE COMPANION ADR-0007 ASKS FOR: `guestsOfThisRoom` is NOT a violation, because the
    // rule does not gate lodging. Without this the refusal above would be indistinguishable
    // from one that banned every non-public bedroom — which is the shipped table's shape.
    expect(() => contentWith('guestsOfThisRoom')).not.toThrow();
    expect(() => contentWith('public')).not.toThrow();
  });
});
