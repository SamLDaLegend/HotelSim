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
  | { readonly kind: 'despawnEntity'; readonly id: EntityId };

export type ScheduledCommand = {
  /** Tick at which this command is applied. */
  readonly tick: number;
  readonly command: Command;
};
