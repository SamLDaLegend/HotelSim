// THE RENDER LAYER (G-030). A live simulation, drawn as a side-on cross-section.
//
// ---------------------------------------------------------------------------------------
// WHY THIS DIRECTORY IS OPEN, BECAUSE THE CHARTER SAID IT WOULD NOT BE UNTIL M5.
//
// ADR-0018 (human, 2026-08-12) supersedes `HOTELSIM.md:66`. §9's stop condition is not in
// the way and never was: it names work on the render layer before **M0** sign-off, which
// happened 2026-08-07. The argument is evidence rather than preference — ADR-0017, the
// largest design change in this project, came from the human's intuition about how the game
// should FEEL, arrived at goal 23, and re-opened behaviour in four earlier goals. Design
// feedback is the scarce input here, and playing is how it is generated.
//
// THE RULE THAT DEFINES THIS LAYER, AND G-031a ADDS THE SECOND HALF:
//
//   Render reads state. Input dispatches commands. Neither ever mutates the sim.
//
// G-030 read state and dispatched nothing. G-031a lets the player build and demolish, and
// EVERY PLAYER ACTION IS AN EXISTING COMMAND — `buildRoom` and `demolishRoom`, both defined
// since G-008, neither changed here. This goal adds no simulation behaviour: no field on
// `World`, no argument to `stepTick`, no migration, no new rule about what a legal placement
// is. If it had needed one, the goal's own first criterion says it stops.
//
// THE SPEED CONTROL AND PAUSE ARE PLAYER ACTIONS AND ARE NOT COMMANDS, which is why the
// criterion is worded about actions that change simulation state. They change HOW MANY ticks
// are run, never WHAT a tick does — and the proof is mechanical rather than asserted: they
// do not appear in `session.log`, because the only things that enter it are the commands
// `commandsFor` hands to a tick.
// ---------------------------------------------------------------------------------------

import { createWorld } from '@hotelsim/sim';
import { Application } from 'pixi.js';
import { loadContent, loadSpeedLadder } from './content.js';
import { advance, createDriver, restIdle } from './driver.js';
import { renderGuestPositions, renderHud, renderTools, renderTransport, wordsOf } from './hud.js';
import { actionAt, attachPointer, toolLabel } from './input.js';
import type { Point, Tool } from './input.js';
import { fastestRung, rungById } from './ladder.js';
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
import { createScene } from './view/scene.js';
import { createOverlay } from './view/overlay.js';
import { cellAt } from './view/layout.js';
import type { Layout } from './view/layout.js';
import { INK } from './view/palette.js';

