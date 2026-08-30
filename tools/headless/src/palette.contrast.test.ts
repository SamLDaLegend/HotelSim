// EVERY CONTENT-TYPED THING DRAWN IS DISTINGUISHABLE FROM EVERY OTHER — BY LUMINANCE, OR BY
// SHAPE WHERE SHAPE IS DRAWN (G-030, widened G-077).
//
//   pnpm exec vitest run palette.contrast
//
// ---------------------------------------------------------------------------------------
// WHY THIS TEST EXISTS: A HUMAN WATCHED THE FIRST BUILD AND COULD NOT READ IT.
//
//   "Reads quite difficult I would say. Lots of washout of bars and whilst I can visualise
//    it to an extent, it's not easy."
//
// Measured afterwards, the first palette had **32 of its 66 pairs below 1.3:1 contrast and a
// worst pair at 1.00:1** — two colours of identical luminance and different hue. It varied
// hue and held luminance nearly constant, so the shapes separated from the background and
// not from each other.
//
// ALL SIX OF G-030's ORIGINAL EXIT CRITERIA PASSED ON THAT SCREEN. `pnpm dev` opened, the
// ladder scan was green, a guest was drawn at `guest.at`, I1 held, the art was placeholder,
// the gates passed. The goal exists to make the game watchable and nothing in it tested
// whether it was watchable — ADR-0007's sixth amendment, on a criterion rather than a check:
// a vacuous check fails to catch a defect; A VACUOUS CRITERION CERTIFIES THE GOAL.
//
// So this is the mechanical half of the replacement criterion. It cannot tell anybody the
// picture is GOOD — that stays the human's WATCH and no agent may discharge it. It can tell
// anybody, mechanically and before a human is asked to look again, that the specific failure
// which was measured on the build they could not read HAS NOT COME BACK.
// ---------------------------------------------------------------------------------------
//
// =========================================================================================
// WHAT THIS FILE MEASURES CHANGED AT G-077, AND THE CHANGE IS NAMED HERE RATHER THAN LEFT IN
// A DIFF — §9 makes "an invariant gate was modified to make a test pass" a stop condition,
// and a reader is entitled to check that this is not that.
//
// THE FACT THAT FORCED IT IS ARITHMETIC AND IT IS NOT ABOUT THIS PALETTE. N ids separated by
// LUMINANCE ALONE can do no better than a worst pair of `span ** (1 / (N - 1))`, and WCAG
// contrast tops out at 21:1. The shipped band gives seven ids; the widest band that can
// physically exist gives twelve; the twenty-eight item types G-075b ships would need a band
// of span 1.19e3. **The floor of 1.3 and twenty-eight distinct colours cannot both hold, in
// any palette, ever.** That is E-017, and the human's ruling (ADR-0112 §1) was the option that
// costs the most: LUMINANCE STOPS BEING THE SOLE DISCRIMINATOR. Lowering the floor and
// narrowing the comparison population were both offered and both REFUSED, so neither appears
// below.
//
// SO THE SUBJECT IS NOW A **MARK** — A COLOUR AND A FORM — AND THE CLAIM MOVED WITH IT:
//
//   BEFORE   every pair of ids in a role differs in LUMINANCE by at least the floor
//   NOW      every pair of ids in a role differs in FORM, or in LUMINANCE by at least the
//            floor
//
// WHAT IT THEREFORE NO LONGER CHECKS, STATED PLAINLY (ADR-0086: a gate's name is a claim
// about ONE clause, not a class): **it no longer checks that any two colours in a role are
// told apart in greyscale.** Two item types on the same luminance rung are 1.00:1 to each
// other — the exact reading the failed wheel was condemned for — and this file passes them,
// because one is a disc and the other is a triangle. If forms stopped being drawn, or two
// forms became the same silhouette, THAT is the failure this file must catch, and the two
// describes named "THE EXEMPTION IS REAL" are the whole of the reason it can.
//
// AND THE OLD CHECK IS NOT GONE, IT IS THE SAME EXPRESSION AT ONE FORM. A role whose ids all
// share a form has every pair "same-form", so the assertion below reduces, character for
// character, to the one this file made before G-077. `room` and `need` are in that state
// today and are checked exactly as they were; `item` is the only role spending the exemption.
// =========================================================================================
//
// GREYSCALE IS STILL THE PROXY FOR THE COLOUR HALF, AND IT IS CHOSEN BECAUSE IT IS THE CHEAP
// MECHANICAL STAND-IN FOR "reads at cell scale". Hue discrimination is weak at small sizes and
// weaker for a colour-blind viewer; luminance survives both. A palette that separates in
// greyscale separates for everybody, which is a stronger claim than the one being asked for —
// and it is why the ladder is still spent to exhaustion before a form is reached for.
//
// WHY IT IMPORTS THE SHIPPED MODULE, AND THE PRECEDENT THAT SETS. `HOTELSIM.md` §3 says the
// render layer is "not unit tested, it is playtested", and `vitest.config.ts` excludes
// `apps/**` from test DISCOVERY. This file is in `tools/headless` and imports pure,
// dependency-free modules from `apps/game` — no Pixi, no DOM, no canvas. It is not a unit
// test of the renderer: it is the mechanical half of a perceptual criterion, computed over
// the SHIPPED content rather than over a fixture, and §3's "playtested" stands untouched for
// everything that draws. Re-deriving the ladder here instead would test a copy, and the copy
// is exactly what would drift.
//
// IT IS NOT A SCANNER and owes the census nothing (`scanner.census.test.ts:28-31`): it walks
// no tree. It reads named content files and named source files and calls named functions, so
// a moved subject throws at the read rather than reporting a clean tree.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { FORMS, outlineOf } from '../../../apps/game/src/view/form.js';
import type { Form } from '../../../apps/game/src/view/form.js';
import { ITEM_SIZE } from '../../../apps/game/src/view/iso.js';
import {
  BACKGROUND,
  bestAchievableContrast,
  contrastRatio,
  createPalette,
  hueDistanceFromReserved,
  INK,
  MAX_RUNGS,
  MIN_CONTRAST_VS_BACKGROUND,
  MIN_CONTRAST_WITHIN_ROLE,
  relativeLuminance,
  RESERVED_HUE_HALF_WIDTH,
  ROLES_DRAWN_AS_FORMS,
  UNKNOWN,
} from '../../../apps/game/src/view/palette.js';
import type { Mark } from '../../../apps/game/src/view/palette.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const content = loadContent();
const palette = createPalette(content);

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

