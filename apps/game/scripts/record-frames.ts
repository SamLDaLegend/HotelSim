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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  createValidityCache,
  createWorld,
  entranceCell,
  hashState,
  run,
  solvencyOf,
  starRatingOf,
  stepTick,
  UNRATED,
} from '@hotelsim/sim';
import type { Command, ScheduledCommand, World } from '@hotelsim/sim';
/**
 * ==========================================================================================
 * THE READER FOR THE DOCUMENT THE GAME'S "export session" BUTTON WRITES (G-074).
 *
 * THIS IS AN `apps/` -> `tools/` IMPORT, AND THAT DIRECTION IS THE ONE NOBODY FENCED.
 * `.dependency-cruiser.cjs`'s `tools-may-reach-only-pure-view-modules` runs the OTHER way — it
 * stops `tools/` reaching into `apps/`, so that a test cannot drag Pixi and a DOM into the
 * sim-side test tree. Nothing there and nothing in `check-purity.mjs` constrains this edge; the
 * only rule that could is `no-circular`, and `session-document.ts` imports one value and one
 * type from `@hotelsim/sim` and nothing else, so there is no cycle for it to make.
 *
 * AND `session-document.ts` RATHER THAN `replay.ts`, WHICH ALSO EXPORTS THESE TWO. `replay.ts`
 * imports `./content-loader.js` — the HARNESS's content path, the one this file's own header
 * spent four commits' worth of an incident getting away from. Importing it would put that
 * loader back into this file's module graph, evaluated at startup, one autocomplete from a call
 * site. `session-document.ts` is the piece both consumers need and it reaches no filesystem and
 * binds no content at all: `parseSession` takes TEXT.
 *
 * WHAT IS SHARED IS THE DEFINITION OF THE FORMAT, which is the point. A second reader that
 * validated the document itself would be a second answer to "what is a session", and the day
 * `exportSession` grows a field one of them would refuse the unknown key and the other would
 * silently drop it.
 * ==========================================================================================
 */
import { assertReplayable, parseSession } from '../../../tools/headless/src/session-document.js';
import type { SessionDocument } from '../../../tools/headless/src/session-document.js';
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
import { loadContent, loadRemarkBook, loadSpriteRefs } from '../src/content.js';
import { createMotion, observeMotion } from '../src/motion.js';
// THE SAME WORDS THE HUD PRINTS (G-062), from the same function. A recorded frame is the
// surface of record for a WATCH, and a caption that described the rating in its own phrasing
// would be a second opinion about the thing the player is actually shown.
import { describeRating } from '../src/rating.js';
// AND THE SAME LINES THE FEED PRINTS (G-066b), from the same formatter, for the reason above
// it: a recorded frame has no HUD, and a caption that phrased a guest's review in its own
// words would be a second opinion about the thing the player is actually shown.
import { describeFeed, REMARKS_SHOWN } from '../src/remarks.js';
// AND THE SAME THREE FACTS THE WARNING PANEL PRINTS (G-070), from the same formatter, for the
// reason above it: a recorded frame has no HUD, and ADR-0013 requires a perceptual finding to
// carry a FRAME REFERENCE. A caption that phrased the lose state in its own words would be a
// second opinion about the thing the player is actually shown.
import { describeSolvency, solvencyLine } from '../src/solvency.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, escape, frameSvg, hex } from './svg.js';
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

/** `--name value` as a STRING, or null when the flag is absent. `arg`'s sibling. */
function textArg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return null;
  const value = process.argv[at + 1];
  // A flag with no value is an error rather than an absence: `--session` alone is somebody
  // asking for a session and getting the scenario, which is the quiet wrong answer.
  if (value === undefined || value.startsWith('--')) throw new Error(`--${name} needs a value`);
  return value;
}

/**
 * ==========================================================================================
 * FILM A SESSION SOMEBODY PLAYED, INSTEAD OF THE SCENARIO THIS FILE DRIVES (G-074) —
 * `--session <file>`, the document the game's "export session" button wrote.
 *
 *   pnpm --filter @hotelsim/game record --
 *     --session ../../tools/headless/src/fixtures/played-session.json --every 240 --out watch
 *
 * WHY: G-073 made a played session REPLAYABLE — `pnpm sim:replay` reproduces its `finalHash` —
 * and that proves the run happened without showing anybody what it looked like. ADR-0013 says a
 * "reads as stupid" finding needs a FRAME REFERENCE, and *"the guests were doing something weird
 * around there"* is exactly the class a hash cannot settle. So the substitution is the one
 * `replay.ts` already makes: the world is driven by the SESSION'S OWN COMMAND LOG instead of by
 * `createScenario`, and nothing else about this recorder moves.
 *
 * WITHOUT THE FLAG NOTHING HERE RUNS AND NOTHING BELOW CHANGES, and that is not a courtesy.
 * Every WATCH in this project is a recording taken at the default; a flag that quietly moved the
 * default would invalidate all of them at once. With no `--session`, `session` is `null`, `seed`,
 * `ticks` and the command source resolve by the expressions they always did, and the frames are
 * byte-identical — demonstrated by recording the default before and after this change and
 * comparing sha256 of every file.
 *
 * IT DOES NOT READ `frameTicks`. A recorded frame is taken at a tick the OPERATOR names, on the
 * `--every` cadence, because a WATCH is an argument about the simulation rather than about how a
 * browser's frame pacing happened to bunch up on the afternoon somebody played it.
 * ==========================================================================================
 */
