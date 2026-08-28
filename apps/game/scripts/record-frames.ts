// RECORD THE ISOMETRIC VIEW AS SVG FRAMES (G-035).
//
//   pnpm --filter @hotelsim/game record -- --ticks 2880 --every 240 --floor 0
//
// ============================================================================
// WHY THIS EXISTS: G-035'S EXIT CRITERIA INCLUDE "A RECORDING EXISTS AND `JOURNAL.md`
// CARRIES A WATCH ENTRY".
//
// ADR-0046 §7 rules that a behavioural goal shipping with no instrument to watch it is an
// ESCALATION rather than a recorded debt, and this goal exists to end that condition. An
// instrument nobody can produce evidence from has not ended it. A running browser is a WATCH
// and it is the real one; it is also a thing that cannot be attached to a report, replayed by
// somebody who was not there, or compared against the same run a month later.
//
// SO THE FRAME IS DATA BEFORE IT IS PIXELS. `view/scene.ts` returns a list of primitives and
// `view/paint.ts` turns them into Pixi. This walks the SAME `buildScene` over the SAME
// scenario and writes the SAME primitives out as SVG. **The thing watched is the thing
// shipped**, not a second drawing of it — which is the property `tools/viewer` never had and
// is the reason its drawing went stale without anybody noticing.
//
// IT IS NOT A VIEWER AND MUST NOT BECOME ONE. §9 lists "the replay viewer is acquiring
// features, a public API, or defenders" as a stop condition, and the same discipline applies
// here with more force, because this one lives inside `apps/game`. It writes files. It has no
// controls, no server, no state and no API. If it starts growing any of those, delete it: the
// browser is the viewer.
//
// IT IS OFF BY DEFAULT AND ON NOBODY'S PATH. No gate runs it, `pnpm verify` does not know it
// exists, and `pnpm dev` does not call it. It is a command a person types when they want a
// recording.
// ============================================================================

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createValidityCache,
  createWorld,
  entranceCell,
  starRatingOf,
  stepTick,
  UNRATED,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
/**
 * ==========================================================================================
 * THE GAME'S OWN CONTENT LOADER, AND IT IS THE HEADER'S PROPERTY RATHER THAN AN IMPORT TIDY-UP
 * (G-051b -> broken; repaired here).
 *
 * THIS FILE USED TO CALL `tools/headless/src/content-loader.ts`, AND IT HAS FILMED A HOTEL
 * NOBODY COULD ARRIVE IN SINCE G-051b — broken at `4656f56` and in every commit after it
 * (`git rev-list --count 4656f56..HEAD` reads 4). That loader takes a `Market` and DEFAULTS
 * to `'commanded'`, which reads and validates `demand.json` and then WITHHOLDS it from the
 * injected registry — the laboratory clamp every measured arm depends on. G-051b also removed
 * the last `guestArrives` from `scenario.ts`. So from that commit the recorder had NO demand curve
 * and NO arrival commands, and every frame it wrote captioned itself `0 guests here · 0
 * elsewhere` while exiting 0.
 *
 * PASSING `'byDemand'` WOULD HAVE FIXED THE SYMPTOM AND LEFT THE HOLE. The hole is that this
 * file's header claims **"the thing watched is the thing shipped"** and then loaded its content
 * through a DIFFERENT loader from the one `main.ts` uses. Same scene builder, same scenario,
 * second content path — and a second content path is a place for the two to disagree about
 * anything: which tables are injected, which are withheld, what a future `Market` value means.
 *
 * `../src/content.ts` IS THE LOADER THE BROWSER USES. It injects the demand curve
 * unconditionally ("THE GAME IS NOT A MEASUREMENT"), and it takes no market, because the game
 * has none — a market is a HARNESS concept and it does not belong in a picture of the game.
 * There is now exactly one answer to "what content is this hotel running", and the recorder
 * cannot hold a different one.
 *
 * IT LOADS UNDER `tsx` DESPITE THE BUNDLER-STYLE JSON IMPORTS, which was checked by running it
 * rather than assumed. `tsconfig.scripts.json` typechecks this file with `types: ["node"]` and
 * no DOM lib; `src/content.ts` names no DOM type, so it compiles under both configs.
 * ==========================================================================================
 */
