// PRIMITIVES INTO PIXI (G-035).
//
// ---------------------------------------------------------------------------------------
// THE ONLY FILE IN THE VIEW THAT KNOWS WHAT PIXI IS.
//
// `scene.ts` produces a list of primitives; this turns them into a scene graph. The split is
// what lets `record-frames.ts` draw the SAME frame with no browser, which is how this goal
// produces the evidence its exit criteria ask for — and it is what lets `iso.ts` and
// `depth.ts` be driven by a test.
//
// IT HOLDS NO SIMULATION STATE. What survives a frame here is a pool of display objects and a
// pair of generated textures: the same class of thing as a camera position or a scroll offset.
// Nothing is read back, and nothing here is authoritative about anything.
//
// ---------------------------------------------------------------------------------------
// THE GUEST IS A GREYSCALE TEXTURE WITH A RUNTIME TINT, AND THAT IS THE MECHANISM ADR-0047 A6
// ASKS FOR RATHER THAN AN IMPLEMENTATION DETAIL.
//
// The figure is rasterised ONCE per facing, in greyscale, at `ASSET_SCALE` resolution — the
// same 2x the real atlas will be authored at. Every guest on screen is a `Sprite` of one of
// those four textures with `tint` set to what `guestTintOf` returned. Pixi multiplies.
//
// So the renderer keeps encoding guest state in COLOUR while the artwork carries none, which
// is the property the ruling calls load-bearing: "a sprite with baked colour destroys a visual
// language the sim already feeds". When the real 3D-rendered sprites land they are greyscale
// masks in an atlas and this file changes at ONE line — where the texture comes from.
// ---------------------------------------------------------------------------------------

import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { figureBox, figureOutline, figureParts } from './figure.js';
import { ASSET_SCALE } from './iso.js';
import { FACINGS } from './primitives.js';
import type { Facing, Primitive } from './primitives.js';
import { TextPool } from './text.js';

/**
 * The box a figure is rasterised into, and where the feet sit inside it.
 *
 * PINNED EXPLICITLY RATHER THAN MEASURED FROM THE GEOMETRY'S BOUNDS. A texture whose size is
 * whatever the shapes happened to cover has an anchor nobody can compute, and the failure is a
 * guest floating half a tile above the floor — the exact class of bug an isometric view is
 * debugged visually for. With a stated box, the anchor is arithmetic.
 */
const BOX = figureBox();
/** One pixel of air, so antialiasing at the rim is not cut off by the texture edge. */
const BOX_PAD = 1;
const BOX_WIDTH = Math.ceil(BOX.maxX - BOX.minX) + 2 * BOX_PAD;
const BOX_HEIGHT = Math.ceil(BOX.maxY - BOX.minY) + 2 * BOX_PAD;
/** Where the figure's origin sits inside the box, in the box's own pixels. */
const ORIGIN_X = -BOX.minX + BOX_PAD;
const ORIGIN_Y = -BOX.minY + BOX_PAD;
/** The feet, as a fraction of the box. `anchor` is in 0..1 of the sprite's own size. */
const FEET_X = ORIGIN_X / BOX_WIDTH;
const FEET_Y = ORIGIN_Y / BOX_HEIGHT;

/** How visible a HOLLOW guest's body is — the one with no bed. See `guest.ts`. */
const HOLLOW_ALPHA = 0.3;

export type Painter = {
  readonly container: Container;
  /**
   * Draw one frame. Everything not used is hidden, never destroyed.
   *
   * THREE LISTS, NOT ONE, AND THE SPLIT IS ABOUT WHAT MAY COVER WHAT. `world` is the
   * depth-sorted building; `overlay` is the PLAYER'S OWN MARKS — the ghost of a queued
   * command, the flash of a refusal — which must sit above the guests or the very move the
   * player is trying to read is hidden by whoever happens to be standing there; `labels` is
   * text, above everything.
   */
  readonly paint: (
    world: readonly Primitive[],
    overlay: readonly Primitive[],
    labels: readonly Primitive[],
  ) => void;
};