type Pair = { readonly a: string; readonly b: string; readonly ratio: number; readonly sameForm: boolean };

function pairsIn(marks: ReadonlyMap<string, Mark>): readonly Pair[] {
  const ids = [...marks.keys()];
  const out: Pair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      const ma = marks.get(a);
      const mb = marks.get(b);
      if (ma === undefined || mb === undefined) continue;
      out.push({ a, b, ratio: contrastRatio(ma.colour, mb.colour), sameForm: ma.form === mb.form });
    }
  }
  return out;
}

/** A role's marks with every FORM collapsed to one — the pre-G-077 world, for the bite arms. */
const withoutForms = (marks: ReadonlyMap<string, Mark>): ReadonlyMap<string, Mark> => {
  const first = FORMS[0] ?? 'block';
  return new Map([...marks].map(([id, mark]) => [id, { ...mark, form: first }]));
};

const worstOf = (pairs: readonly Pair[]): Pair | undefined =>
  pairs.reduce<Pair | undefined>((worst, pair) => (worst === undefined || pair.ratio < worst.ratio ? pair : worst), undefined);

/** The pairs the colour floor still applies to: the ones no form tells apart. */
const sameFormPairs = (marks: ReadonlyMap<string, Mark>): readonly Pair[] =>
  pairsIn(marks).filter((pair) => pair.sameForm);

const formsUsedBy = (marks: ReadonlyMap<string, Mark>): number => new Set([...marks.values()].map((m) => m.form)).size;

const rungsUsedBy = (marks: ReadonlyMap<string, Mark>): number => new Set([...marks.values()].map((m) => m.rung)).size;