/**
 * The seed the hotel opens on.
 *
 * 7 because it is the seed this project's own observations were taken at — ADR-0017's
 * measurements and G-017's watched recording are both `--seed 7`, so a first play session is
 * comparable with the notes that exist. It is a scenario choice, not a balance number; when
 * the player can start a game (G-031 and beyond) it becomes theirs to pick.
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

// Content first, and a failure here throws before a world exists — the ordering `cli.ts:61`
// uses, for the reason it gives: a half-loaded registry must never reach a tick.
const content = loadContent();
const rungs = loadSpeedLadder();

const world = createWorld(SEED, content);
const scenarioAt = createScenario(content, world.grid);
const driver = createDriver(world);
const session = createSession();

const app = new Application();
await app.init({ background: INK.background, antialias: false, resizeTo: stage, autoDensity: true, resolution: window.devicePixelRatio });
stage.append(app.canvas);

const scene = createScene(content);
app.stage.addChild(scene.container);
const overlay = createOverlay();
app.stage.addChild(overlay.container);

// ---------------------------------------------------------------------------------------
// TRANSPORT STATE — the whole of what this layer remembers between frames, and none of it
// is simulation state. A reload would lose the selected rung and nothing else; a room's
// occupancy, a guest's cell and the balance all live in the world, which is what makes this
// layer replaceable (I1: "if the human later wants Godot, only apps/game is thrown away").

let selectedRungId: string | null = fastestRung(rungs)?.id ?? null;
let paused = false;
let fps = 0;
// AND THE PLAYER'S OWN UI STATE, which is the rest of what this layer remembers: which tool
// is held and where the pointer is. A reload loses both. What the player BUILT is in the
// world, because it got there by being a command.
let tool: Tool = null;
// THE POINTER IS KEPT IN PIXELS, NEVER AS A CELL. A cell resolved at `pointermove` is
// resolved against the layout as it was then, and the layout is rebuilt every frame from the
// world's extent — so a build that grows the extent moves the click target out from under a
// motionless pointer while the outline stays put. Both are resolved below, in the frame,
// through the layout that frame is drawing with. See `input.ts` for the measurement.
let pointer: Point | null = null;
let layout: Layout | null = null;

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
      // A download rather than a console log: this file is G-031b's fixture, and a human
      // following the WATCH card should end up with it on disk without being asked to open
      // devtools. `URL.revokeObjectURL` on the next frame — the click has already been
      // delivered by then.
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
  onClick: (point) => {
    // Resolved against the layout the LAST FRAME DREW — the picture the player was looking
    // at, and the same `Layout` OBJECT the outline was drawn on. Not the same call: this is
    // a second `cellAt` on a second point source, and what makes the two agree is that
    // `layout` is assigned in exactly one place (see the frame, below).
    if (layout === null) return;
    // A `pointerdown` can arrive with no `pointermove` before it — touch, pen, or the
    // pointer re-entering after `pointerleave` — and then the outline was showing nothing.
    // Adopting the click's own point means the next frame draws the outline where the click
    // just went, rather than leaving the player with no picture of what they hit.
    pointer = point;
    const action = actionAt(driver.world, content, tool, cellAt(layout, point.x, point.y));
    if (action !== null) enqueue(session, action);
  },
  onCancel: () => {
    tool = null;
    app.canvas.style.cursor = 'default';
    tools();
  },
});

// A HIDDEN TAB IS PAUSED. The companion half of `MAX_BACKLOG_SECONDS` in `driver.ts`: a
// game that runs on while nobody is looking spends simulated days the player never saw, and
// then the clamp has to decide how much of that to throw away. Not watching is a clearer
// answer than either.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused) {
    paused = true;
    restIdle(driver);
    transport();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key !== ' ') return;
  event.preventDefault();
  paused = !paused;
  restIdle(driver);
  transport();
});

// ---------------------------------------------------------------------------------------
// THE FRAME. Time in, ticks spent, world drawn — in that order, once per frame.
//
// `app.ticker` gives the frame; it does NOT give the simulation its clock. What reaches
// `advance` is the wall-clock timestamp, and what leaves it towards `stepTick` is a world,
// the content, and the commands due on a tick. The speed is in ticks per real SECOND and is
// looked up from the ladder every frame by ID — no rung's value is held anywhere in this
// layer (see `ladder.ts`).

app.ticker.add(() => {
  fps = app.ticker.FPS;
  const rung = selectedRungId === null ? undefined : rungById(rungs, selectedRungId);
  const speed = paused || rung === undefined ? null : rung.ticksPerRealSecond;
  // EVERY FRAME RECORDS WHAT IT SPENT, INCLUDING THE ONES THAT SPENT NOTHING. A paused or
  // stalled frame earns zero ticks and that zero is part of the witness: a log whose frames
  // all consumed the same number of ticks did not come out of a real-time driver, and
  // G-031b's replay is what asserts it.
  let spent = 0;
  if (speed === null) restIdle(driver);
  else {
    spent = advance(
      driver,
      content,
      performance.now(),
      speed,
      (tick) => commandsFor(session, scenarioAt, tick),
      (before, after) => observeTick(session, before, after),
    );
  }
  recordFrame(session, spent);
  expireFlashes(session, driver.world.tick);

  const report = scene.draw(
    driver.world,
    app.renderer.width / app.renderer.resolution,
    app.renderer.height / app.renderer.resolution,
  );
  // THE ONLY ASSIGNMENT TO `layout` IN THIS FILE, AND THE POINTER FIX RESTS ON THAT BEING
  // TRUE. The outline below and the click handler above each call `cellAt` themselves — two
  // calls, two point sources — so what makes them agree is that they read one `Layout`
  // object, written here and nowhere else. A second assignment (a resize handler is the
  // obvious candidate) would let a click resolve against a layout the player never saw,
  // which is the defect the pixel-not-cell change repaired. If one is ever needed, it goes
  // through this line.
  layout = report.layout;
  overlay.draw(report.layout, {
    hovered: pointer === null ? null : cellAt(report.layout, pointer.x, pointer.y),
    toolLabel: toolLabel(tool),
    queued: session.queue,
    flashes: session.flashes,
    words: wordsOf,
  });
  renderHud(hudHost, {
    world: driver.world,
    content,
    crowdedOut: report.crowdedOut,
    invalidRooms: report.invalidRooms,
    rooms: report.rooms,
    fps,
    queued: session.queue.length,
    lastAction: session.last,
  });
  renderGuestPositions(guestsHost, driver.world, GUEST_POSITIONS_SHOWN);
});
