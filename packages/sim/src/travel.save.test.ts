// G-023a — SAVE SCHEMA 11, AND A POSITION DERIVED FROM THE BYTES RATHER THAN INVENTED.
//
//   pnpm exec vitest run travel      and      pnpm exec vitest run save
//
// Named to be picked up by BOTH, because those are two of this goal's exit criteria and this
// is where they meet — the `review.save.test.ts` precedent one version on.
//
// ADR-0006 HAS NOW FIRED TEN TIMES. `Guest` gains `at`, so the permanent v1 fixture describes
// a world this build cannot load, and the answer is a real 10 -> 11 migration.
// `fixtures/save-v1.ts` HAS A ZERO-LINE DIFF in this change; the migration is what carries
// it. The walk is 1 -> ... -> 10 -> 11.
//
// THIS FILE OWNS THE CURRENT ERA. When v12 arrives, the assertions here move the same way and
// the hand-written v10 world below must not (ADR-0008 (2)).
//
// ============================================================================
//  THE FIXTURE PROVES NOTHING FOR THIS STEP, AND THAT IS WHY THIS FILE EXISTS.
//
//  The permanent v1 fixture's guest list is EMPTY — `migrateV1ToV2` gives it
//  `{nextId: 1, list: []}` and no later step puts a guest in it — so `migrateV10ToV11` maps
//  over an empty array for the fixture and reports success having inspected nothing. That is
//  ADR-0007's exact shape, and it is the paragraph `migrateV6ToV7`, `migrateV7ToV8` and
//  `migrateV8ToV9` all carry. It is ASSERTED below rather than asserted about, so nobody has
//  to take the claim on trust.
//
//  EVERY EXPECTED CELL BELOW IS A HAND-WRITTEN LITERAL. Deriving them from `entranceCell` or
//  `standingCell` would make both sides of every assertion come out of the same build — the
//  vacuity ADR-0008's "why" paragraph works through in full, where a test oracle derived from
//  the artefact it is testing agrees with whatever that artefact does.
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent } from './content.js';
import type { NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { SAVE_V1_BYTES, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';
import { guestsInOrder } from './guests.js';
import {
  assertMigrationPathComplete,
  assertWorldShape,
  deserialise,
  MIGRATIONS,
  MIN_SUPPORTED_SCHEMA_VERSION,
  SAVE_SCHEMA_VERSION,
  serialise,
} from './save.js';
import { hashState, WORLD_KEYS } from './world.js';

/** The v10 -> v11 step itself. Index 9, the tenth link. */
const step = MIGRATIONS[9]!;

const roomType = (id: string, provides: readonly string[]): RoomTypeData => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const need = (id: string, lodging: boolean): NeedTypeData => ({
  id,
  name: id,
  role: lodging ? 'lodging' : 'engagement',
  // G-027b: `capacityTicks` is time-to-empty, which is what `patienceTicks` named, so 200 is
  // carried on both. The refills are chosen to keep the table serviceable and the lodging need
  // reachable inside a 40-tick stay.
  capacityTicks: 200,
  refillPerTick: lodging ? 5 : 3,
});

const V11_CONTENT: SimContent = {
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('food', false), need('rest', true)],
  // G-027a: content declaring a lodging need must say how long a stay lasts, or `bindContent`
  // refuses it. G-027b adds the wait and the want line: 2 x 200 x 200 = 80,000 fits inside the
  // ten away-ticks one engagement need generates in a 40-tick stay at refill 3, which is 100,000.
  guestRules: [
    { id: 'houseRules', name: 'House Rules', stayDurationTicks: 40, toleranceTicks: 200, wantAtBasisPoints: 200 },
  ],
};
const content = bindContent(V11_CONTENT);

// ============================================================================
//  A v10 WORLD WITH SOMETHING TO MIGRATE, WRITTEN BY HAND — ALL OF IT.
//
//  *** NEVER REGENERATE THIS. A literal produced by this build would agree   ***
//  *** with whatever this build does, which is the question it exists to     ***
//  *** answer (ADR-0006, ADR-0008 (2)).                                      ***
//
//  FIVE GUESTS, ONE PER BRANCH OF THE DERIVATION, because a step whose branches are not all
//  driven is a step that has been watched doing one thing. Two of the five hold entities that
//  are THEMSELVES UNPLACED — the state every entity carried out of the v2 -> v3 chain is in —
//  which is the branch that would otherwise be reasoned about rather than run.
//
//  EVERY TOP-LEVEL FIELD IS SPELLED OUT, AND IT DID NOT START THAT WAY (`sim-critic` MINOR
//  4). The first version built its base from `createWorld(3, content)` and overrode the
//  three fields it cared about — not vacuous, because the guests, the entities and every
//  expected cell were hand-written, but a FORWARD hazard under a banner that says frozen:
//  `createWorld` returns a world in the CURRENT shape, so the day v12 adds a top-level
//  field this "v10" world would silently already carry it, v12's overwrite guard for that
//  field would never fire here, and the banner above would tell the next author the fixture
//  was frozen while it quietly tracked the build.
//
//  THE ONE VALUE THAT IS NOT FROZEN IS `contentHash`, and it is named rather than hidden:
//  it is `content.fingerprint` of the definitions at the top of this file, because the
//  fingerprint of a hand-written table is not something a reader can maintain as a literal.
//  Nothing here asserts on it except the "reads no content" case, which OVERWRITES it with
//  a fingerprint naming content that does not exist — so no claim in this file rests on its
//  value.
// ============================================================================

/** Where each entity in the hand-built world stands. Ids are the array positions plus one. */
const ENTITIES: readonly { readonly id: number; readonly kind: string; readonly at: unknown }[] = [
  { id: 1, kind: 'bedroom', at: { floor: 0, column: 3 } },
  { id: 2, kind: 'cafe', at: { floor: -1, column: 6 } },
  { id: 3, kind: 'bedroom', at: { floor: 0, column: 9 } },
  { id: 4, kind: 'bedroom', at: null }, // legacy: carried unplaced out of the v2 -> v3 chain
  { id: 5, kind: 'cafe', at: null }, // ditto
  { id: 6, kind: 'bedroom', at: { floor: 2, column: 12 } },
];

const needs = (engaged: boolean): readonly unknown[] => [
  { needId: 'food', patienceRemaining: 90, progressRemaining: engaged ? 4 : 9, metBy: null, abandonCount: 0 },
  { needId: 'rest', patienceRemaining: 80, progressRemaining: 12, metBy: null, abandonCount: 0 },
];

/**
 * The nine fields a v10 world carried that this file is not otherwise about, as literals.
 * (`entities`, `guests` and `guestOutcomes` are the three `v10World` supplies, making the
 * twelve a v10 world has — the count the "adds no top-level key" case below asserts.)
 *
 * Written out rather than taken from `createWorld` so that the day a v12 field arrives, THIS
 * WORLD DOES NOT HAVE IT — which is what makes v12's own overwrite guard reachable from a
 * fixture that claims to be frozen. The plot is the shipped default's four integers because
 * the entities above stand on it; the tests that need a different plot pass their own.
 */
const V10_BASE: Readonly<Record<string, unknown>> = Object.freeze({
  tick: 5_000,
  rng: { a: 380_611_476, b: 3_528_236_117, c: 3_141_763_490, d: 24_321_242 },
  ledger: [{ tick: 1_440, amount: 8_500, reason: 'roomRevenue' }],
  contentHash: content.fingerprint,
  needOutcomes: [],
  reviewOutcomes: [],
  grid: { minFloor: -2, maxFloor: 20, minColumn: 0, maxColumn: 79 },
  buildOutcomes: {
    built: 0,
    demolished: 0,
    refused: { insufficientFunds: 0, noSuchRoom: 0, occupied: 0, outOfBounds: 0 },
  },
  loanOutcomes: { drawn: 0, refused: { noLoanOffered: 0, notEligible: 0 } },
});

/** A v10 world. `guests[].at` does not exist in it, which is the whole point. */
const v10World = (grid?: Record<string, number>): Record<string, unknown> => {
  return {
    ...V10_BASE,
    ledger: [...(V10_BASE['ledger'] as readonly unknown[])],
    ...(grid === undefined ? {} : { grid }),
    entities: { nextId: 7, list: ENTITIES.map((entity) => ({ ...entity })) },
    guests: {
      nextId: 6,
      list: [
        // 1. ENGAGED WITH A PLACED PROVIDER, and holding a placed room besides. The café wins.
        { id: 1, arrivedTick: 10, roomEntityId: 1, engagement: { entityId: 2, needId: 'food' }, needs: needs(true) },
        // 2. HOLDING A PLACED ROOM AND NOTHING ELSE.
        { id: 2, arrivedTick: 20, roomEntityId: 3, engagement: null, needs: needs(false) },
        // 3. HOLDING NOTHING AT ALL — waiting in the doorway.
        { id: 3, arrivedTick: 30, roomEntityId: 0, engagement: null, needs: needs(false) },
        // 4. HOLDING A ROOM THAT IS ITSELF UNPLACED. There is no cell to inherit.
        { id: 4, arrivedTick: 40, roomEntityId: 4, engagement: null, needs: needs(false) },
        // 5. ENGAGED WITH AN UNPLACED PROVIDER while holding a PLACED room. The branch the
        //    two readings of the rule disagree about.
        { id: 5, arrivedTick: 50, roomEntityId: 6, engagement: { entityId: 5, needId: 'food' }, needs: needs(true) },
      ],
    },
    // FROZEN, NOT `createGuestOutcomes()`, and for the reason `V10_BASE` is frozen one level
    // up: a departure taxonomy is the union `V8_MIGRATION_GUEST_OUTCOMES` exists because it
    // grows, and a "v10" world folding the LIVE list would silently gain a sixth row the day
    // M3 adds "gave up waiting for a lift" — **and G-038b-i did, at index 3, which is why this
    // frozen five-row literal now differs from the live eight-row union**. Five guests arrived
    // and none has left.
    guestOutcomes: {
      arrived: 5,
      // THE v10-ERA SPELLINGS, AND THEY ARE NOT THE LIVE ONES SINCE G-027a. `satisfied` and
      // `gaveUpWaiting` are what a v10 world's table said; `migrateV11ToV12` renames them.
      // Updating them here to match `GUEST_DEPARTURE_REASONS` would be the drift ADR-0008
      // forbids — and would make the v12 step's own guard unreachable from this fixture.
      departures: [
        { reason: 'satisfied', count: 0 },
        { reason: 'gaveUpWaiting', count: 0 },
        { reason: 'evictedRoomGone', count: 0 },
        { reason: 'evictedRoomUnusable', count: 0 },
        { reason: 'evictedCauseUnrecorded', count: 0 },
      ],
    },
  };
};

type MigratedGuest = { readonly id: number; readonly at: { readonly floor: number; readonly column: number } };
const migratedGuests = (world: Record<string, unknown>): readonly MigratedGuest[] =>
  (step.migrate(world) as { guests: { list: MigratedGuest[] } }).guests.list;

/**
 * EVERY TOP-LEVEL KEY A v11 WORLD HAD, frozen at the moment v18 was defined (G-034b).
 *
 * The literal this file's own comment asked for one bump before it was needed: *"the correct
 * response is to compare against the v10 key set of the day (this literal list, moved here) and
 * let the v11 -> v12 step be what supplies the new one."* v12 through v17 reshaped fields rather
 * than adding them, so the day arrived at v18. Sorted, because the assertion sorts.
 */
const V11_WORLD_KEYS: readonly string[] = Object.freeze([
  'buildOutcomes',
  'contentHash',
  'entities',
  'grid',
  'guestOutcomes',
  'guests',
  'ledger',
  'loanOutcomes',
  'needOutcomes',
  'reviewOutcomes',
  'rng',
  'tick',
]);

describe('the chain walks 1 -> ... -> today, and every link is still observed (G-023a)', () => {
  it('ships one step per version, and the 10 -> 11 step is still the tenth of them', () => {
    expect(MIN_SUPPORTED_SCHEMA_VERSION).toBe(1);
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
    expect([step.from, step.to]).toEqual([10, 11]);
    expect(MIGRATIONS.map((entry) => [entry.from, entry.to])).toEqual([
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 8],
      [8, 9],
      [9, 10],
      [10, 11],
      [11, 12],
      [12, 13],
      [13, 14],
      [14, 15],
      [15, 16],
      [16, 17],
      [17, 18],
      [18, 19],
      [19, 20],
      [20, 21],
      [21, 22],
      [22, 23],
    ]);
    expect(() => assertMigrationPathComplete()).not.toThrow();
  });

  it('and the permanent v1 fixture still walks the whole of it, unregenerated', () => {
    // Bytes committed at G-003 and never rewritten. They have survived ten schema bumps, and
    // the day they stop loading is the day a migration was skipped rather than the day the
    // fixture went stale (ADR-0006).
    expect((JSON.parse(SAVE_V1_BYTES) as { schemaVersion: number }).schemaVersion).toBe(1);
    const loaded = deserialise(SAVE_V1_BYTES);
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    // And the era it describes is untouched: the content fingerprint frozen into those bytes
    // is the v1-era one, and this goal ships no content change that could have moved it.
    expect(SAVE_V1_CONTENT_FINGERPRINT).toBe('8e09fe4f0fa162a3');
    expect(loaded.contentHash).toBe('8e09fe4f0fa162a3');
  });

  it('AND THE FIXTURE PROVES NOTHING FOR THIS STEP, which is asserted rather than admitted', () => {
    // ADR-0007, stated as a case. The fixture's guest list is empty, so this step maps over
    // an empty array and would report success having inspected nothing. Everything below
    // drives a hand-built world for exactly this reason, and if the fixture ever DOES acquire
    // a guest, this goes red and the paragraph in `save.ts` needs rewriting rather than
    // re-reading.
    expect(guestsInOrder(deserialise(SAVE_V1_BYTES).guests)).toEqual([]);
    expect(step.migrate({ ...v10World(), guests: { nextId: 1, list: [] } })).toEqual({
      ...v10World(),
      guests: { nextId: 1, list: [] },
    });
  });

  it('adds no top-level key, so a v11 world has exactly the twelve a v10 world had', () => {
    // The first schema bump since G-007 to reshape something INSIDE a field rather than add
    // one beside it. `save.fixture.test.ts` asserts the same fact from the other side, by
    // counting the fields the fixture gains across the whole walk.
    //
    // WHEN v12 ADDS A FIELD, THIS GOES RED, AND THE FIX IS NOT TO ADD IT TO `V10_BASE`. A v10
    // world does not have a v12 field — that is the entire point of freezing the base — so
    // the correct response is to compare against the v10 key set of the day (this literal
    // list, moved here) and let the v11 -> v12 step be what supplies the new one. Adding it
    // above would put back exactly the forward hazard the freeze removed.
    //
    // G-034b IS THAT DAY, AND THE PARAGRAPH ABOVE IS WHAT WAS DONE. v18 added `corridors`, so
    // the comparison moved off the live `WORLD_KEYS` and onto v11's own key set, frozen below.
    // `WORLD_KEYS` is still read for the one claim that IS about today — that it is sorted, the
    // property `assertWorldShape` and the field-coverage generator both rest on.
    expect([...WORLD_KEYS]).toEqual([...WORLD_KEYS].sort());
    const migrated = step.migrate(v10World()) as Record<string, unknown>;
    expect(Object.keys(migrated).sort()).toEqual([...V11_WORLD_KEYS]);
  });
});

