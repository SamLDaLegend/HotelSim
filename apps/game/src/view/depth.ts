// DEPTH SORTING, AND THE ONE-TILE PROHIBITION (G-035, ADR-0047 A3).
//
// ---------------------------------------------------------------------------------------
// "ACCEPTED, AND IT GETS A TEST RATHER THAN A DEBUGGING SESSION." — ADR-0047 A3.
//
// This is the classic isometric bug: a near thing drawn before a far one, once, on one
// frame, at one camera position, in a screenshot nobody kept. It is debugged visually
// forever unless the ordering is a function somebody can call. So the ordering is a pure
// function of integers here, and `tools/headless/src/iso-depth.test.ts` drives it. No Pixi,
// no DOM, no world.
//
// THE RULE, IN FULL:
//
//   1. SORT BY DEPTH, which is `u + v` in VIEW space (`iso.ts`). Larger is nearer the
//      camera and is drawn LATER. It is view space and not `column + row` so that the
//      ordering rotates with the camera — at the shipped orientation the two are the same
//      number, which is exactly why writing `column + row` here would look correct forever
//      and be wrong the day rotation lands.
//   2. THEN BY AN EXPLICIT WITHIN-TILE LAYER INDEX: floor -> wall -> item -> guest ->
//      overlay. Explicit, because "the order I happened to push them in" is not an order,
//      and because a guest that steps behind a wall on ITS OWN TILE is a bug with no
//      reproduction.
//   3. THEN BY INSERTION SEQUENCE, so the sort is stable without depending on whether the
//      host's `Array.prototype.sort` is (it is, since ES2019 — but a tie broken by an
//      engine promise is a tie nobody can read in the source).
// ---------------------------------------------------------------------------------------

import type { Orientation } from './iso.js';
import { toView } from './iso.js';

/**
 * THE WITHIN-TILE LAYER INDEX, WRITTEN DOWN ONCE.
 *
 * The numbers are ordinals and nothing computes with them; what matters is that they are
 * declared in one place and that `LAYER_ORDER` below is derived from this object rather than
 * retyped, so a layer added to one and forgotten in the other cannot happen.
 */
export const LAYER = {
  floor: 0,
  wall: 1,
  item: 2,
  guest: 3,
  overlay: 4,
} as const;

export type LayerName = keyof typeof LAYER;
export type LayerIndex = (typeof LAYER)[LayerName];

/** The layers in drawing order, derived from `LAYER` rather than listed a second time. */
export const LAYER_ORDER: readonly LayerName[] = Object.freeze(
  (Object.keys(LAYER) as LayerName[]).sort((a, b) => LAYER[a] - LAYER[b]),
);

/** One thing to draw, with everything the ordering needs and nothing else. */
export type Drawable<T> = {
  /** `u + v` in view space. Larger is nearer the camera. */
  readonly depth: number;
  readonly layer: LayerIndex;
  /** Insertion order, assigned by `collect`. Breaks the last tie explicitly. */
  readonly seq: number;
  readonly payload: T;
};

/** Depth for a WORLD tile under one orientation. The only place `u + v` is spelled. */
export function depthOf(column: number, row: number, orientation: Orientation): number {
  const view = toView(column, row, orientation);
  return view.u + view.v;
}

/**
 * A collector: things go in with a depth and a layer, and come out sorted.
 *
 * A COLLECTOR RATHER THAN A LOOSE `sort` CALL, because the sequence number has to be
 * assigned at insertion and there is no honest way to recover it afterwards. Nothing here is
 * state that outlives a frame — `take` empties it.
 */
export type Collector<T> = {
  readonly add: (depth: number, layer: LayerIndex, payload: T) => void;
  readonly take: () => readonly T[];
  readonly size: () => number;
};

export function createCollector<T>(): Collector<T> {
  let items: Drawable<T>[] = [];
  let next = 0;
  return {
    add: (depth, layer, payload) => {
      items.push({ depth, layer, seq: next, payload });
      next += 1;
    },
    take: () => {
      const sorted = sortDrawables(items);
      items = [];
      next = 0;
      return sorted.map((item) => item.payload);
    },
    size: () => items.length,
  };
}

/**
 * The ordering itself, exported so the test drives THE comparison the renderer uses rather
 * than a retyped copy of it.
 *
 * A COPY IS RETURNED. Sorting in place would let a caller's array be reordered under it
 * between the collect and the draw, which is the shape of bug that produces one wrong frame
 * in a hundred.
 */
export function sortDrawables<T>(items: readonly Drawable<T>[]): readonly Drawable<T>[] {
  return [...items].sort(
    (a, b) => a.depth - b.depth || a.layer - b.layer || a.seq - b.seq,
  );
}

/**
 * MULTI-TILE ITEMS ARE FORBIDDEN UNTIL A GOAL HANDLES THEM, AND THIS THROWS RATHER THAN
 * SAYING SO IN A COMMENT (ADR-0047 A3, and it is the ADR's own wording: "that prohibition is
 * a check, not a comment").
 *
 * WHY IT MATTERS AT ALL: everything above sorts by ONE depth per drawable. A thing that
 * spans two tiles has two depths and no single correct position in this order — the first bed
 * that spans two tiles is a visual bug nobody can reproduce from a save, because it depends
 * on what else happens to be standing on the other tile. G-036 gives rooms player-drawn
 * footprints and G-037 scores what is in them; ONE OF THOSE GOALS OWNS SPLITTING A FOOTPRINT
 * INTO PER-TILE DRAWABLES. Until then the renderer refuses the input rather than drawing it
 * wrongly.
 *
 * IT THROWS RATHER THAN SKIPPING. A skipped room is a room the player cannot see and cannot
 * be told about, which is §6.1's "UI that cannot express a state the sim can reach" wearing
 * a shrug. A throw arrives with the entity id and the cell count, at the frame it first
 * happens.
 */
export function assertSingleTile(cells: readonly unknown[], what: string): void {
  if (cells.length === 1) return;
  throw new Error(
    `${what} occupies ${cells.length} tiles, and the isometric renderer draws one tile per drawable (ADR-0047 A3). ` +
      `Multi-tile footprints are forbidden until a goal splits them into per-tile drawables with their own depths; ` +
      `until then a room spanning two tiles has two depths and no correct place in the draw order.`,
  );
}
