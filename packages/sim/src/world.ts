// The world: everything the simulation knows, as one immutable value. Every field is
// saved, hashed and replayed; adding one means adding it to `assertWorldShape` in `save.ts`.

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
import { createRecentRemarks, createReviewOutcomes } from './reviews.js';
import type { RemarkRecord, ReviewOutcomeRow } from './reviews.js';
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
   * Fingerprint of the content this world was created under. The content itself is
   * injected per call, not saved; this makes a run under different content hash differently
   * from tick 0, and lets `assertContentMatches` refuse to tick it.
   */
  readonly contentHash: string;
  /** Live guests only; departed guests are tallied in `guestOutcomes`. */
  readonly guests: GuestStore;
  /** The payroll. Fixed for the life of the world until hire/fire commands exist. */
  readonly staff: StaffStore;
  /** Departed guests counted by reason; `assertGuestOutcomes` checks arrived = departures + live. */
  readonly guestOutcomes: GuestOutcomes;
  /** Need instances of departed guests, by need type, ascending by need id. */
  readonly needOutcomes: readonly NeedOutcome[];
  /** Departed guests' review scores, ascending. Never read by the sim (`review.boundary.test.ts`). */
  readonly reviewOutcomes: readonly ReviewOutcomeRow[];
  /**
   * The most recent departures, oldest first, as remark inputs rather than sentences so remark
   * text can change without touching saves. Never read by the sim.
   */
  readonly recentRemarks: readonly RemarkRecord[];
  /**
   * The plot's bounds. Cell contents are derived from entity positions, not stored. Saved so
   * that changing the default plot cannot reinterpret an old save.
   */
  readonly grid: GridBounds;
  /**
   * Every cell the player declared a corridor, ascending by `compareCells`. Kept apart from
   * `grid` so the bounds stay a cheap fixed-size comparison.
   */
  readonly corridors: Corridors;
  /**
   * Every cell declared a stair, ascending by `compareCells`, all sharing one `(column, row)`.
   * Empty means the floor axis costs nothing extra to cross.
   */
  readonly stairs: Stairs;
  /** What serves the stair shaft: a lift with a capacity, or `null` for an unbounded staircase. */
  readonly lift: Lift | null;
  /**
   * Guests waiting for the lift, front first. Stored because queue order is an inter-tick
   * fact nothing else records. Always empty while `lift` is `null`.
   */
  readonly liftQueue: LiftQueue;
  /** Build command outcomes, counted; a refused build leaves no other trace. */
  readonly buildOutcomes: BuildOutcomes;
  /** Loan command outcomes, counted. Never money: debt is folded from the ledger. */
  readonly loanOutcomes: LoanOutcomes;
};

/**
 * Every top-level key of `World`. A mapped type over `keyof World`, so a field missing
 * here, or a name that is not a field, is a type error.
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
  recentRemarks: true,
  reviewOutcomes: true,
  rng: true,
  staff: true,
  stairs: true,
  tick: true,
};

/**
 * The keys of `WORLD_KEY_SET`, ascending, with a locale-free comparator (determinism).
 * Consumed by `assertWorldShape` and the field-coverage tests.
 */
export const WORLD_KEYS: readonly (keyof World)[] = Object.freeze(
  (Object.keys(WORLD_KEY_SET) as (keyof World)[]).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
);

/**
 * A new world, opened under `content`. Opening capital is a ledger transaction (the
 * balance is never stored). If the content defines no scenario, nothing is booked, so
 * worlds under older content keep an empty ledger.
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
    // Hired from content; empty if the scenario declares no staff. Ids ascend by role (determinism).
    staff: hireOpeningStaff(content),
    guestOutcomes: createGuestOutcomes(),
    // Empty, not one row per need type: rows appear on first departure. This is what lets the
    // save migration default it without content.
    needOutcomes: createNeedOutcomes(),
    reviewOutcomes: createReviewOutcomes(),
    recentRemarks: createRecentRemarks(),
    grid: createGridBounds(),
    corridors: createCorridors(),
    stairs: createStairs(),
    lift: NO_LIFT,
    liftQueue: createLiftQueue(),
    buildOutcomes: createBuildOutcomes(),
    loanOutcomes: createLoanOutcomes(),
  };
}

/**
 * Throws unless `content` is the content this world was created under. Called every tick
 * from `beginTick`; hosts loading a save should call it too for an earlier error.
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
