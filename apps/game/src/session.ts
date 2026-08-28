// THE PLAYER'S HALF OF THE COMMAND PATH (G-031a).
//
// ---------------------------------------------------------------------------------------
// THE RULE THIS FILE EXISTS TO KEEP:
//
//   Render reads state. INPUT DISPATCHES COMMANDS. Neither ever mutates the sim.
//
// A click builds a `Command` — the simulation's own type, one of the fourteen it already
// defines — and puts it in a queue. Nothing else happens at click time: no world is read for a
// decision, no world is written, no rule about legal placement is evaluated here. The queue
// is drained into ticks by `commandsFor` below, and the simulation judges what it is given.
//
// THE BOUNDARY IS UNMOVED AND IS STILL `stepTick`'s ARGUMENT LIST (`tick.ts:811`: "`dt` is
// not a parameter and never will be"). This goal adds no argument to it, no field to `World`
// and no behaviour to the simulation. Every player action is an existing command.
// ---------------------------------------------------------------------------------------
//
// HOW A CLICK BECOMES AN ENTRY IN THE LOG FOR A SPECIFIC TICK, AND WHY THAT IS DETERMINISTIC.
//
// The wall clock decides WHICH TICK a click lands on. It never decides what a tick does, and
// the choice it made is recorded in the log's `tick` field — which is exactly what I2 means
// by "same seed PLUS SAME COMMAND LOG". Two sessions with identical clicks at different
// frame rates produce different logs and different worlds, and that is not a determinism
// failure: the log is part of the input, not part of the output.
//
// A pointer event cannot arrive part-way through a frame's batch of ticks, because the batch
// loop in `driver.ts` is synchronous and JavaScript delivers events between callbacks. So
// the queue is stable for the whole of a frame, and "which tick" is decided in exactly one
// place: `commandsFor`.
//
// AT MOST ONE BUILD-FAMILY COMMAND PER TICK, AND IT IS LOAD-BEARING RATHER THAN CAUTIOUS.
// `BuildOutcomes` counts refusals BY CATEGORY and does not say which command was refused —
// per-command acknowledgement is a parked G-001 item whose stated consumer is this UI
// (`build.ts:140-149`). So "why was MY build refused" is answered by diffing the counters
// across the one tick that carried the command, which is only an answer while a tick carries
// at most one. The alternative was asking `packages/sim` for a per-command result, which
// this goal's first exit criterion forbids: if it needs a simulation change, it stops.
//
// AND THE DISCIPLINE IS ACTUALLY "AT MOST ONE PLAYER COMMAND PER TICK", WHICH IS WIDER AND IS
// WHAT `commandsFor` ENFORCES (G-063). It shifts exactly one entry off the queue whatever kind
// it is, so the property survived a verb that is not build-family at all. What did NOT survive
// is the assumption that every player command lands in `BuildOutcomes`: `layCorridor` records
// nothing there, and reading its result off those counters answers `unattributed` for a
// command that cannot fail. `attributeCorridor` below reads the corridor plan instead — a
// second SOURCE for a second command, never a second RULE about the same one.

import {
  BUILD_REFUSAL_REASONS,
  describeCell,
  hasCorridorAt,
  hashState,
  SAVE_SCHEMA_VERSION,
} from '@hotelsim/sim';
import type { BuildOutcomes, Cell, Command, ScheduledCommand, World } from '@hotelsim/sim';

/** What the player asked for, with the words to say it and the cell to flash. */
export type PlayerAction = {
  readonly command: Command;
  /** The cell the player CLICKED. For a demolish this is where the room stood. */
  readonly at: Cell;
  /** "build Standard Room", "demolish room 7" — assembled from content names, never ids. */
  readonly label: string;
};

/**
 * What the simulation did with it: one of its own outcome words, or `unattributed`.
 *
 * `unattributed` is a real member and not a placeholder. If more than one counter moves
 * across a tick that carried one command, this layer does not know which move was the
 * player's — and it says so instead of picking the likely one. A UI that guesses is a UI
 * that reports a refusal reason the simulation never recorded.
 */
export type ActionOutcome = 'built' | 'demolished' | 'unattributed' | (string & {});

