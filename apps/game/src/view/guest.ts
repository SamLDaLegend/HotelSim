// A GUEST, AND EVERY NEED IT CARRIES (G-030).
//
// ---------------------------------------------------------------------------------------
// THIS IS THE ONLY MODULE IN `apps/game` THAT READS `NeedState`, AND THAT IS DELIBERATE
// CONTAINMENT RATHER THAN TIDINESS.
//
// ADR-0017 deletes `progressRemaining`'s terminal semantics and makes a need a STOCK that
// decays and refills: "it is never done". That lands in G-027, on the sim track, running in
// PARALLEL with this goal. It will change the shape this file reads. Keeping every field
// access in one file makes that a single-file repair with a known address instead of a
// scatter hunt through the renderer — and the address is written here so whoever does G-027
// finds it without looking.
//
// It is a scheduled cost, not a surprise, and it is recorded in both goal blocks.
// ---------------------------------------------------------------------------------------
//
// TWO ORTHOGONAL MARKS, BECAUSE THEY ANSWER TWO INDEPENDENT QUESTIONS. Inherited as a
// FINDING from `tools/viewer/viewer.js:401-419` — the code there is disposable, this
// reasoning is not:
//
//   COLOUR = what the guest is DOING: the need its provider is serving, or the lodging
//            colour while it is resting, or grey while it is doing nothing.
//   FILL   = whether it HAS A BED: filled if it holds a room, hollow if it does not.
//
// They used to be one chain, and that was the defect this kind of instrument exists to
// catch: `engagement !== null` tested first drew a roomless guest that happened to be
// eating pixel-identical to a housed one. Measured at `--rooms 1 --arrivals 120` over ten
// days: 19,619 roomless guest-ticks, 100% of them engaged — a watcher saw a basement of
// contented eaters and no signal at all that three quarters of them would never get a bed,
// while 89 of 120 guests left unsatisfied. That is §6.1's "UI that cannot express a state
// the sim can reach", and the fill is what closes it.

import { findNeedType, isNeedFailed, isNeedMet, lodgingNeedOf, NO_ENTITY } from '@hotelsim/sim';
import type { BoundContent, Guest, NeedState } from '@hotelsim/sim';
import type { Graphics } from 'pixi.js';
import { INK, UNKNOWN } from './palette.js';
import type { Palette } from './palette.js';

/** At or below this share of patience remaining, a guest is visibly in trouble. */
const FAILING_AT = 0.25;

export type GuestGeometry = {
  readonly bodyWidth: number;
  readonly bodyHeight: number;
  /** Height of the need vector standing above the head. */
  readonly needHeight: number;
  /** Width of one need's column. */
  readonly segmentWidth: number;
  /** Gap between columns. Non-zero: touching columns are one shape. */
  readonly segmentGap: number;
};

/**
 * The cell height a guest is drawn at its natural size in. Above it the guest grows, below
 * it shrinks, and both are clamped so a huge cell does not give a guest a torso and a tiny
 * one does not reduce it to a pixel.
 */
const NATURAL_CELL_HEIGHT = 110;

export function guestGeometry(cellHeight: number): GuestGeometry {
  const scale = Math.max(0.55, Math.min(cellHeight / NATURAL_CELL_HEIGHT, 1.8));
  return {
    // WIDER AND SHORTER THAN THE FIRST VERSION. A 9x20 sliver reads as a scratch; a squarer
    // body reads as a figure, and it gives the state marks somewhere to sit.
    bodyWidth: Math.max(5, Math.round(13 * scale)),
    bodyHeight: Math.max(8, Math.round(22 * scale)),
    // RESTORED AND ENLARGED. 14px was the original height and 3px the original column; the
    // column is now 4 with a 1px gap, so four needs occupy 19px against a 13px body — the
    // vector is deliberately WIDER than the figure it belongs to, which is what makes it a
    // chart rather than a hat. See `drawNeedVector` for why this is a size change and not a
    // mechanism change.
    needHeight: Math.max(6, Math.round(14 * scale)),
    segmentWidth: Math.max(3, Math.round(4 * scale)),
    segmentGap: Math.max(1, Math.round(1 * scale)),
  };
}

/** How wide this guest's vector is — what the pitch between guests has to clear. */
export function needVectorWidth(needs: number, geometry: GuestGeometry): number {
  if (needs <= 0) return 0;
  return needs * geometry.segmentWidth + (needs - 1) * geometry.segmentGap;
}

/**
 * How much of this need's patience is left, 0..1, or `null` when the loaded content does
 * not define the need at all — which makes the question unanswerable.
 *
 * IT RETURNS `null` RATHER THAN 1, AND THE DIRECTION OF THE OLD BUG IS THE WHOLE POINT
 * (`viewer.js:101-108`). It used to be `patience ? remaining / patience : 1`, so a need the
 * content does not carry drew a FULL bar: a need with no patience left rendered as the
 * healthiest state on screen. Silent, and in the reassuring direction, which is the worst
 * direction for something whose output becomes evidence in `JOURNAL.md`.
 */
