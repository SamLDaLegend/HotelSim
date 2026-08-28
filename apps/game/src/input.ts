// POINTER TO COMMAND (G-031a). The only file in this layer that touches a mouse.
//
// THE WHOLE OF WHAT IT DOES: read where the pointer is, look up what is drawn there, build
// one of the simulation's own `Command` values, and hand it to the queue. It evaluates no
// rule about whether the move is legal, charges nothing, and touches no world. Every
// judgement — off the plot, occupied, unaffordable, not a room — belongs to `packages/sim`
// and comes back as a recorded refusal (`build.ts`: "two doors, one rule, and the door
// decides who is at fault").
//
// ---------------------------------------------------------------------------------------
// A BUILD IS A DRAG, NOT A CLICK (G-064), AND THAT IS `HOTELSIM.md` §1'S HEADLINE BECOMING
// PLAYABLE: *"ROOMS ARE DESIGNED BY THE PLAYER, NOT PLACED FROM A CATALOGUE. The player draws
// a room's footprint..."* The simulation has accepted a drawn rectangle since G-036b and no
// click could produce one until now — a human watching the game put it in six words, *"can't
// currently build a room larger than 1x1."*
//
// THE GESTURE IS PRESS, MOVE, RELEASE, AND IT PRODUCES EXACTLY ONE COMMAND. The press records
// a corner and asks for nothing; the release turns two corners into a rectangle and enqueues
// one `drawRoom`. A press and a release on ONE cell is a `1x1` rectangle and is not a special
// case anywhere in this file, in `overlay.ts`, or in `build.ts` (`applyBuildRoom` is one line
// and it is a call to `applyDrawRoom` at `UNIT_FOOTPRINT`) — which is what keeps the gesture
// every room in this project was built with working unchanged.
//
// NOTHING ABOUT THE RECTANGLE IS JUDGED HERE. Not its size against the room type's band, not
// what stands under it, not whether the balance covers it, not whether any corner is on the
// plot. `applyDrawRoom` answers all five with a recorded refusal and the player reads the word
// on the tile. §6.1's line for this layer is "UI that cannot express a state the sim can
// reach", and a preview that greyed out a rectangle the sim would refuse would BOTH re-decide
// a rule the sim owns AND make that state unreachable.
// ---------------------------------------------------------------------------------------
//
// NO CONTENT ID IS NAMED HERE (ADR-0003, and `check:content` scans `apps/game/src`). The
// tool carries a `RoomTypeData` the player picked out of the injected content, and the
// command carries `roomType.id` — a value that came from the JSON, never a literal typed
// into this layer. The label is `roomType.name` for the same reason the speed buttons use
// `rung.name`: rename it in content and the button renames itself.

import { describeFootprint, isUnitFootprint, isWithinBounds } from '@hotelsim/sim';
import type { BoundContent, Cell, Footprint, RoomTypeData, World } from '@hotelsim/sim';
import { roomEntityAt } from './pick.js';
import type { PlayerAction } from './session.js';

/**
 * What a click will ask for.
 *
 * `null` is a real state and it is the default: with no tool held, a click does nothing at
 * all. A renderer whose every click builds something is a renderer the player cannot look
 * around in.
 */
export type Tool =
  | { readonly kind: 'build'; readonly roomType: RoomTypeData }
  /**
   * THE PLAN SAYS PEOPLE WALK HERE (G-063). `layCorridor` has existed since G-034b and
   * `scenario.ts` has dispatched it since G-035; until this goal NO CLICK COULD.
   *
   * It carries nothing, because the command carries nothing but a cell: a corridor is a
   * declaration about a cell rather than a thing placed in it, it takes no content id, and
   * it costs nothing (a corridor's price is a designer's number and there is none —
   * `commands.ts`). So there is no room type to hold and no catalogue to pick from.
   */
  | { readonly kind: 'corridor' }
  | { readonly kind: 'demolish' }
  | null;

/**
 * A rectangle of cells: the simulation's own pair, an origin and an extent.
 *
 * IT IS THE SHAPE `drawRoom` TAKES, NOT A SECOND DESCRIPTION OF ONE. `commands.ts` spells the
 * origin as "the rectangle's smallest column and smallest row" and `Footprint` as a pair of
 * counts along the two axes; this holds exactly those two values, so the thing the preview
 * draws and the thing the command carries are one object rather than two that have to agree.
 */
export type Region = { readonly at: Cell; readonly footprint: Footprint };

