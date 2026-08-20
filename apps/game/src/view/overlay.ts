// THE PLAYER'S INTENT, DRAWN (G-031a, ported to isometric at G-035).
//
// PORTED, NOT REDESIGNED (ADR-0046 §3, which names the queued-command ghosts and the
// recorded-refusal flash as two of the five things worth rebuilding). Everything in this file
// is drawn from RENDER-SIDE state — the hovered cell, the queue of commands not yet spent, the
// outcomes of the last few that were. None of it is in the world, none of it survives a
// reload, and none of it is a second opinion about anything the simulation decides. It is kept
// out of `scene.ts` for exactly that reason: that file's opening claim is "every shape below is
// a function of the `World` handed in", and these shapes are not.
//
// WHY THE GHOST EXISTS AT ALL, WHICH IS THE PAUSE PROBLEM. A queued command is spent by the
// next TICK, and at pause there is no next tick — so without a ghost, clicking build while
// paused looks exactly like a dead UI. It is also the honest picture at the slow rungs: at 5
// ticks a second a queue of four takes most of a second to drain, and the player should be
// able to see their own moves standing in line.
//
// THE OVERLAY NEVER PREDICTS AN OUTCOME, AND THE DELIBERATE CHOICE NOT TO GREY OUT ILLEGAL
// MOVES IS ONE OF THE FIVE THINGS ADR-0046 §3 SAYS TO REBUILD RATHER THAN RETHINK. There is no
// red ghost for "you cannot afford this" and no grey-out for an occupied cell. Predicting a
// refusal would mean writing the simulation's placement and affordability rules a second time,
// in the layer whose whole contract is that it does not decide — and it is also how the refusal
// states went unwatched at G-030: a UI that refuses locally never lets the player reach
// `outOfBounds`, `occupied` or `insufficientFunds` at all. The player clicks, the simulation
// answers, the answer is drawn.
//
// WHAT THE PROJECTION CHANGED: a cell is a DIAMOND rather than a rectangle, and a cell not on
// the drawn floor has no picture at all. That second one is new and it is handled rather than
// ignored — see `OFF_FLOOR` below.

import type { Cell } from '@hotelsim/sim';
import { centreOf, toCanvas } from './camera.js';
import type { View } from './camera.js';
import { cornerOf, toView } from './iso.js';
import { INK } from './palette.js';
import type { Primitive } from './primitives.js';
import type { PlayerAction, ResolvedAction } from '../session.js';

export type OverlayState = {
  /** The cell under the pointer, or `null` when the pointer is off the stage. */
  readonly hovered: Cell | null;
  /** What a click would ask for, in words — or `null` when no tool is held. */
  readonly toolLabel: string | null;
  /** Clicked and not yet spent, in the order they will be spent. */
  readonly queued: readonly PlayerAction[];
  /** Recently answered, oldest first. */
  readonly flashes: readonly ResolvedAction[];
  /**
   * A camelCase outcome as words — injected rather than imported.
   *
   * The simulation's outcome words (`insufficientFunds`, `noSuchRoom`) are its own, and
   * exactly one function in this layer turns them into English (`wordsOf` in `hud.ts`). It
   * is passed in so the cell and the HUD line cannot say the same refusal two ways.
   */
  readonly words: (outcome: string) => string;
};

/** Line pitch for stacked outcome words. One line of 10px text plus a hair of air. */
const WORD_LINE_HEIGHT = 11;

/** Queue positions listed individually before the run is summarised as a range. */
const QUEUE_POSITIONS_LISTED = 3;

/**
 * HOW MANY LINES OF OUTCOME A TILE CAN HOLD.
 *
 * IN THE CROSS-SECTION THIS WAS COMPUTED FROM THE CELL'S PIXEL HEIGHT, WHICH A DIAMOND DOES
 * NOT HAVE IN THE SAME SENSE. A tile is 64 logical pixels tall at the centre and tapers to
 * nothing at the corners, so "how many lines fit" is a stated number rather than a division.
 * The bound is what matters and the reason for it is unchanged: holding `build` and clicking
 * one cell forty times yields thirty simultaneous flashes, twenty-nine of them the identical
 * word — 330px of stacked text through the middle of the hotel. A run collapses to one line
 * with a count, what is left is capped, and ANYTHING DROPPED IS COUNTED AND SAID.
 */