export function patienceFractionOf(content: BoundContent, need: NeedState): number | null {
  const patience = findNeedType(content, need.needId)?.patienceTicks;
  if (patience === undefined || patience <= 0) return null;
  return Math.max(0, Math.min(need.patienceRemaining / patience, 1));
}

/** What this guest is doing, as a colour. */
function activityColourOf(content: BoundContent, palette: Palette, guest: Guest): number {
  if (guest.engagement !== null) return palette.needColour(guest.engagement.needId);
  const lodgingNeed = lodgingNeedOf(content);
  if (guest.roomEntityId !== NO_ENTITY && lodgingNeed !== undefined) {
    const lodging = guest.needs.find((need) => need.needId === lodgingNeed.id);
    if (lodging !== undefined && !isNeedMet(lodging)) return palette.needColour(lodging.needId);
  }
  return INK.guestIdle;
}

/**
 * The unmet need with the least patience left — the one the vector EMPHASISES.
 *
 * ---------------------------------------------------------------------------------------
 * THIS FUNCTION SURVIVED A REVERSAL AND ITS JOB CHANGED. It is worth reading the history,
 * because the mistake is a reusable one.
 *
 * WATCH #5 reported "lots of washout of bars", so this pass did two things at once: it
 * rebuilt the palette on luminance, and it REDUCED the vector to this one need. The
 * reduction was argued as "four 3px segments above a 13px body is not four readings, it is
 * one smudge" and, decisively, "it was not readable from the smudge either".
 *
 * WATCH #6 FALSIFIED THAT LAST SENTENCE, from the only person whose perception it was a
 * claim about: "I note I can only see one need at a time, whereas before I could see all
 * needs." They could read it. The claim that they could not was mine, not theirs.
 *
 * AND THE MECHANISM FOR WHY IT LOOKED TRUE IS THE LESSON: THE TWO CHANGES WENT IN TOGETHER,
 * AND THE SECOND WAS JUSTIFIED BY THE STATE OF THE FIRST BEFORE IT WAS REPAIRED. The need
 * role's colours came from the same wheel that had 32 of 66 pairs under 1.3:1 and a worst
 * pair at 1.00:1 — two needs of IDENTICAL luminance. Of course four columns of that smudged.
 * They now come from a ladder whose worst pair is 1.814:1 with nothing under threshold, and
 * NOBODY HAD EVER SEEN THE MULTI-SEGMENT BAR AGAINST THAT. The reduction was solving a
 * problem the other half of the same commit had already solved.
 *
 * So the vector is back, and this function keeps the half of the insight that was real: a
 * watcher scanning a crowd asks "who is in trouble" first, so the answer is EMPHASISED
 * within the full vector rather than substituted for it. Answering both questions was
 * always the target; dropping information to answer one was the error.
 * ---------------------------------------------------------------------------------------
 */
export function mostUrgentNeed(content: BoundContent, guest: Guest): NeedState | null {
  let worst: NeedState | null = null;
  let worstFraction = Infinity;
  for (const need of guest.needs) {
    if (isNeedMet(need)) continue;
    const fraction = patienceFractionOf(content, need);
    // An unknown need type is the most urgent thing on screen: it means the recording and
    // the content disagree, and every other reading is suspect.
    if (fraction === null) return need;
    if (fraction < worstFraction) {
      worstFraction = fraction;
      worst = need;
    }
  }
  return worst;
}

/**
 * One guest, standing with its feet on `baseY`, its need vector stacked above it.
 *
 * The vector is `guest.needs.length` segments wide — the needs THIS guest actually carries,
 * which is not necessarily every need the content defines: a guest migrated from an older
 * save carries the vector it formed under the content of its own era, and that is a true
 * statement about it rather than a gap to fill in.
 */
export function drawGuest(
  g: Graphics,
  content: BoundContent,
  palette: Palette,
  guest: Guest,
  x: number,
  baseY: number,
  geometry: GuestGeometry,
): void {
  const { bodyWidth, bodyHeight } = geometry;
  const urgent = mostUrgentNeed(content, guest);
  // THE ONLY URGENCY QUESTION LEFT AT THIS LEVEL IS THE HALO. Patience fractions, the
  // failing threshold and the bar heights all belong to `drawNeedVector` now — when the
  // single bar became a full vector, the per-column reading moved with it, and reading it
  // twice in two places is how the picture and the emphasis drift apart.
  const failed = urgent !== null && isNeedFailed(urgent);

  const top = baseY - bodyHeight;
  const colour = activityColourOf(content, palette, guest);
  const housed = guest.roomEntityId !== NO_ENTITY;

  // EVERY GUEST HAS AN EDGE, whatever its fill (the same rule the rooms now follow). A body
  // whose only boundary is its own colour disappears the moment it stands on a room of
  // similar tone, which is a thing the palette cannot prevent and an outline can.
  if (housed) {
    g.rect(x, top, bodyWidth, bodyHeight).fill(colour);
    g.rect(x + 0.5, top + 0.5, bodyWidth - 1, bodyHeight - 1).stroke({ width: 1, color: INK.soot });
  } else {
    // Hollow: no bed. The interior is the page showing through, so the difference from a
    // filled body is a large area rather than a hairline.
    g.rect(x, top, bodyWidth, bodyHeight).fill({ color: INK.background, alpha: 0.85 });
    g.rect(x + 1, top + 1, bodyWidth - 2, bodyHeight - 2).stroke({ width: 2, color: colour });
  }

  drawNeedVector(g, content, palette, guest, x, top - 3, geometry, urgent);

  // AND THE ALARM IS A HALO ROUND THE WHOLE FIGURE, not a three-pixel cap on its head.
  if (failed) {
    g.rect(x - 2.5, top - 2.5, bodyWidth + 5, bodyHeight + 5).stroke({ width: 2, color: INK.alarm });
  }
}