describe('v10 -> v11 reads each guest\'s position out of what it was holding (G-023a)', () => {
  it('puts an ENGAGED guest at the provider it was using', () => {
    // Guest 1 holds bedroom 1 at (0, 3) and is engaged with café 2 at (-1, 6). A v10 guest
    // using a café was AT the café: the save says which café and the café says which cell.
    expect(migratedGuests(v10World())[0]).toMatchObject({ id: 1, at: { floor: -1, column: 6 } });
  });

  it('puts a LODGING guest in the room it was in', () => {
    expect(migratedGuests(v10World())[1]).toMatchObject({ id: 2, at: { floor: 0, column: 9 } });
  });

  it('puts a guest holding NOTHING at the entrance derived from that world\'s own plot', () => {
    // The default plot's left edge on the ground floor, written out rather than derived: an
    // oracle computed by `entranceCell` would agree with `entranceCell` whatever it did.
    expect(migratedGuests(v10World())[2]).toMatchObject({ id: 3, at: { floor: 0, column: 0 } });
  });

  it('puts a guest whose ROOM is unplaced at the entrance, because there is no cell to inherit', () => {
    // Reachable rather than defensive: every entity carried out of the v2 -> v3 chain has
    // `at: null`, since a world that predated positions could not be given invented ones.
    expect(migratedGuests(v10World())[3]).toMatchObject({ id: 4, at: { floor: 0, column: 0 } });
  });

  it('FALLS THROUGH an unplaced PROVIDER to the placed room, rather than to the door', () => {
    // The branch the two readings of the rule disagree about, and the one this file exists to
    // pin: a guest asleep in a well-placed bedroom is not moved to the doorway because the
    // café it was in has no coordinates. `standingCell` makes the same choice, which is what
    // makes the migration and the live path one rule rather than two.
    expect(migratedGuests(v10World())[4]).toMatchObject({ id: 5, at: { floor: 2, column: 12 } });
  });

  it('CLAMPS the entrance onto a plot with no ground floor, from the bytes\' own plot', () => {
    // `assertGridBounds` requires only `min <= max`, so a v10 save whose plot starts at floor
    // 3 is legal and floor 0 is not on it. The migration reads THAT plot — not this build's —
    // which is what keeps its output a pure function of its input bytes (ADR-0008).
    const sky = { minFloor: 3, maxFloor: 5, minColumn: 2, maxColumn: 9 };
    const guests = migratedGuests(v10World(sky));
    expect(guests[2]).toMatchObject({ id: 3, at: { floor: 3, column: 2 } });
    expect(guests[3]).toMatchObject({ id: 4, at: { floor: 3, column: 2 } });
    // A plot entirely underground clamps the other way.
    const buried = { minFloor: -6, maxFloor: -2, minColumn: 7, maxColumn: 9 };
    expect(migratedGuests(v10World(buried))[2]).toMatchObject({ id: 3, at: { floor: -2, column: 7 } });
  });

  it('and it leaves everything else about every guest exactly as it found it', () => {
    const before = v10World();
    const after = step.migrate(before) as { guests: { list: Record<string, unknown>[] } };
    const stripped = {
      ...after,
      guests: {
        ...after.guests,
        list: after.guests.list.map((guest) => {
          const { at: _placed, ...rest } = guest;
          return rest;
        }),
      },
    };
    expect(stripped).toEqual(before);
  });

  it('gives two guests in the doorway their OWN cell object, not one shared between them', () => {
    // `worldToJson` is an identity cast, so what reaches the hash is this object graph. A
    // shared cell hashes the same today and is a mutation hazard the day anything writes
    // through one — the `draftSpawn` copy rule, one field over.
    const guests = migratedGuests(v10World());
    expect(guests[2]!.at).toEqual(guests[3]!.at);
    expect(guests[2]!.at).not.toBe(guests[3]!.at);
  });
});

