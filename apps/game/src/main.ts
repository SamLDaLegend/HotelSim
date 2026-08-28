// THE RENDER LAYER (G-030, G-031a — rebuilt in ISOMETRIC at G-035).
//
// ---------------------------------------------------------------------------------------
// WHY THIS FILE EXISTS TWICE, WHICH IS THE LARGEST RULING IN THE PROJECT.
//
// ADR-0046 (human, 2026-08-16) supersedes `HOTELSIM.md` §1's "side-on cross-section view,
// not isometric" — a projection choice made before the first line of code, which nothing in
// the loop was ever pointed at, and which survived thirty-two goals because every gate,
// critic and WATCH takes the charter as given. `apps/game` was written off as CODE. Its
// DESIGN was not: the queued-command ghosts, the recorded-refusal flash, the transport strip
// reading the content ladder, the HUD's `last` and `refused` fields, and the deliberate
// choice NOT to grey out illegal moves are all rebuilt here rather than redesigned (§3).
//
// AND WHY IT IS THIS GOAL RATHER THAN A LATER ONE. ADR-0023 made `apps/game` the surface of
// record; writing it off left the project with NO VALID WATCH SURFACE, and ADR-0046 §7 rules
// that a behavioural goal shipping without an instrument is an ESCALATION rather than a
// recorded debt. There has been an open escalation since 2026-08-16 for exactly that. THIS
// GOAL ENDS THAT CONDITION; that is its purpose, and polish is not.
//
// THE RULE THAT DEFINES THIS LAYER, UNCHANGED BY THE PROJECTION:
//
//   Render reads state. Input dispatches commands. Neither ever mutates the sim.
//
// EVERY PLAYER ACTION IS AN EXISTING COMMAND — `drawRoom` (G-036b), `layCorridor` (G-034b)
// and `demolishRoom` (G-008), none of them changed here. No field on `World`, no argument to
// `stepTick`, no migration, no new rule about what a legal placement is.
//
// (This line read "`buildRoom` and `demolishRoom`, both defined since G-008" until G-064, and
// by then it had been wrong for two goals in two different ways: `layCorridor` joined at
// G-063, and the build tool now sends `drawRoom` because that is the only one of the two that
// carries a rectangle. `buildRoom` still exists and is still what the headless harness issues;
// what changed is which door this layer knocks on.)
//
// THE SPEED CONTROL, PAUSE AND THE FLOOR SWITCHER ARE PLAYER ACTIONS AND ARE NOT COMMANDS.
// They change HOW MANY ticks are run and WHAT IS DRAWN, never WHAT a tick does — and the
// proof is mechanical rather than asserted: none of them appears in `session.log`, because
// the only things that enter it are the commands `commandsFor` hands to a tick.
// ---------------------------------------------------------------------------------------

import { createWorld, entranceCell, UNIT_FOOTPRINT } from '@hotelsim/sim';
import type { Cell } from '@hotelsim/sim';
import { Application } from 'pixi.js';
import { loadContent, loadSpeedLadder, loadSpriteRefs } from './content.js';
import { advance, createDriver, restIdle } from './driver.js';
import {
  renderFloors,
  renderGuestPositions,
  renderHud,
  renderTools,
  renderTransport,
  wordsOf,
} from './hud.js';
import { actionAt, attachPointer, regionBetween, toolLabel } from './input.js';
import type { Point, Tool } from './input.js';
import { fastestRung, rungById } from './ladder.js';
import { createMotion, observeMotion } from './motion.js';
import { createScenario } from './scenario.js';
import {
  commandsFor,
  createSession,
  enqueue,
  exportSession,
  expireFlashes,
  observeTick,
  recordFrame,
} from './session.js';
import { cellAt, floorsOf, guestsOnFloor, viewFor } from './view/camera.js';
import type { View } from './view/camera.js';
import { DEFAULT_WALL_VISIBILITY, SHIPPED_ORIENTATION, WALL_VISIBILITIES } from './view/iso.js';
import type { WallVisibility } from './view/iso.js';
import { createOverlay } from './view/overlay.js';
import { createPainter } from './view/paint.js';
import { INK } from './view/palette.js';
import { createScene } from './view/scene.js';

