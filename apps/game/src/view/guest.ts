// A GUEST, AND EVERY NEED IT CARRIES (G-030).
//
// ---------------------------------------------------------------------------------------
// THIS IS THE ONLY MODULE IN `apps/game` THAT READS `NeedState`, AND THAT IS DELIBERATE
// CONTAINMENT RATHER THAN TIDINESS.
//
// ADR-0017 deleted `progressRemaining`'s terminal semantics and made a need a STOCK that decays
// and refills: "it is never done". That landed in G-027b, on the sim track, which ran in
// PARALLEL with G-030 — and **THE PREDICTION CAME TRUE AND THE CONTAINMENT PAID**: the whole
// repair was `stockFractionOf` (then named `patienceFractionOf`) and `isWanted` below, in
// this file, at the address written
// here before the change existed. Nothing else in the renderer had to be opened.
//
// IT WAS A SCHEDULED COST AND IT IS NOW A SPENT ONE, kept because the containment argument is
// the reusable part: G-028 changes what "met" means, and the same rule applies — every
// `NeedState` field access stays in this file.
// ---------------------------------------------------------------------------------------
//
// TWO ORTHOGONAL MARKS, BECAUSE THEY ANSWER TWO INDEPENDENT QUESTIONS. Inherited as a
// FINDING from `drawGuest` in `tools/viewer/viewer.js` — the code there is disposable, this
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

import {
  findNeedType,
  isNeedEmpty,
  isNeedFull,
  isNeedWanted,
  lodgingNeedOf,
  NO_ENTITY,
  toleranceOf,
  wantAtOf,
} from '@hotelsim/sim';
import type { BoundContent, Guest, NeedState } from '@hotelsim/sim';
import type { Graphics } from 'pixi.js';
import { INK, UNKNOWN } from './palette.js';
import type { Palette } from './palette.js';

/**
 * At or below this share of a stock remaining — or of a lobby fuse — a guest is visibly in
 * trouble.
 *
 * It read "share of patience remaining" until θ-a sweep 2, and there is no patience: the two
 * quantities this threshold is applied to are how full a need's STOCK is and how much of a
 * queueing guest's `toleranceTicks` is left. Both are fractions and neither is a countdown on a
 * need.
 */
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
 * HOW FULL THIS NEED'S STOCK IS, 0..1 (G-027b), or `null` when the loaded content does not
 * define the need at all — which makes the question unanswerable.
 *
 * THE PICTURE IS THE SAME AND THE QUANTITY BEHIND IT IS NEW. It used to be patience remaining
 * over patience; a need is now a LEVEL, so it is `1 - deficit/capacity`. A full bar still means
 * a contented guest and an empty one still means trouble, which is why the column drawing below
 * needed no rework — but the field it reads is gone, and a renderer left reading it would have
 * drawn `undefined/undefined` on every guest.
 *
 * IT WAS CALLED `patienceFractionOf` UNTIL θ-a SWEEP 3. Sweep 2 fenced every sentence around it
 * and left the NAME, which is the sharpest form of the class this goal is about: prose can be
 * put in the past tense and an identifier cannot, so the only honest repairs are a rename or a
 * registration. Renamed, in both renderers, on the same pass.
 *
 * IT RETURNS `null` RATHER THAN 1, AND THE DIRECTION OF THE OLD BUG IS THE WHOLE POINT
 * (`stockFractionOf` in `tools/viewer/viewer.js` says the same at length, and is cited by
 * SYMBOL because the line range this used to name had already drifted off it). It used to
 * be `patience ? remaining / patience : 1`, so a need the
 * content does not carry drew a FULL bar: a need with nothing left rendered as the healthiest
 * state on screen. Silent, and in the reassuring direction, which is the worst direction for
 * something whose output becomes evidence in `JOURNAL.md`.
 */