const sessionPath = textArg('session');
const session: SessionDocument | null =
  sessionPath === null ? null : parseSession(readFileSync(sessionPath, 'utf8'), sessionPath);

/**
 * A SESSION BRINGS ITS OWN SCHEMA VERSION, ITS OWN SEED AND ITS OWN LENGTH, AND ALL THREE
 * CONFLICTS ARE REFUSED OUTRIGHT RATHER THAN WARNED ABOUT.
 *
 * `--walls` and `--carry` warn and fall back, because a MISSPELLING has a safe answer. These are
 * not misspellings, they are contradictions: `--seed 42 --session` asks for two different hotels,
 * and `--ticks` past the end of the log asks to film ticks the session says nothing about. Either
 * would fill a directory with frames that a report would then cite as "the session", which is
 * worse than no frames at all. `assertReplayable` is the third and it is `replay.ts`'s, shared
 * rather than restated — a document from another save schema describes commands whose meaning may
 * have moved.
 *
 * AND THEY THROW BEFORE ANYTHING IS WRITTEN, which is the opposite of the empty-recording refusal
 * at the foot of this file, for the reason that one states: there, the empty frames ARE the
 * evidence of the fault, so they are written first. Here nothing has been filmed yet.
 */
if (session !== null && sessionPath !== null) {
  assertReplayable(session, sessionPath);
  if (process.argv.includes('--seed')) {
    throw new Error(
      `--seed and --session cannot both be given: ${sessionPath} was played at seed ` +
        `${session.seed}, and the same command log under another seed is a different hotel.`,
    );
  }
  if (process.argv.includes('--ticks') && arg('ticks', session.ticks) > session.ticks) {
    throw new Error(
      `--ticks ${arg('ticks', session.ticks)} is past the end of ${sessionPath}, which is ` +
        `${session.ticks} ticks long. Beyond that the log says nothing, so the frames would not ` +
        'be this session. Give --ticks at or below its length, or drop it to film all of it.',
    );
  }
}

const seed = session === null ? arg('seed', 7) : session.seed;
const ticks = session === null ? arg('ticks', 2880) : arg('ticks', session.ticks);
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
/**
 * WHERE EACH TICK'S COMMANDS COME FROM — the scenario this file drives, or a session's log.
 *
 * THE GROUPING IS THIS FILE'S OWN AND NOT `run`'s, though `run` does the same fold in
 * `packages/sim`: it does not export it, and copying six lines is cheaper than widening the
 * simulation's surface for a recorder. THE COPY IS NOT TAKEN ON TRUST — the agreement check in
 * the frame loop below re-runs the same log through `run` and compares state hashes, so a
 * grouping that disagreed with `run`'s in any way that reached the world goes red at the first
 * filmed tick.
 */
function commandsFrom(schedule: readonly ScheduledCommand[]): (tick: number) => readonly Command[] {
  const byTick = new Map<number, Command[]>();
  for (const entry of schedule) {
    const bucket = byTick.get(entry.tick);
    if (bucket === undefined) byTick.set(entry.tick, [entry.command]);
    else bucket.push(entry.command);
  }
  const none: readonly Command[] = [];
  // Lookup only, never iterated — `run` carries the same note, for I2's reason.
  return (tick: number): readonly Command[] => byTick.get(tick) ?? none;
}
// RENAMED FROM `scenarioAt` AT G-074, because under `--session` it is not a scenario. A name
// that says "scenario" at the one call site that decides what the filmed hotel DOES is the kind
// of quiet wrongness this project keeps paying for.
const commandsAt =
  session === null ? createScenario(content, world.grid) : commandsFrom(session.commands);