/**
 * The seed the hotel opens on.
 *
 * 7 because it is the seed this project's own observations were taken at — ADR-0017's
 * measurements and G-017's watched recording are both `--seed 7`, so a first play session is
 * comparable with the notes that exist. It is a scenario choice, not a balance number; when
 * the player can start a game (C1's scenarios, M6) it becomes theirs to pick.
 */
const SEED = 7;

/** How many guest positions the strip under the stage names. See `renderGuestPositions`. */
const GUEST_POSITIONS_SHOWN = 6;

/** A required element, or a message that names which one is missing. */
function hostElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`index.html is missing #${id}`);
  return element;
}

const stage = hostElement('stage');
const hudHost = hostElement('hud');
const transportHost = hostElement('transport');
const guestsHost = hostElement('guests');
const toolsHost = hostElement('tools');
const floorsHost = hostElement('floors');

// Content first, and a failure here throws before a world exists — the ordering `cli.ts:61`
// uses, for the reason it gives: a half-loaded registry must never reach a tick.
const content = loadContent();
const sprites = loadSpriteRefs();
const rungs = loadSpeedLadder();

const world = createWorld(SEED, content);
const scenarioAt = createScenario(content, world.grid);
const driver = createDriver(world);
const session = createSession();
/**
 * HOW EVERY GUEST GOT FROM THE LAST TICK TO THIS ONE (G-047b).
 *
 * RENDER STATE, AND THE SAME STATUS AS THE LINE ABOVE IT AND THE CAMERA BELOW: a reload loses
 * it and the hotel is unchanged. It is a DERIVATION over the two worlds `advance` already
 * hands to `observe`, recorded once per tick because a path is constant between ticks and this
 * loop draws 145 frames a second.
 */
const motion = createMotion();

const app = new Application();
await app.init({
  background: INK.background,
  antialias: true,
  resizeTo: stage,
  autoDensity: true,
  resolution: window.devicePixelRatio,
});
stage.append(app.canvas);

const scene = createScene(content, sprites);
const painter = createPainter(app.renderer);
app.stage.addChild(painter.container);
const overlay = createOverlay();

// ---------------------------------------------------------------------------------------
// TRANSPORT AND CAMERA STATE — the whole of what this layer remembers between frames, and
// none of it is simulation state. A reload would lose the selected rung, the tool, the
// pointer and WHICH FLOOR IS BEING LOOKED AT, and nothing else; a room's occupancy, a guest's
// cell and the balance all live in the world, which is what makes this layer replaceable
// (I1: "if the human later wants Godot, only apps/game is thrown away").

let selectedRungId: string | null = fastestRung(rungs)?.id ?? null;
let paused = false;
let fps = 0;
let tool: Tool = null;
// THE POINTER IS KEPT IN PIXELS, NEVER AS A CELL. A cell resolved at `pointermove` is
// resolved against the camera as it was then, and the camera is rebuilt every frame from the
// floor's extent — so a build that grows the extent moves the click target out from under a
// motionless pointer while the outline stays put. Both are resolved below, in the frame,
// through the view that frame is drawing with.
let pointer: Point | null = null;
let view: View | null = null;
/**
 * THE CORNER THE PLAYER PRESSED ON, or `null` when no gesture is in flight (G-064).
 *
 * ---------------------------------------------------------------------------------------
 * RENDER STATE, AND THE THINNEST KIND: a reload loses it and the hotel is unchanged. Nothing
 * is spent, charged or queued while it is held — the queue gains one entry at the release and
 * not before.
 *
 * IT IS A CELL WHERE `pointer` ABOVE IS A PIXEL, AND THE TWO ARE NOT INCONSISTENT: they are
 * answers to different questions. `pointer` is a LIVE QUERY — "what is under the cursor now" —
 * and must be re-resolved every frame, because the camera is rebuilt from the floor's extent
 * and a build that grows the extent moves the tile out from under a motionless pointer
 * (`input.ts` carries the measurement: two cells, at 900x700). The anchor is a RECORDED
 * GESTURE START — "which tile did I grab" — and the same camera movement must NOT move it, or
 * a still finger would be dragging from a different corner than the one it pressed on. Stored
 * as a pixel it would slide; stored as a cell it stays on the tile the player grabbed and the
 * marquee stays pinned to it.
 *
 * IT IS RESOLVED ONCE, AT THE PRESS, AGAINST THE VIEW THE PLAYER WAS LOOKING AT — which is
 * exactly the staleness the click has had since G-031a, unchanged and no worse.
 * ---------------------------------------------------------------------------------------
 */
