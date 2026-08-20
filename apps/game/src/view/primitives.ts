// WHAT A FRAME IS, AS DATA (G-035).
//
// ---------------------------------------------------------------------------------------
// THE SCENE PRODUCES A LIST OF PRIMITIVES. A PAINTER TURNS THEM INTO PIXI. THOSE ARE TWO
// FILES, AND THE SPLIT IS THE REASON THIS GOAL CAN PRODUCE EVIDENCE AT ALL.
//
// `HOTELSIM.md` §3: the render layer "is not unit tested, it is playtested". That stands.
// What this split buys is different and is G-035's own exit criterion: **a recording exists
// and somebody describes what it shows.** A `Graphics` object is not inspectable outside a
// browser; a list of polygons with colours is. `tools/headless/src/record-frames.ts` steps
// the real simulation, calls the real `buildScene`, and writes the real primitives out as
// SVG — so the thing watched is the thing shipped, not a second drawing of it.
//
// IT IS ALSO WHAT MAKES THE DEPTH ORDER TESTABLE (ADR-0047 A3, "a test rather than a
// debugging session"): the order of this array IS the draw order.
//
// NOTHING HERE IS SIMULATION STATE. A primitive is computed from a `World` and thrown away;
// call `buildScene` twice with the same world and the same view and you get the same list.
// ---------------------------------------------------------------------------------------

/** A stroke: width in logical pixels, a packed 0xRRGGBB colour, and an optional alpha. */
export type Stroke = {
  readonly width: number;
  readonly colour: number;
  readonly alpha?: number;
};

/** A filled and/or stroked shape's paint. Both are optional; neither is a default. */
export type Paint = {
  readonly fill?: number;
  readonly alpha?: number;
  readonly stroke?: Stroke;
};

/** Which way a figure is looking. Four facings ship; eight is a render setting (ADR-0047 A6). */
export type Facing = 'ne' | 'nw' | 'se' | 'sw';

/** Every facing, ascending, so an exhaustive walk has a stated order. */
export const FACINGS: readonly Facing[] = Object.freeze(['ne', 'nw', 'se', 'sw']);

export type Primitive =
  /** A closed polygon: `points` is `[x0, y0, x1, y1, …]`. Tiles and walls are these. */
  | ({ readonly kind: 'poly'; readonly points: readonly number[] } & Paint)
  | ({ readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number } & Paint)
  | {
      readonly kind: 'line';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly width: number;
      readonly colour: number;
      readonly alpha?: number;
    }
  /**
   * A GUEST, DRAWN FROM THE GREYSCALE FIGURE AND TINTED AT RUNTIME (ADR-0047 A6).
   *
   * The tint is the load-bearing half and it is not aesthetic: the renderer encodes guest
   * STATE in colour — the need being served, the lodging colour while resting, grey while
   * idle — and a sprite with baked colour destroys a visual language the simulation already
   * feeds. So the artwork is greyscale, the colour arrives here, and Pixi's `tint` does the
   * multiply for free.
   *
   * `filled` is the second, ORTHOGONAL mark inherited from G-030 and kept deliberately
   * separate from the tint: colour says what the guest is DOING, fill says whether it HAS A
   * BED. They used to be one chain, and a roomless guest that happened to be eating drew
   * pixel-identical to a housed one.
   */
  | {
      readonly kind: 'figure';
      readonly x: number;
      readonly y: number;
      readonly scale: number;
      readonly facing: Facing;
      readonly tint: number;
      readonly filled: boolean;
    }
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly colour: number;
      readonly bold?: boolean;
      /** 0 left, 1 right. Defaults to left. */
      readonly anchorX?: number;
      /** 0 top, 1 bottom. Defaults to top. */
      readonly anchorY?: number;
    };

/** Multiply a packed colour by a 0..1 greyscale value — what a tint does, in arithmetic. */
export function shade(colour: number, factor: number): number {
  const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));
  const r = clamp(((colour >> 16) & 0xff) * factor);
  const g = clamp(((colour >> 8) & 0xff) * factor);
  const b = clamp((colour & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