import { loadContent, loadSpriteRefs } from '../src/content.js';
import { createMotion, observeMotion } from '../src/motion.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, frameSvg, hex } from './svg.js';
import { createScenario } from '../src/scenario.js';
import { floorsOf, guestsOnFloor, viewFor } from '../src/view/camera.js';
import { DEFAULT_WALL_VISIBILITY, SHIPPED_ORIENTATION, WALL_VISIBILITIES } from '../src/view/iso.js';
import type { WallVisibility } from '../src/view/iso.js';
import { BACKGROUND } from '../src/view/palette.js';
import { createScene } from '../src/view/scene.js';

/** `--name value` out of argv, or a default. Deliberately tiny: this is not a CLI. */
function arg(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const value = Number(process.argv[at + 1]);
  return Number.isFinite(value) ? value : fallback;
}

/**
 * WHICH WALL POSITION TO RECORD IN (ADR-0052, G-039a) — `--walls reduced|transparent|full`.
 *
 * IT DEFAULTS TO THE DEFAULT, which is the whole point of the ruling: an unattended recording
 * gets `reduced`, the position that shows what is inside a room. The flag exists because the
 * transparency position was PARKED WITH A FALSIFICATION TEST — *"build all three, look at the
 * same frame in each"* — and a test you cannot invoke is not a test.
 */
const wallsArg = process.argv.includes('--walls')
  ? String(process.argv[process.argv.indexOf('--walls') + 1])
  : DEFAULT_WALL_VISIBILITY;
const walls: WallVisibility = (WALL_VISIBILITIES as readonly string[]).includes(wallsArg)
  ? (wallsArg as WallVisibility)
  : DEFAULT_WALL_VISIBILITY;
if (walls !== wallsArg) {
  // LOUD, NOT QUIET. A misspelt `--walls transparant` that silently records the default would
  // produce two identical recordings and an argument about what they showed.
  process.stdout.write(`--walls "${wallsArg}" is not one of ${WALL_VISIBILITIES.join(', ')}; recording ${walls}
`);
}

const seed = arg('seed', 7);
const ticks = arg('ticks', 2880);
const every = arg('every', 240);

/**
 * WHICH SUB-TICK MOMENT TO DRAW THE BODIES AT (G-047b) — `--carry 0..1`, DEFAULT 1.
 *
 * ==========================================================================================
 * AT THE DEFAULT THIS FILE WRITES THE FRAMES IT ALWAYS WROTE, TO THE PIXEL. A guest is drawn
 * at `route(1)`, which `tweenView` clamps to the route's last tile — its cell at `world.tick`
 * — with the slot offset it has at `world.tick`. That is the definition of the picture this
 * recorder produced before interpolation existed, so a before/after comparison of two default
 * recordings is a real check rather than a hope, and it is the check this goal used.
 *
 * WHY THE FLAG EXISTS AT ALL, GIVEN §9 MAKES "THE RECORDER ACQUIRING FEATURES" A STOP
 * CONDITION. A guest between two cells is the entire subject of this goal and **a frame at an
 * integer tick cannot contain one**: at `carry = 1` every figure is on a tile centre, by
 * construction, forever. Without this the instrument of record can photograph every state of
 * the hotel except the one the goal is about. It is one number, validated, loud when it is
 * wrong, and it changes nothing else — the same shape as `--walls`, which exists for the same
 * reason: a position that cannot be photographed cannot be argued about.
 *
 * IT IS A MOMENT, NOT A RATE. Nothing here consumes real time, and this number never reaches
 * `stepTick`; it selects which instant between two completed ticks is drawn.
 * ==========================================================================================
 */
const carryArg = process.argv.includes('--carry')
  ? Number(process.argv[process.argv.indexOf('--carry') + 1])
  : 1;