let dragFrom: Cell | null = null;

/**
 * WHICH FLOOR IS ON SCREEN. Render state, and the one piece of it this projection adds.
 *
 * It opens on the ENTRANCE'S floor rather than on the highest or the lowest, because that is
 * where an arriving guest stands and therefore where the guest loop is visible from tick one.
 * `entranceCell` is a total function of the world's own bounds (G-023a), so this is right on
 * a plot that does not contain floor 0.
 */
let floor = ((): number => {
  const available = floorsOf(driver.world);
  const wanted = entranceCell(driver.world.grid).floor;
  return available.includes(wanted) ? wanted : (available[0] ?? wanted);
})();

function transport(): void {
  renderTransport(transportHost, rungs, selectedRungId, paused, {
    onSelect: (id) => {
      selectedRungId = id;
      // The carry is dropped on a speed change: fractional ticks earned at the old rate are
      // not owed at the new one.
      restIdle(driver);
      transport();
    },
    onTogglePause: () => {
      paused = !paused;
      restIdle(driver);
      transport();
    },
  });
}
transport();

function floors(): void {
  renderFloors(floorsHost, floorsOf(driver.world), floor, (n) => guestsOnFloor(driver.world, n), {
    onSelect: (picked) => {
      floor = picked;
      // A DRAG DOES NOT SURVIVE A FLOOR CHANGE (G-064). `Footprint` is two counts along the
      // column and row axes and has no floor extent, so a rectangle spanning two storeys is
      // not a thing the simulation can be asked for. The gesture is dropped rather than
      // silently flattened onto one of the two floors, which would build somewhere the player
      // was no longer looking.
      dragFrom = null;
      floors();
    },
  });
}
floors();

// ---------------------------------------------------------------------------------------
// THE PLAYER'S TOOLS AND THE POINTER.
//
// A click does four things and none of them is a decision: find the cell, ask the tool what
// it would do there, put the resulting `Command` in the queue, redraw the toolbar. The
// simulation judges it on the next tick and the answer comes back through `observeTick`.

function tools(): void {
  renderTools(toolsHost, content, content.content.roomTypes, tool, {
    onPick: (picked) => {
      tool = picked;
      // The cursor says whether a click will do anything at all, which the ghost cannot: the
      // ghost only appears once the pointer is over the stage.
      app.canvas.style.cursor = picked === null ? 'default' : 'crosshair';
      tools();
    },
    onExport: () => {
      const blob = new Blob([exportSession(session, SEED, driver.world)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `hotelsim-session-tick-${driver.world.tick}.json`;
      link.click();
      requestAnimationFrame(() => URL.revokeObjectURL(url));
    },
  });
}
tools();

attachPointer(app.canvas, {
  onPointer: (point) => {
    pointer = point;
  },
  // THE PRESS RECORDS A CORNER AND ASKS FOR NOTHING (G-064). No command is constructed, the
  // queue is untouched, and the world is not read for a decision — the only thing that happens
  // is that the marquee now has two ends instead of one.
  onPressStart: (point) => {
    // Resolved against the view the LAST FRAME DREW — the picture the player was looking at,
    // and the same `View` OBJECT the outline was drawn on. Not the same call: this is a second
    // `cellAt` on a second point source, and what makes the two agree is that `view` is
    // assigned in exactly one place (see the frame, below).
    if (view === null) return;
    // A `pointerdown` can arrive with no `pointermove` before it — touch, pen, or the pointer
    // re-entering after `pointerleave` — and then the outline was showing nothing. Adopting
    // the press's own point means the next frame draws the outline where the press just went.
    pointer = point;
    dragFrom = cellAt(view, point.x, point.y);
  },
  // THE RELEASE IS THE MOVE, AND IT IS THE ONLY PLACE A COMMAND IS QUEUED.
  onPressEnd: (point) => {
    if (view === null) return;
    const from = dragFrom;
    dragFrom = null;
    // A RELEASE WITH NO PRESS IS NOT A MOVE. It happens whenever the pointer went down
    // somewhere else — on a toolbar button, or outside the window — and came up over the
    // stage, and it is also every release after an Escape. Building there would be a gesture
    // the player never started on this canvas.
    if (from === null) return;
    pointer = point;
    // THE RELEASE RESOLVES ITS OWN POINT, exactly as the click used to, so a fast drag whose
    // last `pointermove` never arrived still ends where the finger lifted.
    const action = actionAt(driver.world, content, tool, from, cellAt(view, point.x, point.y));
    if (action !== null) enqueue(session, action);
  },
  // ESCAPE ESCALATES: the gesture first, the tool second (`input.ts`'s `onCancel`). Backing out
  // of a mis-started drag must not also put the room type down, or every correction costs two
  // extra clicks in the toolbar.
  onCancel: () => {
    if (dragFrom !== null) {
      dragFrom = null;
      return;
    }
    tool = null;
    app.canvas.style.cursor = 'default';
    tools();
  },
});

// A HIDDEN TAB IS PAUSED. The companion half of `MAX_BACKLOG_SECONDS` in `driver.ts`: a game
// that runs on while nobody is looking spends simulated days the player never saw, and then
// the clamp has to decide how much of that to throw away. Not watching is a clearer answer
// than either.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused) {
    paused = true;
    restIdle(driver);
    transport();
  }
});

