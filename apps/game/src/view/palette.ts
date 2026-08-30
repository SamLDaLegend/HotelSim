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
//
// ==========================================================================================
// AND AT G-077 THE LADDER STOPPED BEING THE WHOLE ANSWER (E-017, ADR-0112 — human ruling).
//
// The arithmetic above has a second half nobody needed until twenty-eight item types landed:
// the ceiling S^(1/(N-1)) does not merely make a WHEEL of twelve impossible, IT MAKES A
// LADDER OF TWENTY-EIGHT IMPOSSIBLE TOO. Shipped span 6.0929 gives seven ids; the widest band
// that can physically exist gives twelve; twenty-eight would need a span of 1.19e3, and WCAG
// contrast tops out at 21:1. **The cap was physics, not this palette.** G-030's own note —
// "the fix is not a better twelve; it is fewer colours per question" — was the same reading
// one step short: scoping per role buys a factor, and a factor runs out.
//
// THE HUMAN'S RULING WAS OPTION (a): LUMINANCE STOPS BEING THE SOLE DISCRIMINATOR. Lowering
// the floor and narrowing the comparison population were both offered and both refused. So a
// drawn thing now has a MARK — a colour AND A FORM (`form.ts`) — and the separation claim
// moves with it:
//
//   BEFORE   every pair of ids in a role differs in luminance by at least the floor
//   NOW      every pair of ids in a role differs in FORM, or in luminance by at least the
//            floor — and ids sharing a form always differ in luminance
//
// LUMINANCE STILL GOES FIRST AND SPENDS ITSELF COMPLETELY. A role with no more ids than
// `MAX_RUNGS` gets exactly the ladder it got before this goal, to the byte: rooms and needs
// are untouched by G-077 and only the item ladder moved. Form is what happens after the free
// resource is exhausted, not instead of it.
//
// WHAT THE CAP IS NOW: `MAX_RUNGS * FORMS.length`, and it is derived rather than declared.
// It is not special-cased to items — ADR-0112 §2 rules the seven-room-type cap temporary, and
// a fix that lifted it for one role would leave M6's first new room type to raise E-017 again
// under another heading.
// ==========================================================================================

import { needTypesInOrder } from '@hotelsim/sim';
import type { BoundContent } from '@hotelsim/sim';
import { FORMS } from './form.js';
import type { Form } from './form.js';

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

/**
 * HOW MANY LUMINANCE RUNGS A LADDER MAY HAVE — the longest one whose own CEILING still clears
 * the floor, computed from the two functions above rather than written down.
 *
 * ADR-0013 §4: a gate threshold must be derivable from a stated requirement. The requirement
 * is `MIN_CONTRAST_WITHIN_ROLE`'s — no pair as close as the pairs measured on the build a
 * human could not read — and `bestAchievableContrast` is the arithmetic that says how many
 * ids that permits. Adding a rung past this point does not make the ladder slightly worse; it
 * makes EVERY pair on it worse than the floor at once, which is what the failed twelve-hue
 * wheel was.
 *
 * IT IS SEVEN ON THE SHIPPED BAND AND NOTHING SHOULD DEPEND ON THAT. Move `BACKGROUND`,
 * `MIN_CONTRAST_VS_BACKGROUND` or `BAND_MAX_L` and this follows, because the ladder is no
 * longer the only discriminator: a role that loses a rung spills into one more form instead of
 * going quietly below the floor. That is the difference G-077 bought, and it is why the E-017
 * escalation was about a number sitting on its own limit.
 */
export const MAX_RUNGS: number = (() => {
  // `bestAchievableContrast` falls monotonically towards 1 and the floor is above 1, so this
  // terminates. Two is the smallest ladder that has a pair at all.
  let rungs = 1;
  while (bestAchievableContrast(rungs + 1) > MIN_CONTRAST_WITHIN_ROLE) rungs += 1;
  return rungs;
})();

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
 * The luminance of rung `rung` of a ladder `rungs` long.
 *
 * Geometric in (L + 0.05) rather than linear in L, because contrast is a RATIO of those
 * quantities — an even spread in L would bunch every pair at the light end together. A ladder
 * of one has no pair to separate and takes the top of the band.
 */
