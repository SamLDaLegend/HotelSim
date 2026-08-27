// The world: everything the simulation knows, as one immutable value.
//
// Every field here is saved, hashed and replayed. Adding a field means adding it to
// `assertWorldShape` in `save.ts` and to the key list in `save.test.ts` IN THE SAME
// CHANGE — a field that round-trips by accident today is the field that is silently
// missing from someone's save tomorrow (I6).
//
// The tick itself lives in `tick.ts`, so this module has no dependency on commands and
// the module graph stays a DAG.

import { createBuildOutcomes } from './build.js';
import type { BuildOutcomes } from './build.js';
import { firstScenario } from './content.js';
import type { BoundContent } from './content.js';
import { createCorridors } from './corridors.js';
import type { Corridors } from './corridors.js';
import { createStairs } from './stairs.js';
import type { Stairs } from './stairs.js';
import { NO_LIFT } from './lift.js';
import type { Lift } from './lift.js';
import { createEntityStore } from './entities.js';
import type { EntityStore } from './entities.js';
import { createGridBounds } from './grid.js';
import type { GridBounds } from './grid.js';
import { createGuestOutcomes, createGuestStore, createLiftQueue } from './guests.js';
import type { GuestOutcomes, GuestStore, LiftQueue } from './guests.js';
import { createNeedOutcomes } from './needs.js';
import type { NeedOutcome } from './needs.js';
import { createReviewOutcomes } from './reviews.js';
import type { ReviewOutcomeRow } from './reviews.js';
import { hashJson } from './hash.js';
import type { JsonValue } from './hash.js';
import { appendTransaction } from './ledger.js';
import type { Transaction } from './ledger.js';
import { createLoanOutcomes } from './loan.js';
import type { LoanOutcomes } from './loan.js';
import { createRng } from './rng.js';
import type { RngState } from './rng.js';
import { hireOpeningStaff } from './staff.js';
import type { StaffStore } from './staff.js';

/** One tick is one in-game minute. 1440 ticks make a day. */
export const TICKS_PER_DAY = 1440;

