// Commands are the ONLY way the outside world changes the simulation. The render
// layer dispatches these; it never mutates state directly (§6.1 render-critic).
//
// A command log plus a seed fully determines the run (I2). Anything that cannot be
// expressed as a command cannot be replayed, and therefore cannot exist.
//
// Commands are applied at ONE point in the tick — the `applyCommands` phase, first of
// the three in `tick.ts` — not wherever they happen to arrive.

import type { ContentId, EntityId } from './entities.js';

export type Command =
  /** Does nothing, deterministically. Pins that a no-effect command is still a defined
   *  point in the tick rather than a special case that skips the phase. */
  | { readonly kind: 'noop' }
  /** Creates one entity. The id is allocated by the store, not chosen by the caller. */
  | { readonly kind: 'spawnEntity'; readonly entityKind: ContentId }
  /** Removes one entity. Unknown or already-removed ids are a deterministic no-op. */
  | { readonly kind: 'despawnEntity'; readonly id: EntityId }
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
