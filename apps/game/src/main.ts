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
// THE RULE THAT DEFINES THIS LAYER, AND THIS GOAL KEEPS THE HALF IT OWNS:
//
//   Render reads state. Input dispatches commands. Neither ever mutates the sim.
//
// G-030 READS STATE AND DISPATCHES NOTHING. There is no player action here at all — no
// build, no demolish, no click that reaches a command. That is G-031's, and the split is
// what makes this goal's claim checkable: the only things the player can touch are the
// speed control and pause, and neither is a `Command`. They change HOW MANY ticks are run,
// never WHAT a tick does.
// ---------------------------------------------------------------------------------------

import { createWorld } from '@hotelsim/sim';
import { Application } from 'pixi.js';
import { loadContent, loadSpeedLadder } from './content.js';
import { advance, createDriver, restIdle } from './driver.js';
import { renderGuestPositions, renderHud, renderTransport } from './hud.js';
import { fastestRung, rungById } from './ladder.js';
import { createScenario } from './scenario.js';
import { createScene } from './view/scene.js';
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

// Content first, and a failure here throws before a world exists — the ordering `cli.ts:61`
// uses, for the reason it gives: a half-loaded registry must never reach a tick.
const content = loadContent();
const rungs = loadSpeedLadder();

const world = createWorld(SEED, content);
const commandsAt = createScenario(content, world.grid);
const driver = createDriver(world);

const app = new Application();
await app.init({ background: INK.background, antialias: false, resizeTo: stage, autoDensity: true, resolution: window.devicePixelRatio });
stage.append(app.canvas);

const scene = createScene(content);
app.stage.addChild(scene.container);

// ---------------------------------------------------------------------------------------
// TRANSPORT STATE — the whole of what this layer remembers between frames, and none of it
// is simulation state. A reload would lose the selected rung and nothing else; a room's
// occupancy, a guest's cell and the balance all live in the world, which is what makes this
// layer replaceable (I1: "if the human later wants Godot, only apps/game is thrown away").

let selectedRungId: string | null = fastestRung(rungs)?.id ?? null;
let paused = false;
let fps = 0;

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
  if (speed === null) restIdle(driver);
  else advance(driver, content, performance.now(), speed, commandsAt);

  const report = scene.draw(
    driver.world,
    app.renderer.width / app.renderer.resolution,
    app.renderer.height / app.renderer.resolution,
  );
  renderHud(hudHost, {
    world: driver.world,
    content,
    crowdedOut: report.crowdedOut,
    invalidRooms: report.invalidRooms,
    rooms: report.rooms,
    fps,
  });
  renderGuestPositions(guestsHost, driver.world, GUEST_POSITIONS_SHOWN);
});