export type World = {
  readonly tick: number;
  readonly rng: RngState;
  readonly ledger: readonly Transaction[];
  readonly entities: EntityStore;
  /**
   * Fingerprint of the content this world was created under (G-002).
   *
   * The content itself is NOT here: it is injected per call and rides in `TickState`,
   * so a save does not carry a copy of the game's definitions and a content update
   * cannot silently change what an old save meant. What is here is the one bit of
   * content that world state genuinely needs — which content this run is of.
   *
   * It is hashed and saved like every other field, so a run under a different content
   * file has a different state hash from tick 0, loudly, rather than diverging at tick
   * 40,000 for reasons nobody can reconstruct. And `assertContentMatches` refuses to
   * tick a world under content it was not created from, which is what makes a save
   * either reproducible or rejected, never quietly wrong.
   */
  readonly contentHash: string;
  /**
   * Live guests (G-004). Guests that have left are not here — their outcome is in
   * `guestOutcomes` instead, so the per-tick scan cost does not grow with the age of
   * the run. A guest is NOT an entity; see the header of `guests.ts`.
   */
  readonly guests: GuestStore;
  /**
   * WHO IS ON THE PAYROLL (G-052a) — the money loop's third term made state.
   *
   * A member of staff is a PERSON and not an entity, for the reason a guest is not: `entities`
   * holds spatial things with footprints and positions, and `nightlyUpkeepOf` walks it asking
   * every member what its room type costs. See the header of `staff.ts`.
   *
   * At this goal the payroll is fixed for the life of the world — `hireOpeningStaff` runs once,
   * in `createWorld`, from the scenario's declared postings — because there is no hire command
   * and no fire command yet. It is world state rather than a fold over content anyway, and that
   * is deliberate: G-052b gives a member of staff a position and a duty, and a save must say who
   * this hotel employs rather than re-deriving it from whatever content is loaded next.
   */
  readonly staff: StaffStore;
  /**
   * What happened to every guest that has left, counted BY REASON (G-015).
   *
   * Not derivable from anything else: a departed guest leaves no trace in the store,
   * and the ledger only records the ones who paid. Bound to the store by
   * `assertGuestOutcomes` — arrived === the sum of its departure rows, plus live — so
   * the two cannot drift apart unnoticed. The total is never stored; it is folded from
   * the rows, which is what keeps that law a check rather than an identity.
   */
  readonly guestOutcomes: GuestOutcomes;
  /**
   * What became of every NEED INSTANCE a departed guest formed, counted per need type
   * (G-012). Strictly ascending by need id; rows appear on first use.
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, for the reason `guestOutcomes` is not: a departed
   * guest leaves no trace, and its needs leave less than that. It is also not derivable
   * from `guestOutcomes`, which counts STAYS — a guest can leave satisfied having failed
   * two of its engagement needs, and that difference is the whole subject of this goal.
   *
   * Bound to `guestOutcomes` by `assertNeedOutcomes`: no row can have resolved more
   * instances than guests have departed. See `needs.ts` for why that is an inequality
   * here and an exact identity in the report.
   */
  readonly needOutcomes: readonly NeedOutcome[];
  /**
   * WHAT EVERY DEPARTED GUEST THOUGHT OF THE PLACE, counted by score (G-019). Strictly
   * ascending by score; rows appear on first use.
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, and not from the two tallies above either — which is
   * the whole reason it is a field rather than a fold. `guestOutcomes` counts stays by
   * REASON and `needOutcomes` counts need instances by TYPE; a review is a statement about
   * ONE guest's whole vector, and neither table records which needs the SAME guest met. Two
   * guests, one meeting all four needs and one meeting none, leave the same marks on both
   * tables as two guests meeting two each — and different reviews.
   *
   * NOTHING IN `packages/sim` READS IT. That is this goal's boundary and it is enforced
   * mechanically rather than by this sentence — see the header of `reviews.ts` for the two
   * checks and for why the reasons to read it are M4's.
   */
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
  /**
   * The plot this hotel is built on (G-007): the four edges of the coordinate space.
   *
   * THE CELLS THEMSELVES ARE NOT HERE, and that is the design rather than an omission.
   * A cell's contents are derived from the `at` fields of the entities, so there is one
   * authoritative record of where anything is — the same call I4 makes about the cash
   * balance and G-004 makes about reservations. See the header of `grid.ts`.
   *
   * It is saved and hashed rather than being a build constant so that editing the
   * default plot cannot silently reinterpret an existing save. A save carries its own
   * plot; `assertWorldShape` validates that save's placements against THAT plot.
   */
  readonly grid: GridBounds;
  /**
   * WHERE THE PLAN SAYS PEOPLE WALK (G-034b, ADR-0047 B2): every cell declared a corridor,
   * ascending by `compareCells`.
   *
   * A SET OF COORDINATES, NOT A THING AND NOT A BACK-POINTER. It says nothing about what
   * stands anywhere, so it cannot drift from the entities — the property `grid.ts`'s header
   * is about, kept by storing a player DECISION about space rather than a second record of
   * contents. `corridors.ts` carries the decision and the two shapes it was chosen over.
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, which is why it is a field. An empty cell beside a
   * room and a corridor beside a room are the same bytes everywhere else in `World`; the
   * difference is exactly what a player drew, and before this goal there was nowhere to
   * write it down. `report.ts` has carried the consequence in a comment since G-009 —
   * *"the empty column between them IS the corridor until M3 gives corridors an identity of
   * their own"* — and this is that identity.
   *
   * IT SITS BESIDE `grid` RATHER THAN INSIDE IT on purpose. `GridBounds` is six integers
   * that never change within a run; this changes whenever the player draws. Putting a
   * mutable list inside the plot would make `boundsEqual` — the `ValidityCache`'s reuse
   * clause — a deep comparison over a growing array, on the hottest predicate in the tick.
   */
  readonly corridors: Corridors;
  /**
   * WHERE THE PLAN SAYS PEOPLE CLIMB (G-038a-ii-alpha): every cell declared a stair,
   * ascending by `compareCells`, ALL SHARING ONE `(column, row)`.
   *
   * A SECOND SET OF COORDINATES BESIDE `corridors` RATHER THAN A FLAG ON ONE, because the two
   * answer different questions and a cell can be neither, either or both. A corridor says
   * people walk HERE; a stair says people climb FROM here. Folding them into one set would
   * make "is this circulation?" and "may the floor axis spend?" the same question, and the
   * whole of `stairs.ts` is the argument that they are not.
   *
   * READ PER WORLD, NOT PER FLOOR, and `stairs.ts`'s header carries the ruling: a stair is a
   * relation between floor f and f+1, so every per-floor reading is non-local in exactly the
   * direction `isOpenPlan` refused for corridors. The one sentence the field means is *"no
   * stair declared anywhere in this world => the floor axis spends unconditionally"*, which is
   * what every build before this one did and what a v20 save says.
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, which is why it is a field: an empty cell in a lane and
   * a stairwell in a lane are the same bytes everywhere else in `World`.
   */
  readonly stairs: Stairs;
  /**
   * WHAT SERVES THAT SHAFT — a lift with a capacity, or `null` for a staircase (G-038b-i,
   * ADR-0075).
   *
   * A RATE ON THE SHAFT `stairs` ALREADY DESCRIBES, NOT A SECOND SHAFT. Where a guest may climb
   * is `stairs`; how many may climb at once is this. Folding them together would make "may the
   * floor axis spend?" and "how fast?" one question, and `lift.ts` is the argument that they are
   * not — the same split `stairs` itself makes against `corridors`.
   *
   * `null` IS A RULE AND NOT AN ABSENCE: *the shaft is a staircase, and a staircase has
   * unbounded capacity*, which is what every build before this one did and exactly what a v22
   * save says. **It is `null` in every world this build ships**; no content declares a lift and
   * no harness installs one. G-038b-ii owns the dial (ADR-0075: the congestion a lift manages
   * does not occur at any workload this project can currently produce, so a capacity would not
   * be derivable from a stated requirement yet — §2.1).
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, which is why it is a field: a shaft with a lift in it and
   * a shaft with stairs in it are the same cells everywhere else in `World`.
   */
  readonly lift: Lift | null;
  /**
   * WHO IS STANDING IN THE LINE FOR THAT LIFT, IN ORDER, FRONT FIRST (G-038b-i).
   *
   * STATE, NOT A DECLARATION, WHICH IS WHY IT IS A SECOND FIELD AND NOT A KEY ON `lift`. The
   * project keeps a player's DECISION about the building (`corridors`, `stairs`, `lift`) apart
   * from what the simulation is doing in it (`guests`, `guestOutcomes`), and mixing the two
   * would put a value the tick rewrites inside a value only a command may touch.
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, and ADR-0075 is the citation: **a queue's order is an
   * INTER-TICK temporal fact and nothing else in `World` records it** — `arrivedTick` is arrival
   * at the HOTEL, not at the lift. The alternative, deriving the order from ascending guest id,
   * was available and free and is rejected in `LiftQueue`'s docblock for a reason and with its
   * consequence.
   *
   * ALWAYS EMPTY WHILE `lift` IS `null`, checked by `assertWorldShape` rather than assumed.
   */
  readonly liftQueue: LiftQueue;
  /**
   * What the player's build commands have done, counted (G-008).
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, which is why it is a field rather than a fold. A
   * refused build leaves no trace anywhere — no entity, no transaction, no id consumed —
   * so "refusal is a recorded outcome rather than a throw" is only true if the record
   * lives here. The same argument `guestOutcomes` makes about a departed guest.
   *
   * The alternative that would have avoided a field — recording refusals in the ledger as
   * zero-amount transactions — was rejected: a money log recording that money did not
   * move corrupts what the ledger means, and grows without bound with player misclicks.
   *
   * See the note on `BuildOutcomes` in `build.ts` for why this has no conservation law
   * binding it to the entity store, and what is checked instead.
   */
  readonly buildOutcomes: BuildOutcomes;
  /**
   * What the player's loan commands have done, counted (G-011).
   *
   * NOT DERIVABLE FROM ANYTHING ELSE, for the reason `buildOutcomes` is not: a refused
   * draw leaves no trace anywhere — no transaction, no entity, no id consumed — so
   * "refusal is a recorded outcome rather than a throw" is only true if the record lives
   * here. A host issuing `drawLoan` on a blind cadence learns how often it was actually
   * needed only from these counters.
   *
   * WHAT IS DELIBERATELY NOT HERE IS THE DEBT. The outstanding loan balance is
   * `outstandingDebtOf(world.ledger)`, a fold over `loanDraw` and `loanRepayment` — I4's
   * argument applied past cash. A stored debt would be a second money value that can
   * drift from the log explaining it, and a drift that hashes perfectly is the one class
   * of bug I2 cannot see. This field holds counters, never money.
   *
   * A SEPARATE FIELD RATHER THAN TWO MORE KEYS ON `buildOutcomes`: see the note on
   * `LoanOutcomes` in `loan.ts`. Sharing the bag would make `applyCommands`'s per-tick
   * law compare a mixed count against a build count, and both laws would stop being able
   * to fail independently.
   */
  readonly loanOutcomes: LoanOutcomes;
};