const carry = Number.isFinite(carryArg) && carryArg >= 0 && carryArg <= 1 ? carryArg : 1;
if (carry !== carryArg) {
  // LOUD, NOT QUIET, for `--walls`' reason: a mistyped `--carry` that silently recorded the
  // default would produce two identical recordings and an argument about what they showed.
  process.stdout.write(`--carry "${String(process.argv[process.argv.indexOf('--carry') + 1])}" is not a number in 0..1; recording at 1
`);
}
const outDir = process.argv.includes('--out')
  ? String(process.argv[process.argv.indexOf('--out') + 1])
  : join(process.cwd(), 'recording');

const content = loadContent();
const world = createWorld(seed, content);
const scenarioAt = createScenario(content, world.grid);
// THE SPRITE REFERENCES THE GAME PASSES, not an empty map standing in for them. It returns
// nothing today (no shipped table declares a sprite) and that is exactly why it was easy to
// substitute — the substitution is invisible until the day it is not, which is the same shape
// as the withheld demand curve above.
const scene = createScene(content, loadSpriteRefs());
const cache = createValidityCache();
/**
 * HOW EVERY GUEST GOT FROM ONE TICK TO THE NEXT (G-047b), fed from the same two worlds
 * `stepTick` produces below — which is the browser's `observe(before, after)` hook, spelled out
 * in a loop that has both worlds in hand anyway.
 *
 * IT IS OBSERVED ON EVERY TICK, NOT ONLY ON RECORDED ONES, because a record describes the move
 * INTO a tick: skipping the ticks between two frames at `--every 240` would leave the recorded
 * frame describing a move 240 ticks long, and `pathBetween`'s cost bound is the STEP's (two
 * cells N ticks apart span O(N^2) lattice cells). Observing every tick keeps every lookup the
 * one it is correct for.
 */
const motion = createMotion();

mkdirSync(outDir, { recursive: true });