if (session !== null && sessionPath !== null) {
  // THE PROVENANCE GOES ON STDOUT AND NOT IN THE CAPTION. A caption change would move what the
  // recorder DRAWS, and every frame recorded before today would stop being comparable by eye
  // with the ones taken after. The output directory and this line are what a WATCH note cites.
  process.stdout.write(
    `session ${sessionPath} - seed ${session.seed} - save v${session.saveSchemaVersion} - ` +
      `${session.ticks} ticks - ${session.commands.length} commands - ` +
      `recorded hash ${session.finalHash}\n`,
  );
}
// THE SPRITE REFERENCES THE GAME PASSES, not an empty map standing in for them. It returns
// nothing today (no shipped table declares a sprite) and that is exactly why it was easy to
// substitute — the substitution is invisible until the day it is not, which is the same shape
// as the withheld demand curve above.
const scene = createScene(content, loadSpriteRefs());
// THE BOOK THE BROWSER BINDS, through the game's own loader. Same argument as the content
// above: a second path to the remark table is a second place for the recording and the screen
// to disagree about what a guest said.
const remarkBook = loadRemarkBook(content);
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
    // THE RATING ON THE CENSUS LINE TOO, AS DIGITS. The caption carries it in words for a
    // human; this line is what a report greps, and `stars 4` is the same reading in the form
    // a count belongs in.
    `stars ${frame.report.rating.stars}`,
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

/**
 * ==========================================================================================
 * EVERY CHECK ON WHICH THIS RECORDER AND `pnpm sim:replay` REACHED DIFFERENT WORLDS (G-074).
 * Empty on the green path, and a reading is printed either way. NOT "every filmed tick": two
 * arms are folded into this one list and the second is not taken at a filmed tick.
 *
 * WHAT THIS CHECKS, IN ONE LINE: for each frame written under `--session`, the world it was
 * drawn from hashes to the same `hashState` as `run(createWorld(seed), log, tick)` — and, at the
 * session's last tick, to the `finalHash` the BROWSER recorded.
 *
 * WHY IT IS ASSERTED AND NOT ASSUMED. A frame and a hash are two claims about one session, and
 * this goal exists so that a stranger's report can be anchored to a picture. A picture drawn
 * from a world that is not the world `sim:replay` reproduces is worse than no picture: it would
 * be cited as evidence of a run that never happened that way. The two halves catch different
 * things and both are needed:
 *
 *   THE PER-TICK ARM catches this file diverging from the SHIPPED tick loop — a command grouping
 *   that dropped an entry, a `--carry` or a cache regime that reached the world, a scenario leak.
 *   Its independent arm is `run` in `packages/sim`, the same call `replaySession` makes.
 *
 *   THE FINAL-HASH ARM catches the TWO CONTENT PATHS diverging. This recorder binds content
 *   through `apps/game/src/content.ts` and `replay.ts` binds it through `content-loader.ts`;
 *   `replay.ts`'s header says at length that the agreement between them is a test rather than an
 *   assumption. Reproducing the browser's own `finalHash` here is that test taken a second time,
 *   from the OTHER host, which is the only reason this arm is worth its cost.
 *
 * IT REPORTS AT THE END AND FAILS AFTERWARDS, exactly as the empty-recording refusal below does
 * and for the reason that one states: the frames are the evidence, so they get written first.
 * ==========================================================================================
 */
const disagreements: string[] = [];

