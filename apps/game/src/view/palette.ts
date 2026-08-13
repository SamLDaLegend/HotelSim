// COLOUR — rebuilt on LUMINANCE after the first WATCH came back negative (G-030).
//
// ---------------------------------------------------------------------------------------
// WHAT THE HUMAN SAW, AND WHY THE FIRST VERSION FAILED.
//
//   "Reads quite difficult I would say. Lots of washout of bars and whilst I can visualise
//    it to an extent, it's not easy."
//
// The first palette was twelve hues hashed by content id. It was measured after the fact:
// **32 of its 66 pairs fell under 1.3:1 contrast, and its worst pair — 0x50907c against
// 0x6f7fd0 — had IDENTICAL luminance, 1.00:1.** It varied HUE while holding LUMINANCE
// nearly constant, and hue discrimination is weak at cell scale and weaker still for a
// colour-blind viewer. The shapes separated from the ground and not from each other.
//
// THE HASH WAS NOT THE DEFECT AND IS NOT WHAT CHANGED. FNV-1a into a wheel was well argued
// and its stability property was real. THE WHEEL WAS THE DEFECT.
//
// AND THE ARITHMETIC SAYS NO WHEEL OF THAT SIZE COULD HAVE WORKED, which is the part worth
// keeping. Contrast ratio is (L1+0.05)/(L2+0.05), so N colours spread across a luminance
// band of span S can do no better than a minimum pairwise ratio of S^(1/(N-1)). Measured
// against this background, in the band where every colour still clears 3:1 against it:
//
//     N =  3   4   5   6   8   12
//   max = 2.53 1.86 1.59 1.45 1.30 1.18      <- the CEILING, not a choice
//
// **A twelve-entry palette cannot exceed 1.18:1, which is below the ratio the failed build
// washed out at.** So the fix is not a better twelve; it is fewer colours per question.
// ---------------------------------------------------------------------------------------
//
// THE SCHEME: ONE LADDER PER ROLE, SIZED TO THE CONTENT, ASSIGNED BY RANK.
//
//   LUMINANCE CARRIES SEPARATION. Each role's ids are spread geometrically across the band,
//   which maximises the minimum pairwise ratio for that count — there is no arrangement of
//   N colours in a band with a better worst pair, so this is optimal rather than tuned.
//   HUE CARRIES IDENTITY, spread evenly around the circle, and carries nothing that
//   legibility depends on.
//
//   ROLE-SCOPED, because room types are compared with room types. Four rooms in one ladder
//   get 1.86:1; eleven ids in one ladder would get 1.20:1 and read as the failed build did.
//
//   RANK, NOT HASH, and this is a TRADE rather than an improvement — it is stated because
//   the property being given up was argued for in the previous version and in
//   `tools/viewer/viewer.js`'s PALETTE block. A hash into a small ladder collides: four ids into four
//   slots collide 91% of the time, and a collision means two room types are the same colour,
//   which is worse than the disease. Rank is collision-free and deterministic. THE COST IS
//   THAT ADDING A ROOM TYPE RE-DERIVES THE LADDER AND EVERY EXISTING ROOM CHANGES COLOUR,
//   so a `JOURNAL.md` note saying "the green room served nobody" can be invalidated by a
//   content edit. That was the argument for hashing, and it is a real cost being paid
//   deliberately: a stable vocabulary for notes is worth nothing while nobody can read the
//   screen. The thing that buys back both is a colour field in content, which is a
//   `packages/content` change and is parked.
//
// EVERY NUMBER HERE IS COMPUTED, NOT PICKED. `tools/headless/src/palette.contrast.test.ts`
// builds this palette from the SHIPPED content and asserts the pairwise floor over the ids
// actually drawn — so the guarantee survives someone adding a thirteenth entry, and fails
// loudly rather than washing out quietly.

import { needTypesInOrder } from '@hotelsim/sim';
import type { BoundContent } from '@hotelsim/sim';

/** The page behind everything. Every drawn colour is held clear of it by `BAND_MIN_L`. */
export const BACKGROUND = 0x0d0f12;