/**
 * What one resolved command amounted to: the word, and whether it was a refusal.
 *
 * THE FLAG TRAVELS WITH THE WORD RATHER THAN BEING RE-DERIVED FROM IT (G-063), and that is
 * the repair the corridor tool forced rather than a tidy-up beside it. `refused` used to be
 * `outcome !== 'built' && outcome !== 'demolished'` — a WHITELIST OF THE TWO SUCCESSES the
 * build family has, evaluated at the one call site. A third verb with a third success makes
 * that predicate silently wrong: `layCorridor` records no `BuildOutcome` at all, so the
 * whitelist would have painted every corridor the player successfully laid as a REFUSAL, in
 * the HUD line and in the cell flash, in the game's own words. Deciding it where the outcome
 * is decided means the fourth verb cannot inherit that bug from this one.
 */
type Attribution = { readonly outcome: ActionOutcome; readonly refused: boolean };

export type ResolvedAction = {
  readonly action: PlayerAction;
  readonly tick: number;
  readonly outcome: ActionOutcome;
  /** True when the outcome is a refusal, so the HUD and the flash agree on colour. */
  readonly refused: boolean;
};

export type Session = {
  /** Clicked and not yet spent. FIFO: the order the player made the moves. */
  readonly queue: PlayerAction[];
  /** EXACTLY WHAT WAS APPLIED, in order, tick by tick — the command log I2 speaks of. */
  readonly log: ScheduledCommand[];
  /**
   * Ticks consumed by each rendered frame, in order.
   *
   * NOT A DIAGNOSTIC. It is the witness that this log came out of a real-time driver rather
   * than out of a headless `run()`: a 30-ticks-per-second rung against a 60Hz display earns
   * 0 ticks on some frames and 2 on others, and no straight loop produces that shape by
   * accident. G-031b's replay test asserts it, which is what stops the fixture being
   * regenerated the easy way after a schema move.
   */
  readonly frameTicks: number[];
  /** The most recent resolved action. Never expires — see `main.ts`. */
  last: ResolvedAction | null;
  /** Recently resolved actions, for the cell flash. Trimmed by tick age, not by clock. */
  readonly flashes: ResolvedAction[];
  /** The tick `commandsFor` last answered for, or `null` before the first tick. */
  lastTick: number | null;
  /**
   * The command handed to the tick now running, waiting for its outcome.
   *
   * It lives for the width of one `stepTick` call: set by `commandsFor`, consumed by
   * `observeTick`. Never more than one, which is the same one-per-tick discipline stated
   * above wearing its data shape.
   */
  pending: { readonly action: PlayerAction; readonly tick: number } | undefined;
};

/** How many ticks a flash stays on its cell: two in-game hours. Look, not simulation. */
const FLASH_TICKS = 120;

export function createSession(): Session {
  return {
    queue: [],
    log: [],
    frameTicks: [],
    last: null,
    flashes: [],
    lastTick: null,
    pending: undefined,
  };
}

export function enqueue(session: Session, action: PlayerAction): void {
  session.queue.push(action);
}

/**
 * The commands due on `tick`: the scenario's, then at most one of the player's.
 *
 * IT IS NOT A PURE FUNCTION OF THE TICK NUMBER AND MUST NOT BE DESCRIBED AS ONE. Draining a
 * queue is a side effect, and the property G-030 stated — "a pure function of the tick
 * number" — stopped being true the moment a player could click. The comments in `driver.ts`
 * and `scenario.ts` that said so are amended in this same change; the sentence they should
 * have said all along is the one below, and it is ASSERTED rather than asserted-in-prose:
 *
 *   IT IS ASKED EXACTLY ONCE PER TICK, IN INCREASING TICK ORDER, AND WHAT IT RETURNS IS
 *   RECORDED.
 *
 * That, plus the recording, is what makes the world at tick N reproducible: `run(createWorld
 * (seed, content), content, N, session.log)` reaches the same state, whatever the frame rate
 * was. The throw below is the executable half — a driver that asked twice for one tick, or
 * that replayed a tick, would silently duplicate or drop a player's command and the log would
 * describe a run that never happened.
 *
 * ORDER WITHIN A TICK IS STATED AND FIXED: scenario first, player second. An arrival and a
 * build on one tick are applied in that order, always, so the log's order is the tick's
 * order.
 */