describe('the WCAG arithmetic itself, so a ratio here means what it means everywhere', () => {
  it('agrees with the two fixed points of the definition', () => {
    // Black and white are the extremes of the scale by construction: (1+0.05)/(0+0.05) = 21.
    expect(relativeLuminance(0x000000)).toBeCloseTo(0, 6);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 6);
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 6);
    expect(contrastRatio(0x123456, 0x123456)).toBeCloseTo(1, 6);
  });

  it('is symmetric, because "distinguishable" is not a direction', () => {
    expect(contrastRatio(0x3f6fb5, 0xc1793a)).toBeCloseTo(contrastRatio(0xc1793a, 0x3f6fb5), 12);
  });

  it('reproduces the measurement taken on the build the human could not read', () => {
    // The two colours of the failed wheel's worst pair, quoted here as raw values rather
    // than imported: the wheel they came from is deleted, and this is the only place that
    // still needs them. If this ever stops reading 1.00, the arithmetic has changed and every
    // threshold below has quietly moved with it.
    expect(contrastRatio(0x50907c, 0x6f7fd0)).toBeCloseTo(1.0, 2);
  });
});

describe('the subject is real — a palette over the SHIPPED content, not a fixture', () => {
  it('has a mark for every room type, item type and need type the content declares', () => {
    // THE ANTI-VACUITY ARM. A palette over zero ids has no pairs and passes every assertion
    // below it, which is precisely the shape ADR-0007 names. Counts are asserted against the
    // content itself rather than against literals, so adding a room type strengthens this
    // test instead of stranding it.
    const rooms = palette.marksByRole.get('room');
    const items = palette.marksByRole.get('item');
    const needs = palette.marksByRole.get('need');
    // `itemTypes` and `needTypes` are optional on `SimContent` — content from before G-004
    // and G-009 had neither, and the shape still says so. An absent table is an empty ladder.
    expect(rooms?.size).toBe(content.content.roomTypes.length);
    expect(items?.size).toBe((content.content.itemTypes ?? []).length);
    expect(needs?.size).toBe((content.content.needTypes ?? []).length);
    expect(rooms?.size ?? 0).toBeGreaterThan(1);
    expect(needs?.size ?? 0).toBeGreaterThan(1);
    for (const [, marks] of palette.marksByRole) {
      for (const [, mark] of marks) {
        expect(mark.colour).toBeGreaterThanOrEqual(0);
        expect(mark.colour).toBeLessThanOrEqual(0xffffff);
        expect(FORMS).toContain(mark.form);
      }
    }
    // `byRole` is the colour column of the same table and half a dozen callers read it. If the
    // two ever disagreed, this file would be measuring something the renderer does not draw.
    for (const [role, marks] of palette.marksByRole) {
      for (const [id, mark] of marks) expect(palette.byRole.get(role)?.get(id)).toBe(mark.colour);
    }
  });

  it('gives every id its own MARK — a collision is two room types drawn identically', () => {
    // The reason assignment is by RANK and not by hash. Four ids hashed into four slots
    // collide about 91% of the time, and a collision is worse than a washout: it is two
    // different things that are the same thing on screen.
    //
    // THE SUBJECT IS THE PAIR SINCE G-077, because the pair is what is on screen. Two ids may
    // now share a rung, so "distinct colours" would be the weaker claim of the two — and it is
    // asserted as well, on the line below, because hue is still handed out per id and a role
    // that stopped doing that would have lost a cue nothing else replaces.
    for (const [role, marks] of palette.marksByRole) {
      const distinct = new Set([...marks.values()].map((mark) => `${mark.colour}:${mark.form}`));
      expect(distinct.size, `${role}: two ids share a mark`).toBe(marks.size);
      expect(new Set([...marks.values()].map((mark) => mark.colour)).size, `${role}: two ids share a colour`).toBe(
        marks.size,
      );
    }
  });
});

