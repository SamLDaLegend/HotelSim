// THE RESERVED-HUE MARGIN, MEASURED RATHER THAN ASSUMED (G-032a).
//
//   pnpm exec vitest run palette.reserved-hue
//
// ===========================================================================================
// WHAT WAS OWED, AND WHAT THE MEASUREMENT RETURNED — WHICH IS NOT WHAT THE NOTE PREDICTED.
//
// `PARKING.md` (G-030 VERIFY) recorded that `games_room` clears the reserved magenta arc by
// **0.05 degrees**, and attached this discriminator:
//
//   > add a fifth room type to a scratch copy of `room-types.json` and run the palette
//   > hue assertions. *If a room lands inside 300 ± 35 the guard is binding rather than
//   > comfortable …; if all five clear, the 0.05 was a four-entry coincidence and this
//   > note closes.*
//
// **BOTH BRANCHES ARE WRONG, AND THE ARM BELOW IS WHY.** Run at five, six, seven and eight
// room types, the closest room sits at the SAME distance every time, to four decimal places.
// A fifth room type cannot flip it, and it was never a four-entry coincidence.
//
// THE REASON IS ARITHMETIC AND IT IS ONE LINE OF `palette.ts`:
//
//     hueAt(i) = ALLOWED_HUE_START + (ALLOWED_HUE_SPAN * (i + phase)) / count
//     ALLOWED_HUE_START = RESERVED_HUE + RESERVED_HUE_HALF_WIDTH        // the arc's edge
//     ROLE_HUE_PHASE.room = 0
//
// At `i = 0` and `phase = 0` the `count` term VANISHES: the first room rung is requested at
// **exactly** the arc's edge, at every room count there will ever be. So the margin is not
// headroom that a fifth entry eats — it is **zero by construction**, and the 0.05° a reader
// sees is the 8-bit RGB round trip through `atLuminance` and `hueOf` landing outward rather
// than inward.
//
// > **The guard is satisfied at EQUALITY, and it passes because a rounding went the right way.**
//
// WHICH MAKES THE LIVE HAZARD A DIFFERENT ONE FROM THE PARKED NOTE'S. It is not room count. It
// is anything that changes which 24-bit colour the first rung quantises to — a new luminance
// rung for that room, a change to `BAND_MIN_L`/`BAND_MAX_L`, a change to `bestAchievableContrast`
// — because the requested hue is on the line and only the rounding is off it.
//
// AND `ROLE_HUE_PHASE`'s OWN DOCSTRING IS THE THING TO FIX, NOT THIS TEST. It reads
// *"Identity only: no legibility claim rests on these, and moving one changes nothing the
// contrast test asserts."* Moving `ROLE_HUE_PHASE.room` off zero is the ONE edit that would give
// this guard real headroom — the dial that matters most here is documented as the one that
// matters least.
//
// THIS GOAL MEASURES AND PINS; IT DOES NOT REPAIR. `apps/game/src/view/palette.ts` belongs to
// the render track and is shut for this milestone (ADR-0018 §4's disjointness rule). The repair
// — phase off zero, or start the arc a degree inside — is one line in that file and it is
// `render-engineer`'s to make. What this goal owes is a number nobody has to take again.
// ===========================================================================================
//
// IT IMPORTS THE SHIPPED MODULE for the reason `palette.contrast.test.ts` does: re-deriving the
// ladder here would test a copy, and the copy is exactly what would drift. One pure,
// dependency-free module — no Pixi, no DOM. `HOTELSIM.md` §3's "playtested, not unit tested"
// stands untouched for everything that draws.
//
// IT IS NOT A SCANNER and owes the census nothing (`scanner.census.test.ts`): it walks no tree.