describe('v10 -> v11 refuses what it cannot honestly write (G-023a)', () => {
  it('refuses a guest that already carries a position', () => {
    // The refusal every step in this chain makes, and it is reachable rather than decorative:
    // spreading over real state is the one way a migration destroys data.
    const world = v10World() as { guests: { list: Record<string, unknown>[] } };
    world.guests.list[0] = { ...world.guests.list[0]!, at: { floor: 4, column: 4 } };
    expect(() => step.migrate(world)).toThrow(/already has an "at" field/);
  });

  it('refuses a world with no plot, because an entrance cannot be derived without one', () => {
    const { grid: _none, ...plotless } = v10World();
    expect(() => step.migrate(plotless)).toThrow(/world.grid is missing/);
  });

  it('refuses a plot that is not four numbers, rather than emitting a NaN cell', () => {
    // A NaN would reach `canonicalise`, which throws on non-finite numbers — a determinism
    // bug surfacing three layers from its cause. Refused here, where the message says what
    // is wrong.
    expect(() => step.migrate({ ...v10World(), grid: { minFloor: 'ground', maxFloor: 5, minColumn: 0 } })).toThrow(
      /does not describe a plot/,
    );
  });

  it('refuses a non-object world, a missing guest store and a missing entity store', () => {
    expect(() => step.migrate(null)).toThrow(/world is not an object/);
    expect(() => step.migrate([])).toThrow(/world is not an object/);
    const { guests: _noGuests, ...guestless } = v10World();
    expect(() => step.migrate(guestless)).toThrow(/world.guests is missing/);
    const { entities: _noEntities, ...entityless } = v10World();
    expect(() => step.migrate(entityless)).toThrow(/world.entities is missing/);
    const listless = { ...v10World(), guests: { nextId: 1 } };
    expect(() => step.migrate(listless)).toThrow(/world.guests.list is missing/);
  });

  it('reads no content: the same bytes migrate the same way whatever the shipped table says', () => {
    // ADR-0008, as a case that can fail rather than as a restatement. A step that looked
    // anything up would have to do something about a world whose content fingerprint names
    // content that does not exist.
    const foreign = { ...v10World(), contentHash: 'ffffffffffffffff' };
    expect(migratedGuests(foreign)[0]).toMatchObject({ at: { floor: -1, column: 6 } });
  });

  it('and the structural guard behind THAT claim is a SOURCE SCAN, not this file', () => {
    // No assertion here can tell "states the rule for its own era" apart from "calls the live
    // helper and happens to agree" — the two produce identical output today, and will keep
    // doing so until G-023b or G-024 moves the live rule, which is precisely when the
    // divergence must already be in place. ADR-0008 (3) says the guard must be structural,
    // and it is:
    //
    //     tools/headless/src/migration-scan.build.grid.provider.outcome.travel.save.test.ts
    //
    // a scan asserting `save.ts` names neither `entranceCell` nor `standingCell` nor
    // `GROUND_FLOOR` in executable code. It lives in `tools/headless` because it reads a file
    // and `packages/sim` may not (I1), and it carries `travel` in its name so THIS goal's
    // exit filter runs it — the G-015 lesson, where the guard for a goal's migration was
    // nearly left outside that goal's own command.
    expect(MIGRATIONS).toHaveLength(SAVE_SCHEMA_VERSION - MIN_SUPPORTED_SCHEMA_VERSION);
  });
});