function rungLuminance(rungs: number, rung: number): number {
  if (rungs <= 1) return BAND_MAX_L;
  return (BAND_MIN_L + 0.05) * bestAchievableContrast(rungs) ** rung - 0.05;
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

/**
 * WHICH ROLES ARE DRAWN AS A FORM AS WELL AS A COLOUR, AND IT IS NOT A PREFERENCE.
 *
 * ==========================================================================================
 * THIS IS THE ANTI-VACUITY CONDITION FOR THE WHOLE OF G-077, so it is stated here and asserted
 * in `palette.contrast.test.ts` rather than left as an understanding.
 *
 * The separation claim is now a DISJUNCTION — two ids are told apart by their forms OR by
 * their luminance. A disjunction is only as strong as its weaker branch is REAL: if a role
 * were given forms that nothing on screen ever draws, every pair in it would satisfy the
 * check by a difference the player cannot see. That is ADR-0007's class exactly, one level up
 * from a vacuous test and inside the mechanism meant to catch one.
 *
 *   `room` — `drawRoom` puts the form on the badge plate, beside the initials.
 *   `item` — `drawItems` draws the item AS its form. It is the whole mark.
 *   `need` — NOTHING DRAWS A NEED'S FORM. A need is a column in a guest's vector, three
 *            logical pixels wide, and there is no silhouette at that size. So needs are not
 *            here, they get the ladder they always got, and a content set with more need
 *            types than `MAX_RUNGS` goes RED on the contrast gate instead of passing on a
 *            form nobody draws. The gate names this file when it does.
 *
 * The tie between this list and the two functions above is checked against the bytes of
 * `scene.ts` by the contrast test, because a list of role names cannot say what a renderer
 * does with them.
 * ==========================================================================================
 */
export const ROLES_DRAWN_AS_FORMS: readonly string[] = Object.freeze(['room', 'item']);

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

/**
 * HOW ONE CONTENT ID IS DRAWN: a colour and a form. The pair is what has to be unique.
 *
 * `rung` is carried because it is the thing the contrast floor is ABOUT — two ids on the same
 * rung have (near enough) the same luminance whatever their hues, and the test says so in its
 * message rather than making a reader re-derive it from two hex values.
 */
export type Mark = {
  readonly colour: number;
  readonly rung: number;
  readonly form: Form;
};

export type Palette = {
  readonly roomColour: (contentId: string) => number;
  readonly itemColour: (contentId: string) => number;
  readonly needColour: (contentId: string) => number;
  /** The shape a room's badge glyph takes. `UNKNOWN_FORM` for an id this palette has none for. */
  readonly roomForm: (contentId: string) => Form;
  /** The shape an item is drawn as. `UNKNOWN_FORM` for an id this palette has none for. */
  readonly itemForm: (contentId: string) => Form;
  /** Ink that reads against `fill`, chosen by contrast rather than by taste. */
  readonly inkOn: (fill: number) => number;
  /** Every colour this palette will ever hand out, by role — the test's subject. */
  readonly byRole: ReadonlyMap<string, ReadonlyMap<string, number>>;
  /**
   * Every MARK this palette will ever hand out, by role. `byRole` above is this map's colour
   * column, kept as it was because half a dozen callers want a colour and nothing else.
   *
   * EVERY ROLE IS HERE, INCLUDING THE ONES NOTHING DRAWS A FORM FOR. A role outside
   * `ROLES_DRAWN_AS_FORMS` gets the SAME form for every one of its ids, so every pair in it is
   * a same-form pair and the contrast test holds it to the pre-G-077 rule — colour alone must
   * separate it — by the same expression it applies to the others. The list is what decides
   * the assignment; it is not a filter on this map.
   */
  readonly marksByRole: ReadonlyMap<string, ReadonlyMap<string, Mark>>;
};

/** Ascending, explicit, locale-free — the `compareIds` discipline from `content.ts`. */
const ascending = (ids: readonly string[]): readonly string[] =>
  [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * One role's ids, each given a rung of the luminance ladder and a form.
 *
 * ==========================================================================================
 * LUMINANCE FIRST, AND ONLY THEN SHAPE. `rungs` is the whole count while the count fits, so a
 * role no bigger than `MAX_RUNGS` gets exactly the ladder it got before G-077 — every id on
 * its own rung, every pair separated by the ceiling for that length, one form for all of them.
 * That is not a compatibility shim: luminance is the discriminator that works at any size and
 * for any eye, and spending it before reaching for shape is what keeps the picture as legible
 * as arithmetic allows.
 *
 * PAST THAT, RUNG CYCLES AND FORM ADVANCES. Two ids share a rung only if their indices differ
 * by a multiple of `rungs`, and then their forms differ by construction; two ids share a form
 * only if they are in the same block of `rungs`, and then their rungs differ. So no two ids
 * can share both, which is what makes the collision impossible rather than unlikely.
 *
 * HUE IS UNTOUCHED BY ANY OF THIS. It is still one even sweep of the allowed arc over the
 * WHOLE role, which is why `palette.reserved-hue.test.ts`'s measurement of where the first
 * room sits is unmoved by this goal.
 * ==========================================================================================
 */
function assign(ids: readonly string[], phase: number, role: string): ReadonlyMap<string, Mark> {
  const ordered = ascending(ids);
  const count = ordered.length;
  const formed = ROLES_DRAWN_AS_FORMS.includes(role);
  const rungs = Math.max(1, formed ? Math.min(count, MAX_RUNGS) : count);
  if (formed && count > rungs * FORMS.length) {
    // LOUD, NEVER QUIET, and it is the same call `UNKNOWN`'s magenta makes: a palette that
    // cannot tell two things apart must say so rather than hand out two marks that are the
    // same mark. This is E-017 re-raised at the ceiling G-077 built, and the message says what
    // to do about it — which E-017 could not, because at the time there was nothing to do.
    throw new Error(
      `the "${role}" role declares ${count} content ids and this palette can draw ` +
        `${rungs * FORMS.length} distinguishable marks (${rungs} luminance rungs x ${FORMS.length} ` +
        'forms). Add a form to FORMS in view/form.ts, or split the role.',
    );
  }
  const map = new Map<string, Mark>();
  ordered.forEach((id, i) => {
    const hue = ALLOWED_HUE_START + (ALLOWED_HUE_SPAN * (i + phase)) / count;
    const rung = i % rungs;
    const form = FORMS[Math.floor(i / rungs)] ?? UNKNOWN_FORM;
    map.set(id, { colour: atLuminance(hue, rungLuminance(rungs, rung)), rung, form });
  });
  return map;
}

/** Just the colours, for the callers that want a fill and nothing else. */
const coloursOf = (marks: ReadonlyMap<string, Mark>): ReadonlyMap<string, number> =>
  new Map([...marks].map(([id, mark]) => [id, mark.colour]));

/**
 * The palette for one content set. Built once at startup; no id is named anywhere in this
 * file (ADR-0003), and a content set with more room types gets a longer ladder until the
 * ladder is full, then a second form (see `assign`).
 */
export function createPalette(content: BoundContent): Palette {
  const rooms = assign(content.content.roomTypes.map((room) => room.id), ROLE_HUE_PHASE.room, 'room');
  // `itemTypes` is optional in `SimContent` — content from before G-009 had none, and the
  // shape still says so. An absent table is an empty ladder, not a crash.
  const items = assign((content.content.itemTypes ?? []).map((item) => item.id), ROLE_HUE_PHASE.item, 'item');
  const needs = assign(needTypesInOrder(content).map((need) => need.id), ROLE_HUE_PHASE.need, 'need');
  const marksByRole = new Map([
    ['room', rooms],
    ['item', items],
    ['need', needs],
  ]);
  return {
    roomColour: (id) => rooms.get(id)?.colour ?? UNKNOWN,
    itemColour: (id) => items.get(id)?.colour ?? UNKNOWN,
    needColour: (id) => needs.get(id)?.colour ?? UNKNOWN,
    roomForm: (id) => rooms.get(id)?.form ?? UNKNOWN_FORM,
    itemForm: (id) => items.get(id)?.form ?? UNKNOWN_FORM,
    inkOn: (fill) => (contrastRatio(fill, INK.paper) >= contrastRatio(fill, INK.soot) ? INK.paper : INK.soot),
    byRole: new Map([...marksByRole].map(([role, marks]) => [role, coloursOf(marks)])),
    marksByRole,
  };
}

/** A content id this palette has no colour for. Loud, never quiet. */
export const UNKNOWN = 0xff00ff;

/**
 * The form drawn for an id this palette has no entry for.
 *
 * IT IS THE FIRST FORM AND IT IS NOT A SECOND ALARM, deliberately. `UNKNOWN`'s magenta already
 * shouts, on the same mark, in the channel that carries further; a bespoke "unknown shape"
 * would be a second thing to learn for a state that is already unmistakable, and it would have
 * to be a ninth silhouette that never appears in a working build.
 */
export const UNKNOWN_FORM: Form = FORMS[0] ?? 'block';

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
  /**
   * CIRCULATION — WHERE THE PLAN SAYS PEOPLE WALK (G-035, and G-034b is why it must be
   * visible at all: *a room reported `noCorridor` looks identical to a working one unless
   * the plan is on screen*).
   *
   * ACHROMATIC ON PURPOSE, AND IT IS A LEGIBILITY ARGUMENT RATHER THAN A TASTE ONE. Every
   * room type's colour comes off the ladder above, which spreads HUE evenly round the circle
   * — so every room on screen is saturated. A corridor is grey. "Room or walkway" is then a
   * SATURATION question rather than a which-grey-is-which one, and it keeps working at twelve
   * room types, where the hue wheel has already given up (see this file's opening arithmetic).
   *
   * Two tones, above and below grade, for the same reason the ground has two: with one floor
   * on screen there is no street line to see, so the ground itself has to say which side of it
   * you are on.
   */
  corridor: 0x5a6472,
  corridorBelow: 0x4a4640,
  corridorEdge: 0x8a94a3,
  /**
   * THE STAIRWELL (G-044) — the one mark on the floor plane that is about LEAVING it.
   *
   * ONE INK, NOT TWO, AND NOT A SECOND PAVING. `corridor` needed an above/below-grade pair
   * because paving is GROUND and with one floor on screen the ground itself has to say which
   * side of the street line you are on. A shaft is not ground: it is the same shaft on every
   * floor it passes through, and drawing it the same colour on every floor is the honest
   * reading rather than a shortcut. So this is a MARK laid over whatever tile is there — the
   * `entrance` diamond's mechanism, one axis over — and the tile underneath keeps saying
   * whether it is above grade, below it, paved, bare, or built on.
   *
   * WHY IT IS THE ONE HUED PIECE OF CIRCULATION ON SCREEN, when `corridor`'s own block above
   * argues that circulation is achromatic. That argument is about a COUNT: every room type is
   * hued, so "room or walkway" must not be a which-hue-is-which question. There is exactly ONE
   * stairwell column in a world (`stairs.ts`: stairs are aligned), so this ink is compared
   * against nothing — it is a singleton mark, like `entrance` (ochre) and `alarm` (red), both
   * of which are hued for the same reason.
   *
   * MEASURED, LIKE EVERY OTHER NUMBER IN THIS FILE. Against the paving it has to be told apart
   * from, it reaches **3.48:1 on `corridor`** — its worst case, and the one that decided the
   * value — and 5.44:1 on `corridorBelow`, both clearing the 3:1 of
   * `MIN_CONTRAST_VS_BACKGROUND`'s own source (WCAG 2.2 SC 1.4.11, non-text contrast: a
   * graphical object needed to understand the content). Over the shaft's own darkened tile it
   * reaches 6.47:1 above grade and 8.20:1 below. Its hue is 185 degrees: 115 from the reserved
   * magenta arc,
   * and further from `entrance` (43) than any other ink on the plane — which matters because
   * the shipped scenario puts the shaft in the cell NEXT DOOR to the door.
   */
  stair: 0x5fd6e0,
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
