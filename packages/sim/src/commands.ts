// SCAFFOLD — bootstrap substrate, owned by sim-engineer from G-001 onward.
//
// Commands are the ONLY way the outside world changes the simulation. The render
// layer dispatches these; it never mutates state directly (§6.1 render-critic).
//
// A command log plus a seed fully determines the run (I2). Anything that cannot be
// expressed as a command cannot be replayed, and therefore cannot exist.

export type Command = {
  readonly kind: 'noop';
};

export type ScheduledCommand = {
  /** Tick at which this command is applied. */
  readonly tick: number;
  readonly command: Command;
};
