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
// AND SINCE G-064 THE INTENT IS A RECTANGLE RATHER THAN A CELL, WHICH CHANGES NOTHING ABOVE.
// A build is a drag now (`input.ts`), so what is drawn under the pointer is the rectangle the
// gesture currently covers and what is drawn on a queued build is the rectangle it will ask
// for. Both are read from the player's own gesture and from the `Command` already
// constructed — not computed a second time, and not checked against anything.
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
// THAT NOW COVERS TWO MORE REFUSALS AND THEY ARE THE REASON TO SAY IT AGAIN. `drawRoom` adds
// `footprintTooSmall` and `footprintTooLarge`, both of which are functions of the rectangle
// ALONE — so they are the easiest refusal in the game to predict locally and the most
// tempting to paint red. That is exactly why this file does not: `maxFootprintCells` is
// content (I3), a copy of it here would be a second definition of a rule `applyDrawRoom`
// owns, and the two would agree until the day a designer edits the JSON.
//
// WHAT THE PROJECTION CHANGED: a cell is a DIAMOND rather than a rectangle, and a cell not on
// the drawn floor has no picture at all. That second one is new and it is handled rather than
// ignored — see `OFF_FLOOR` below.

import { UNIT_FOOTPRINT } from '@hotelsim/sim';
import type { Cell, Footprint } from '@hotelsim/sim';
import { centreOf, toCanvas } from './camera.js';
import type { View } from './camera.js';
import { cornerOf, toView } from './iso.js';
import { INK } from './palette.js';
import type { Primitive } from './primitives.js';
import type { Region } from '../input.js';
import type { PlayerAction, ResolvedAction } from '../session.js';

export type OverlayState = {
  /**
   * THE RECTANGLE A RELEASE RIGHT NOW WOULD COVER, or `null` when the pointer is off the
   * stage (G-064).
   *
   * IT IS THE GESTURE, NOT A PREDICTION OF THE ANSWER, and the distinction is the one §6.1
   * and this file's header are about. With no drag in flight it is the hovered cell at
   * `1x1` — exactly the `hovered` field it replaces. With a drag in flight it is anchor-to-
   * pointer. In BOTH cases it says only where the player's hand is; whether the simulation
   * will accept it is not asked here, is not colour-coded here, and is not knowable here
   * without writing `applyDrawRoom`'s five rules a second time.
   */
  readonly intent: Region | null;
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

/**
 * The four canvas-space corners of a RECTANGLE of tiles. The overlay's only geometry.
 *
 * =========================================================================================
 * FOUR POINTS FOR ANY RECTANGLE, NOT ONE DIAMOND PER CELL (G-064). An axis-aligned rectangle
 * in grid space is still a parallelogram after `cornerOf`, because the projection is two
 * affine lines — so its outline is the outline of its extreme corners and nothing is gained
 * by drawing the interior tiles. The cost matters as well as the tidiness: `cellAt` does not
 * clamp, so a drag can legally span a rectangle far larger than the plot, and a per-cell loop
 * would put that number of polygons in a frame for a gesture that is about to be refused.
 *
 * THE EXTREMES ARE TAKEN IN VIEW SPACE RATHER THAN IN GRID SPACE, AND THAT IS NOT
 * DECORATION. `toView` NEGATES an axis at three of the four orientations (`{ u: row, v:
 * -column - 1 }` at orientation 1), so the grid's smallest column is not the view's smallest
 * `u` at every camera. Taking the min and max of the two projected corners is right at all
 * four; taking them before projecting is right at one, and would draw the marquee inside-out
 * at the other three the day this camera learns to rotate.
 *
 * AT A ONE-CELL FOOTPRINT IT RETURNS EXACTLY THE FOUR POINTS IT ALWAYS DID — `u0 === u1` and
 * `v0 === v1`, so the expression collapses to the tile's own four corners.
 * =========================================================================================
 */
function marquee(view: View, at: Cell, footprint: Footprint): number[] {
  const near = toView(at.column, at.row, view.orientation);
  const far = toView(at.column + footprint.columns - 1, at.row + footprint.rows - 1, view.orientation);
  const u0 = Math.min(near.u, far.u);
  const u1 = Math.max(near.u, far.u);
  const v0 = Math.min(near.v, far.v);
  const v1 = Math.max(near.v, far.v);
  const points: number[] = [];
  for (const [a, b] of [
    [u0, v0],
    [u1 + 1, v0],
    [u1 + 1, v1 + 1],
    [u0, v1 + 1],
  ] as const) {
    const p = toCanvas(view, cornerOf(a, b));
    points.push(p.x, p.y);
  }
  return points;
}

/**
 * HOW MANY CELLS A QUEUED OR ANSWERED ACTION COVERS, read off the command the player actually
 * sent (G-064).
 *
 * IT IS A LOOKUP, NOT A RE-DERIVATION. The rectangle is already in the `Command` — this layer
 * put it there and the simulation is about to judge that exact pair — so the ghost the player
 * watches queue up is the rectangle that will be built, by construction rather than by two
 * calculations agreeing. Everything that is not a `drawRoom` occupies its one cell:
 * `layCorridor` declares a cell and `demolishRoom` names an id whose room is drawn by
 * `scene.ts` anyway.
 */
function extentOf(action: PlayerAction): Footprint {
  return action.command.kind === 'drawRoom' ? action.command.footprint : UNIT_FOOTPRINT;
}

/** The canvas point at the middle of a rectangle of tiles. Affine in both arguments, so the
 *  midpoint of the extreme cells IS the middle of the rectangle (`iso.ts`: "`u` and `v` may
 *  be fractional"). */
function middleOf(view: View, at: Cell, footprint: Footprint): { readonly x: number; readonly y: number } {
  return centreOf(view, at.column + (footprint.columns - 1) / 2, at.row + (footprint.rows - 1) / 2);
}

export function createOverlay(): Overlay {
  const build = (
    view: View,
    state: OverlayState,
  ): { readonly shapes: readonly Primitive[]; readonly labels: readonly Primitive[] } => {
    const shapes: Primitive[] = [];
    const labels: Primitive[] = [];

    // THE RECTANGLE UNDER THE POINTER. Drawn even when it is off the plot, because a click
    // there is a legal move that earns a recorded refusal, and a cell the player cannot see is
    // a cell they cannot learn from.
    //
    // ONE COLOUR, WHATEVER THE RECTANGLE IS (G-064). `INK.intent` is the same blue for a
    // one-cell hover, for a 3x2 the sim will accept and for a 9x9 it will refuse as
    // `footprintTooLarge` — because turning it red on the third would mean this file holding a
    // copy of `maxFootprintCells`, and the player learns the bound from the word on the tile
    // one tick later, which is the same way they learn `occupied` and `insufficientFunds`.
    // The header's "no red ghost for you cannot afford this" is a rule about the SHAPE too.
    if (state.intent !== null && state.toolLabel !== null) {
      const { at, footprint } = state.intent;
      shapes.push({ kind: 'poly', points: marquee(view, at, footprint), stroke: { width: 2, colour: INK.intent, alpha: 0.9 } });
      const centre = middleOf(view, at, footprint);
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
      const centre = middleOf(view, first.at, extentOf(first));
      shapes.push({
        kind: 'poly',
        points: marquee(view, first.at, extentOf(first)),
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
        points: marquee(view, newest.action.at, extentOf(newest.action)),
        stroke: { width: 3, colour: newest.refused ? INK.alarm : INK.ok, alpha: 0.9 },
      });
      const centre = middleOf(view, newest.action.at, extentOf(newest.action));
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