/**
 * THE RECTANGLE A DRAG FROM `from` TO `to` COVERS (G-064).
 *
 * =========================================================================================
 * THE WHOLE OF THE GESTURE'S GEOMETRY, AND IT DECIDES NOTHING. Two corners in, an origin and
 * an extent out. It does not ask whether the rectangle is on the plot, whether a room stands
 * in it, how big the room type allows, or what it costs — every one of those is a rule
 * `packages/sim` owns and answers with a recorded refusal (`applyDrawRoom`, in that order).
 *
 * EITHER CORNER MAY BE THE ONE THE PLAYER PRESSED ON. A drag up-and-left is as ordinary as a
 * drag down-and-right, so the origin is the MINIMUM of the two on each axis and the extent is
 * the span, inclusive of both ends — which is why the `+ 1` is there and why a press and a
 * release on ONE cell gives `1x1`, the footprint every build in this project has had until
 * now.
 *
 * OFF-PLOT CORNERS ARE NOT SPECIAL-CASED, AND THAT IS THE POINT RATHER THAN AN OMISSION.
 * `cellAt` does not clamp, a cell off the plot is an ordinary answer from it, and for the
 * BUILD family a click there "is a legal move that earns a recorded refusal" (`overlay.ts`,
 * and G-063 measured both halves: `buildRoom` at column -3 records `outOfBounds`, where
 * `layCorridor` would have thrown). `applyDrawRoom` asks `footprintWithinBounds`, which tests
 * the origin AND the far corner, so a rectangle with ANY corner off the plot is refused with
 * `outOfBounds` — the same word, through the same door, as the single off-plot click that has
 * been legal since G-031a. Clamping the drag here would be this layer deciding a rule instead,
 * and it would make that refusal unreachable from the UI, which is how three outcome marks
 * went unwatched at G-030.
 *
 * THE FLOOR IS THE ANCHOR'S, BECAUSE A FOOTPRINT HAS NO FLOOR EXTENT. A rectangle spanning two
 * storeys is not a thing `Footprint` can express, so `main.ts` DROPS a drag when the player
 * changes floor mid-gesture rather than letting one end of it hang. This function is total
 * either way and does not have an opinion about it.
 * =========================================================================================
 */
export function regionBetween(from: Cell, to: Cell): Region {
  return {
    at: {
      floor: from.floor,
      column: Math.min(from.column, to.column),
      row: Math.min(from.row, to.row),
    },
    footprint: {
      columns: Math.abs(to.column - from.column) + 1,
      rows: Math.abs(to.row - from.row) + 1,
    },
  };
}

/**
 * What the tool would do over `footprint`, in words, for the ghost under the pointer.
 *
 * THE SIZE IS A FACT ABOUT THE DRAG AND NEVER A PREDICTION ABOUT THE OUTCOME (§6.1). "build
 * Standard Room 3x2" says how many cells the player is currently covering; it does not say
 * whether the room will be built, and nothing in this layer may. A version of this that read
 * "too big" or that dropped the size once it exceeded `maxFootprintCells` would be the
 * affordability predictor `overlay.ts` refuses, wearing a tape measure.
 *
 * `describeFootprint` IS THE SIMULATION'S OWN SPELLING, IMPORTED. A `${columns}x${rows}` typed
 * here would be a second format for one quantity, and the day the sim's changes the player's
 * would not. THE ONE CELL CASE OMITS IT: "build Standard Room 1x1" is noise on the gesture
 * that is 99% of clicks, and `isUnitFootprint` is the sim's value test rather than a `=== 1 &&
 * === 1` written again (a migrated world and a fresh spawn carry two objects — `grid.ts`).
 */
export function toolLabel(tool: Tool, footprint: Footprint): string | null {
  if (tool === null) return null;
  if (tool.kind === 'build') return buildLabel(tool.roomType, footprint);
  if (tool.kind === 'corridor') return 'lay corridor';
  return 'demolish';
}

/** The words for a build, in ONE place, so the ghost under the pointer and the answer in the
 *  HUD cannot describe the same rectangle two ways. */
function buildLabel(roomType: RoomTypeData, footprint: Footprint): string {
  return `build ${roomType.name}${isUnitFootprint(footprint) ? '' : ` ${describeFootprint(footprint)}`}`;
}

