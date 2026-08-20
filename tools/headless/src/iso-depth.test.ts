// THE ISOMETRIC PROJECTION AND ITS DEPTH ORDER, PINNED (G-035).
//
//   pnpm exec vitest run iso-depth
//
// ============================================================================
// WHY THIS FILE EXISTS, AND IT IS AN EXIT CRITERION RATHER THAN A COURTESY.
//
// ADR-0047 A3, in the ruling's own words: **"ACCEPTED, AND IT GETS A TEST RATHER THAN A
// DEBUGGING SESSION."** Depth sorting is the classic isometric bug — a near thing drawn
// before a far one, once, at one camera position, in a screenshot nobody kept — and it is
// debugged visually forever unless the ordering is a function somebody can call.
//
// It is also the one part of the render layer where `HOTELSIM.md` §3's "the render layer is
// playtested, not unit tested" does NOT settle the question. §3 is about whether a PICTURE
// reads; this is arithmetic over integers, and the precedent for testing it from here is
// already in the tree: `palette.contrast.test.ts` and `palette.reserved-hue.test.ts` both
// import a dependency-free module out of `apps/game` and drive it. `view/iso.ts` and
// `view/depth.ts` import no Pixi, no DOM and no world, for exactly this reason.
//
// WHAT IT DOES NOT CLAIM. It does not claim the hotel LOOKS right — that is the WATCH, and
// ADR-0013 says an agent cannot discharge it. It claims that the order the painter is handed
// is the order the projection implies, and that the prohibition on multi-tile footprints is
// enforced by something that throws.
// ============================================================================

import { describe, expect, it } from 'vitest';

import {
  ASSET_SCALE,
  cornerOf,
  edgeOf,
  farSidesOf,
  fromView,
  ORIENTATIONS,
  SHIPPED_ORIENTATION,
  SIDES,
  TILE_HEIGHT,
  TILE_WIDTH,
  toView,
  viewTileAt,
  WALL_HEIGHT,
  tileCentre,
} from '../../../apps/game/src/view/iso.js';
import type { Orientation, Side } from '../../../apps/game/src/view/iso.js';
import {
  assertSingleTile,
  createCollector,
  depthOf,
  LAYER,
  LAYER_ORDER,
  sortDrawables,
} from '../../../apps/game/src/view/depth.js';
import type { Drawable, LayerIndex } from '../../../apps/game/src/view/depth.js';

/** The tile range every geometric arm below is driven over. Small, and it includes negatives. */
const COLUMNS = [-2, -1, 0, 1, 2, 3];
const ROWS = [-2, -1, 0, 1, 2, 3];

describe('the tile dimensions are LOCKED and the wall height is PROVISIONAL', () => {
  it('is 2:1, at 128 by 64 logical pixels', () => {
    // ADR-0047 A2, accepted with the derivation §2.1 demands. The atlas depends on these, so
    // they are settled before any asset exists — which is exactly why they are asserted here
    // rather than left as two constants nobody compares.
    expect(TILE_WIDTH).toBe(128);
    expect(TILE_HEIGHT).toBe(64);
    expect(TILE_WIDTH).toBe(2 * TILE_HEIGHT);
  });

  it('is authored at 2x for high-DPI', () => {
    expect(ASSET_SCALE).toBe(2);
  });

  it('states the wall-height derivation — one grid unit — and does not claim it is settled', () => {
    // THE DERIVATION IS PINNED; THE DECISION IS NOT. At 2:1 a tile's screen height is the
    // projection of one grid unit of depth, so one grid unit of HEIGHT is the same number.
    // This asserts the arithmetic held. **It does not assert the number is right**, because
    // wall height is a PERCEPTUAL property and ADR-0013 says a perceptual criterion needs a
    // perceptual check — a human looking at a floor. ADR-0047's amendment rules it provisional
    // for exactly this goal: ship it, look at it, then lock it.
    //
    // So when a human says the walls are too tall, THIS ASSERTION IS THE ONE THAT MOVES, and
    // it moves with the constant. It is here to stop the number drifting by accident, not to
    // defend it.
    expect(WALL_HEIGHT).toBe(TILE_HEIGHT);
  });
});