/**
 * EVERY NEED THIS GUEST CARRIES, one column each, standing on `baseY`.
 *
 * A column's HEIGHT is the patience left for that need, so a full vector is a level row of
 * bars and a hotel in trouble is visibly ragged. That is the reading the human asked for
 * back: "I can only see one need at a time, whereas before I could see all needs."
 *
 * THREE THINGS ARE DIFFERENT FROM THE VERSION THAT WAS REMOVED, and all three are size or
 * ground rather than mechanism — the mechanism was never the problem, the palette was:
 *
 *   BIGGER. Columns are 4px on a 1px gap instead of 3 on 1, and 14px tall. Four needs make
 *   a 19px chart over a 13px body, so the vector is wider than the figure rather than
 *   crammed onto it.
 *
 *   ON A PLATE. The whole strip sits on a dark ground, so a column is read against the same
 *   background whether the guest is standing in a near-white bedroom or a dark basement.
 *   Exactly the lesson the item pips already carry — a mark whose legibility depends on what
 *   it happens to be standing on is a mark that disappears somewhere.
 *
 *   A TRACK BEHIND EACH COLUMN. The drained part is drawn faintly rather than left empty, so
 *   "half gone" reads as half of something instead of as a shorter bar.
 *
 * It draws needs in `guest.needs` order, which is ascending by need id and therefore stable:
 * the same need is the same column for every guest on screen, which is what makes a row of
 * guests comparable at a glance.
 *
 * AND THAT ORDER MAKES THE VECTOR A LUMINANCE STAIRCASE, which is worth naming because it is
 * the property that decides whether four columns read as four things. The need ladder assigns
 * brightness by rank in ascending id order and this loop draws in ascending id order, so
 * every column is the brightest-but-one of its neighbours: measured on the shipped content,
 * ADJACENT columns separate at 1.840, 1.823 and 1.814 to one. The same four needs under the
 * palette this vector was removed for had a worst pair of 1.019:1 — two columns of
 * indistinguishable brightness. THAT was the smudge, and it was chromatic rather than
 * geometric, which is why restoring the vector at a slightly larger size is the whole fix.
 * (A reordering of either the ladder or this loop would break the staircase but not the
 * legibility floor: `palette.contrast.test.ts` holds EVERY pair apart, not just adjacent
 * ones.)
 */
function drawNeedVector(
  g: Graphics,
  content: BoundContent,
  palette: Palette,
  guest: Guest,
  x: number,
  baseY: number,
  geometry: GuestGeometry,
  urgent: NeedState | null,
): void {
  const { needHeight, segmentWidth, segmentGap } = geometry;
  const width = needVectorWidth(guest.needs.length, geometry);
  if (width === 0) return;
  const top = baseY - needHeight;

  g.rect(x - 2, top - 2, width + 4, needHeight + 4).fill({ color: INK.soot, alpha: 0.85 });

  guest.needs.forEach((need, i) => {
    const segX = x + i * (segmentWidth + segmentGap);
    const fraction = patienceFractionOf(content, need);
    // A need the content cannot name fills its whole column magenta: unanswerable, and loud
    // about it. Never a full bar in a plausible colour, which is the reassuring direction.
    if (fraction === null) {
      g.rect(segX, top, segmentWidth, needHeight).fill(UNKNOWN);
      return;
    }
    const tint = palette.needColour(need.needId);
    const met = isNeedMet(need);
    const dying = !met && (isNeedFailed(need) || fraction <= FAILING_AT);
    const filled = met ? needHeight : Math.max(1, Math.round(needHeight * fraction));
    g.rect(segX, top, segmentWidth, needHeight).fill({ color: tint, alpha: 0.28 });
    g.rect(segX, baseY - filled, segmentWidth, filled).fill(dying ? INK.alarm : tint);
    // A met need is capped, so "full" and "finished" are different pictures.
    if (met) g.rect(segX, top, segmentWidth, 2).fill(INK.paper);
    // THE EMPHASIS, AND IT IS THE HALF OF THE REDUCTION WORTH KEEPING: the column a watcher
    // should look at first is outlined. The question "who is in trouble" is answered without
    // the other three needs having to be thrown away to answer it.
    if (urgent !== null && need.needId === urgent.needId) {
      g.rect(segX - 1.5, top - 1.5, segmentWidth + 3, needHeight + 3).stroke({
        width: 1,
        color: INK.paper,
        alpha: 0.9,
      });
    }
  });
}