const OUTCOME_LINES = 4;

/** Where a cell that is not on the drawn floor is reported. See `draw`. */
const OFF_FLOOR = 14;

export type Overlay = {
  build: (view: View, state: OverlayState) => { readonly shapes: readonly Primitive[]; readonly labels: readonly Primitive[] };
};

/** The four canvas-space corners of one tile. The overlay's only geometry. */
function diamond(view: View, at: Cell): number[] {
  const tile = toView(at.column, at.row, view.orientation);
  const points: number[] = [];
  for (const [a, b] of [
    [tile.u, tile.v],
    [tile.u + 1, tile.v],
    [tile.u + 1, tile.v + 1],
    [tile.u, tile.v + 1],
  ] as const) {
    const p = toCanvas(view, cornerOf(a, b));
    points.push(p.x, p.y);
  }
  return points;
}

export function createOverlay(): Overlay {
  const build = (
    view: View,
    state: OverlayState,
  ): { readonly shapes: readonly Primitive[]; readonly labels: readonly Primitive[] } => {
    const shapes: Primitive[] = [];
    const labels: Primitive[] = [];

    // THE HOVERED CELL. Drawn even when it is off the plot, because a click there is a legal
    // move that earns a recorded refusal, and a cell the player cannot see is a cell they
    // cannot learn from.
    if (state.hovered !== null && state.toolLabel !== null) {
      shapes.push({ kind: 'poly', points: diamond(view, state.hovered), stroke: { width: 2, colour: INK.intent, alpha: 0.9 } });
      const centre = centreOf(view, state.hovered.column, state.hovered.row);
      labels.push({
        kind: 'text',
        text: state.toolLabel,
        x: centre.x,
        y: centre.y - 6,
        size: 10,
        colour: INK.intent,
        bold: true,
        anchorX: 0.5,
        anchorY: 1,
      });
    }

    // TWO THINGS ON ONE CELL ARE STACKED, NEVER OVERPRINTED, AND BOTH CASES ARE ORDINARY
    // RATHER THAN EXOTIC. Build a room and then click the same cell again and the two answers
    // — "built" and "occupied" — land on one tile; queue two demolishes on one room (the
    // gesture that earns `noSuchRoom`, and which this layer deliberately does not
    // de-duplicate) and the queue has two entries at one address.
    const byCell = <T>(items: readonly T[], cellOf: (item: T) => Cell): Map<string, T[]> => {
      const groups = new Map<string, T[]>();
      for (const item of items) {
        const at = cellOf(item);
        const k = `${at.floor},${at.column},${at.row}`;
        const bucket = groups.get(k);
        if (bucket === undefined) groups.set(k, [item]);
        else bucket.push(item);
      }
      return groups;
    };

    /**
     * A MARK ON A CELL THAT IS NOT ON THIS FLOOR HAS NOWHERE TO GO, AND SAYING SO IS BETTER
     * THAN DRAWING IT IN THE WRONG PLACE.
     *
     * This is new at G-035 and it is the cost of drawing one floor at a time: a player who
     * queues a build, switches floor and watches it resolve would otherwise see the flash land
     * on whichever tile happens to share that column and row. The mark is suppressed and the
     * floor is named in the words instead — a state with a picture that lies is worse than a
     * state with a sentence.
     */
    const elsewhere = (at: Cell): boolean => at.floor !== view.floor;

    // QUEUED, WITH ITS PLACE IN THE LINE. The number is the queue position, so a player who
    // clicked four times can see which one lands next — and two on one cell read as "1,2".
    // A RUN IS SUMMARISED RATHER THAN LISTED, because the list has no bound and the tile does.
    const queuedPositions = new Map<PlayerAction, number>();
    state.queued.forEach((action, i) => queuedPositions.set(action, i + 1));
    for (const [, actions] of byCell(state.queued, (action) => action.at)) {
      const first = actions[0];
      if (first === undefined) continue;
      const positions = actions.map((action) => queuedPositions.get(action) ?? 0);
      const summary =
        positions.length <= QUEUE_POSITIONS_LISTED
          ? positions.join(',')
          : `${positions[0] ?? 0}-${positions[positions.length - 1] ?? 0} x${positions.length}`;
      if (elsewhere(first.at)) {
        labels.push({
          kind: 'text',
          text: `queued ${summary} on floor ${first.at.floor}`,
          x: OFF_FLOOR,
          y: OFF_FLOOR + labels.length * WORD_LINE_HEIGHT,
          size: 10,
          colour: INK.intent,
          bold: true,
        });
        continue;
      }
      const centre = centreOf(view, first.at.column, first.at.row);
      shapes.push({
        kind: 'poly',
        points: diamond(view, first.at),
        fill: INK.intent,
        alpha: 0.16,
        stroke: { width: 2, colour: INK.intent, alpha: 0.6 },
      });
      labels.push({
        kind: 'text',
        text: summary,
        x: centre.x,
        y: centre.y,
        size: 13,
        colour: INK.intent,
        bold: true,
        anchorX: 0.5,
        anchorY: 0.5,
      });
    }

    // ANSWERED. Green for a move the simulation took, alarm for one it refused — and the
    // refusal carries its REASON on the cell, because "something was refused" is not the
    // question a player has. The word is the simulation's own, split into words upstream.
    for (const [, flashes] of byCell(state.flashes, (flash) => flash.action.at)) {
      const newest = flashes[flashes.length - 1];
      if (newest === undefined) continue;

      // Consecutive identical outcomes collapse to one line: "occupied x29".
      const runs: { readonly flash: ResolvedAction; count: number }[] = [];
      for (const flash of flashes) {
        const last = runs[runs.length - 1];
        if (last !== undefined && last.flash.outcome === flash.outcome) last.count += 1;
        else runs.push({ flash, count: 1 });
      }
      // And what still does not fit is dropped from the OLDEST end, with a line saying so.
      // THE COUNT IS TAKEN FROM WHAT WAS ACTUALLY SHOWN, WHICH IS THE ONLY WAY IT CAN BE
      // RIGHT: the `+N earlier` line occupies a slot of its own, so a version that computed
      // `runs.length - affords` hid one more than it admitted to.
      const shown = runs.length <= OUTCOME_LINES ? runs : runs.slice(runs.length - (OUTCOME_LINES - 1));
      const dropped = runs.length - shown.length;
      const lines: { readonly text: string; readonly colour: number }[] =
        dropped === 0 ? [] : [{ text: `+${dropped} earlier`, colour: INK.paper }];
      for (const run of shown) {
        lines.push({
          text: run.count === 1 ? state.words(run.flash.outcome) : `${state.words(run.flash.outcome)} x${run.count}`,
          colour: run.flash.refused ? INK.alarm : INK.ok,
        });
      }

      if (elsewhere(newest.action.at)) {
        lines.forEach((line, i) => {
          labels.push({
            kind: 'text',
            text: `${line.text} — floor ${newest.action.at.floor}`,
            x: OFF_FLOOR,
            y: OFF_FLOOR + (labels.length + i) * WORD_LINE_HEIGHT,
            size: 10,
            colour: line.colour,
            bold: true,
          });
        });
        continue;
      }

      shapes.push({
        kind: 'poly',
        points: diamond(view, newest.action.at),
        stroke: { width: 3, colour: newest.refused ? INK.alarm : INK.ok, alpha: 0.9 },
      });
      const centre = centreOf(view, newest.action.at.column, newest.action.at.row);
      lines.forEach((line, i) => {
        labels.push({
          kind: 'text',
          text: line.text,
          x: centre.x,
          y: centre.y - 24 - (lines.length - 1 - i) * WORD_LINE_HEIGHT,
          size: 10,
          colour: line.colour,
          bold: true,
          anchorX: 0.5,
        });
      });
    }

    return { shapes, labels };
  };

  return { build };
}