describe('the projection round-trips, at EVERY orientation', () => {
  it('toView and fromView are exact inverses', () => {
    // ROTATION-CAPABLE, ONE ORIENTATION SHIPPED (ADR-0047 A5). The whole value of that
    // decision is that tile addressing stays rotation-agnostic, and the way a mirrored axis
    // goes wrong is a HALF-TILE offset that only appears once somebody rotates the camera.
    // Driving all four now is what makes rotation a feature rather than a rewrite.
    for (const orientation of ORIENTATIONS) {
      for (const column of COLUMNS) {
        for (const row of ROWS) {
          const view = toView(column, row, orientation);
          expect(fromView(view.u, view.v, orientation)).toEqual({ column, row });
        }
      }
    }
  });

  it('a point inside a tile resolves back to that tile, at every orientation', () => {
    // `viewTileAt` is the inverse used by the click path. Sampled at nine points across each
    // tile rather than at its centre alone: a hit test that is right at the middle and wrong
    // at the corners is a hit test that builds in the wrong room a quarter of the time.
    const insets = [0.2, 0.5, 0.8];
    for (const orientation of ORIENTATIONS) {
      for (const column of COLUMNS) {
        for (const row of ROWS) {
          const view = toView(column, row, orientation);
          for (const du of insets) {
            for (const dv of insets) {
              const point = cornerOf(view.u + du, view.v + dv);
              expect(viewTileAt(point.x, point.y)).toEqual({ u: view.u, v: view.v });
            }
          }
        }
      }
    }
  });

  it('a tile centre is half a tile below its top corner and exactly one tile wide', () => {
    const top = cornerOf(0, 0);
    const centre = tileCentre(0, 0);
    expect(centre.y - top.y).toBe(TILE_HEIGHT / 2);
    const right = cornerOf(1, 0);
    const left = cornerOf(0, 1);
    expect(right.x - left.x).toBe(TILE_WIDTH);
  });
});

describe('TWO FAR WALLS, and the rule is a function of orientation', () => {
  it('the shipped orientation draws NORTH and WEST', () => {
    // ADR-0047 A4: "draw the two far walls (north and west), leave south and east open, so you
    // can see into rooms". This is that sentence, executed.
    expect([...farSidesOf(SHIPPED_ORIENTATION)].sort()).toEqual(['north', 'west']);
  });

  it('every orientation draws exactly two, and never a pair of opposites', () => {
    // A pair of OPPOSITE walls would be a box seen edge-on with no corner: the picture would
    // have no depth and half of every room would still be hidden. Two ADJACENT far sides is
    // what makes a prism read as a prism.
    const opposite: Readonly<Record<Side, Side>> = { north: 'south', south: 'north', east: 'west', west: 'east' };
    for (const orientation of ORIENTATIONS) {
      const far = farSidesOf(orientation);
      expect(far).toHaveLength(2);
      const [first, second] = far;
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      if (first === undefined || second === undefined) continue;
      expect(opposite[first]).not.toBe(second);
    }
  });

  it('rotating the camera rotates which walls are far — all four pairs are distinct', () => {
    // The interaction A4 names ("if the camera rotates, *far* rotates too") stated as a
    // property rather than as a promise: four orientations, four different pairs.
    const pairs = ORIENTATIONS.map((orientation) => [...farSidesOf(orientation)].sort().join('+'));
    expect(new Set(pairs).size).toBe(ORIENTATIONS.length);
  });

  it('both far edges meet at the tile TOP corner, and neither near edge does', () => {
    // The geometric statement behind "far": the two edges that meet at the corner furthest
    // from the camera. If this ever stopped holding, walls would be drawn on the near edges
    // and the player would be looking at the back of a closed box.
    for (const orientation of ORIENTATIONS) {
      const far = new Set<Side>(farSidesOf(orientation));
      const top = cornerOf(0, 0);
      for (const side of SIDES) {
        const [a, b] = edgeOf(0, 0, side, orientation);
        const touchesTop = (a.x === top.x && a.y === top.y) || (b.x === top.x && b.y === top.y);
        expect(touchesTop, `${side} at orientation ${orientation}`).toBe(far.has(side));
      }
    }
  });
});

/** A payload that says which tile and which layer it came from, so a failure is readable. */
type Mark = { readonly tile: string; readonly layer: LayerIndex };

const drawable = (depth: number, layer: LayerIndex, seq: number, tile: string): Drawable<Mark> => ({
  depth,
  layer,
  seq,
  payload: { tile, layer },
});