export function stockFractionOf(content: BoundContent, need: NeedState): number | null {
  const capacity = findNeedType(content, need.needId)?.capacityTicks;
  if (capacity === undefined || capacity <= 0) return null;
  return Math.max(0, Math.min(1 - need.deficit / capacity, 1));
}

/**
 * Is this need one the guest is currently after? **`isNeedWanted`, called** (G-027b).
 *
 * IT ASKS THE SIM'S OWN PREDICATE rather than re-deriving a threshold here: a renderer that
 * decided for itself where "wanting" starts would be holding authoritative state, which is
 * §6.1's first render defect.
 *
 * ---------------------------------------------------------------------------------------
 * IT USED TO SAY THAT AND RE-IMPLEMENT THE PREDICATE INSTEAD, DROPPING THE `beingServed` ARM
 * — AND THE PICTURE THE HUMAN ANSWERED THE NAPS WATCH QUESTION AGAINST WAS THE BROKEN ONE.
 *
 * `isNeedWanted` is a SCHMITT TRIGGER: wanting starts at the want line and stops only at FULL,
 * so a need something is already serving stays wanted all the way up. A copy that tested only
 * `deficit >= wantLine` drops the second arm, and the state it drops is the commonest thing a
 * housed guest does — sleeping. A guest asleep in its own bed rendered as a guest doing nothing,
 * for the tail of every nap.
 *
 * TWO MEASUREMENTS OF IT, BOTH OVER `--days 4 --seed 7 --rooms 6 --amenities 2 --arrivals 60`,
 * and they count different things — the run is deterministic (I2), so each is the population
 * rather than a sample:
 *
 *   `ai-critic`, round 1, from the recording at `--record-every 10`: GUEST 1 is at home being
 *   refilled for 749 FRAMES and 432 of them (58%) drew as idle grey, the longest unbroken
 *   stretch being 179 consecutive ticks of a 272-tick nap.
 *
 *   The repair, stepped rather than recorded, over EVERY guest and every TICK: of 21,511
 *   at-home guest-ticks, the dropped-arm predicate called 13,220 (61.5%) idle, longest single-
 *   guest run 481 ticks; calling `isNeedWanted` with `beingServed` leaves 2,632 (12.2%), which
 *   are the ticks the lodging need really is full and the guest really is doing nothing.
 *
 * `beingServed` IS A FACT THE CALLER HAS AND THIS FUNCTION CANNOT DERIVE, which is why the
 * predicate takes it. For the lodging need it is `holds a room && not engaged` — the same
 * derivation `stepGuests` makes for `const atHome` in `guests.ts`, and the reason a guest at a
 * café is not also asleep in its bed (ADR-0017 §3). `activityColourOf` is the only caller and it
 * has both facts already. (Cited by SYMBOL: both citations of it in this file carried a line
 * number in `guests.ts` until θ-a's unpinned-claim pass, by which time the definition had moved
 * six lines below it.)
 * ---------------------------------------------------------------------------------------
 */
function isWanted(content: BoundContent, need: NeedState, beingServed: boolean): boolean {
  return isNeedWanted(findNeedType(content, need.needId), need, wantAtOf(content), beingServed);
}

/**
 * How much of its `toleranceTicks` a guest waiting for a room has left, 0..1 — **re-derived
 * from the clock, because the field it used to read is gone** (G-027b). `null` for a guest that
 * holds a room, which has no fuse.
 *
 * A GUEST IN THE LOBBY IS THE ONE THING ON SCREEN WITH A DEADLINE, and it is the only deadline
 * left in the model: it leaves at `toleranceTicks` after arriving unless it gets a room. That
 * used to be legible as the lodging need's patience bar; under a stock the lodging need's bar
 * shows a LEVEL, which for a roomless guest barely moves — so without this the queueing guest's
 * fuse would simply have disappeared from the picture, in the goal whose exit criterion is a
 * watch.
 *
 * IT WAS COMPUTED AND NEVER DRAWN FOR ONE CRITIQUE ROUND, WHICH MADE THE PARAGRAPH ABOVE A
 * DESCRIPTION OF A DEFECT IT DID NOT FIX. `drawLobbyFuse` is the repair; the sentence is kept
 * because the reason the mark exists is still the reason, and because "exported, argued for, and
 * called by nothing" is a shape worth being able to recognise.
 */
