// POINTER TO COMMAND (G-031a). The only file in this layer that touches a mouse.
//
// THE WHOLE OF WHAT IT DOES: read where the pointer is, look up what is drawn there, build
// one of the simulation's own `Command` values, and hand it to the queue. It evaluates no
// rule about whether the move is legal, charges nothing, and touches no world. Every
// judgement — off the plot, occupied, unaffordable, not a room — belongs to `packages/sim`
// and comes back as a recorded refusal (`build.ts`: "two doors, one rule, and the door
// decides who is at fault").
//
// NO CONTENT ID IS NAMED HERE (ADR-0003, and `check:content` scans `apps/game/src`). The
// tool carries a `RoomTypeData` the player picked out of the injected content, and the
// command carries `roomType.id` — a value that came from the JSON, never a literal typed
// into this layer. The label is `roomType.name` for the same reason the speed buttons use
// `rung.name`: rename it in content and the button renames itself.

import type { BoundContent, Cell, RoomTypeData, World } from '@hotelsim/sim';
import { roomEntityAt } from './pick.js';
import type { PlayerAction } from './session.js';

/**
 * What a click will ask for.
 *
 * `null` is a real state and it is the default: with no tool held, a click does nothing at
 * all. A renderer whose every click builds something is a renderer the player cannot look
 * around in.
 */
export type Tool = { readonly kind: 'build'; readonly roomType: RoomTypeData } | { readonly kind: 'demolish' } | null;

/** What the tool would do at a cell, in words, for the ghost under the pointer. */
export function toolLabel(tool: Tool): string | null {
  if (tool === null) return null;
  return tool.kind === 'build' ? `build ${tool.roomType.name}` : 'demolish';
}

/**
 * The action a click at `cell` asks for, or `null` when there is nothing to ask.
 *
 * DEMOLISH ON AN EMPTY CELL RETURNS `null` AND DISPATCHES NOTHING, and that is the one place
 * this file declines to act. It is not a rule about legality — it is that `demolishRoom`
 * takes an ENTITY ID and there is no id to send. The player has not made a move; they have
 * clicked the sky.
 *
 * WHICH IS ALSO THE EXACT CONDITION UNDER WHICH A PLAYER REACHES `noSuchRoom`, AND IT IS
 * NARROWER THAN IT LOOKS — stated precisely because the first draft of this paragraph said
 * "click a room twice and the second earns `noSuchRoom`", which is FALSE once the first
 * click has been spent: the room is gone from the world by then, this function finds
 * nothing, and nothing is dispatched. The refusal is reachable when BOTH CLICKS LAND BEFORE
 * EITHER IS SPENT — a double-click inside one tick, or any two clicks while paused, where
 * both see the same live room. Measured: two clicks queued at tick 10 give `demolished` at
 * 10 and `refused: noSuchRoom` at 11.
 *
 * THE QUEUE IS THEREFORE NOT DE-DUPLICATED, DELIBERATELY. Collapsing two identical clicks
 * would be this layer deciding that the player's second move was a mistake, and it would
 * make one of the simulation's four refusal reasons unreachable from the UI — which is how
 * three marks went unwatched at G-030.
 */
export function actionAt(
  world: World,
  content: BoundContent,
  tool: Tool,
  cell: Cell,
): PlayerAction | null {
  if (tool === null) return null;
  if (tool.kind === 'build') {
    return {
      command: { kind: 'buildRoom', roomType: tool.roomType.id, at: cell },
      at: cell,
      label: `build ${tool.roomType.name}`,
    };
  }
  const room = roomEntityAt(world, content, cell);
  if (room === undefined) return null;
  return {
    command: { kind: 'demolishRoom', id: room.id },
    at: cell,
    // "demolish room 7", not "demolish 7" — the bare id reads as a quantity in the HUD line
    // ("demolish 1 at floor 0, column 1"), and `README.md` already used the longer form.
    label: `demolish room ${room.id}`,
  };
}

/** Where the pointer is, in the canvas's own CSS pixels. */
export type Point = { readonly x: number; readonly y: number };

export type PointerHandlers = {
  /** The pointer moved, or left the stage (`null`). PIXELS, not a cell — see below. */
  readonly onPointer: (point: Point | null) => void;
  /** The player clicked. Nothing about legality is decided before this is called. */
  readonly onClick: (point: Point) => void;
  /** Escape: put the tool down. */
  readonly onCancel: () => void;
};

/**
 * Wire a canvas to the handlers above.
 *
 * ---------------------------------------------------------------------------------------
 * THIS REPORTS PIXELS AND NEVER A CELL, AND THAT IS A REPAIR RATHER THAN A PREFERENCE.
 *
 * The first version resolved the cell HERE, at `pointermove`, and handed it out. That is a
 * cell computed against the layout as it was AT THE MOMENT THE POINTER LAST MOVED — and the
 * layout is rebuilt every frame from the world's extent. So the outline and the click target
 * silently diverged whenever the extent changed under a MOTIONLESS pointer, and the
 * commonest cause of that is the player's own build: the room lands a tick later, the extent
 * grows, and the next click in a row-of-rooms gesture goes somewhere the outline did not
 * indicate. Measured at 900x700 on the shipped hotel: one build two floors up moved the
 * click target TWO CELLS away from the drawn outline, pointer untouched. At 250,000p a room
 * that is a real cost, and `README.md` promises the opposite in as many words.
 *
 * A pixel does not go stale. The outline and the click are resolved AGAINST THE SAME
 * `Layout` OBJECT — not by the same call, which is what an earlier version of this paragraph
 * claimed and is not what shipped: there are two `cellAt` call sites with two point sources
 * (the outline uses the last `pointermove`, the click uses the `pointerdown`'s own
 * coordinates). What makes them agree is that `main.ts` assigns `layout` in EXACTLY ONE
 * PLACE, in the frame, and both read that.
 *
 * SAYING IT THAT WAY NAMES THE THING A FUTURE EDIT COULD BREAK, which "the same call" hid: a
 * second assignment to `layout` — a resize handler is the obvious candidate — reinstates the
 * divergence underneath a comment claiming it cannot happen.
 * ---------------------------------------------------------------------------------------
 *
 * `offsetX`/`offsetY` ARE THE RIGHT COORDINATES AND THE REASON IS `autoDensity`. The canvas
 * is sized in CSS pixels and scaled by `devicePixelRatio` internally, and `scene.draw` is
 * given `renderer.width / renderer.resolution` — CSS pixels. So the layout, the pointer and
 * the drawing are all in one unit, and a HiDPI screen does not need a conversion nobody
 * would remember to write.
 */
export function attachPointer(canvas: HTMLCanvasElement, handlers: PointerHandlers): void {
  const pointOf = (event: PointerEvent | MouseEvent): Point => ({ x: event.offsetX, y: event.offsetY });
  canvas.addEventListener('pointermove', (event) => handlers.onPointer(pointOf(event)));
  canvas.addEventListener('pointerleave', () => handlers.onPointer(null));
  canvas.addEventListener('pointerdown', (event) => {
    // Left button only. A right-click is the browser's menu and a middle-click is a paste on
    // some platforms; neither should build a hotel.
    if (event.button !== 0) return;
    handlers.onClick(pointOf(event));
  });
  // The canvas is not focusable, so the key listener goes on the window — the same place
  // pause already lives.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.onCancel();
  });
}