export function commandsFor(
  session: Session,
  scenario: (tick: number) => readonly Command[],
  tick: number,
): readonly Command[] {
  // EXACTLY ONCE PER TICK MEANS `lastTick + 1`, NOT MERELY "GREATER THAN". The first guard
  // written here was `tick <= session.lastTick`, which makes "twice for one tick" and
  // "backwards" fail loudly and lets a SKIPPED tick through in silence — so the sentence
  // above claimed a third conjunct the predicate did not check, in a paragraph written to
  // repair exactly that class. It is unreachable through today's `advance`, which is why it
  // was a MINOR and not a defect; the point is that the check now makes the whole claim.
  if (session.lastTick !== null && tick !== session.lastTick + 1) {
    throw new Error(
      `commandsFor: asked for tick ${tick} after tick ${session.lastTick}. It must be asked exactly once per tick, in increasing order and skipping none, or the log stops describing the run.`,
    );
  }
  session.lastTick = tick;
  const scheduled = scenario(tick);
  const mine = session.queue.shift();
  const commands = mine === undefined ? scheduled : [...scheduled, mine.command];
  for (const command of commands) {
    session.log.push({ tick, command });
  }
  if (mine !== undefined) session.pending = { action: mine, tick };
  return commands;
}

/**
 * Which single counter moved across one tick, or `unattributed`.
 *
 * Every build-family command produces exactly one recorded outcome (`build.ts`'s per-tick
 * law), so with one such command in the tick exactly one counter moves. Two would mean the
 * one-per-tick discipline above has been broken somewhere, and the honest answer is then
 * that this layer does not know.
 */
export function attribute(before: BuildOutcomes, after: BuildOutcomes): ActionOutcome {
  const moved: ActionOutcome[] = [];
  if (after.built !== before.built) moved.push('built');
  if (after.demolished !== before.demolished) moved.push('demolished');
  for (const reason of BUILD_REFUSAL_REASONS) {
    if (after.refused[reason] !== before.refused[reason]) moved.push(reason);
  }
  return moved.length === 1 && moved[0] !== undefined ? moved[0] : 'unattributed';
}

/**
 * What a `layCorridor` amounted to, read off the corridor plan itself (G-063).
 *
 * =========================================================================================
 * IT IS NOT A BUILD-FAMILY COMMAND AND THERE IS NOTHING FOR `attribute` ABOVE TO SEE.
 * `tick.ts` says so at the case: *"NOT A BUILD-FAMILY COMMAND: it charges nothing, records no
 * outcome and consumes no id, so neither per-tick law below has anything to say about it."*
 * Run through `attribute`, a perfectly successful corridor moves NO counter, `moved.length`
 * is 0, and the answer is `unattributed` — "I do not know" reported for the one command in
 * the game whose result is never in doubt.
 *
 * SO IT IS READ FROM `world.corridors`, WHICH IS HASHED, SAVED STATE, THROUGH THE
 * SIMULATION'S OWN PREDICATE. `hasCorridorAt` is the function `validity.ts` asks — imported,
 * not re-spelled — and it is asked of the world BEFORE and the world AFTER, which is exactly
 * the shape `attribute` uses one field over. Nothing here evaluates a rule; it reads a
 * declaration the simulation made and reports which way it went.
 *
 * NEITHER ANSWER IS A REFUSAL, AND THAT IS THE SIMULATION'S WORD RATHER THAN A CHOICE MADE
 * HERE. `commands.ts`, and the emphasis is this file's: *"Idempotent — declaring a cell that
 * is already declared is a deterministic no-op, **not a refusal and not a throw**"*. A UI that
 * called the second case
 * refused would be reporting a refusal the simulation never recorded, which is the defect the
 * `unattributed` member exists to avoid.
 *
 * `unattributed` SURVIVES AS THE THIRD ANSWER AND IS NOT DECORATION. It is reachable if the
 * plan does not contain the cell after a tick that carried a `layCorridor` for it — which
 * nothing in this build can produce, and which is precisely why it must not be assumed away.
 *
 * ALL THREE ARMS RETURN `refused: false`, INCLUDING THE ONE THAT SAYS "I DO NOT KNOW", and
 * that is not the build family's answer being copied carelessly. `layCorridor` has NO refusal
 * path: on the plot it succeeds, off the plot it throws and `actionAt` never sends it there.
 * So "this was not refused" is true of a corridor unconditionally, whatever else is unclear
 * about it. The build family's `unattributed` is refused-coloured because there the honest
 * doubt INCLUDES the nine refusals; here there are none to be in doubt about.
 * =========================================================================================
 */