/**
 * WHICH WALL POSITION IS DRAWN (ADR-0052, human ruling — G-039a).
 *
 * Render state and nothing else: a reload puts it back to `reduced`, nothing is saved, and the
 * simulation cannot see it. The default is the human's ruling in one word — *"the default stays
 * 24"* — because it is the position that shows the mechanic `placeItem` and the quality fold
 * are about, and it is what an unattended recording gets.
 */
let walls: WallVisibility = DEFAULT_WALL_VISIBILITY;

window.addEventListener('keydown', (event) => {
  // `w` CYCLES THE WALLS, in the order `WALL_VISIBILITIES` lists them: reduced -> transparent
  // -> full. One key rather than three, because a control with three positions and three keys
  // is three things to remember; the HUD says which one is live.
  if (event.key === 'w' || event.key === 'W') {
    event.preventDefault();
    const at = WALL_VISIBILITIES.indexOf(walls);
    walls = WALL_VISIBILITIES[(at + 1) % WALL_VISIBILITIES.length] ?? DEFAULT_WALL_VISIBILITY;
    return;
  }
  if (event.key === ' ') {
    event.preventDefault();
    paused = !paused;
    restIdle(driver);
    transport();
    return;
  }
  // FLOORS ON THE ARROW KEYS, so a watcher can walk the building without leaving the picture.
  // It moves to the next floor THAT EXISTS rather than by one number, because the plot is 23
  // floors deep and almost all of them are empty.
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  const available = floorsOf(driver.world);
  const at = available.indexOf(floor);
  const next = available[at + (event.key === 'ArrowUp' ? 1 : -1)];
  if (next !== undefined) {
    floor = next;
    // The floor switcher's reason, one control over — see `renderFloors`' `onSelect` above.
    dragFrom = null;
    floors();
  }
});

// ---------------------------------------------------------------------------------------
// THE FRAME. Time in, ticks spent, world drawn — in that order, once per frame.
//
// `app.ticker` gives the frame; it does NOT give the simulation its clock. What reaches
// `advance` is the wall-clock timestamp, and what leaves it towards `stepTick` is a world,
// the content, and the commands due on a tick. The speed is in ticks per real SECOND and is
// looked up from the ladder every frame by ID — no rung's value is held anywhere in this
// layer (see `ladder.ts`).

let lastFloorsDrawn = -1;