export function lobbyFractionOf(content: BoundContent, guest: Guest, tick: number): number | null {
  if (guest.roomEntityId !== NO_ENTITY) return null;
  const tolerance = toleranceOf(content);
  if (tolerance === undefined || tolerance <= 0) return null;
  return Math.max(0, Math.min(1 - (tick - guest.arrivedTick) / tolerance, 1));
}

/** Empty — nothing left in the stock — asked with the content the caller already holds. */
function isNeedEmptyIn(content: BoundContent, need: NeedState): boolean {
  const needType = findNeedType(content, need.needId);
  return needType !== undefined && isNeedEmpty(needType, need);
}

/** What this guest is doing, as a colour. */
function activityColourOf(content: BoundContent, palette: Palette, guest: Guest): number {
  if (guest.engagement !== null) return palette.needColour(guest.engagement.needId);
  const lodgingNeed = lodgingNeedOf(content);
  // AT HOME: holds a room and is not engaged — the engaged case returned one line above, so
  // this IS the sim's own definition of presence (`const atHome` in `guests.ts`) and therefore
  // of "the room is serving the lodging need this tick". That is exactly the `beingServed` fact
  // `isNeedWanted` needs and cannot see for itself.
  const atHome = guest.roomEntityId !== NO_ENTITY;
  if (atHome && lodgingNeed !== undefined) {
    const lodging = guest.needs.find((need) => need.needId === lodgingNeed.id);
    if (lodging !== undefined && isWanted(content, lodging, true)) return palette.needColour(lodging.needId);
  }
  return INK.guestIdle;
}

/**
 * The wanting need with the LEAST LEFT IN IT — the one the vector EMPHASISES.
 *
 * (It read "the least patience left" until θ-a sweep 3's enumeration, which covered apps/.
 * There is no patience: what is ranked is how empty a stock is.)
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
    if (isNeedFull(need)) continue;
    const fraction = stockFractionOf(content, need);
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
 * One guest, standing with its feet on `baseY`, its need vector stacked above it and — if it is
 * still waiting for a room — its lobby fuse beneath its feet.
 *
 * The vector is `guest.needs.length` segments wide — the needs THIS guest actually carries,
 * which is not necessarily every need the content defines: a guest migrated from an older
 * save carries the vector it formed under the content of its own era, and that is a true
 * statement about it rather than a gap to fill in.
 *
 * `tick` IS THE WORLD'S, AND IT IS HERE FOR THE FUSE ALONE. It is the only quantity in this file
 * that is not read off the guest, because the one deadline left in the model is a clock
 * comparison rather than a stored countdown (`lobbyFractionOf`).
 */
export function drawGuest(
  g: Graphics,
  content: BoundContent,
  palette: Palette,
  guest: Guest,
  x: number,
  baseY: number,
  geometry: GuestGeometry,
  tick: number,
): void {
  const { bodyWidth, bodyHeight } = geometry;
  const urgent = mostUrgentNeed(content, guest);
  // THE ONLY URGENCY QUESTION LEFT AT THIS LEVEL IS THE HALO. `stockFractionOf`, the failing
  // threshold and the bar heights all belong to `drawNeedVector` now — when the single bar
  // became a full vector, the per-column reading moved with it, and reading it twice in two
  // places is how the picture and the emphasis drift apart.
  //
  // IT SAID "PATIENCE FRACTIONS" UNTIL θ-a'S UNPINNED-CLAIM PASS: the present tense, naming a
  // quantity the PREVIOUS pass had already renamed at the top of this same file, and renamed
  // there for the stated reason that an identifier cannot be put in the past tense. The rename
  // landed and the sentence pointing at it did not. **A rename that leaves
  // its own references behind is exactly what a pin catches and prose does not**, so both
  // identifiers named above are registered in `tools/headless/src/prose-citations.test.ts` and
  // the next rename reddens instead of drifting.
  const failed =
    urgent !== null && isNeedEmptyIn(content, urgent);

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
  drawLobbyFuse(g, content, guest, x, baseY, geometry, tick);

  // AND THE ALARM IS A HALO ROUND THE WHOLE FIGURE, not a three-pixel cap on its head.
  if (failed) {
    g.rect(x - 2.5, top - 2.5, bodyWidth + 5, bodyHeight + 5).stroke({ width: 2, color: INK.alarm });
  }
}

