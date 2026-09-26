// Commands are the only way the outside world changes the simulation. Seed + command log +
// injected content fully determine a run. All commands are applied in the `applyCommands`
// phase of the tick, not wherever they arrive.
//
// Player commands never throw on an illegal move: they record a refusal reason in
// `World.buildOutcomes` / `World.loanOutcomes`. Structural primitives (`spawnEntity`,
// `layCorridor`, `layStair`, `installLift`) throw on caller bugs and charge nothing.

import type { ContentId, EntityId } from './entities.js';
import type { Cell, Footprint } from './grid.js';

export type Command =
  /** Does nothing, deterministically. */
  | { readonly kind: 'noop' }
  /** Creates one entity for tests and scenario setup; a host acting for a player uses `buildRoom`. */
  | {
      readonly kind: 'spawnEntity';
      readonly entityKind: ContentId;
      readonly at: Cell;
      /** Size of the entity, or absent for one cell. Invalid, off-plot or overlapping footprints throw. */
      readonly footprint?: Footprint;
    }
  /** Removes one entity. Unknown or already-removed ids are a deterministic no-op. */
  | { readonly kind: 'despawnEntity'; readonly id: EntityId }
  /** The player builds a one-cell room: `drawRoom` at 1x1. */
  | { readonly kind: 'buildRoom'; readonly roomType: ContentId; readonly at: Cell }
  /**
   * The player draws a room. Refused when off the plot, outside the room type's size band,
   * overlapping a room, or unaffordable.
   */
  | {
      readonly kind: 'drawRoom';
      readonly roomType: ContentId;
      /** The rectangle's origin: its smallest column and smallest row. */
      readonly at: Cell;
      readonly footprint: Footprint;
    }
  /** The player buys an item and places it in the room covering `at`. */
  | { readonly kind: 'placeItem'; readonly itemType: ContentId; readonly at: Cell }
  /**
   * The player redraws an existing room, keeping its entity id. Free. Refused if it would
   * invalidate another room; items cut off by a shrink are dropped (`displaced`).
   */
  | {
      readonly kind: 'resizeRoom';
      readonly id: EntityId;
      /** The rectangle's new origin: its smallest column and smallest row. */
      readonly at: Cell;
      readonly footprint: Footprint;
    }
  /** The player moves an item. Refused if it would leave its room missing a required item. */
  | { readonly kind: 'moveItem'; readonly id: EntityId; readonly to: Cell }
  /** The player demolishes a room for a partial refund. A resting guest is evicted. */
  | { readonly kind: 'demolishRoom'; readonly id: EntityId }
  /** Declares one cell a corridor. Idempotent. Whether a room is in the way is `validity.ts`'s question. */
  | { readonly kind: 'layCorridor'; readonly at: Cell }
  /** Declares one cell a stair. Idempotent. Throws outside the single aligned stairwell column. */
  | { readonly kind: 'layStair'; readonly at: Cell }
  /**
   * Serves the stairwell with a lift of `capacity`; waiting guests give up after
   * `waitToleranceTicks`. Idempotent. Throws without a stairwell (an earlier `layStair` in
   * the same batch counts).
   */
  | {
      readonly kind: 'installLift';
      readonly capacity: number;
      readonly waitToleranceTicks: number;
    }
  /**
   * One guest walks in; everything about it comes from content. Demand also creates
   * arrivals, so the log is not a full record of who arrived — replay holds because demand
   * draws no randomness.
   */
  | { readonly kind: 'guestArrives' }
  /** The player borrows on content-defined terms. Refused unless the hotel is stuck. */
  | { readonly kind: 'drawLoan' };

export type ScheduledCommand = {
  /** Tick at which this command is applied. */
  readonly tick: number;
  readonly command: Command;
};
