// SHAPE — THE SECOND DISCRIMINATOR, BECAUSE THE FIRST ONE RAN OUT OF ROOM (G-077, ADR-0112).
//
// ---------------------------------------------------------------------------------------
// WHAT FORCED THIS FILE, IN ARITHMETIC RATHER THAN IN TASTE.
//
// `palette.ts` separates a role's content ids by LUMINANCE, and that is a bounded resource:
// N colours spread across a band of span S can do no better than a worst pairwise contrast of
// S^(1/(N-1)), and WCAG contrast tops out at 21:1 for black on white. Measured on the shipped
// band, seven ids is the most that clears `MIN_CONTRAST_WITHIN_ROLE`; the widest band that
// can PHYSICALLY exist gives twelve; twenty-eight item types would need a band of span 1.19e3,
// which does not exist. E-017 raised it, and the human ruled (ADR-0112 §1) that luminance
// stops being the SOLE discriminator — rejecting both "lower the floor" and "compare fewer
// things".
//
// SO A DRAWN THING HAS A FORM AS WELL AS A COLOUR, AND THE PAIR IS ITS MARK. Two ids that sit
// on the same luminance rung are told apart by SHAPE, which is a resource this file can extend
// by writing another polygon — where luminance could only be extended by inventing a brighter
// white.
//
// ADR-0014 (human) is what makes this a shipping answer rather than a stopgap: *"the first
// playable build ships placeholder art — flat coloured shapes, clear silhouettes."* A flat
// coloured shape with a clear silhouette is exactly what is below.
// ---------------------------------------------------------------------------------------
//
// IT IMPORTS NOTHING, AND THAT IS A FENCE CONDITION RATHER THAN A STYLE. `.dependency-cruiser.cjs`
// admits four modules from `apps/game/src/view` into `tools/`, and admits them because none of
// them can reach Pixi or a DOM. This one is arithmetic over numbers, like `iso.ts`, and
// `tools/headless/src/view-fence.test.ts` asserts that against the bytes on disk.
//
// WHY THE GEOMETRY IS HERE AND THE ASSIGNMENT IS IN `palette.ts`. The assignment — which id
// gets which form — is a property of a content set and belongs beside the ladder that assigns
// the colour. The geometry is a property of the FORM and belongs beside the other forms, where
// somebody adding a ninth can see the eight it has to look different from.
//
// EVERY FORM IS SOLID. A hollow variant (a ring against a disc, a frame against a block) would
// have doubled the vocabulary for free, and it is deliberately absent: a hollow shape is drawn
// as a stroke, a stroke has a width, and a width that reads at twelve logical pixels does not
// read at six. Eight solid silhouettes are eight shapes that survive being small. The capacity
// this leaves is stated in `palette.ts` and it is not close to binding.

/**
 * The shapes a mark can take, and the ORDER IS THE ASSIGNMENT ORDER — `palette.ts` hands them
 * out from the front, so the first four are the ones the shipped item catalogue actually
 * draws and they are the four that are least like each other: a square, a round, a triangle
 * and a diamond.
 *
 * NO NAME HERE IS A CONTENT ID (ADR-0003). These are shapes, not things: a `wedge` is not a
 * kind of furniture, and no JSON file may ever mention one. Which id is drawn as which form
 * falls out of the content's own ordering, so a designer renaming a room type changes the
 * picture without ever naming a shape.
 */
export type Form = 'block' | 'disc' | 'wedge' | 'gem' | 'cross' | 'bar' | 'post' | 'ell';

/** Every form, in assignment order. Frozen: this order is a decision, not an accident. */
export const FORMS: readonly Form[] = Object.freeze([
  'block',
  'disc',
  'wedge',
  'gem',
  'cross',
  'bar',
  'post',
  'ell',
] as const);

/**
 * The proportions the shapes below are built from, as fractions of the mark's half-size.
 *
 * NAMED RATHER THAN INLINED so the two that must agree can be seen to agree: `BAR_THICKNESS`
 * is what makes `bar` and `post` the same shape turned ninety degrees, which is the whole
 * reason they read as a pair rather than as two rectangles somebody chose.
 *
 * `OCTAGON_INSET` is `tan(22.5°)`, which is what makes the eight sides of `disc` equal — the
 * regular octagon, not an approximation of one. A rounder shape than that needs a curve, and a
 * curve is a texture rather than a polygon.
 */
const OCTAGON_INSET = Math.SQRT2 - 1;
const BAR_THICKNESS = 0.38;
const CROSS_ARM = 0.34;

/**
 * The outline of `form`, as a closed polygon centred on `(cx, cy)` and `size` across.
 *
 * FLAT POINTS — `[x0, y0, x1, y1, …]` — because that is what `Primitive`'s `poly` takes, and a
 * shape that has to be converted at the call site is a shape somebody will convert differently
 * the second time.
 *
 * THE SHAPE IS SCREEN-AXIS-ALIGNED AND NOT PROJECTED, which is a choice and not an oversight.
 * A form drawn into the tile's 2:1 diamond would shear every silhouette by the same transform
 * — a square would become a diamond and `block` and `gem` would collide, which is the one
 * thing this file exists to prevent. The mark is a LABEL standing on the floor, like the badge
 * and the occupancy pips beside it, rather than a footprint painted on it.
 */
export function outlineOf(form: Form, cx: number, cy: number, size: number): readonly number[] {
  const h = size / 2;
  const at = (x: number, y: number): readonly [number, number] => [cx + x * h, cy + y * h];
  const flatten = (points: readonly (readonly [number, number])[]): readonly number[] =>
    points.flatMap(([x, y]) => [x, y]);
  const k = OCTAGON_INSET;
  const b = BAR_THICKNESS;
  const a = CROSS_ARM;
  switch (form) {
    case 'block':
      return flatten([at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)]);
    case 'disc':
      return flatten([at(-k, -1), at(k, -1), at(1, -k), at(1, k), at(k, 1), at(-k, 1), at(-1, k), at(-1, -k)]);
    case 'wedge':
      return flatten([at(0, -1), at(1, 1), at(-1, 1)]);
    case 'gem':
      return flatten([at(0, -1), at(1, 0), at(0, 1), at(-1, 0)]);
    case 'cross':
      return flatten([
        at(-a, -1),
        at(a, -1),
        at(a, -a),
        at(1, -a),
        at(1, a),
        at(a, a),
        at(a, 1),
        at(-a, 1),
        at(-a, a),
        at(-1, a),
        at(-1, -a),
        at(-a, -a),
      ]);
    case 'bar':
      return flatten([at(-1, -b), at(1, -b), at(1, b), at(-1, b)]);
    case 'post':
      return flatten([at(-b, -1), at(b, -1), at(b, 1), at(-b, 1)]);
    case 'ell':
      // The one asymmetric silhouette, and it is asymmetric on purpose: seven shapes with a
      // vertical mirror line all read as "a blob" when they get small, and a shape with a
      // corner missing does not.
      return flatten([at(-1, -1), at(0, -1), at(0, 0), at(1, 0), at(1, 1), at(-1, 1)]);
  }
}