/**
 * WCAG 2.2 SC 1.4.11 (Non-text Contrast): a graphical object needed to understand the
 * content must reach 3:1 against adjacent colours. A room is exactly that, so every drawn
 * colour clears 3:1 against the background — which is what sets the bottom of the band.
 */
export const MIN_CONTRAST_VS_BACKGROUND = 3;

/**
 * THE FLOOR, AND IT TRACES TO A MEASUREMENT RATHER THAN TO TASTE (§2.1: a threshold must be
 * derivable from a stated requirement).
 *
 * The build the human watched and could not read had 32 of 66 pairs below 1.3:1 and a worst
 * pair at 1.00:1. So the requirement is: NO PAIR MAY BE AS CLOSE AS THE PAIRS THAT WERE
 * MEASURED ON THE BUILD A HUMAN COULD NOT READ. It is not a claim about what is comfortable
 * — only about what is known to fail — and the test reports the achieved figure beside it so
 * a reader can see the margin rather than just the verdict.
 */
export const MIN_CONTRAST_WITHIN_ROLE = 1.3;

/** sRGB channel to linear light. The WCAG definition, not an approximation of it. */
function linearise(channel: number): number {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) to 1 (white). WCAG 2.2. */
export function relativeLuminance(colour: number): number {
  const r = linearise(((colour >> 16) & 0xff) / 0xff);
  const g = linearise(((colour >> 8) & 0xff) / 0xff);
  const b = linearise((colour & 0xff) / 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). Order-independent. */
export function contrastRatio(a: number, b: number): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return la > lb ? (la + 0.05) / (lb + 0.05) : (lb + 0.05) / (la + 0.05);
}

/** The lowest luminance that still clears `MIN_CONTRAST_VS_BACKGROUND` against the page. */
const BAND_MIN_L =
  MIN_CONTRAST_VS_BACKGROUND * (relativeLuminance(BACKGROUND) + 0.05) - 0.05;
/** The top of the band. Short of pure white, which is reserved for marks that must shout. */
const BAND_MAX_L = 0.95;

/**
 * The best minimum pairwise contrast achievable for `count` colours in the band.
 *
 * Exported because it is the honest answer to "why is this the number": it is a ceiling
 * imposed by arithmetic, not a target somebody chose, and the test asserts the ladder
 * reaches it rather than merely clearing the floor.
 */
export function bestAchievableContrast(count: number): number {
  if (count < 2) return Infinity;
  const span = (BAND_MAX_L + 0.05) / (BAND_MIN_L + 0.05);
  return span ** (1 / (count - 1));
}

/** RGB in 0..1, for mixing. */
type Rgb = { readonly r: number; readonly g: number; readonly b: number };

/** A fully saturated hue, `degrees` around the circle. */
function hueRgb(degrees: number): Rgb {
  const h = (((degrees % 360) + 360) % 360) / 60;
  const x = 1 - Math.abs((h % 2) - 1);
  const [r, g, b] =
    h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
  return { r: r ?? 0, g: g ?? 0, b: b ?? 0 };
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
const pack = ({ r, g, b }: Rgb): number =>
  (Math.round(Math.max(0, Math.min(1, r)) * 0xff) << 16) |
  (Math.round(Math.max(0, Math.min(1, g)) * 0xff) << 8) |
  Math.round(Math.max(0, Math.min(1, b)) * 0xff);

/**
 * One hue, darkened towards black or lightened towards white until it hits `targetL`.
 *
 * `t` runs black -> hue -> white and luminance rises monotonically along it, so a bisection
 * lands on the target. Bisection rather than an inverse formula because the gamma curve has
 * no clean inverse through a hue mix, and forty halvings is exact to well under one 8-bit
 * step. Reaching a HIGH luminance therefore desaturates — which is what any palette must do,
 * and is why the light end reads as pastel rather than as neon.
 */
function atLuminance(hueDegrees: number, targetL: number): number {
  const hue = hueRgb(hueDegrees);
  const at = (t: number): Rgb =>
    t < 0.5
      ? { r: mix(0, hue.r, t * 2), g: mix(0, hue.g, t * 2), b: mix(0, hue.b, t * 2) }
      : { r: mix(hue.r, 1, t * 2 - 1), g: mix(hue.g, 1, t * 2 - 1), b: mix(hue.b, 1, t * 2 - 1) };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (relativeLuminance(pack(at(mid))) < targetL) lo = mid;
    else hi = mid;
  }
  // `hi` IS RETURNED RATHER THAN THE MIDPOINT, AND IT IS NOT A ROUNDING PREFERENCE. The
  // search maintains "the packed colour at `hi` has luminance >= target"; the midpoint
  // maintains nothing, and eight-bit quantisation lands it just under about half the time.
  // The bottom rung is exactly where that matters, because its target IS the 3:1 line
  // against the background — and the first version of this function returned the midpoint
  // and put `games_room` at 2.993:1, which the contrast test refused. Landing at or above
  // every target is the property; being closest to it is not.
  return pack(at(hi));
}