/** A census line per frame, so a description of the recording rests on counts. */
function census(current: World, floor: number): string {
  const view = viewFor(current, floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
  const frame = scene.build(current, view, motion, carry);
  const figures = frame.shapes.filter((item) => item.kind === 'figure');
  const tints = new Map<string, number>();
  let hollow = 0;
  for (const figure of figures) {
    if (figure.kind !== 'figure') continue;
    tints.set(hex(figure.tint), (tints.get(hex(figure.tint)) ?? 0) + 1);
    if (!figure.filled) hollow += 1;
  }
  const facings = new Map<string, number>();
  for (const figure of figures) {
    if (figure.kind !== 'figure') continue;
    facings.set(figure.facing, (facings.get(figure.facing) ?? 0) + 1);
  }
  return [
    `tick ${current.tick}`,
    `floor ${floor}`,
    `shapes ${frame.shapes.length}`,
    `rooms ${frame.report.rooms}`,
    `invalid ${frame.report.invalidRooms}`,
    `guests-here ${figures.length}`,
    `hollow ${hollow}`,
    `elsewhere ${frame.report.guestsElsewhere}`,
    // BOTH COUNTS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS. The first is what the picture is
    // marked with; the second is world-wide, so a silent floor can be told apart from a silent
    // hotel — the split `elsewhere` above already makes.
    `unwalkable ${frame.report.unwalkable}/${motion.unwalkable}`,
    `tints ${[...tints.entries()].map(([k, v]) => `${k}x${v}`).join(',') || 'none'}`,
    `facings ${[...facings.entries()].map(([k, v]) => `${k}x${v}`).join(',') || 'none'}`,
  ].join('  ');
}

let current = world;
const written: { readonly file: string; readonly caption: string }[] = [];
const entrance = entranceCell(current.grid);

/**
 * ==========================================================================================
 * THE MOST GUESTS ANY RECORDED FRAME CONTAINED, WORLD-WIDE — the input to the refusal at the
 * foot of this file. It is `here + elsewhere`, which is the CAPTION'S OWN TWO NUMBERS and
 * therefore exactly `world.guests.list.length` (`scene.ts` counts a guest as `elsewhere` iff
 * its floor is not the drawn one). The check reads what the picture says, not a second census
 * that could disagree with it.
 * ==========================================================================================
 */
let peakGuests = 0;
let peakAtTick = -1;

for (let tick = 0; tick <= ticks; tick += 1) {
  if (tick % every === 0) {
    for (const floor of floorsOf(current)) {
      const view = viewFor(current, floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
      const frame = scene.build(current, view, motion, carry);
      const caption =
        `tick ${current.tick} · floor ${floor} · walls ${walls} · bodies at ` +
        `${(current.tick - 1 + carry).toFixed(2)} · ${frame.report.rooms} rooms ` +
        `(${frame.report.invalidRooms} invalid) · ${guestsOnFloor(current, floor)} guests here · ` +
        `${frame.report.guestsElsewhere} elsewhere · ${frame.report.unwalkable} no walk drawn · ` +
        `scale ${view.scale.toFixed(2)}`;
      // THE POSITION IS IN THE FILENAME, so three recordings of one tick can sit in one
      // directory and a report can name the frame it is describing.
      // THE MOMENT IS IN THE FILENAME BESIDE THE POSITION, for the reason the position is:
      // several recordings of one tick sit in one directory and a report has to be able to name
      // the frame it is describing. `c100` is `--carry 1`, which is every frame written before
      // G-047b — so a filename says which arm it came from without opening it.
      const file =
        `t${String(current.tick).padStart(6, '0')}-f${floor < 0 ? `m${-floor}` : floor}` +
        `-${walls}-c${String(Math.round(carry * 100)).padStart(3, '0')}.svg`;
      writeFileSync(join(outDir, file), frameSvg(frame.shapes, frame.labels, caption), 'utf8');
      written.push({ file, caption });
      const inWorld = guestsOnFloor(current, floor) + frame.report.guestsElsewhere;
      if (inWorld > peakGuests) {
        peakGuests = inWorld;
        peakAtTick = current.tick;
      }
    }
    process.stdout.write(`${census(current, entrance.floor)}\n`);
  }
  if (tick === ticks) break;
  const before = current;
  current = stepTick(current, content, scenarioAt(current.tick), cache);
  observeMotion(motion, content, before, current);
}

// THE RUN'S OWN SUMMARY, printed rather than inferred from the pictures.
const finalView = viewFor(current, entrance.floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
process.stdout.write(`\nfloors: ${floorsOf(current).join(', ')}\n`);
process.stdout.write(`corridors declared: ${current.corridors.length}\n`);
process.stdout.write(`frames written: ${written.length} in ${outDir}\n`);
process.stdout.write(`final view scale on floor ${finalView.floor}: ${finalView.scale.toFixed(3)}\n`);

// A CONTACT SHEET, and it is a `<img>` grid rather than a viewer. No controls, no script, no
// state — see this file's header. It exists so a human can see a whole run at once instead of
// opening forty files.
const sheet = [
  '<!doctype html><meta charset="utf-8"><title>HotelSim recording</title>',
  `<body style="margin:0;background:${hex(BACKGROUND)};color:#c8cfda;font:12px ui-monospace,monospace">`,
  '<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px">',
  ...written.map(
    (entry) =>
      `<figure style="margin:0"><img src="${entry.file}" style="width:100%;display:block" />` +
      `<figcaption style="padding:4px 2px">${escape(entry.caption)}</figcaption></figure>`,
  ),
  '</div></body>',
].join('\n');
writeFileSync(join(outDir, 'contact-sheet.html'), sheet, 'utf8');

// ==========================================================================================
// THE RECORDER REFUSES A RECORDING WITH NO GUEST IN IT (added after G-051b broke this file).
//
// WHAT THIS CHECKS, IN ONE LINE: at least one recorded frame contained at least one guest,
// anywhere in the world. Nothing about how many, where, or for how long.
//
// WHY THERE IS NO NUMBER TO DERIVE. §2.1 requires a gate threshold to be sourceable from a
// stated requirement, and the way to satisfy that here is to have no threshold: the predicate
// is `> 0`. "Some guests" would need a derivation, would be a claim about the demand curve
// rather than about the instrument, and would go stale the next time the curve moved.
//
// WHY IT LIVES IN THE RECORDER RATHER THAN IN A TEST OVER A SHORT RECORDING. Three reasons,
// and the first is the one that decided it:
//
//   1. IT COVERS THE RECORDING THAT WAS ACTUALLY TAKEN. A WATCH is recorded at whatever
//      `--seed`, `--ticks`, `--every` and `--walls` the observer typed. A test can only pin
//      ONE invocation; this fires on every one of them, including the combinations no test
//      will ever enumerate. The break being repaired here was found by a human running the
//      recorder, and this is that human, mechanised.
//   2. A TEST COULD NOT SIT WHERE IT WOULD NEED TO. `vitest.config.ts` excludes `apps/**`
//      ("apps/game is playtested, not unit tested"), and `.dependency-cruiser.cjs`'s
//      `tools-may-reach-only-pure-view-modules` forbids anything under `tools/` importing
//      anything under `apps/` except `view/{palette,iso,depth}.ts`. So a test would have to
//      SPAWN this script as a subprocess from `tools/` — a multi-second child added to the I4
//      row, which `vitest.config.ts` documents going red five times from contention alone.
//   3. IT ADDS NO SURFACE. §9 makes "the recorder acquiring features" a stop condition. This
//      is a comparison against two numbers the caption already prints; no flag, no file, no
//      option, nothing a person has to know about until it fires.
//
// IT WRITES EVERYTHING FIRST AND FAILS AFTERWARDS, DELIBERATELY. The empty frames ARE the
// evidence of the emptiness, and a recorder that deleted them would leave the next person
// with a non-zero exit and nothing to look at.
//
// THE ONE INVOCATION THIS REFUSES THAT A PERSON MIGHT MEAN: `--ticks 0`. That records a single
// frame at tick 0, which is BEFORE the tick that applies the seed commands, so it has no rooms
// and no guests and it fails here. That is the right answer rather than an edge case to
// special-case — one pre-seed frame is not a recording of the game running, and this file's
// header claims to record the game.
//
// AND IT PRINTS ITS READING ON THE GREEN PATH TOO, because a check that only speaks when it
// fails is a check nobody can tell is still connected (ADR-0007).
// ==========================================================================================
if (peakGuests > 0) {
  process.stdout.write(`guests: peak ${peakGuests} in one frame, at tick ${peakAtTick}\n`);
} else {
  // Assembled as lines and joined, rather than as one string full of escapes. This is the
  // message a person reads at the exact moment their instrument has told them nothing.
  // The rating is derived HERE rather than above, so the happy path pays nothing for it.
  const rating = starRatingOf(current.entities, current.grid, current.corridors, current.stairs, content);
  const why = [
    '',
    `NO GUEST APPEARS IN ANY OF THE ${written.length} FRAMES JUST WRITTEN, and the count is`,
    'WORLD-WIDE rather than per-floor, so this is not the camera and not the floor. A recording',
    'of an empty hotel is the instrument reporting nothing while looking fine.',
    '',
    `  demand curve injected: ${content.content.demand !== undefined}`,
    `  star rating at tick ${current.tick}: ${rating.stars}${rating.stars === UNRATED ? ' — UNRATED, and an unrated hotel earns nobody' : ''}`,
    '',
    'Both have to hold for anyone to arrive: the curve is what turns a rating into parties, and',
    'the rating is what the curve is indexed by. If the curve is missing, this script is loading',
    "content through something other than `apps/game/src/content.ts` — see this file's imports.",
    '',
  ];
  process.stdout.write(why.join('\n'));
  process.exitCode = 1;
}