export function attributeCorridor(before: World, after: World, at: Cell): Attribution {
  if (hasCorridorAt(before.corridors, at)) return { outcome: 'alreadyDeclared', refused: false };
  if (hasCorridorAt(after.corridors, at)) return { outcome: 'laid', refused: false };
  return { outcome: 'unattributed', refused: false };
}

/**
 * One tick has run: attribute the player's command, if this tick carried one.
 *
 * Called by the driver with the world BEFORE and the world AFTER, which is the only pair
 * from which a counter delta can be read. Nothing here writes to either world.
 */
export function observeTick(session: Session, before: World, after: World): void {
  const pending = session.pending;
  if (pending === undefined) return;
  // A PENDING COMMAND THAT IS NOT THIS TICK'S IS DROPPED RATHER THAN CARRIED. It can only
  // exist if a tick was begun and never finished — `stepTick` threw between `commandsFor`
  // and here. Carrying it would attribute an old command's outcome to a later tick's
  // counters, which is a wrong answer where "I do not know" was available; clearing it means
  // the player loses one line of feedback and every later line is still true.
  session.pending = undefined;
  if (pending.tick !== before.tick) return;
  // WHICH ATTRIBUTOR ANSWERS IS DECIDED BY THE COMMAND'S OWN KIND, not by which counters
  // happened to move (G-063). A corridor moves none, so a single attributor keyed on the
  // counters cannot tell "the corridor landed" from "something went wrong" — see
  // `attributeCorridor`. The command is the thing that knows which question to ask.
  const command = pending.action.command;
  const attribution: Attribution =
    command.kind === 'layCorridor'
      ? attributeCorridor(before, after, command.at)
      : ((): Attribution => {
          const outcome = attribute(before.buildOutcomes, after.buildOutcomes);
          return { outcome, refused: outcome !== 'built' && outcome !== 'demolished' };
        })();
  const resolved: ResolvedAction = {
    action: pending.action,
    tick: before.tick,
    outcome: attribution.outcome,
    refused: attribution.refused,
  };
  session.last = resolved;
  session.flashes.push(resolved);
}

/** Drop flashes older than `FLASH_TICKS`. At pause no tick passes, so nothing expires. */
export function expireFlashes(session: Session, tick: number): void {
  while (session.flashes.length > 0 && tick - (session.flashes[0]?.tick ?? tick) > FLASH_TICKS) {
    session.flashes.shift();
  }
}

/** One frame consumed `ticks` ticks — including the frames that consumed none. */
export function recordFrame(session: Session, ticks: number): void {
  session.frameTicks.push(ticks);
}

/** How a resolved action reads in the HUD: "build Standard Room at floor 1, column 5 — …". */
export function describeAction(resolved: ResolvedAction, words: (name: string) => string): string {
  const what = `${resolved.action.label} at ${describeCell(resolved.action.at)}`;
  const outcome = resolved.refused ? `refused: ${words(resolved.outcome)}` : words(resolved.outcome);
  return `${what} — ${outcome} (tick ${resolved.tick})`;
}

/**
 * THE SESSION, AS A DOCUMENT — seed, log, witness, and the hash of the world just drawn.
 *
 * This is G-031b's input and it is produced here because only a played session can produce
 * it. `hashState` is computed ON DEMAND rather than per frame: it canonicalises the whole
 * world including the ledger, and a HUD that did it 60 times a second would be paying a
 * serialisation cost to display a number nobody reads until they export.
 *
 * The schema version travels with it so a stale log fails LOUDLY at replay — "recorded
 * against save v12, this build is v13" — rather than as two hex strings that differ for an
 * unstated reason. Track B moves that number; this is how the move announces itself.
 */
export function exportSession(session: Session, seed: number, world: World): string {
  return JSON.stringify(
    {
      seed,
      saveSchemaVersion: SAVE_SCHEMA_VERSION,
      ticks: world.tick,
      finalHash: hashState(world),
      frameTicks: session.frameTicks,
      commands: session.log,
    },
    null,
    2,
  );
}
