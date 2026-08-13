// THE PLAYER'S INTENT, DRAWN (G-031a).
//
// Everything in this file is drawn from RENDER-SIDE state — the hovered cell, the queue of
// commands not yet spent, the outcomes of the last few that were. None of it is in the
// world, none of it survives a reload, and none of it is a second opinion about anything the
// simulation decides. It is kept out of `scene.ts` for exactly that reason: that file's
// opening claim is "every shape below is a function of the `World` handed in; call it twice
// with the same world and you get the same picture", and these shapes are not.
//
// WHY THE GHOST EXISTS AT ALL, WHICH IS THE PAUSE PROBLEM. A queued command is spent by the
// next TICK, and at pause there is no next tick — so without a ghost, clicking build while
// paused looks exactly like a dead UI. It is also the honest picture at the slow rungs: at 5
// ticks a second a queue of four takes most of a second to drain, and the player should be
// able to see their own moves standing in line. The ghost is what makes "your click was
// received; it lands when time moves" visible rather than something the player has to know.
//
// THE OVERLAY NEVER PREDICTS AN OUTCOME. There is no red ghost for "you cannot afford this"
// and no grey-out for an occupied cell. Predicting a refusal would mean writing the
// simulation's placement and affordability rules a second time, in the layer whose whole
// contract is that it does not decide — and it is also how the refusal states went unwatched
// at G-030: a UI that refuses locally never lets the player reach `outOfBounds`, `occupied`
// or `insufficientFunds` at all. The player clicks, the simulation answers, the answer is
// drawn.

import type { Cell } from '@hotelsim/sim';
import { Graphics } from 'pixi.js';
import type { Layout } from './layout.js';
import { INK } from './palette.js';
import type { PlayerAction, ResolvedAction } from '../session.js';
import { TextPool } from './text.js';

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

export type Overlay = {
  readonly container: Graphics;
  readonly labels: TextPool;
  draw: (layout: Layout, state: OverlayState) => void;
};