/**
 * `count` colours: luminance spread geometrically across the band, hue spread evenly around
 * the circle from `hueOffset`.
 *
 * Geometric in (L + 0.05) rather than linear in L, because contrast is a RATIO of those
 * quantities — an even spread in L would bunch every pair at the light end together.
 */
function ladder(count: number, phase: number): readonly number[] {
  if (count <= 0) return [];
  const hueAt = (i: number): number => ALLOWED_HUE_START + (ALLOWED_HUE_SPAN * (i + phase)) / count;
  if (count === 1) return [atLuminance(hueAt(0), BAND_MAX_L)];
  const step = bestAchievableContrast(count);
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const targetL = (BAND_MIN_L + 0.05) * step ** i - 0.05;
    out.push(atLuminance(hueAt(i), targetL));
  }
  return out;
}

/**
 * MAGENTA IS RESERVED, AND NO LADDER MAY PRODUCE IT.
 *
 * `UNKNOWN` means "the loaded content does not define this", and it is the one colour on
 * screen that must never be mistaken for a legitimate one — a recording watched under the
 * wrong content is how a `JOURNAL.md` note comes out confidently wrong. The first version of
 * this ladder handed `hotel_cafe` the colour `#f100f1`, which is magenta to any eye that is
 * not holding a hex editor, so a perfectly ordinary café would have read as a content error.
 *
 * The arc below excludes 35 degrees either side of magenta, and `hueOf` plus the contrast
 * test assert that no produced colour lands inside it.
 */
export const RESERVED_HUE = 300;
export const RESERVED_HUE_HALF_WIDTH = 35;
const ALLOWED_HUE_START = RESERVED_HUE + RESERVED_HUE_HALF_WIDTH;
const ALLOWED_HUE_SPAN = 360 - 2 * RESERVED_HUE_HALF_WIDTH - 10;

/**
 * Where each role's hues start inside the allowed arc, as a fraction of one step — so a room
 * and a need at the same rank are different colours, and every role stays inside the arc.
 * Identity only: no legibility claim rests on these, and moving one changes nothing the
 * contrast test asserts.
 */
const ROLE_HUE_PHASE = { room: 0, item: 0.33, need: 0.66 } as const;

