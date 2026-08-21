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
  stepTick,
} from '@hotelsim/sim';
import type { World } from '@hotelsim/sim';
import { loadContent } from '../../../tools/headless/src/content-loader.js';
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
const outDir = process.argv.includes('--out')
  ? String(process.argv[process.argv.indexOf('--out') + 1])
  : join(process.cwd(), 'recording');

const content = loadContent();
const world = createWorld(seed, content);
const scenarioAt = createScenario(content, world.grid);
const scene = createScene(content, new Map<string, string>());
const cache = createValidityCache();

mkdirSync(outDir, { recursive: true });

/** A census line per frame, so a description of the recording rests on counts. */
function census(current: World, floor: number): string {
  const view = viewFor(current, floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
  const frame = scene.build(current, view);
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
    `tints ${[...tints.entries()].map(([k, v]) => `${k}x${v}`).join(',') || 'none'}`,
    `facings ${[...facings.entries()].map(([k, v]) => `${k}x${v}`).join(',') || 'none'}`,
  ].join('  ');
}

let current = world;
const written: { readonly file: string; readonly caption: string }[] = [];
const entrance = entranceCell(current.grid);

for (let tick = 0; tick <= ticks; tick += 1) {
  if (tick % every === 0) {
    for (const floor of floorsOf(current)) {
      const view = viewFor(current, floor, SHIPPED_ORIENTATION, CANVAS_WIDTH, CANVAS_HEIGHT, walls);
      const frame = scene.build(current, view);
      const caption =
        `tick ${current.tick} · floor ${floor} · walls ${walls} · ${frame.report.rooms} rooms ` +
        `(${frame.report.invalidRooms} invalid) · ${guestsOnFloor(current, floor)} guests here · ` +
        `${frame.report.guestsElsewhere} elsewhere · scale ${view.scale.toFixed(2)}`;
      // THE POSITION IS IN THE FILENAME, so three recordings of one tick can sit in one
      // directory and a report can name the frame it is describing.
      const file = `t${String(current.tick).padStart(6, '0')}-f${floor < 0 ? `m${-floor}` : floor}-${walls}.svg`;
      writeFileSync(join(outDir, file), frameSvg(frame.shapes, frame.labels, caption), 'utf8');
      written.push({ file, caption });
    }
    process.stdout.write(`${census(current, entrance.floor)}\n`);
  }
  if (tick === ticks) break;
  current = stepTick(current, content, scenarioAt(current.tick), cache);
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