describe('DEPTH SORTING — the classic isometric bug, pinned rather than watched for', () => {
  it('sorts by depth first: a FARTHER tile is drawn entirely before a NEARER one', () => {
    // The bug in one sentence: something near drawn before something far, so the far thing
    // paints over it. Larger `u + v` is nearer the camera and must come LAST.
    const far = 0;
    const near = 1;
    const items: Drawable<Mark>[] = [
      drawable(near, LAYER.floor, 0, 'near'),
      drawable(far, LAYER.overlay, 1, 'far'),
      drawable(near, LAYER.wall, 2, 'near'),
      drawable(far, LAYER.floor, 3, 'far'),
    ];
    const order = sortDrawables(items).map((item) => item.payload.tile);
    expect(order).toEqual(['far', 'far', 'near', 'near']);
  });

  it('a whole diagonal sorts back to front, and nothing near precedes anything far', () => {
    // Driven over the real tile range through `depthOf`, so this exercises the projection's
    // own depth rather than a number the test made up.
    const items: Drawable<Mark>[] = [];
    let seq = 0;
    for (const column of COLUMNS) {
      for (const row of ROWS) {
        for (const layer of LAYER_ORDER) {
          items.push(drawable(depthOf(column, row, SHIPPED_ORIENTATION), LAYER[layer], seq, `${column},${row}`));
          seq += 1;
        }
      }
    }
    // Shuffled deterministically so the input order cannot be what makes the output right.
    const shuffled = [...items].sort((a, b) => ((a.seq * 7919) % 101) - ((b.seq * 7919) % 101));
    const sorted = sortDrawables(shuffled);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1];
      const current = sorted[i];
      if (previous === undefined || current === undefined) continue;
      expect(previous.depth).toBeLessThanOrEqual(current.depth);
    }
  });

  it('within one tile the layers run floor, wall, item, guest, overlay', () => {
    // THE EXPLICIT WITHIN-TILE LAYER INDEX (ADR-0047 A3). "The order I happened to push them
    // in" is not an order, and a guest that steps behind the wall of its OWN tile is a bug
    // with no reproduction.
    const items = [...LAYER_ORDER]
      .reverse()
      .map((layer, i) => drawable(0, LAYER[layer], i, 'one'));
    const order = sortDrawables(items).map((item) => item.payload.layer);
    expect(order).toEqual(LAYER_ORDER.map((layer) => LAYER[layer]));
  });

  it('the layer names and their order are declared once', () => {
    expect(LAYER_ORDER).toEqual(['floor', 'wall', 'item', 'guest', 'overlay']);
  });

  it('breaks the last tie by INSERTION ORDER, explicitly', () => {
    // Stability without relying on the engine's sort being stable — it is, since ES2019, but a
    // tie broken by a specification promise is a tie nobody can read in the source.
    const items = [3, 1, 2, 0].map((seq) => drawable(0, LAYER.item, seq, `seq${seq}`));
    expect(sortDrawables(items).map((item) => item.payload.tile)).toEqual(['seq0', 'seq1', 'seq2', 'seq3']);
  });

  it('does not reorder the caller’s array', () => {
    const items = [drawable(2, LAYER.floor, 0, 'b'), drawable(1, LAYER.floor, 1, 'a')];
    sortDrawables(items);
    expect(items.map((item) => item.payload.tile)).toEqual(['b', 'a']);
  });

  it('the DEPTH ROTATES WITH THE CAMERA — it is view space, not column plus row', () => {
    // If `depthOf` were written as `column + row` it would look correct forever at the shipped
    // orientation and be exactly backwards at orientation 2. This is the arm that separates
    // the two, and it is the reason `depth.ts` refuses to spell `column + row`.
    const a = { column: 0, row: 0 };
    const b = { column: 3, row: 0 };
    const shipped = depthOf(a.column, a.row, 0) - depthOf(b.column, b.row, 0);
    const rotated = depthOf(a.column, a.row, 2) - depthOf(b.column, b.row, 2);
    expect(shipped).toBeLessThan(0);
    expect(rotated).toBeGreaterThan(0);
  });

  it('the collector assigns the sequence itself and empties on take', () => {
    const collector = createCollector<string>();
    collector.add(depthOf(1, 0, SHIPPED_ORIENTATION), LAYER.guest, 'guest on 1,0');
    collector.add(depthOf(0, 0, SHIPPED_ORIENTATION), LAYER.wall, 'wall on 0,0');
    collector.add(depthOf(0, 0, SHIPPED_ORIENTATION), LAYER.floor, 'floor on 0,0');
    expect(collector.size()).toBe(3);
    expect(collector.take()).toEqual(['floor on 0,0', 'wall on 0,0', 'guest on 1,0']);
    // Emptied, so a frame cannot inherit the previous frame's shapes — which would be the
    // render layer holding state across a frame boundary.
    expect(collector.size()).toBe(0);
    expect(collector.take()).toEqual([]);
  });
});

describe('MULTI-TILE ITEMS ARE FORBIDDEN, and the prohibition THROWS', () => {
  it('accepts exactly one tile', () => {
    expect(() => assertSingleTile([{ floor: 0, column: 0, row: 0 }], 'room 1')).not.toThrow();
  });

  it('refuses two tiles, naming the subject and the count', () => {
    // ADR-0047 A3: "that prohibition is a check, not a comment — otherwise the first bed that
    // spans two tiles is a visual bug nobody can reproduce from a save". A thing spanning two
    // tiles has two depths and no single correct position in the order above.
    expect(() =>
      assertSingleTile([{ floor: 0, column: 0, row: 0 }, { floor: 0, column: 1, row: 0 }], 'room 7 (bedroom)'),
    ).toThrow(/room 7 \(bedroom\) occupies 2 tiles/u);
  });

  it('refuses zero tiles too, because an unplaced thing has no depth either', () => {
    expect(() => assertSingleTile([], 'room 3')).toThrow(/occupies 0 tiles/u);
  });

  it('says WHY, so the next reader does not have to find the ADR first', () => {
    let message = '';
    try {
      assertSingleTile([1, 2], 'x');
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain('two depths and no correct place in the draw order');
  });
});

/** Named so the type import above is load-bearing rather than decorative. */
const shippedIsAnOrientation: Orientation = SHIPPED_ORIENTATION;

describe('the shipped orientation is one of the four', () => {
  it('is orientation 0', () => {
    expect(shippedIsAnOrientation).toBe(0);
    expect(ORIENTATIONS).toContain(SHIPPED_ORIENTATION);
  });
});