/**
 * THE LOBBY FUSE: a bar UNDER THE FEET of a guest that is still waiting for a room, shrinking
 * from full to nothing as its `toleranceTicks` run out. Nothing is drawn for a guest that holds
 * a room, because it has no fuse.
 *
 * A THIRD MARK, AND IT IS DELIBERATELY NOT ONE OF THE FIRST TWO. The header's rule is that
 * COLOUR says what the guest is doing and FILL says whether it has a bed; a fuse is a third,
 * independent question — how long it has left to get one — and folding it into either of the
 * other two is the chain-of-conditions defect that block records. So it is drawn OUTSIDE the
 * body, below the feet, in the 5px the standing row leaves between a guest and the floor line.
 * A watcher can read all three at once, and the one that is absent for most guests is absent
 * rather than encoded as an ambiguous shade of a mark that is always there.
 *
 * IT IS SPATIALLY THE OPPOSITE OF THE NEED VECTOR ON PURPOSE. Needs stack ABOVE the head and
 * this sits BELOW the feet, so "the clock on this guest" and "what this guest wants" cannot be
 * misread for one another at a glance, however crowded the cell gets.
 *
 * IT TURNS ALARM AT THE SAME `FAILING_AT` THE COLUMNS USE, which is the point of sharing the
 * threshold: a hotel where the lobby is going red is the same reading as a hotel where the bars
 * are, and a watcher does not have to learn two scales.
 */
function drawLobbyFuse(
  g: Graphics,
  content: BoundContent,
  guest: Guest,
  x: number,
  baseY: number,
  geometry: GuestGeometry,
  tick: number,
): void {
  const left = lobbyFractionOf(content, guest, tick);
  if (left === null) return;
  const { bodyWidth } = geometry;
  // The track is the whole width, so a short bar reads as "most of it gone" rather than as a
  // small mark — the same reason the need columns have a track behind them.
  g.rect(x, baseY + 1, bodyWidth, 2).fill({ color: INK.soot, alpha: 0.85 });
  const lit = Math.max(1, Math.round(bodyWidth * left));
  g.rect(x, baseY + 1, lit, 2).fill(left <= FAILING_AT ? INK.alarm : INK.paper);
}

/**
 * EVERY NEED THIS GUEST CARRIES, one column each, standing on `baseY`.
 *
 * A column's HEIGHT is how full that need's STOCK is, so a full vector is a level row of
 * bars and a hotel in trouble is visibly ragged. That is the reading the human asked for
 * back: "I can only see one need at a time, whereas before I could see all needs." (It read
 * "the patience left for that need" until θ-a sweep 2; `stockFractionOf` above has said what
 * the quantity is since G-027b, and this paragraph had not caught up.)
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
    const fraction = stockFractionOf(content, need);
    // A need the content cannot name fills its whole column magenta: unanswerable, and loud
    // about it. Never a full bar in a plausible colour, which is the reassuring direction.
    if (fraction === null) {
      g.rect(segX, top, segmentWidth, needHeight).fill(UNKNOWN);
      return;
    }
    const tint = palette.needColour(need.needId);
    const met = isNeedFull(need);
    const dying = !met && (isNeedEmptyIn(content, need) || fraction <= FAILING_AT);
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