for (let tick = 0; tick <= ticks; tick += 1) {
  if (tick % every === 0) {
    for (const floor of floorsOf(current)) {
      const view = viewFor(current, floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
      const frame = scene.build(current, view, motion, carry);
      // ==================================================================================
      // THE CAPTION IS THREE LINES SINCE G-062, AND THE CENSUS LINE IS LAST.
      //
      // `frameSvg` stacks the block upward from the bottom, so the census keeps the exact
      // position it has had since G-035 and the two rating lines grow above it. That ordering
      // is what makes a frame taken today comparable, by eye, with every frame in the
      // project's recordings — the census a reader looks for is where they last saw it.
      //
      // WHY THE RATING IS IN THE PICTURE'S OWN CAPTION AND NOT ONLY IN THE BROWSER'S HUD.
      // `PARKING.md`'s item 3 sets this goal's falsification test as a claim about a FRAME:
      // *"the item dies when a viewer of `t005760-fm1` can say WHY the empty rooms are
      // there."* A HUD cell cannot discharge that — a recorded frame has no HUD. So the words
      // travel with the picture, from the same `describeRating` the HUD calls.
      // ==================================================================================
      const rating = describeRating(content, frame.report.rating);
      // WHAT THE LAST FEW DEPARTURES SAID (G-066b), NEWEST FIRST AND ABOVE THE RATING.
      //
      // It goes at the TOP of the block because `frameSvg` stacks upward from the bottom: the
      // census line keeps the exact y it has had since G-035 and the rating lines keep theirs,
      // so a frame taken today is still comparable by eye with every frame in this project's
      // recordings. An empty feed contributes no lines at all, which is why a hotel nobody has
      // left yet writes the caption it always wrote.
      const feed = describeFeed(content, remarkBook, current.recentRemarks, REMARKS_SHOWN);
      // WHETHER THIS HOTEL IS LOSING, AT THIS TICK (G-070). Above the rating and below the feed,
      // and ABSENT ENTIRELY when the hotel is not losing — `describeSolvency` returns `null` and
      // this line contributes nothing, exactly as an empty feed does. So a solvent hotel writes
      // the caption it always wrote, and a frame that carries this line is a frame in which the
      // simulation says the hotel is losing.
      const solvency = describeSolvency(solvencyOf(current, content));
      const caption = [
        ...feed.map((line) => `said ${line.score}  ${line.text}`),
        solvency === null ? '' : `losing money  ${solvencyLine(solvency)}`,
        `stars ${rating.stars} · next ${rating.next}`,
        rating.earnedBy === null ? '' : `earned by ${rating.earnedBy}`,
        `tick ${current.tick} · floor ${floor} · walls ${walls} · bodies at ` +
          `${(current.tick - 1 + carry).toFixed(2)} · ${frame.report.rooms} rooms ` +
          `(${frame.report.invalidRooms} invalid) · ${guestsOnFloor(current, floor)} guests here · ` +
          `${frame.report.guestsElsewhere} elsewhere · ${frame.report.unwalkable} no walk drawn · ` +
          `scale ${view.scale.toFixed(2)}`,
      ]
        .filter((line) => line !== '')
        .join('\n');
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
    if (session !== null) {
      // The frame's own world, and the world a replay of the same log reaches at the same tick.
      const filmed = hashState(current);
      const replayed = hashState(
        run(createWorld(session.seed, content), content, current.tick, session.commands),
      );
      if (filmed !== replayed) {
        disagreements.push(
          `tick ${current.tick}: this recording reached ${filmed}, a replay of the same log reached ${replayed}`,
        );
      }
    }
  }
  if (tick === ticks) break;
  const before = current;
  current = stepTick(current, content, commandsAt(current.tick), cache);
  observeMotion(motion, content, before, current);
}

/**
 * THE SECOND ARM: the browser's own `finalHash`, reproduced by this host.
 *
 * ONLY WHEN THE WHOLE SESSION WAS FILMED, because `finalHash` is a statement about the tick the
 * button was pressed on and about no other. A prefix recording (`--ticks` below the log's length)
 * is a legitimate thing to want and is still covered by the per-tick arm above.
 */
if (session !== null && sessionPath !== null && current.tick === session.ticks) {
  const reached = hashState(current);
  if (reached !== session.finalHash) {
    // THE MESSAGE NAMES A DISJUNCTION RATHER THAN A CAUSE, AND IT NAMES THE COMMAND THAT
    // SEPARATES THEM. The first draft read "the log and the seed agree, so what differs is the
    // content this host bound" — which the very first mutation probe falsified: dropping one
    // `spawnEntity` from the log fires this arm, and then the log is exactly what does NOT
    // agree. A failure message that asserts a cause it cannot know is ADR-0007's class in the
    // one place a reader has no other information.
    disagreements.push(
      `tick ${current.tick} (the session's last): the browser recorded ${session.finalHash} and ` +
        `this recording reached ${reached}. Either this document is no longer the one that ` +
        'produced that hash — a command edited, added or dropped — or the two hosts bound ' +
        'different content: this recorder binds through `apps/game/src/content.ts` and ' +
        '`pnpm sim:replay` binds through `tools/headless/src/content-loader.ts`. RUN ' +
        `\`pnpm sim:replay ${sessionPath}\`: if it also reaches ${reached}, the ` +
        'document moved; if it reaches the recorded hash, this host did.',
    );
  }
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
      `<figcaption style="padding:4px 2px;white-space:pre-line">${escape(entry.caption)}</figcaption></figure>`,
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
// AND IT SPEAKS ON THE GREEN PATH, for the reason the guests reading below does (ADR-0007): a
// check that only speaks when it fails is a check nobody can tell is still connected.
if (session !== null) {
  if (disagreements.length === 0) {
    process.stdout.write(
      `session: every filmed tick matches a replay of the same log` +
        `${current.tick === session.ticks ? `, and tick ${current.tick} matches the hash the browser recorded` : ''}\n`,
    );
  } else {
    process.stdout.write(
      [
        '',
        // THE COUNT NAMES ITS UNIT (§4.1) AND THE UNIT IS CHECKS and not FILMED TICKS. The two
        // arms are counted into one list and the final-hash arm is not a filmed tick — the first
        // draft said "N of the filmed ticks" and the mutation probe printed 3 for two filmed
        // ticks plus one terminal check.
        `THIS RECORDING IS NOT OF THE SESSION IT NAMES. ${disagreements.length} of its checks put`,
        'this recorder in a different world from a replay of the same session, so the frames just',
        'written cannot be cited as evidence about it — a frame and a hash are two claims about one',
        'run and they disagree.',
        '',
        ...disagreements.map((line) => `  ${line}`),
        '',
      ].join('\n'),
    );
    process.exitCode = 1;
  }
}

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

