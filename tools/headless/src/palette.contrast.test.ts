// EVERY CONTENT-TYPED THING DRAWN IS DISTINGUISHABLE FROM EVERY OTHER, IN GREYSCALE (G-030).
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
// GREYSCALE IS THE PROXY, AND IT IS CHOSEN BECAUSE IT IS THE CHEAP MECHANICAL STAND-IN FOR
// "reads at cell scale". Hue discrimination is weak at small sizes and weaker for a
// colour-blind viewer; luminance survives both. A palette that separates in greyscale
// separates for everybody, which is a stronger claim than the one being asked for.
//
// WHY IT IMPORTS THE SHIPPED MODULE, AND THE PRECEDENT THAT SETS. `HOTELSIM.md` §3 says the
// render layer is "not unit tested, it is playtested", and `vitest.config.ts` excludes
// `apps/**` from test DISCOVERY. This file is in `tools/headless` and imports ONE pure,
// dependency-free module from `apps/game` — no Pixi, no DOM, no canvas. It is not a unit
// test of the renderer: it is the mechanical half of a perceptual criterion, computed over
// the SHIPPED content rather than over a fixture, and §3's "playtested" stands untouched for
// everything that draws. Re-deriving the ladder here instead would test a copy, and the copy
// is exactly what would drift.
//
// IT IS NOT A SCANNER and owes the census nothing (`scanner.census.test.ts:28-31`): it walks
// no tree. It reads named content files and calls a named function, so a moved subject
// throws at the read rather than reporting a clean tree.

import { describe, expect, it } from 'vitest';
import { loadContent } from './content-loader.js';
import {
  BACKGROUND,
  bestAchievableContrast,
  contrastRatio,
  createPalette,
  hueDistanceFromReserved,
  INK,
  MIN_CONTRAST_VS_BACKGROUND,
  MIN_CONTRAST_WITHIN_ROLE,
  relativeLuminance,
  RESERVED_HUE_HALF_WIDTH,
  UNKNOWN,
} from '../../../apps/game/src/view/palette.js';

const content = loadContent();
const palette = createPalette(content);

const hex = (colour: number): string => `#${colour.toString(16).padStart(6, '0')}`;

type Pair = { readonly a: string; readonly b: string; readonly ratio: number };

function pairsIn(colours: ReadonlyMap<string, number>): readonly Pair[] {
  const ids = [...colours.keys()];
  const out: Pair[] = [];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (a === undefined || b === undefined) continue;
      const ca = colours.get(a);
      const cb = colours.get(b);
      if (ca === undefined || cb === undefined) continue;
      out.push({ a, b, ratio: contrastRatio(ca, cb) });
    }
  }
  return out;
}

const worstOf = (pairs: readonly Pair[]): Pair | undefined =>
  pairs.reduce<Pair | undefined>((worst, pair) => (worst === undefined || pair.ratio < worst.ratio ? pair : worst), undefined);

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
  it('has a colour for every room type, item type and need type the content declares', () => {
    // THE ANTI-VACUITY ARM. A palette over zero ids has no pairs and passes every assertion
    // below it, which is precisely the shape ADR-0007 names. Counts are asserted against the
    // content itself rather than against literals, so adding a room type strengthens this
    // test instead of stranding it.
    const rooms = palette.byRole.get('room');
    const items = palette.byRole.get('item');
    const needs = palette.byRole.get('need');
    // `itemTypes` and `needTypes` are optional on `SimContent` — content from before G-004
    // and G-009 had neither, and the shape still says so. An absent table is an empty ladder.
    expect(rooms?.size).toBe(content.content.roomTypes.length);
    expect(items?.size).toBe((content.content.itemTypes ?? []).length);
    expect(needs?.size).toBe((content.content.needTypes ?? []).length);
    expect(rooms?.size ?? 0).toBeGreaterThan(1);
    expect(needs?.size ?? 0).toBeGreaterThan(1);
    for (const [, colours] of palette.byRole) {
      for (const [, colour] of colours) {
        expect(colour).toBeGreaterThanOrEqual(0);
        expect(colour).toBeLessThanOrEqual(0xffffff);
      }
    }
  });

  it('gives every id its own colour — a collision is two room types drawn identically', () => {
    // The reason assignment is by RANK and not by hash. Four ids hashed into four slots
    // collide about 91% of the time, and a collision is worse than a washout: it is two
    // different things that are the same thing on screen.
    for (const [role, colours] of palette.byRole) {
      const distinct = new Set(colours.values());
      expect(distinct.size, `${role}: two ids share a colour`).toBe(colours.size);
    }
  });
});