describe('a v10 blob loads, and a v10 world without the step does not (G-023a)', () => {
  const v10Blob = (): string => JSON.stringify({ schemaVersion: 10, world: v10World() });

  it('and a v10 world WITHOUT the migration fails at load, so the step is doing work', () => {
    // ADR-0007's companion case. "The migrated world loads" says nothing unless the
    // unmigrated one does not — otherwise the step could be the identity function.
    expect(() => assertWorldShape(v10World())).toThrow(/Save is corrupt/);
    // AND THE CLAIM IS PINNED IN TWO HALVES SINCE v17 (G-034a), which is the shape
    // `guest.save.test.ts` has carried since G-007 for the same structural reason.
    // `assertWorldShape` checks the world's fields oldest-first, so the bare v10 world above
    // is now refused for the OLDER defect — a plot with four edges where this build wants six
    // — and asserting the guest message against it would have gone on passing while inspecting
    // something else entirely. So the guest clause is driven where it is the only thing wrong:
    // a world this build itself produced, with one guest's position taken back off it.
    const current = JSON.parse(serialise(deserialise(v10Blob()))) as { world: Record<string, unknown> };
    const guests = current.world['guests'] as { nextId: number; list: Record<string, unknown>[] };
    const [first, ...others] = guests.list;
    const { at: _tookItBack, ...positionless } = first!;
    expect(() =>
      assertWorldShape({ ...current.world, guests: { ...guests, list: [positionless, ...others] } }),
    ).toThrow(/guests\.list\[0\]\.at is missing or not a cell/);
  });

  it('loads, and what it becomes hashes the same however it is reached', () => {
    const loaded = deserialise(v10Blob());
    expect(hashState(deserialise(serialise(loaded)))).toBe(hashState(loaded));
    expect((JSON.parse(serialise(loaded)) as { schemaVersion: number }).schemaVersion).toBe(SAVE_SCHEMA_VERSION);
  });

  it('and every guest in it comes back standing where the bytes said it was', () => {
    // The whole derivation, through the real load path rather than through `step.migrate`, so
    // the chain and the invariant checks are exercised on the result too — a cell off the
    // plot or a missing one would be refused by `assertGuestStoreInvariants` on the way in.
    expect(guestsInOrder(deserialise(v10Blob()).guests).map((guest) => guest.at)).toEqual([
      // ROW 0 ON EVERY ONE OF THEM, AND IT COMES FROM `migrateV16ToV17` (G-034a). A v10 world
      // had no third axis at all, so this is the one reading its bytes support — and the door
      // these guests were derived onto is on the same row for the same reason.
      { floor: -1, column: 6, row: 0 },
      { floor: 0, column: 9, row: 0 },
      { floor: 0, column: 0, row: 0 },
      { floor: 0, column: 0, row: 0 },
      { floor: 2, column: 12, row: 0 },
    ]);
  });

  it('and a v11 blob is not migrated again, so the overwrite guard cannot fire on a fresh save', () => {
    const world = deserialise(v10Blob());
    expect(() => deserialise(serialise(world))).not.toThrow();
    expect(hashState(deserialise(serialise(world)))).toBe(hashState(world));
  });
});