/**
 * The action a gesture from `from` to `to` asks for, or `null` when there is nothing to ask.
 *
 * =========================================================================================
 * IT IS `drawRoom` AND IT WAS NEVER A CHOICE BETWEEN TWO COMMANDS THAT COULD BOTH DO IT
 * (G-064). `buildRoom` CARRIES NO FOOTPRINT FIELD AT ALL — read it in `commands.ts`:
 *
 *     | { readonly kind: 'buildRoom'; readonly roomType: ContentId; readonly at: Cell }
 *
 * The optional `footprint?: Footprint` one screen above it belongs to `spawnEntity`, the
 * STRUCTURAL door a scenario seeds through, which throws where the player's verb refuses. So
 * "buildRoom with a footprint" is not a thing that can be constructed, and the question is
 * only whether the player-facing rectangle verb exists at all. IT DOES: `drawRoom` has been
 * "THE PLAYER DRAWS A ROOM ... The primary building verb" since G-036b, it REQUIRES a
 * footprint, and it refuses — recorded, never thrown — with `outOfBounds`, `footprintTooSmall`,
 * `footprintTooLarge`, `occupied` and `insufficientFunds`.
 *
 * THIS IS THE OPPOSITE OF WHAT G-063 FOUND FOR CORRIDORS, and the difference is worth stating
 * because the two goals look alike from outside. There, `layCorridor` was "THE PRIMITIVE, NOT
 * THE PLAYER'S DRAWING", the player-facing verb was named as owed, and this file had to decline
 * to send an off-plot cell because the only door available THROWS. Here both doors already
 * exist and the player's one is the wider of the two.
 *
 * THE ONE-CELL BUILD NOW SENDS `drawRoom` AT `1x1` RATHER THAN `buildRoom`, AND THAT IS ONE
 * VERB FOR ONE GESTURE RATHER THAN A FORK. `applyBuildRoom` is a single line — a call to
 * `applyDrawRoom` at `UNIT_FOOTPRINT` — so the two commands are one rule and produce the same
 * five refusals, the same charge and the same entity; branching here on `columns === 1 && rows
 * === 1` would put a fork in the UI mirroring a fork the simulation deliberately does not
 * have. `buildRoom` is NOT deprecated by this and nothing here retires it: it is what the
 * determinism harness and `tools/headless/src/report.ts` issue, and every recorded log
 * containing one still means exactly what it meant (which is `commands.ts`' whole argument for
 * `drawRoom` being a second command rather than a wider first one).
 *
 * WHAT IS LOST, SAID PLAINLY: after this goal no click in the game produces a `buildRoom`, so
 * the UI no longer exercises that entry point. What that entry point does is call the function
 * below it with a frozen constant, and it is exercised on every tick of every harness and
 * every golden in the project — so the coverage that matters is not this layer's to give.
 * =========================================================================================
 *
 * THE CORRIDOR AND DEMOLISH TOOLS TAKE THE RELEASE CELL AND DO NOT DRAG. Neither command has a
 * rectangle form: `demolishRoom` takes an ENTITY ID, and a corridor rectangle is N idempotent
 * no-ops which `commands.ts` parks explicitly ("it becomes a real question the day a corridor
 * gains a COST"). `to` rather than `from` because that is what a press-and-release at one point
 * already meant, and because a control that acts where the finger LIFTS is what every button on
 * this page does.
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
 *
 * =========================================================================================
 * THE CORRIDOR TOOL IS THE SECOND PLACE THIS FILE DECLINES TO ACT, AND IT IS THE SAME
 * REASON AS THE FIRST RATHER THAN A NEW ONE (G-063).
 *
 * `layCorridor` IS THE STRUCTURAL DOOR AND IT THROWS OFF THE PLOT. `tick.ts`'s case reads
 * *"The cell is checked for integer-ness and for being on the plot by `assertCell`, and a
 * failure THROWS, because this is the structural door and the caller is holding the world
 * whose plot it just ignored"*, and it closes with *"a corridor whose refusal is RECORDED is
 * the player-facing verb, and that is G-036's"* — a verb that does not exist. So the two
 * doors `build.ts` tabulates are not both open here: there is only the primitive one.
 *
 * THE CONSEQUENCE FOR THIS LAYER IS EXACT AND IS NOT A JUDGEMENT ABOUT LEGALITY. `cellAt`
 * does not clamp — `overlay.ts` says so in as many words, *"Drawn even when it is off the
 * plot, because a click there is a legal move that earns a recorded refusal"* — and that
 * sentence is true of `buildRoom` and FALSE of `layCorridor`. Handing an off-plot cell to
 * this command would not refuse it; it would throw out of `stepTick` and end the session.
 *
 * SO THE TEST BELOW IS `isWithinBounds`, THE SIMULATION'S OWN PREDICATE, IMPORTED. It is the
 * first half of `assertCell` — the same function, asked instead of being tripped over — and
 * it is asked for the reason the demolish branch asks `roomEntityAt`: not "would the sim
 * allow this", but "is there a thing to send". `demolishRoom` needs an entity id and there
 * is none; `layCorridor` needs a cell on this plot and there is none. Neither is a second
 * opinion about a rule the simulation owns, because in neither case is there a rule — the
 * simulation does not refuse these, it has no vocabulary for them.
 *
 * WHAT IT IS NOT, SAID SO A LATER READER DOES NOT WIDEN IT: this is not the affordability
 * check G-031a refused, and it must not become one. It asks nothing about what stands on the
 * cell, nothing about the balance, nothing about whether the corridor will help. Those are
 * judgements; this is an address.
 *
 * AND `layCorridor` HAS NO REFUSAL TO REACH. It is idempotent, it costs nothing, and it does
 * not ask what is standing there, so on-plot there is no move it declines. A player who lays
 * a corridor where one already runs has laid a corridor where one already runs; see
 * `attributeCorridor` in `session.ts` for how that is said without calling it a refusal.
 * =========================================================================================
 */