describe('SEPARATION — no pair is as close as the pairs measured on the unreadable build', () => {
  it.each([...palette.byRole.keys()])('%s colours are pairwise separated in greyscale', (role) => {
    const colours = palette.byRole.get(role);
    expect(colours).toBeDefined();
    const pairs = pairsIn(colours ?? new Map());
    if (pairs.length === 0) return;
    const worst = worstOf(pairs);
    expect(
      worst?.ratio,
      `${role}: worst pair ${worst?.a} vs ${worst?.b} at ${worst?.ratio.toFixed(3)}:1 — the build ` +
        `the human could not read had 32 of 66 pairs below ${MIN_CONTRAST_WITHIN_ROLE} and a worst of 1.00`,
    ).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });

  it('and the spread is OPTIMAL for its length, not merely over the floor', () => {
    // The floor says "not as bad as the thing that failed". This says "as good as arithmetic
    // allows": N colours in a luminance band can do no better than span^(1/(N-1)), so a
    // ladder achieving it is the best arrangement that exists rather than a tuned one. It is
    // also what stops somebody satisfying the floor by bunching three colours at the top.
    for (const [role, colours] of palette.byRole) {
      const pairs = pairsIn(colours);
      if (pairs.length === 0) continue;
      const worst = worstOf(pairs);
      const best = bestAchievableContrast(colours.size);
      expect(
        worst?.ratio ?? 0,
        `${role}: achieved ${worst?.ratio.toFixed(4)} against a ceiling of ${best.toFixed(4)}`,
      ).toBeGreaterThan(best * 0.97);
    }
  });

  it('every drawn colour separates from the page it is drawn on (WCAG 2.2 SC 1.4.11)', () => {
    for (const [role, colours] of palette.byRole) {
      for (const [id, colour] of colours) {
        expect(
          contrastRatio(colour, BACKGROUND),
          `${role} ${id} (${hex(colour)}) against the background`,
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
    for (const [role, colours] of palette.byRole) {
      for (const [id, colour] of colours) {
        expect(
          hueDistanceFromReserved(colour),
          `${role} ${id} (${hex(colour)}) is within ${RESERVED_HUE_HALF_WIDTH}° of the UNKNOWN magenta`,
        ).toBeGreaterThanOrEqual(RESERVED_HUE_HALF_WIDTH);
      }
    }
    expect(hueDistanceFromReserved(UNKNOWN)).toBe(0);
  });

  it('and the ink chosen for a fill always reads against it', () => {
    // `inkOn` is what makes an outline and a badge independent of the palette. If it ever
    // returned the wrong one of paper/soot, a label would vanish on one room type in four —
    // the failure mode that is hardest to notice, because three quarters of the screen is fine.
    for (const [, colours] of palette.byRole) {
      for (const [id, colour] of colours) {
        const ink = palette.inkOn(colour);
        expect([INK.paper, INK.soot]).toContain(ink);
        expect(contrastRatio(ink, colour), `ink on ${id} (${hex(colour)})`).toBeGreaterThanOrEqual(
          MIN_CONTRAST_VS_BACKGROUND,
        );
      }
    }
  });
});

describe('AND IT BITES — the failed wheel does not pass the check written for its failure', () => {
  it('the twelve hues that were watched and rejected are refused by this floor', () => {
    // The proof that the threshold is doing work. These are the twelve colours of the build
    // the human could not read; if they were to satisfy the assertions above, the assertions
    // would be certifying the defect they were written for.
    const failed = new Map<string, number>(
      [0x3f6fb5, 0x3f9c72, 0xc1793a, 0x7d5aa8, 0xc4634e, 0x4fa3c7, 0x9aa83f, 0xb45d8f, 0x50907c, 0xa8763f, 0x6f7fd0, 0xc9a03a].map(
        (colour, i) => [`entry-${i}`, colour],
      ),
    );
    const pairs = pairsIn(failed);
    const worst = worstOf(pairs);
    expect(pairs).toHaveLength(66);
    expect(worst?.ratio).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(pairs.filter((pair) => pair.ratio < MIN_CONTRAST_WITHIN_ROLE)).toHaveLength(32);
  });

  it('and no twelve-colour palette could have passed it, which is why the fix was fewer per role', () => {
    // The finding worth keeping from this whole episode: the ceiling for twelve colours in
    // the usable band is BELOW the floor. The first palette was not a bad twelve; twelve was
    // the mistake. Scoping the ladders per role is what made the floor reachable.
    expect(bestAchievableContrast(12)).toBeLessThan(MIN_CONTRAST_WITHIN_ROLE);
    expect(bestAchievableContrast(4)).toBeGreaterThan(MIN_CONTRAST_WITHIN_ROLE);
  });
});