/**
 * Rasterise the four facings, in greyscale, once.
 *
 * WHITE MEANS "SHOW THE TINT AT FULL STRENGTH" and black means "show none of it", which is
 * what a multiply does. `figure.ts` authors each part's brightness on exactly that scale, so
 * this loop is a straight translation and there is no second opinion about what a part's
 * `grey` means.
 */
function rasteriseFigures(renderer: Renderer): ReadonlyMap<Facing, Texture> {
  const textures = new Map<Facing, Texture>();
  for (const facing of FACINGS) {
    const g = new Graphics();
    // The box itself, transparent, so the generated texture is exactly `BOX_WIDTH` x
    // `BOX_HEIGHT` whatever the shapes cover. `frame` below says the same thing to the
    // renderer; both are stated because a texture that quietly changes size moves every
    // guest on screen.
    g.rect(0, 0, BOX_WIDTH, BOX_HEIGHT).fill({ color: 0xffffff, alpha: 0 });
    for (const part of figureParts(facing)) {
      const points: number[] = [];
      for (let i = 0; i < part.points.length; i += 2) {
        points.push((part.points[i] ?? 0) + ORIGIN_X, (part.points[i + 1] ?? 0) + ORIGIN_Y);
      }
      const level = Math.round(Math.max(0, Math.min(1, part.grey)) * 0xff);
      g.poly(points).fill((level << 16) | (level << 8) | level);
    }
    textures.set(
      facing,
      renderer.generateTexture({
        target: g,
        resolution: ASSET_SCALE,
        frame: new Rectangle(0, 0, BOX_WIDTH, BOX_HEIGHT),
      }),
    );
    g.destroy();
  }
  return textures;
}

/** The hollow guest's outline, as a reusable path. Built from the same silhouette. */
function outlineGraphics(): Graphics {
  const g = new Graphics();
  const points: number[] = [];
  const outline = figureOutline();
  for (let i = 0; i < outline.length; i += 2) {
    points.push(outline[i] ?? 0, outline[i + 1] ?? 0);
  }
  g.poly(points).stroke({ width: 2, color: 0xffffff });
  return g;
}

