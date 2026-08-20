// PRIMITIVES AS SVG (G-035) — the recorder's paint step, in its own file.
//
// SEPARATE FROM `record-frames.ts` BECAUSE MORE THAN ONE THING DRAWS A FRAME. The recorder
// walks a scenario; an evidence probe may want a single frame of a world it constructed. One
// SVG writer means those two cannot disagree about what a primitive looks like — the same
// argument `paint.ts` and this file already answer to each other with (`figure.ts`: one
// silhouette, two painters).
//
// IT IS NOT SHIPPED TO A BROWSER. `scripts/` is Node-only and has its own tsconfig; nothing
// in `src/` imports it.

import { figureOutline, figureParts } from '../src/view/figure.js';
import { BACKGROUND } from '../src/view/palette.js';
import { shade } from '../src/view/primitives.js';
import type { Primitive } from '../src/view/primitives.js';

/** The frame a recording is drawn at. A window size, not a bound: nothing compares to it. */
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;

/** A packed colour as `#rrggbb`. */
export const hex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

const attr = (name: string, value: string | number | undefined): string =>
  value === undefined ? '' : ` ${name}="${value}"`;

const escape = (text: string): string =>
  text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;');

/** `points="x,y x,y …"` from a flat list. */
const pointsOf = (flat: readonly number[]): string => {
  const pairs: string[] = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push(`${(flat[i] ?? 0).toFixed(2)},${(flat[i + 1] ?? 0).toFixed(2)}`);
  return pairs.join(' ');
};

/**
 * One primitive as SVG.
 *
 * THE FIGURE IS THE ONE THAT MATTERS AND IT IS THE ONE THAT COULD DRIFT. `paint.ts` rasterises
 * `figureParts` into a greyscale texture and lets Pixi multiply the tint; this fills the same
 * polygons with `shade(tint, grey)`, which is the same multiply written out. One silhouette,
 * one brightness scale, two painters — a second silhouette here would let the recording and
 * the screen disagree about what was watched, which is the one thing a WATCH surface may not
 * do.
 */
function svgOf(item: Primitive): string {
  if (item.kind === 'poly') {
    return (
      `<polygon points="${pointsOf(item.points)}"` +
      attr('fill', item.fill === undefined ? 'none' : hex(item.fill)) +
      attr('fill-opacity', item.alpha) +
      (item.stroke === undefined
        ? ''
        : attr('stroke', hex(item.stroke.colour)) +
          attr('stroke-width', item.stroke.width) +
          attr('stroke-opacity', item.stroke.alpha)) +
      ' />'
    );
  }
  if (item.kind === 'rect') {
    return (
      `<rect x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" width="${Math.max(0, item.w).toFixed(2)}" height="${Math.max(0, item.h).toFixed(2)}"` +
      attr('fill', item.fill === undefined ? 'none' : hex(item.fill)) +
      attr('fill-opacity', item.alpha) +
      (item.stroke === undefined
        ? ''
        : attr('stroke', hex(item.stroke.colour)) +
          attr('stroke-width', item.stroke.width) +
          attr('stroke-opacity', item.stroke.alpha)) +
      ' />'
    );
  }
  if (item.kind === 'line') {
    return (
      `<line x1="${item.x1.toFixed(2)}" y1="${item.y1.toFixed(2)}" x2="${item.x2.toFixed(2)}" y2="${item.y2.toFixed(2)}"` +
      attr('stroke', hex(item.colour)) +
      attr('stroke-width', item.width) +
      attr('stroke-opacity', item.alpha) +
      ' />'
    );
  }
  if (item.kind === 'text') {
    const anchor = item.anchorX === undefined || item.anchorX === 0 ? 'start' : item.anchorX >= 1 ? 'end' : 'middle';
    const baseline = item.anchorY === undefined || item.anchorY === 0 ? 'hanging' : item.anchorY >= 1 ? 'alphabetic' : 'middle';
    return (
      `<text x="${item.x.toFixed(2)}" y="${item.y.toFixed(2)}" font-family="monospace" font-size="${item.size}"` +
      attr('font-weight', item.bold === true ? 'bold' : undefined) +
      ` fill="${hex(item.colour)}" text-anchor="${anchor}" dominant-baseline="${baseline}">${escape(item.text)}</text>`
    );
  }
  const parts = figureParts(item.facing)
    .map((part) => `<polygon points="${pointsOf(part.points)}" fill="${hex(shade(item.tint, part.grey))}" />`)
    .join('');
  const body = item.filled
    ? parts
    : `<g opacity="0.3">${parts}</g><polygon points="${pointsOf(figureOutline())}" fill="none" stroke="${hex(item.tint)}" stroke-width="2" />`;
  return `<g transform="translate(${item.x.toFixed(2)} ${item.y.toFixed(2)}) scale(${item.scale.toFixed(3)})">${body}</g>`;
}

export function frameSvg(shapes: readonly Primitive[], labels: readonly Primitive[], caption: string): string {
  const body = [...shapes, ...labels].map(svgOf).join('\n');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}">`,
    `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${hex(BACKGROUND)}" />`,
    body,
    `<text x="12" y="${CANVAS_HEIGHT - 12}" font-family="monospace" font-size="14" fill="#c8cfda">${escape(caption)}</text>`,
    '</svg>',
  ].join('\n');
}