export function createOverlay(): Overlay {
  const container = new Graphics();
  const labels = new TextPool();
  container.addChild(labels.container);

  const draw = (layout: Layout, state: OverlayState): void => {
    container.clear();
    labels.begin();

    const box = (at: Cell): { x: number; y: number; w: number; h: number } => ({
      x: layout.x(at.column),
      y: layout.y(at.floor),
      w: layout.cellWidth,
      h: layout.cellHeight,
    });

    // THE HOVERED CELL. Drawn even when it is off the plot, because a click there is a legal
    // move that earns a recorded refusal, and a cell the player cannot see is a cell they
    // cannot learn from.
    if (state.hovered !== null && state.toolLabel !== null) {
      const { x, y, w, h } = box(state.hovered);
      container.rect(x + 1, y + 1, w - 2, h - 2).stroke({ width: 2, color: INK.intent, alpha: 0.9 });
      labels.text(state.toolLabel, x + 4, y + h - 4, {
        size: 10,
        colour: INK.intent,
        bold: true,
        anchorY: 1,
      });
    }

    // TWO THINGS ON ONE CELL ARE STACKED, NEVER OVERPRINTED, AND BOTH CASES ARE ORDINARY
    // RATHER THAN EXOTIC. Build a room and then click the same cell again and the two answers
    // — "built" and "occupied" — land on one square; queue two demolishes on one room (the
    // gesture that earns `noSuchRoom`, and which this layer deliberately does not
    // de-duplicate) and the queue has two entries at one address. Drawn on top of each other
    // the first reads as a smudge and the second as a single command, which would make the
    // very move the refusal criterion depends on invisible. So both are grouped by cell and
    // laid out down it.
    const byCell = <T>(items: readonly T[], cellOf: (item: T) => Cell): Map<string, T[]> => {
      const groups = new Map<string, T[]>();
      for (const item of items) {
        const at = cellOf(item);
        const k = `${at.floor},${at.column}`;
        const bucket = groups.get(k);
        if (bucket === undefined) groups.set(k, [item]);
        else bucket.push(item);
      }
      return groups;
    };

    // QUEUED, WITH ITS PLACE IN THE LINE. The number is the queue position, so a player who
    // clicked four times can see which one lands next — and two on one cell read as "1,2".
    //
    // A RUN IS SUMMARISED RATHER THAN LISTED, because the list has no bound and the cell
    // does. Forty clicks on one cell drew "1,2,3,…,40" straight out through the wall of a
    // 90px room; it now reads "1-40 x40", which is the same information at a fixed width.
    const queuedPositions = new Map<PlayerAction, number>();
    state.queued.forEach((action, i) => queuedPositions.set(action, i + 1));
    for (const [, actions] of byCell(state.queued, (action) => action.at)) {
      const first = actions[0];
      if (first === undefined) continue;
      const { x, y, w, h } = box(first.at);
      const positions = actions.map((action) => queuedPositions.get(action) ?? 0);
      const summary =
        positions.length <= QUEUE_POSITIONS_LISTED
          ? positions.join(',')
          : `${positions[0] ?? 0}-${positions[positions.length - 1] ?? 0} x${positions.length}`;
      container
        .rect(x + 4, y + 4, w - 8, h - 8)
        .fill({ color: INK.intent, alpha: 0.12 })
        .stroke({ width: 2, color: INK.intent, alpha: 0.55 });
      labels.text(summary, x + w / 2, y + h / 2, {
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
    //
    // The OUTLINE is the newest answer's colour and the WORDS are stacked oldest at the top,
    // so a cell that was built on and then refused says both and is outlined as refused.
    //
    // ---------------------------------------------------------------------------------
    // THE STACK IS COLLAPSED AND THEN CAPPED, BECAUSE THE REPAIR THAT CREATED IT HAD NO
    // BOUND AND THE GESTURE THAT REACHES IT IS ORDINARY.
    //
    // Holding `build` and clicking one cell forty times drains at one command per tick and
    // yields thirty simultaneous flashes: 330px of stacked words in a 110px cell, 220px of
    // it printed across the rest of the building, and twenty-nine of them the identical
    // word "occupied". The ceiling is `FLASH_TICKS` — 120 lines, 1,320px. Overprinting (the
    // state before the grouping repair) was ugly and BOUNDED; grouping without a cap traded
    // a smudge for a column of text through the hotel, which is the shape that generates a
    // spurious "reads as stupid" finding in front of the human this build exists to inform.
    //
    // So: a RUN of the same outcome becomes one line with a count, and what is left is
    // capped at the lines the cell can hold. Anything dropped is COUNTED and said — the
    // `crowdedOut` discipline from `drawStandingGuests`, for the same reason: silently
    // dropping one is the difference between an instrument and a decoration.
    // ---------------------------------------------------------------------------------
    for (const [, flashes] of byCell(state.flashes, (flash) => flash.action.at)) {
      const newest = flashes[flashes.length - 1];
      if (newest === undefined) continue;
      const { x, y, w, h } = box(newest.action.at);
      container
        .rect(x + 2, y + 2, w - 4, h - 4)
        .stroke({ width: 3, color: newest.refused ? INK.alarm : INK.ok, alpha: 0.85 });

      // Consecutive identical outcomes collapse to one line: "occupied x29".
      const runs: { readonly flash: ResolvedAction; count: number }[] = [];
      for (const flash of flashes) {
        const last = runs[runs.length - 1];
        if (last !== undefined && last.flash.outcome === flash.outcome) last.count += 1;
        else runs.push({ flash, count: 1 });
      }

      // And what still does not fit is dropped from the OLDEST end, with a line saying so.
      //
      // THE COUNT IS TAKEN FROM WHAT WAS ACTUALLY SHOWN, WHICH IS THE ONLY WAY IT CAN BE
      // RIGHT. It was `runs.length - affords`, which is one too few, because the `+N earlier`
      // line occupies a slot of its own — so the notice that exists to say nothing was hidden
      // silently hid one more. Worst where it matters most: in a tall hotel `cellHeight`
      // falls to `MIN_CELL_HEIGHT` and `affords` is 1, so two outcomes printed `+1 earlier`
      // and neither word. `drawStandingGuests` gets this right by counting what it drew
      // (`crowdedOut = guests.length - drawn`); this now does the same.
      const affords = Math.max(1, Math.floor((h - 8) / WORD_LINE_HEIGHT));
      const shown = runs.length <= affords ? runs : runs.slice(runs.length - (affords - 1));
      const dropped = runs.length - shown.length;
      const lines: { readonly text: string; readonly colour: number }[] =
        dropped === 0 ? [] : [{ text: `+${dropped} earlier`, colour: INK.paper }];
      for (const run of shown) {
        lines.push({
          text: run.count === 1 ? state.words(run.flash.outcome) : `${state.words(run.flash.outcome)} x${run.count}`,
          colour: run.flash.refused ? INK.alarm : INK.ok,
        });
      }
      lines.forEach((line, i) => {
        labels.text(line.text, x + 4, y + 4 + i * WORD_LINE_HEIGHT, {
          size: 10,
          colour: line.colour,
          bold: true,
        });
      });
    }

    labels.end();
  };

  return { container, labels, draw };
}