export function createPainter(renderer: Renderer): Painter {
  const container = new Container();
  /** The building, interleaved: batches of `Graphics` with `Sprite`s between them. */
  const world = new Container();
  const top = new Graphics();
  const labels = new TextPool();
  container.addChild(world);
  container.addChild(top);
  container.addChild(labels.container);

  const textures = rasteriseFigures(renderer);
  const batchPool: Graphics[] = [];
  const spritePool: Sprite[] = [];
  const outlinePool: Graphics[] = [];

  const paint = (
    list: readonly Primitive[],
    overlayList: readonly Primitive[],
    labelList: readonly Primitive[],
  ): void => {
    top.clear();
    labels.begin();
    // The children are re-added in draw order every frame; nothing is destroyed, so the pools
    // survive and the allocation cost is one array of references.
    world.removeChildren();
    let batches = 0;
    let sprites = 0;
    let outlines = 0;

    // ---------------------------------------------------------------------------------
    // THE ARRAY ORDER IS THE DRAW ORDER, AND THAT IS THE WHOLE OF THE DEPTH SORT AT THIS
    // LEVEL. `depth.ts` decided it; this loop obeys it and adds nothing.
    //
    // IT IS INTERLEAVED, AND THAT IS A REPAIR RATHER THAN A REFINEMENT. The first version
    // put every shape in one `Graphics` and every guest in a container ABOVE it, so a guest
    // was never occluded by anything. THAT DIVERGED FROM THE RECORDING, which walks the same
    // list in order and therefore had the true order — and a WATCH surface whose recording
    // and whose screen disagree about what was watched is the one thing this layer may not
    // be. Found by looking at the SVG the recorder wrote, which is the recorder doing its
    // job on its first run.
    //
    // AND THE CASE IS ORDINARY, NOT EXOTIC: in a one-row plot the rooms sit on a diagonal,
    // so the far wall of the room in FRONT crosses the tile behind it. A guest standing in
    // the back room is genuinely partly behind that wall — which is what seeing into a room
    // from the open near sides MEANS, and is exactly the reading the provisional wall height
    // exists to be looked at for.
    // ---------------------------------------------------------------------------------
    const nextBatch = (): Graphics => {
      let batch = batchPool[batches];
      if (batch === undefined) {
        batch = new Graphics();
        batchPool.push(batch);
      }
      batch.clear();
      batches += 1;
      world.addChild(batch);
      return batch;
    };

    let batch = nextBatch();
    for (const item of list) {
      if (item.kind !== 'figure') {
        drawShape(batch, item);
        continue;
      }
      const texture = textures.get(item.facing);
      if (texture === undefined) continue;
      let sprite = spritePool[sprites];
      if (sprite === undefined) {
        sprite = new Sprite(texture);
        spritePool.push(sprite);
      }
      sprite.texture = texture;
      sprite.anchor.set(FEET_X, FEET_Y);
      sprite.scale.set(item.scale);
      sprite.position.set(item.x, item.y);
      sprite.tint = item.tint;
      sprite.alpha = item.filled ? 1 : HOLLOW_ALPHA;
      sprites += 1;
      world.addChild(sprite);
      if (!item.filled) {
        // Hollow: the page shows through the body and the SILHOUETTE carries the colour.
        // A large area rather than a hairline, which is the reading G-030 settled on.
        let outline = outlinePool[outlines];
        if (outline === undefined) {
          outline = outlineGraphics();
          outlinePool.push(outline);
        }
        outline.scale.set(item.scale);
        outline.position.set(item.x, item.y);
        outline.tint = item.tint;
        outlines += 1;
        world.addChild(outline);
      }
      // Anything after a figure goes in a NEW batch, so it can cover the figure.
      batch = nextBatch();
    }

    for (const item of overlayList) {
      if (item.kind !== 'figure' && item.kind !== 'text') drawShape(top, item);
    }

    for (const item of labelList) {
      if (item.kind === 'text') {
        // `exactOptionalPropertyTypes` is on, so an absent option is an ABSENT KEY rather
        // than an explicit `undefined`. Spelling it out is the honest way to say "this
        // primitive did not ask for an anchor" without inventing a default here.
        labels.text(item.text, item.x, item.y, {
          size: item.size,
          colour: item.colour,
          ...(item.bold === undefined ? {} : { bold: item.bold }),
          ...(item.anchorX === undefined ? {} : { anchorX: item.anchorX }),
          ...(item.anchorY === undefined ? {} : { anchorY: item.anchorY }),
        });
      } else {
        drawShape(top, item);
      }
    }

    labels.end();
  };

  return { container, paint };
}

/** One non-figure primitive. Fill first, then stroke, so an outline is never half-covered. */
export function drawShape(g: Graphics, item: Primitive): void {
  if (item.kind === 'poly') {
    const points: number[] = [...item.points];
    if (item.fill !== undefined) g.poly(points).fill({ color: item.fill, alpha: item.alpha ?? 1 });
    if (item.stroke !== undefined) {
      g.poly(points).stroke({ width: item.stroke.width, color: item.stroke.colour, alpha: item.stroke.alpha ?? 1 });
    }
    return;
  }
  if (item.kind === 'rect') {
    if (item.fill !== undefined) g.rect(item.x, item.y, item.w, item.h).fill({ color: item.fill, alpha: item.alpha ?? 1 });
    if (item.stroke !== undefined) {
      g.rect(item.x, item.y, item.w, item.h).stroke({
        width: item.stroke.width,
        color: item.stroke.colour,
        alpha: item.stroke.alpha ?? 1,
      });
    }
    return;
  }
  if (item.kind === 'line') {
    g.moveTo(item.x1, item.y1)
      .lineTo(item.x2, item.y2)
      .stroke({ width: item.width, color: item.colour, alpha: item.alpha ?? 1 });
  }
  // A `text` or `figure` reaching here is a caller error rather than a shape: both are drawn
  // by the painter above, which is the only thing that owns a pool.
}