app.ticker.add(() => {
  fps = app.ticker.FPS;
  const rung = selectedRungId === null ? undefined : rungById(rungs, selectedRungId);
  const speed = paused || rung === undefined ? null : rung.ticksPerRealSecond;
  // EVERY FRAME RECORDS WHAT IT SPENT, INCLUDING THE ONES THAT SPENT NOTHING. A paused or
  // stalled frame earns zero ticks and that zero is part of the witness: a log whose frames
  // all consumed the same number of ticks did not come out of a real-time driver.
  let spent = 0;
  if (speed === null) restIdle(driver);
  else {
    spent = advance(
      driver,
      content,
      performance.now(),
      speed,
      (tick) => commandsFor(session, scenarioAt, tick),
      (before, after) => {
        observeTick(session, before, after);
        observeMotion(motion, content, before, after);
      },
    );
  }
  recordFrame(session, spent);
  expireFlashes(session, driver.world.tick);

  const width = app.renderer.width / app.renderer.resolution;
  const height = app.renderer.height / app.renderer.resolution;
  // THE ONLY ASSIGNMENT TO `view` IN THIS FILE, AND THE POINTER FIX RESTS ON THAT BEING TRUE.
  // The outline below and the click handler above each call `cellAt` themselves — two calls,
  // two point sources — so what makes them agree is that they read one `View` object, written
  // here and nowhere else. A second assignment (a resize handler is the obvious candidate)
  // would let a click resolve against a camera the player never saw.
  view = viewFor(driver.world, floor, SHIPPED_ORIENTATION, width, height, walls);
  // THE BODIES ARE DRAWN AT `tick - 1 + carry` AND EVERYTHING ELSE AT `tick` (ADR-0096
  // ruling 3, and see `Scene.build`). `driver.carry` is the fraction of a tick the wall clock
  // has earned and not yet spent — it is already render-side, it is already frame-rate
  // independent by `ticksEarned`'s construction, and it crosses no boundary going this way.
  const frame = scene.build(driver.world, view, motion, driver.carry);
  // WHAT A RELEASE RIGHT NOW WOULD COVER (G-064) — the hovered cell on its own, or the whole
  // rectangle back to the corner the player pressed on. Resolved HERE, in the frame, through
  // the view this frame is drawing with, which is the property `input.ts`' header rests on:
  // the marquee and the command that follows it read one `View` object.
  //
  // IT SAYS WHERE THE HAND IS AND NOT WHAT THE ANSWER WILL BE. `regionBetween` is pure
  // geometry; nothing between here and `overlay.build` asks the world, the content or the
  // balance a question, and `INK.intent` is one colour for every rectangle. §6.1.
  const hovered = pointer === null ? null : cellAt(view, pointer.x, pointer.y);
  const intent =
    hovered === null ? null : regionBetween(dragFrom ?? hovered, hovered);
  const marks = overlay.build(view, {
    intent,
    toolLabel: toolLabel(tool, intent?.footprint ?? UNIT_FOOTPRINT),
    queued: session.queue,
    flashes: session.flashes,
    words: wordsOf,
  });
  painter.paint(frame.shapes, marks.shapes, [...frame.labels, ...marks.labels]);

  renderHud(hudHost, {
    world: driver.world,
    content,
    crowdedOut: frame.report.crowdedOut,
    unwalkable: frame.report.unwalkable,
    drawnTick: driver.world.tick - 1 + driver.carry,
    invalidRooms: frame.report.invalidRooms,
    rooms: frame.report.rooms,
    // THE RATING COMES OUT OF THE FRAME, not out of a second call (G-062). One walk of the
    // building per tick, one answer, and the words under the picture describe the picture.
    rating: frame.report.rating,
    guestsElsewhere: frame.report.guestsElsewhere,
    fps,
    queued: session.queue.length,
    lastAction: session.last,
    walls,
  });
  renderGuestPositions(guestsHost, driver.world, GUEST_POSITIONS_SHOWN);

  // THE FLOOR SWITCHER IS REBUILT WHEN THE SET OF FLOORS CHANGES, NOT EVERY FRAME. It carries
  // live guest counts, so it does have to be refreshed — but replacing a row of DOM buttons
  // sixty times a second makes them unclickable, which is the sort of defect that reads as
  // "the UI is broken" and is actually a redraw policy. Once a simulated hour is enough for a
  // count that changes when somebody walks through a door.
  const beat = Math.floor(driver.world.tick / 60);
  if (beat !== lastFloorsDrawn) {
    lastFloorsDrawn = beat;
    floors();
  }
});
