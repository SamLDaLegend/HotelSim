// PREFER A SPRITE, FALL BACK TO THE COMPUTED COLOUR (G-035, ADR-0046 §6).
//
// ---------------------------------------------------------------------------------------
// THE RULING, VERBATIM, BECAUSE THE WHOLE OF THIS FILE IS ONE SENTENCE OF IT:
//
//   "THE COMPUTED CONTRAST LADDER SURVIVES AS THE FALLBACK, NOT THE RULE. Content gains an
//    optional sprite reference; the renderer prefers a sprite and falls back to the computed
//    colour. This keeps ADR-0014's 'real art is a separate track' true IN CODE rather than
//    only in prose — the game can ship with half the room types drawn and half as prisms and
//    nothing breaks."
//
// THERE ARE NO SPRITES TODAY. Every id on screen takes the fallback, and this file is
// therefore, right now, an elaborate way of calling `palette.roomColour`. THAT IS THE POINT
// AND IT IS DELIBERATE: the seam is the deliverable, not the artwork. A renderer that reads
// the colour directly is a renderer the art track has to open up before it can land its first
// asset, and "we will add the seam when the art arrives" is how a separate track stops being
// separate.
//
// TWO CONDITIONS, NOT ONE, AND THE SECOND IS THE ONE PEOPLE FORGET. A sprite is used when the
// CONTENT names one AND THE ATLAS HAS IT. Content that names a sprite nobody packed must fall
// back rather than draw nothing — otherwise a designer's typo is an invisible room, which is
// the silent direction and the wrong one (`palette.ts`: a colour this palette has no entry for
// is loud magenta, never a plausible colour).
//
// WHAT KEEPS THE CONTRAST GUARANTEE HONEST AS ART LANDS. `palette.contrast.test.ts` asserts
// over `createPalette`'s output, which is every id the ladder assigns a colour to — the
// population still using the fallback. An id that gains a sprite still has a ladder entry and
// still clears the floor, so the test never silently shrinks its subject; it simply stops
// being the thing that decides how that id looks.
// ---------------------------------------------------------------------------------------

import type { Palette } from './palette.js';

/** How one content id is drawn. */
export type Appearance =
  | { readonly kind: 'sprite'; readonly ref: string; readonly fallback: number }
  | { readonly kind: 'colour'; readonly colour: number };

/** Whether the atlas holds a picture under this key. */
export type Atlas = (ref: string) => boolean;

/**
 * THE ATLAS THIS BUILD SHIPS: empty.
 *
 * Not a stub with a `TODO` — a stated fact with a reason. ADR-0047 A1 settles the authoring
 * route (3D-rendered sprites for the real track, procedural coloured prisms as placeholder,
 * NO ASSETS AT ALL) and ADR-0046 §6 says "do not buy or commission anything yet". So the
 * honest atlas is one that holds nothing, and the fallback path is the one every frame takes.
 *
 * When an atlas exists it is a texture lookup and this constant is the only line that
 * changes.
 */
export const EMPTY_ATLAS: Atlas = () => false;

export type Appearances = {
  readonly room: (contentId: string) => Appearance;
  readonly item: (contentId: string) => Appearance;
};

/**
 * Resolve appearances for one content set against one atlas.
 *
 * `sprites` is the content's own optional references, keyed by content id — read by the host
 * in `content.ts` from the same parsed tables the simulation is injected with, so a renamed
 * sprite key travels with the JSON and never with a literal in this layer (ADR-0003).
 */
export function createAppearances(
  palette: Palette,
  sprites: ReadonlyMap<string, string>,
  atlas: Atlas = EMPTY_ATLAS,
): Appearances {
  const resolve = (contentId: string, colour: number): Appearance => {
    const ref = sprites.get(contentId);
    if (ref !== undefined && atlas(ref)) return { kind: 'sprite', ref, fallback: colour };
    return { kind: 'colour', colour };
  };
  return {
    room: (contentId) => resolve(contentId, palette.roomColour(contentId)),
    item: (contentId) => resolve(contentId, palette.itemColour(contentId)),
  };
}

/**
 * The colour to paint with, whichever branch was taken.
 *
 * A SPRITE STILL CARRIES ITS FALLBACK, so a mark that has to agree with a room's colour — a
 * badge plate, a wall shade, an occupancy pip — has one to read even when the room itself is
 * a picture. Without it, the day the first sprite lands is the day the labels stop matching
 * the rooms they sit on.
 */
export function colourOf(appearance: Appearance): number {
  return appearance.kind === 'sprite' ? appearance.fallback : appearance.colour;
}