describe('SEPARATION — no pair is as close as the pairs measured on the unreadable build', () => {
  it.each([...palette.marksByRole.keys()])('%s marks are pairwise distinguishable', (role) => {
    // THE DISJUNCTION, AND WHAT IS LEFT OF THE OLD ASSERTION INSIDE IT. Pairs that differ in
    // FORM are told apart by shape and are not asked to differ in luminance; every OTHER pair
    // faces the floor unchanged. At one form per role that is every pair, which is why this
    // line is the pre-G-077 check for `room` and `need` rather than a weakened version of it.
    const marks = palette.marksByRole.get(role);
    expect(marks).toBeDefined();
    const pairs = sameFormPairs(marks ?? new Map());
    if (pairs.length === 0) return;
    const worst = worstOf(pairs);
    expect(
      worst?.ratio,
      `${role}: worst SAME-FORM pair ${worst?.a} vs ${worst?.b} at ${worst?.ratio.toFixed(3)}:1 — the build ` +
        `the human could not read had 32 of 66 pairs below ${MIN_CONTRAST_WITHIN_ROLE} and a worst of 1.00`,
    ).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('and the spread is OPTIMAL for the ladder it uses, not merely over the floor', () => {
    // The floor says "not as bad as the thing that failed". This says "as good as arithmetic
    // allows": N colours in a luminance band can do no better than span^(1/(N-1)), so a
    // ladder achieving it is the best arrangement that exists rather than a tuned one. It is
    // also what stops somebody satisfying the floor by bunching three colours at the top.
    //
    // THE LENGTH IS THE RUNG COUNT SINCE G-077, NOT THE ID COUNT, and that is the honest
    // reading rather than a weaker one: with twenty-eight ids on seven rungs the ceiling for
    // twenty-eight is 1.068 and CLEARING IT WOULD MEAN NOTHING. What the ladder must be
    // optimal for is its own length, and the ids beyond it are separated by shape.
    for (const [role, marks] of palette.marksByRole) {
      const pairs = sameFormPairs(marks);
      if (pairs.length === 0) continue;
      const worst = worstOf(pairs);
      const best = bestAchievableContrast(rungsUsedBy(marks));
      expect(
        worst?.ratio ?? 0,
        `${role}: achieved ${worst?.ratio.toFixed(4)} against a ceiling of ${best.toFixed(4)} for ` +
          `${rungsUsedBy(marks)} rungs`,
      ).toBeGreaterThan(best * 0.97);
      // AND THE LADDER IS NEVER LONGER THAN THE ARITHMETIC ALLOWS. `MAX_RUNGS` is derived from
      // the floor, not chosen; a role that exceeded it would be back in the failed wheel.
      expect(rungsUsedBy(marks), `${role} uses more rungs than the band supports`).toBeLessThanOrEqual(MAX_RUNGS);
    }
  });

  it('every drawn colour separates from the page it is drawn on (WCAG 2.2 SC 1.4.11)', () => {
    for (const [role, marks] of palette.marksByRole) {
      for (const [id, mark] of marks) {
        expect(
          contrastRatio(mark.colour, BACKGROUND),
          `${role} ${id} (${hex(mark.colour)}) against the background`,
        ).toBeGreaterThanOrEqual(MIN_CONTRAST_VS_BACKGROUND);
      }
    }
  });

  it('no room, item or need is drawn in the colour reserved for UNKNOWN CONTENT', () => {
    // A ladder is free to walk the hue circle, and one of them walked straight into magenta:
    // the first version of this palette gave `hotel_cafe` #f100f1, so an ordinary café would
    // have read as the "loaded content does not define this" marker. That marker is the one
    // colour that must stay unambiguous — a recording watched under the wrong content is how
    // a JOURNAL.md observation comes out confidently wrong — so the ladder's hue arc excludes
    // a band around it and this is the assertion that the exclusion holds.
    for (const [role, marks] of palette.marksByRole) {
      for (const [id, mark] of marks) {
        expect(
          hueDistanceFromReserved(mark.colour),
          `${role} ${id} (${hex(mark.colour)}) is within ${RESERVED_HUE_HALF_WIDTH}° of the UNKNOWN magenta`,
        ).toBeGreaterThanOrEqual(RESERVED_HUE_HALF_WIDTH);
      }
    }
    expect(hueDistanceFromReserved(UNKNOWN)).toBe(0);
  });

  it('and the ink chosen for a fill always reads against it', () => {
    // `inkOn` is what makes an outline and a badge independent of the palette. If it ever
    // returned the wrong one of paper/soot, a label would vanish on one room type in four —
    // the failure mode that is hardest to notice, because three quarters of the screen is fine.
    //
    // IT IS ALSO WHAT THE FLOOR SEAM RESTS ON SINCE G-077. `drawTile` outlines a room's floor
    // cell in `inkOn(fill)`, so the grid a player reads an item's POSITION off inherits this
    // guarantee rather than needing a number of its own.
    for (const [, marks] of palette.marksByRole) {
      for (const [id, mark] of marks) {
        const ink = palette.inkOn(mark.colour);
        expect([INK.paper, INK.soot]).toContain(ink);
        expect(contrastRatio(ink, mark.colour), `ink on ${id} (${hex(mark.colour)})`).toBeGreaterThanOrEqual(
          MIN_CONTRAST_VS_BACKGROUND,
        );
      }
    }
  });

  it('and it reads against ANY fill, not merely the ones this content produces', () => {
    // ==================================================================================
    // THE SEAM'S DERIVATION, PINNED (ADR-0007's fifth amendment: a comment offered as
    // evidence may not carry a figure no test pins). `drawTile` outlines every room floor
    // cell in `inkOn(fill)` and says the worst case is arithmetic rather than content —
    // paper and soot cross over part way up the luminance scale, and the better of the two
    // is never worse than the crossover.
    //
    // SWEPT OVER THE 24-BIT CUBE rather than over the palette, which is what makes it a
    // claim about the FUNCTION instead of about today's seven room types. The stride is a
    // prime so the samples do not line up with any channel boundary; the reading is the
    // minimum over the sweep, and it is quoted to two places because the true minimum sits
    // between samples.
    // ==================================================================================
    const stride = 977;
    let worst = Infinity;
    let at = 0;
    for (let colour = 0; colour <= 0xffffff; colour += stride) {
      const best = Math.max(contrastRatio(INK.paper, colour), contrastRatio(INK.soot, colour));
      if (best < worst) {
        worst = best;
        at = colour;
      }
    }
    expect(worst).toBeGreaterThan(MIN_CONTRAST_VS_BACKGROUND);
    expect({ worst: Number(worst.toFixed(2)), at: hex(at) }).toEqual({ worst: 4.29, at: '#c038be' });
  });
});

// =========================================================================================
// THE EXEMPTION IS REAL — THE TWO DESCRIBES THIS FILE'S HONESTY RESTS ON.
//
// Everything above lets a pair off the colour floor when its forms differ. That is a licence
// to pass a 1.00:1 pair, which is the exact reading the human rejected, so it is worth
// nothing unless BOTH of these hold: the forms are different SHAPES, and something actually
// DRAWS them. Neither is checkable from the palette alone, and both are checked here.
// =========================================================================================

/** Whether `(x, y)` is inside the flat polygon `points`. Even-odd ray cast. */
function inPoly(points: readonly number[], x: number, y: number): boolean {
  let inside = false;
  const n = points.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = points[i * 2] ?? 0;
    const yi = points[i * 2 + 1] ?? 0;
    const xj = points[j * 2] ?? 0;
    const yj = points[j * 2 + 1] ?? 0;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A form's silhouette as a grid of booleans, ONE SAMPLE PER LOGICAL PIXEL THE MARK OCCUPIES.
 *
 * THE GRID SIZE IS DERIVED AND NOT CHOSEN: `ITEM_SIZE` is the side of the coloured mark at
 * scale 1, so a difference counted here is a difference of that many actual pixels on an
 * unzoomed screen. Sampling finer would count differences nobody can see; sampling coarser
 * would miss ones they can.
 */
function silhouetteOf(form: Form): readonly boolean[] {
  const points = outlineOf(form, 0, 0, ITEM_SIZE);
  const cells: boolean[] = [];
  for (let row = 0; row < ITEM_SIZE; row += 1) {
    for (let column = 0; column < ITEM_SIZE; column += 1) {
      cells.push(inPoly(points, column + 0.5 - ITEM_SIZE / 2, row + 0.5 - ITEM_SIZE / 2));
    }
  }
  return cells;
}

const differingPixels = (a: readonly boolean[], b: readonly boolean[]): number =>
  a.reduce((count, cell, i) => count + (cell === b[i] ? 0 : 1), 0);

describe('THE EXEMPTION IS REAL (1) — the forms are different shapes, measured in pixels', () => {
  it('every form covers some of its box and none of them covers all of it', () => {
    // Vacuity again: a form list of eight empty polygons differs from itself nowhere, and a
    // list of eight full squares differs nowhere either. Both would sail through the arm below
    // if it only asked for "distinct", so the population is checked before it is compared.
    for (const form of FORMS) {
      const filled = silhouetteOf(form).filter(Boolean).length;
      expect(filled, `${form} covers nothing`).toBeGreaterThan(ITEM_SIZE);
      expect(filled, `${form} covers its whole box, so it has no silhouette`).toBeLessThanOrEqual(
        ITEM_SIZE * ITEM_SIZE,
      );
    }
  });

  it('no two forms draw the same silhouette, and the closest pair is recorded', () => {
    const worst = { pixels: Infinity, pair: '' };
    for (let i = 0; i < FORMS.length; i += 1) {
      for (let j = i + 1; j < FORMS.length; j += 1) {
        const a = FORMS[i];
        const b = FORMS[j];
        if (a === undefined || b === undefined) continue;
        const pixels = differingPixels(silhouetteOf(a), silhouetteOf(b));
        expect(pixels, `${a} and ${b} draw the same silhouette`).toBeGreaterThan(0);
        if (pixels < worst.pixels) {
          worst.pixels = pixels;
          worst.pair = `${a} vs ${b}`;
        }
      }
    }
    // TODAY'S SPECIFICS, in `wall-visibility.test.ts`'s shape: a fact about the shipped
    // vocabulary rather than the property under test. The property is "> 0" above, because
    // "how many pixels is enough" is a question about an eye and ADR-0013 reserves it to the
    // human. This line is what makes a ninth form that is nearly a copy of an existing one
    // move a number rather than pass quietly.
    expect({ pixels: worst.pixels, pair: worst.pair }).toEqual({ pixels: 24, pair: 'block vs disc' });
  });

  it('a form is the SAME shape wherever it is drawn, and it scales', () => {
    // The mark is drawn at the item's span on a tile and at the badge glyph's size on a plate.
    // If `outlineOf` were not a similarity transform of one shape, the two would be different
    // pictures of the same content id and the exemption would hold for only one of them.
    for (const form of FORMS) {
      const small = outlineOf(form, 0, 0, 10);
      const large = outlineOf(form, 100, 50, 20);
      expect(large.length).toBe(small.length);
      for (let i = 0; i < small.length; i += 2) {
        expect(large[i] ?? 0).toBeCloseTo(100 + 2 * (small[i] ?? 0), 9);
        expect(large[i + 1] ?? 0).toBeCloseTo(50 + 2 * (small[i + 1] ?? 0), 9);
      }
    }
  });
});

describe('THE EXEMPTION IS REAL (2) — something on screen actually draws the form', () => {
  // THE TIE IS TO THE BYTES OF `scene.ts`, NOT TO AN UNDERSTANDING. `.dependency-cruiser.cjs`
  // forbids importing `scene.ts` from here — it pulls Pixi — so the honest route is the one
  // `view-fence.test.ts` already uses on the same tree: read the named file and look at what
  // it says. A renderer that stopped drawing forms would otherwise leave this whole file
  // certifying a difference that exists only in a data structure.
  const scene = readFileSync(join(ROOT, 'apps/game/src/view/scene.ts'), 'utf8');

  /** The body of a named top-level function in a source file, up to the next one. */
  function bodyOf(source: string, name: string): string {
    const start = source.indexOf(`\nfunction ${name}(`);
    expect(start, `${name} is not a top-level function in scene.ts any more`).toBeGreaterThan(-1);
    const next = source.indexOf('\nfunction ', start + 1);
    return source.slice(start, next === -1 ? source.length : next);
  }

  it('drawItems draws an item AS its form', () => {
    const body = bodyOf(scene, 'drawItems');
    expect(body).toContain('outlineOf(');
    expect(body).toContain('itemForm(');
  });

  it('drawRoom draws the room type FORM on its badge', () => {
    const body = bodyOf(scene, 'drawRoom');
    expect(body).toContain('outlineOf(');
    expect(body).toContain('roomForm(');
  });

  it('and no role spends the exemption without being on that list', () => {
    // The load-bearing tie in one line: a role may only use more than one form if
    // `ROLES_DRAWN_AS_FORMS` names it, and the two arms above are what that name means. A
    // `need` type spilling onto a second form would fail here rather than pass on a shape that
    // is three pixels wide in a guest's need vector.
    for (const [role, marks] of palette.marksByRole) {
      if (formsUsedBy(marks) > 1) {
        expect(ROLES_DRAWN_AS_FORMS, `${role} uses ${formsUsedBy(marks)} forms and nothing draws them`).toContain(role);
      }
    }
    // AND IT IS SPENT ONLY WHEN THE LADDER IS EXHAUSTED, which is the other half of the rule:
    // a role reaches for a second form exactly when it has more ids than there are rungs, never
    // sooner. On the shipped content that is `item` alone — twenty-eight ids against seven rungs
    // — and `room` and `need` are checked by the pre-G-077 expression. It is written as a
    // derivation rather than as the literal `['item']` on purpose: an EIGHTH ROOM TYPE would
    // redden a literal, and ADR-0112 §2 is the ruling that the cap on room types is not
    // permanent. A gate that refused the eighth room type in its receipts would be the cap
    // wearing a different hat.
    const spending = [...palette.marksByRole].filter(([, marks]) => formsUsedBy(marks) > 1).map(([role]) => role);
    expect(spending).toEqual(
      [...palette.marksByRole].filter(([, marks]) => marks.size > MAX_RUNGS).map(([role]) => role),
    );
  });
});

describe('AND IT BITES — the failed wheel does not pass the check written for its failure', () => {
  it('the twelve hues that were watched and rejected are refused by this floor', () => {
    // The proof that the threshold is doing work. These are the twelve colours of the build
    // the human could not read; if they were to satisfy the assertions above, the assertions
    // would be certifying the defect they were written for.
    const failed = new Map<string, Mark>(
      [0x3f6fb5, 0x3f9c72, 0xc1793a, 0x7d5aa8, 0xc4634e, 0x4fa3c7, 0x9aa83f, 0xb45d8f, 0x50907c, 0xa8763f, 0x6f7fd0, 0xc9a03a].map(
        (colour, i) => [`entry-${i}`, { colour, rung: i, form: FORMS[0] ?? 'block' }],
      ),
    );
    const pairs = pairsIn(failed);
    const worst = worstOf(pairs);
    expect(pairs).toHaveLength(66);
    expect(worst?.ratio).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(pairs.filter((pair) => pair.ratio < MIN_CONTRAST_WITHIN_ROLE)).toHaveLength(32);
    // AND IT IS REFUSED BY THE DISJUNCTION TOO, not merely by the old rule. Twelve ids drawn as
    // ONE form get no exemption from anything: every pair is same-form, so the check that
    // passes twenty-eight item types still rejects these twelve.
    expect(worstOf(sameFormPairs(failed))?.ratio).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('and no twelve-colour palette could have passed it, which is why the fix was fewer per role', () => {
    // The finding worth keeping from this whole episode: the ceiling for twelve colours in
    // the usable band is BELOW the floor. The first palette was not a bad twelve; twelve was
    // the mistake. Scoping the ladders per role is what made the floor reachable.
    expect(bestAchievableContrast(12)).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(bestAchievableContrast(4)).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('MAX_RUNGS is the longest ladder that clears the floor, and one more does not', () => {
    // The derivation, executed rather than quoted. This is the number E-017 was about: it is
    // where the cap came from, and it is why the cap could not simply be raised.
    expect(bestAchievableContrast(MAX_RUNGS)).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(bestAchievableContrast(MAX_RUNGS + 1)).toBeLessThanOrEqual(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('THE SHIPPED ITEM ROLE FAILS THE COLOUR-ONLY RULE — which is E-017, and why forms exist', () => {
    // ==================================================================================
    // THE ARM THAT SAYS THE EXEMPTION IS LOAD-BEARING RATHER THAN DECORATIVE. If the shipped
    // marks happened to clear the floor on colour alone, every form below would be untested
    // scenery and this file would be passing for the reason it passed before G-077.
    //
    // COLLAPSING THE FORMS IS THE MUTATION, and it is done to a COPY of the map rather than to
    // the tree — `CLAUDE.md`'s mutation recipe, at the only scale it is needed here.
    // ==================================================================================
    const items = palette.marksByRole.get('item');
    expect(items).toBeDefined();
    expect(items?.size ?? 0).toBeGreaterThan(MAX_RUNGS);
    const collapsed = worstOf(sameFormPairs(withoutForms(items ?? new Map())));
    expect(collapsed?.ratio ?? Infinity).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    // And the same pairs pass WITH their forms, which is the other half of the same sentence.
    expect(worstOf(sameFormPairs(items ?? new Map()))?.ratio ?? 0).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('a role with more ids than there are marks REFUSES to be built', () => {
    // The new ceiling, and it fails loudly instead of handing out two identical marks. E-017
    // could not be answered when it was raised; this one names what to do — add a form — and
    // the message says so.
    const roomTypes = content.content.roomTypes;
    const first = roomTypes[0];
    if (first === undefined) throw new Error('the shipped content declares no room types');
    const capacity = MAX_RUNGS * FORMS.length;
    const overfull = [...roomTypes];
    // THE ID IS DERIVED, NOT SPELLED: a snake_case literal is a content id (ADR-0003), and
    // suffixing one the content already declares is not writing a new one.
    while (overfull.length <= capacity) overfull.push({ ...first, id: `${first.id}_over${overfull.length}` });
    expect(() => createPalette(bindContent({ ...content.content, roomTypes: overfull }))).toThrow(/distinguishable/u);
  });
});

/**
 * The shipped content with `extra` more room types, cloned from the first so they bind — the
 * construction `palette.reserved-hue.test.ts` uses, for its stated reason: `bindContent`
 * refuses an invented room type, and a clone differs from its original in its id alone.
 */
const withExtraRoomTypes = (extra: number): BoundContent => {
  const roomTypes = [...content.content.roomTypes];
  const first = roomTypes[0];
  if (first === undefined) throw new Error('the shipped content declares no room types');
  for (let i = 0; i < extra; i += 1) roomTypes.push({ ...first, id: `${first.id}_probe${i}` });
  return bindContent({ ...content.content, roomTypes });
};

describe('THE CAP IS NOT PERMANENT (ADR-0112 §2) — an eighth room type does not redden this gate', () => {
  it('the room role sits AT the ladder limit, which is what made the cap bite', () => {
    // The state E-017 reported: `room` filling the ladder exactly. One more and, before G-077,
    // the whole role dropped under the floor at once.
    //
    // WRITTEN SO THAT ADDING A ROOM TYPE CANNOT REDDEN IT, which is the point of the goal it
    // belongs to: the first line is the ASSIGNMENT RULE and holds at any count. If the second
    // ever fails it is because room types were REMOVED, the role no longer fills the ladder,
    // and this arm's premise is gone — delete it rather than adjust it.
    const rooms = palette.marksByRole.get('room') ?? new Map();
    expect(formsUsedBy(rooms)).toBe(Math.max(1, Math.ceil(rooms.size / MAX_RUNGS)));
    expect(rooms.size).toBeGreaterThanOrEqual(MAX_RUNGS);
  });

  it('and one, two and three room types PAST the ladder still pass — on a second form', () => {
    const shipped = content.content.roomTypes.length;
    for (const extra of [1, 2, 3]) {
      const grown = createPalette(withExtraRoomTypes(extra));
      const rooms = grown.marksByRole.get('room') ?? new Map();
      expect(rooms.size).toBe(shipped + extra);
      const worst = worstOf(sameFormPairs(rooms));
      expect(
        worst?.ratio ?? Infinity,
        `with ${shipped + extra} room types the worst same-form pair is ${worst?.a} vs ${worst?.b}`,
      ).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
      expect(formsUsedBy(rooms)).toBe(Math.ceil(rooms.size / MAX_RUNGS));
      expect(new Set([...rooms.values()].map((m) => `${m.colour}:${m.form}`)).size).toBe(shipped + extra);
    }
  });

  it('AND THE SAME EIGHTH ROOM TYPE FAILED THE PRE-G-077 RULE — so this is a lift, not a loophole', () => {
    // Without the exemption an eighth room type is eight ids on one ladder, which the opening
    // arithmetic says cannot clear the floor. Measured here rather than asserted, on the same
    // content the arm above passes, so the two readings can be compared directly.
    const rooms = createPalette(withExtraRoomTypes(1)).marksByRole.get('room');
    expect(worstOf(sameFormPairs(withoutForms(rooms ?? new Map())))?.ratio ?? Infinity).toBeLessThan(
      MIN_CONTRAST_WITHIN_ROLE,
    );
  });
});