/** Hue in degrees, 0..360. Undefined for a pure grey, which is reported as 0. */
export function hueOf(colour: number): number {
  const r = ((colour >> 16) & 0xff) / 0xff;
  const g = ((colour >> 8) & 0xff) / 0xff;
  const b = (colour & 0xff) / 0xff;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  if (chroma === 0) return 0;
  const h = max === r ? ((g - b) / chroma) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** How far a hue is from the reserved one, the short way round the circle. */
export function hueDistanceFromReserved(colour: number): number {
  const delta = Math.abs(hueOf(colour) - RESERVED_HUE) % 360;
  return delta > 180 ? 360 - delta : delta;
}

export type Palette = {
  readonly roomColour: (contentId: string) => number;
  readonly itemColour: (contentId: string) => number;
  readonly needColour: (contentId: string) => number;
  /** Ink that reads against `fill`, chosen by contrast rather than by taste. */
  readonly inkOn: (fill: number) => number;
  /** Every colour this palette will ever hand out, by role — the test's subject. */
  readonly byRole: ReadonlyMap<string, ReadonlyMap<string, number>>;
};

/** Ascending, explicit, locale-free — the `compareIds` discipline from `content.ts`. */
const ascending = (ids: readonly string[]): readonly string[] =>
  [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function assign(ids: readonly string[], phase: number): ReadonlyMap<string, number> {
  const ordered = ascending(ids);
  const colours = ladder(ordered.length, phase);
  const map = new Map<string, number>();
  ordered.forEach((id, i) => {
    const colour = colours[i];
    if (colour !== undefined) map.set(id, colour);
  });
  return map;
}

/**
 * The palette for one content set. Built once at startup; no id is named anywhere in this
 * file (ADR-0003), and a content set with more room types simply gets a longer ladder.
 */
export function createPalette(content: BoundContent): Palette {
  const rooms = assign(content.content.roomTypes.map((room) => room.id), ROLE_HUE_PHASE.room);
  // `itemTypes` is optional in `SimContent` — content from before G-009 had none, and the
  // shape still says so. An absent table is an empty ladder, not a crash.
  const items = assign((content.content.itemTypes ?? []).map((item) => item.id), ROLE_HUE_PHASE.item);
  const needs = assign(needTypesInOrder(content).map((need) => need.id), ROLE_HUE_PHASE.need);
  return {
    roomColour: (id) => rooms.get(id) ?? UNKNOWN,
    itemColour: (id) => items.get(id) ?? UNKNOWN,
    needColour: (id) => needs.get(id) ?? UNKNOWN,
    inkOn: (fill) => (contrastRatio(fill, INK.paper) >= contrastRatio(fill, INK.soot) ? INK.paper : INK.soot),
    byRole: new Map([
      ['room', rooms],
      ['item', items],
      ['need', needs],
    ]),
  };
}

/** A content id this palette has no colour for. Loud, never quiet. */
export const UNKNOWN = 0xff00ff;

/** The building's furniture, none of it content-dependent. */
export const INK = {
  background: BACKGROUND,
  /** Below street level. Warmer and darker than the sky, so grade is readable at a glance. */
  earth: 0x1a1512,
  earthBand: 0x221b16,
  /** Above street level, behind the building. */
  sky: 0x11151c,
  skyBand: 0x151a22,
  /** The plot's floor divisions. */
  floorLine: 0x2b3444,
  /** Street level. The heaviest line on screen. */
  grade: 0xc79a4a,
  /** The building's own edge, drawn round the built extent. */
  silhouette: 0x8fa2bd,
  gutter: 0x0a0c10,
  gutterText: 0x93a2b6,
  entrance: 0xf0c250,
  soot: 0x080a0d,
  paper: 0xf4f7fb,
  alarm: 0xff5a5f,
  guestIdle: 0x9aa7b8,
  occupancyPip: 0xffffff,
  /**
   * THE PLAYER'S OWN MARKS (G-031a), and they are three because the player's move has three
   * states the simulation can put it in: waiting, accepted, refused.
   *
   * `intent` is the cell under the pointer and the ghost of a queued command; `ok` is a
   * build or demolish the simulation accepted; refusal reuses `alarm`, deliberately, because
   * a refused build and an invalid room are the same message to a player — this cost money
   * or it will, and it is not working.
   *
   * Neither new hue lands in the reserved magenta arc (300 +/- 35): `intent` is ~218 degrees
   * and `ok` ~145. They are INK rather than palette entries, so no content ladder derives
   * them and `palette.contrast.test.ts` is untouched — it enumerates `byRole` and the two
   * inks it names.
   */
  intent: 0x8fb4ff,
  ok: 0x5fd08a,
} as const;
