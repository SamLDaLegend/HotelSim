// Commands are the ONLY way the outside world changes the simulation. The render
// layer dispatches these; it never mutates state directly (§6.1 render-critic).
//
// A command log plus a seed fully determines the run (I2). Anything that cannot be
// expressed as a command cannot be replayed, and therefore cannot exist.
//
// Commands are applied at ONE point in the tick — the `applyCommands` phase, first of
// the three in `tick.ts` — not wherever they happen to arrive.

import type { ContentId, EntityId } from './entities.js';
import type { Cell } from './grid.js';

export type Command =
  /** Does nothing, deterministically. Pins that a no-effect command is still a defined
   *  point in the tick rather than a special case that skips the phase. */
  | { readonly kind: 'noop' }
  /**
   * Creates one entity at one cell. The id is allocated by the store, not chosen by the
   * caller; the CELL is chosen by the caller, because where a thing stands is the
   * caller's decision and where it sits in the id space is not.
   *
   * The cell is REQUIRED (G-007). An optional one would leave every entity in the repo
   * unplaced and make "positions are part of hashed, saved state" a claim no test could
   * reach through the real path.
   *
   * THIS IS THE PRIMITIVE, NOT THE PLAYER'S BUILD (G-008). A cell off the plot throws,
   * and so does a cell where a room already stands: both are caller bugs, the same class
   * as an unknown `entityKind`, because the caller is holding the world whose plot and
   * contents it just ignored. It charges nothing. Reach for it in tests, in the
   * determinism harness, and to set up the state a scenario STARTS in — the hotel the
   * player inherited. **A host acting for a player reaches for `buildRoom` instead.**
   */
  | { readonly kind: 'spawnEntity'; readonly entityKind: ContentId; readonly at: Cell }
  /** Removes one entity. Unknown or already-removed ids are a deterministic no-op. The
   *  primitive beneath `demolishRoom`, which records a refusal instead. */
  | { readonly kind: 'despawnEntity'; readonly id: EntityId }
  /**
   * THE PLAYER BUILDS A ROOM (G-008). The build loop's entry point, and the command a
   * UI dispatches at M5.
   *
   * It charges the room type's `constructionCostPence` to the ledger, and it REFUSES —
   * recording the reason in `World.buildOutcomes`, never throwing — when the cell is off
   * the plot, when a room already stands there, or when the charge would take the balance
   * below zero. That is the whole difference from `spawnEntity` above: same rule about
   * what a legal placement is, opposite response, because the fault is the player's move
   * rather than the caller's bug. See the header of `build.ts` for the table.
   *
   * `roomType` rather than `entityKind`, because this command is about rooms
   * specifically: occupancy is defined over rooms so that an item inside a room (M2) can
   * share its cells.
   */
  | { readonly kind: 'buildRoom'; readonly roomType: ContentId; readonly at: Cell }
  /**
   * THE PLAYER DEMOLISHES A ROOM (G-008). Free — no refund and no fee, because any
   * fraction is a designer's number and that is M4's pricing goal.
   *
   * BY ENTITY ID, not by cell: the id is the simulation's own handle, and a cell does not
   * identify an entity uniquely once items (M2) or footprints (G-009) share cells. An id
   * that is not a live room is a RECORDED REFUSAL rather than the silent no-op
   * `despawnEntity` gives, because a player action that did nothing is exactly what this
   * goal exists to make observable.
   *
   * A guest resting in the room is evicted on the same tick, by G-004's existing path.
   */
  | { readonly kind: 'demolishRoom'; readonly id: EntityId }
  /**
   * One guest walks in (G-004).
   *
   * NO PAYLOAD. A guest has no archetype (M6) and no party size at M0, so there is
   * nothing for a caller to choose: every arrival is the same event. The need it forms
   * and the patience it has come from content, and the id it gets is allocated by the
   * guest store, not by the caller — the same division `spawnEntity` uses.
   *
   * Arrival is a COMMAND rather than something the simulation decides, because how
   * often guests turn up is demand, and demand is M4. Keeping it out here means the
   * command log fully describes who arrived and when (I2), and a test can put a guest
   * in the lobby on an exact tick without a demand model to argue with.
   */
  | { readonly kind: 'guestArrives' };

export type ScheduledCommand = {
  /** Tick at which this command is applied. */
  readonly tick: number;
  readonly command: Command;
};