export function actionAt(
  world: World,
  content: BoundContent,
  tool: Tool,
  from: Cell,
  to: Cell,
): PlayerAction | null {
  if (tool === null) return null;
  if (tool.kind === 'build') {
    const region = regionBetween(from, to);
    return {
      command: { kind: 'drawRoom', roomType: tool.roomType.id, at: region.at, footprint: region.footprint },
      // THE ORIGIN, NOT THE RELEASE, IS THE CELL THE ANSWER IS DRAWN ON. It is the cell
      // `drawRoom` itself names, so the flash and the HUD line report the rectangle the
      // simulation judged rather than the corner the player happened to let go on.
      at: region.at,
      label: buildLabel(tool.roomType, region.footprint),
    };
  }
  const cell = to;
  if (tool.kind === 'corridor') {
    if (!isWithinBounds(cell, world.grid)) return null;
    return { command: { kind: 'layCorridor', at: cell }, at: cell, label: 'lay corridor' };
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
  /**
   * The player pressed. THE GESTURE HAS STARTED AND NOTHING HAS BEEN ASKED FOR YET (G-064).
   *
   * No command is constructed here and nothing is queued. A press is a corner; it becomes a
   * move at `onPressEnd`, which is the only place in this file that produces one.
   */
  readonly onPressStart: (point: Point) => void;
  /**
   * The player let go. THIS IS THE MOVE — one gesture, one command, whatever it dragged over.
   *
   * It fires for a press-and-release on one cell too, which is every build made before this
   * goal: that gesture is a `1x1` drag and nothing about it is a special case.
   */
  readonly onPressEnd: (point: Point) => void;
  /**
   * Escape, or the system taking the pointer away: ABANDON.
   *
   * It escalates, and `main.ts` owns which rung it is on because `main.ts` owns the anchor: a
   * gesture in flight is dropped and the tool is KEPT, and only a cancel with no gesture puts
   * the tool down. Escape mid-drag meaning "not that rectangle" rather than "not that tool" is
   * what lets a player back out of a mis-started drag without re-picking the room type.
   */
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
    // ---------------------------------------------------------------------------------
    // THE CANVAS CAPTURES THE POINTER FOR THE LENGTH OF THE DRAG (G-064), AND IT IS WHAT
    // MAKES A DRAG OFF THE EDGE OF THE STAGE A COMPLETED GESTURE RATHER THAN A STUCK ONE.
    //
    // Without it a `pointerup` outside the canvas is delivered somewhere else, the anchor is
    // never cleared, and the next click in the game finishes a drag the player abandoned
    // minutes ago. With it, every `pointermove` and the `pointerup` come back here with
    // `offsetX`/`offsetY` STILL RELATIVE TO THE CANVAS — negative or past the far edge, which
    // resolves through `cellAt` to a cell off the plot, which is a legal move that earns
    // `outOfBounds`. That is the answer this layer wants: the simulation says no, in its own
    // word, rather than the UI silently eating the gesture.
    //
    // GUARDED, BECAUSE IT IS NOT THE POINT OF THE FEATURE. A browser that refuses the capture
    // (an already-released pointer id is the documented case) must not take the build tool
    // down with it — the gesture still works, it just stops tracking past the edge.
    // ---------------------------------------------------------------------------------
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // Nothing to do: capture is an improvement to the gesture, not a precondition for it.
    }
    handlers.onPressStart(pointOf(event));
  });
  canvas.addEventListener('pointerup', (event) => {
    if (event.button !== 0) return;
    handlers.onPressEnd(pointOf(event));
  });
  // THE SYSTEM TOOK THE POINTER AWAY — a touch became a scroll, a pen left the tablet. The
  // gesture did not finish, so it must not be completed as though it had: `onCancel` drops it.
  canvas.addEventListener('pointercancel', () => handlers.onCancel());
  // The canvas is not focusable, so the key listener goes on the window — the same place
  // pause already lives.
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.onCancel();
  });
}