import { describe, expect, it } from 'vitest';
import { bindContent } from '@hotelsim/sim';
import type { BoundContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import {
  createPalette,
  hueDistanceFromReserved,
  RESERVED_HUE,
  RESERVED_HUE_HALF_WIDTH,
} from '../../../apps/game/src/view/palette.js';

const shipped = loadContent();

/** The closest any ROOM colour comes to the reserved magenta, in degrees. */
const closestRoomToReserved = (bound: BoundContent): number => {
  const rooms = bound.content.roomTypes;
  const colours = createPalette(bound).byRole.get('room');
  if (colours === undefined) throw new Error('the palette reports no room role at all');
  // ANTI-VACUITY: a palette with no room colours would report `Infinity` as its minimum and
  // every assertion below would pass over nothing.
  expect(colours.size).toBe(rooms.length);
  return Math.min(...[...colours.values()].map((colour) => hueDistanceFromReserved(colour)));
};

/**
 * The shipped content with `extra` more room types, cloned from the first so they bind.
 *
 * CLONED RATHER THAN INVENTED: `bindContent` refuses a room type that provides a need nothing
 * declares, or that requires an item that does not exist, so a hand-written fifth room is a
 * bind error rather than a measurement. A clone differs from its original in its id alone,
 * which is the only field the hue ladder reads.
 *
 * THE ID IS DERIVED, NOT SPELLED. A snake_case literal is a content id (ADR-0003), and while
 * this root is not one `check:content` scans, writing one here would still be putting a content
 * definition in code. Suffixing an id the content already declares is neither.
 */
const withExtraRoomTypes = (extra: number): BoundContent => {
  const roomTypes = [...shipped.content.roomTypes];
  const first = roomTypes[0];
  if (first === undefined) throw new Error('the shipped content declares no room types');
  for (let i = 0; i < extra; i += 1) roomTypes.push({ ...first, id: `${first.id}_probe${i}` });
  return bindContent({ ...shipped.content, roomTypes });
};

describe('the reserved-hue margin owed since G-030', () => {
  it('THE PARKED DISCRIMINATOR, RUN: a fifth room type does NOT move the margin, and nor does an eighth', () => {
    // The whole of `PARKING.md`'s question, answered in one loop. Four is the shipped count.
    const shippedMargin = closestRoomToReserved(shipped);
    for (const extra of [1, 2, 3, 4]) {
      expect(
        closestRoomToReserved(withExtraRoomTypes(extra)),
        `with ${shipped.content.roomTypes.length + extra} room types, the closest room moved`,
      ).toBeCloseTo(shippedMargin, 4);
    }
  });

  it('AND THE MARGIN IS A ROUNDING, NOT HEADROOM — it sits ON the arc edge, not inside it', () => {
    // ===================================================================================
    // THE STATE THIS FORBIDS THAT ITS NEIGHBOURS PERMIT (ADR-0035): a first rung placed a
    // WHOLE DEGREE inside the arc would satisfy the arm above — the margin would still be
    // invariant in room count — and would satisfy `palette.contrast.test.ts`, which only asks
    // for `>= RESERVED_HUE_HALF_WIDTH`. It would not satisfy this. This is the arm that says
    // the guard is passing at equality rather than comfortably.
    //
    // IF THIS GOES RED BECAUSE THE MARGIN GREW, THE DEBT IS DISCHARGED AND THIS TEST COMES
    // OUT. Somebody has given the ladder real headroom — which is the repair this file names
    // and declines to make — and a debt nothing asserts can close without anybody noticing.
    // The message says so, because a red test that does not say what to do is a red test
    // somebody re-runs.
    // ===================================================================================
    const margin = closestRoomToReserved(shipped);
    expect(
      margin - RESERVED_HUE_HALF_WIDTH,
      `the closest room now clears ${RESERVED_HUE}° ± ${RESERVED_HUE_HALF_WIDTH}° by ` +
        `${(margin - RESERVED_HUE_HALF_WIDTH).toFixed(4)}°. If that is because somebody moved ` +
        'ROLE_HUE_PHASE.room off zero or started the arc inside its edge, THE DEBT IS ' +
        'DISCHARGED: delete this test and the PARKING.md item it answers. If it is because the ' +
        'first rung now lands INSIDE the arc, palette.contrast.test.ts is red too and that is ' +
        'the finding.',
    ).toBeLessThan(0.5);
    // And it is on the safe side of the line, which is the property the guard exists for.
    expect(margin).toBeGreaterThanOrEqual(RESERVED_HUE_HALF_WIDTH);
  });

  it('and it is the ROOM role alone that sits on the edge — which is what makes phase-zero the cause', () => {
    // =====================================================================================
    // THE NON-ENTAILED CLAIM. The two arms above are both about rooms; either would still pass
    // if EVERY role sat on the arc edge, which would mean the cause was the arc rather than
    // `ROLE_HUE_PHASE.room = 0`. This is the arm that separates those two explanations, and it
    // does it from OUTSIDE the module — the phases are private, so the observable is the only
    // honest route.
    //
    // (The first draft of this block asserted the room margin was invariant in room count a
    // second time — entailed by arm one, ADR-0035's exact class, in the fix for a note about
    // margins nobody had measured. It came out.)
    // =====================================================================================
    const marginOf = (role: string): number => {
      const colours = createPalette(shipped).byRole.get(role);
      if (colours === undefined || colours.size === 0) throw new Error(`no colours for role "${role}"`);
      return Math.min(...[...colours.values()].map((colour) => hueDistanceFromReserved(colour)));
    };
    // Rooms are on the line; items and needs are a third and two thirds of a step past it, so
    // they clear it by degrees rather than by a rounding.
    expect(marginOf('room') - RESERVED_HUE_HALF_WIDTH).toBeLessThan(0.5);
    for (const role of ['item', 'need']) {
      expect(marginOf(role) - RESERVED_HUE_HALF_WIDTH, `${role} is on the arc edge too`).toBeGreaterThan(0.5);
    }
  });
});