/**
 * Every top-level key of `World`, written down exactly once.
 *
 * A mapped type over `keyof World`, so it is exhaustive in BOTH directions — the same
 * pattern `TICK_PHASE_FNS` uses in `tick.ts` for the same reason (ADR-0005). A field
 * added to `World` and forgotten here is a TYPE error; a name here that is not a field
 * of `World` is a type error. Neither is a comment anyone has to remember to update.
 *
 * This exists because `keyof World` used to be written a third time, as a hand-typed
 * literal in `save.test.ts`. A literal in a test rots exactly the way a comment rots:
 * nothing connects it to the type it claims to describe.
 */
const WORLD_KEY_SET: Readonly<Record<keyof World, true>> = {
  buildOutcomes: true,
  contentHash: true,
  corridors: true,
  entities: true,
  grid: true,
  guestOutcomes: true,
  guests: true,
  ledger: true,
  lift: true,
  liftQueue: true,
  loanOutcomes: true,
  needOutcomes: true,
  reviewOutcomes: true,
  rng: true,
  staff: true,
  stairs: true,
  tick: true,
};

/**
 * The keys of `WORLD_KEY_SET`, ascending. Consumed by `assertWorldShape` (which rejects
 * anything else) and by the field-coverage tests (which delete each one in turn).
 *
 * Sorted with an explicit, locale-free comparator rather than bare `.sort()`, matching
 * `compareIds` in `content.ts`: `Object.keys` order is insertion order, and an order
 * that happens to be right is not an order (I2).
 */
export const WORLD_KEYS: readonly (keyof World)[] = Object.freeze(
  (Object.keys(WORLD_KEY_SET) as (keyof World)[]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
);

/**
 * A new world, opened under `content`.
 *
 * IT OPENS WITH CAPITAL, AND THE CAPITAL IS A TRANSACTION (G-011). There is no `balance`
 * field to set — I4 forbids one — so the only way a hotel can start with money is for
 * that money to be a line in the ledger, which is also why it is EXPLAINED rather than
 * appearing from nowhere. `openingCapitalPence` is content, so what a hotel opens with is
 * a data edit and never a diff here.
 *
 * THE NUMBER IS THE SCENARIO'S SINCE G-057, AND THIS IS THE ONE PLACE IT IS READ. It lived on
 * the economy table — the house rules — until `HOTELSIM.md` section 8's M4 prerequisite was
 * built, and the move is the whole point: the house rules are the game, an opening balance is
 * the situation, and while the two shared a record `--rooms N` could move an opening balance
 * nobody had written down. `firstScenario` reaches it by position rather than by name, so the
 * snake_case id that names it never enters `packages/sim` (ADR-0003).
 *
 * The append is conditional on the content DEFINING a scenario, and unconditional within
 * that: a table saying `0` books a zero-amount transaction, deliberately, exactly as a
 * free room type still books a `construction` of 0. Absence is the pre-G-011 world and
 * books nothing at all, so a world created under content that predates this table has the
 * empty ledger it always had — which is what keeps the permanent v1 save fixture and every
 * test written against that era meaning what they meant. `recovery.capital.test.ts` pins
 * all three branches, so none of them is a path nobody has walked.
 *
 * ADR-0011 calls this the closure for the OPENING: without it the first moment of the game
 * is its most fragile, because a hotel with no rooms has no revenue and therefore can never
 * afford its first room.
 */
export function createWorld(seed: number, content: BoundContent): World {
  const scenario = firstScenario(content);
  const ledger: readonly Transaction[] =
    scenario === undefined
      ? []
      : appendTransaction([], {
          tick: 0,
          amount: scenario.openingCapitalPence,
          reason: 'startingCapital',
        });
  return {
    tick: 0,
    rng: createRng(seed),
    ledger,
    entities: createEntityStore(),
    contentHash: content.fingerprint,
    guests: createGuestStore(),
    // THE OPENING PAYROLL, HIRED FROM CONTENT (G-052a). Empty under content that declares no
    // scenario or no `openingStaff` — a true historical statement rather than a default, exactly
    // as the empty ledger above is: every world before this goal employed nobody, so such a world
    // reproduces its payroll to the byte. Ids are handed out in ascending role order, which is
    // `hireOpeningStaff`'s contract and is I2 rather than tidiness.
    staff: hireOpeningStaff(content),
    guestOutcomes: createGuestOutcomes(),
    // Empty rather than one row per need type, and deliberately not a function of the
    // injected content: rows appear when a guest departs having formed one. That is what
    // lets the v5 -> v6 migration default to the same value honestly, having no content to
    // read (ADR-0008), and it means a world's tally never claims a need existed before
    // anybody wanted it.
    needOutcomes: createNeedOutcomes(),
    // Empty for the reason `needOutcomes` is empty, one table over: rows appear when a
    // guest departs and leaves one. A world that has never had a departure has left no
    // reviews, whatever content created it — which is what lets the v9 -> v10 migration
    // default to the same value honestly, having no content and so no scale to read.
    reviewOutcomes: createReviewOutcomes(),
    grid: createGridBounds(),
    // EMPTY, AND THAT IS A STATEMENT RATHER THAN A DEFAULT (G-034b). A new hotel is a bare
    // plot: nobody has drawn a corridor on it, so every floor is OPEN PLAN and every cell no
    // room stands on is circulation — which is exactly what this simulation meant before
    // corridors existed, and is why opening a world under this build changes no verdict.
    // See `corridors.ts` and `computeRoomInvalidity`.
    corridors: createCorridors(),
    // EMPTY, AND THAT IS A STATEMENT RATHER THAN A DEFAULT (G-038a-ii-alpha). A new hotel has
    // no stairwell, so the floor axis spends unconditionally — which is exactly what this
    // simulation did before stairs existed, and is why opening a world under this build
    // changes no journey. See `stairs.ts`.
    stairs: createStairs(),
    // NO LIFT, AND THAT IS THE SAME KIND OF STATEMENT (G-038b-i). A new hotel's shaft — when it
    // draws one — is a staircase, so the shaft carries as many guests at once as want to use it
    // and nobody ever queues, which is exactly what this simulation did before lifts existed.
    // Nothing in this build ever writes anything else here. See `lift.ts`.
    lift: NO_LIFT,
    // And so nobody is standing in a line that does not exist.
    liftQueue: createLiftQueue(),
    buildOutcomes: createBuildOutcomes(),
    loanOutcomes: createLoanOutcomes(),
  };
}

/**
 * Throws unless `content` is the content this world was created under.
 *
 * Called once per tick from `beginTick` — an O(1) comparison of two 16-character
 * strings, which is the price of the guarantee being structural rather than a startup
 * ritual a caller can skip. Hosts loading a save should also call it directly, to fail
 * at load time with a legible message instead of on the first tick.
 */
export function assertContentMatches(world: World, content: BoundContent): void {
  if (world.contentHash !== content.fingerprint) {
    throw new Error(
      `Content mismatch: this world was created under content ${world.contentHash} but ${content.fingerprint} was injected. ` +
        'A run is only reproducible against the content it was made with; loading it under edited content would diverge silently.',
    );
  }
}

/** Day index derived from the tick, never stored. Storing it would be a second source of truth. */
export function dayOf(world: World): number {
  return Math.floor(world.tick / TICKS_PER_DAY);
}

/**
 * World as canonical JSON. Every field is included automatically, by construction —
 * which is why nothing in `World` may be a Set, a Map or a class instance.
 */
export function worldToJson(world: World): JsonValue {
  return world as unknown as JsonValue;
}

/** The equality oracle for I2 (determinism) and I6 (save round-trip). */
export function hashState(world: World): string {
  return hashJson(worldToJson(world));
}
