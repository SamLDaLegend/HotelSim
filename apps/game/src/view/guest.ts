// A GUEST, AND EVERY NEED IT CARRIES (G-030, ported to isometric at G-035).
//
// ---------------------------------------------------------------------------------------
// PORTED, NOT REDESIGNED (ADR-0046 §3). The projection changed; the READINGS did not, and
// they were argued for over three WATCH cycles with a human looking at them. Everything below
// answers the same questions it answered in the cross-section, from the same fields, at the
// same thresholds — what moved is where the marks are placed and that the body is now a
// greyscale figure with a runtime tint rather than a filled rectangle.
//
// THIS IS THE ONLY MODULE IN `apps/game` THAT READS `NeedState`, AND THAT IS DELIBERATE
// CONTAINMENT RATHER THAN TIDINESS.
//
// ADR-0017 deleted `progressRemaining`'s terminal semantics and made a need a STOCK that decays
// and refills: "it is never done". That landed in G-027b, on the sim track, which ran in
// PARALLEL with G-030 — and **THE PREDICTION CAME TRUE AND THE CONTAINMENT PAID**: the whole
// repair was `stockFractionOf` (then named `patienceFractionOf`) and `isWanted` below, in
// this file, at the address written here before the change existed. Nothing else in the
// renderer had to be opened. **IT PAID A SECOND TIME AT G-035**, which threw the projection
// away and kept this file's predicates unchanged.
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
//
// AND COLOUR IS NOW THE TINT (ADR-0047 A6). The figure is greyscale artwork; the "what is
// this guest doing" colour is multiplied onto it at draw time. That is the same reading
// carried by a different mechanism, and it is the mechanism the real art track needs — see
// `figure.ts`.
// ---------------------------------------------------------------------------------------

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
import type { BoundContent, Cell, Guest, NeedState } from '@hotelsim/sim';
import { FIGURE_HEIGHT, FIGURE_WIDTH } from './figure.js';
import { INK, UNKNOWN } from './palette.js';
import type { Palette } from './palette.js';
import type { Facing, Primitive } from './primitives.js';

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
  /** What the figure primitive is scaled by. `figure.ts` authors at scale 1. */
  readonly scale: number;
};

/**
 * Geometry for a guest drawn at camera scale `scale`.
 *
 * IT TAKES THE CAMERA'S SCALE RATHER THAN A CELL HEIGHT (G-035). In the cross-section a cell
 * had a pixel height and the figure was sized off it; in isometric a tile is a fixed 128x64
 * (locked, ADR-0047 A2) and the only thing that varies is the camera's framing scale. Same
 * idea, one fewer indirection.
 *
 * THE CLAMP SURVIVES AND ITS REASON SURVIVES WITH IT: below it a guest is a smear, above it a
 * guest is a mascot. A hotel framed very small still has to show WHO IS IN TROUBLE, which is
 * the vector, so the marks stop shrinking before they stop being marks.
 */
export function guestGeometry(scale: number): GuestGeometry {
  const drawn = Math.max(0.5, Math.min(scale, 1.4));
  return {
    scale: drawn,
    bodyWidth: Math.max(6, Math.round(FIGURE_WIDTH * drawn)),
    bodyHeight: Math.max(10, Math.round(FIGURE_HEIGHT * drawn)),
    // RESTORED AND ENLARGED AT G-030, UNCHANGED HERE. Four needs occupy 19px against a 24px
    // body at scale 1 — the vector is deliberately about as wide as the figure it belongs
    // to, which is what makes it a chart rather than a hat. See `drawNeedVector`.
    needHeight: Math.max(6, Math.round(14 * drawn)),
    segmentWidth: Math.max(3, Math.round(4 * drawn)),
    segmentGap: Math.max(1, Math.round(1 * drawn)),
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
 * and left the NAME, which is the sharpest form of the class that goal was about: prose can be
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
 * café is not also asleep in its bed (ADR-0017 §3). `guestTintOf` is the only caller and it
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

/**
 * WHAT THIS GUEST IS DOING, AS A COLOUR — and at G-035 that colour is the TINT applied to the
 * greyscale figure (ADR-0047 A6).
 *
 * Renamed from `activityColourOf` because the value now has a job as well as a meaning, and the
 * name should say which: it is the multiply, not a fill. The DERIVATION is untouched.
 */
export function guestTintOf(content: BoundContent, palette: Palette, guest: Guest): number {
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
 * WHICH WAY THE GUEST IS LOOKING (ADR-0047 A6, four facings).
 *
 * THE SIMULATION HAS NO HEADING AND THIS DOES NOT INVENT ONE INTO IT. `Guest.at` is a cell
 * (G-023a) and nothing moves yet (G-023b-i is unbuilt), so a facing is DERIVED here, in the
 * render layer, from two cells the world already carries: where the guest is standing and
 * where the room it holds is. A guest engaged at a provider is looking at what it came for;
 * a guest with a room elsewhere is looking towards its room; a guest with neither faces the
 * camera, which is the state a watcher most needs to be able to read.
 *
 * IT IS A LOOK AND NOT A FACT, AND THAT IS SAID OUT LOUD. Nothing in the simulation agrees or
 * disagrees with it, nothing is stored, and it changes no outcome. When transit lands, the
 * facing comes from the movement vector and this function is the only line that changes —
 * which is the whole reason it is one function rather than an expression at the draw site.
 */
export function facingOf(at: Cell, lookingAt: Cell | null): Facing {
  if (lookingAt === null) return 'se';
  const dc = lookingAt.column - at.column;
  const dr = lookingAt.row - at.row;
  if (dc === 0 && dr === 0) return 'se';
  // The larger step wins; ties go to the column, which is the axis the shipped one-row plot
  // actually has.
  if (Math.abs(dc) >= Math.abs(dr)) return dc >= 0 ? 'se' : 'nw';
  return dr >= 0 ? 'sw' : 'ne';
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
 * One guest, standing with its feet on `(x, y)`, its need vector stacked above it and — if it
 * is still waiting for a room — its lobby fuse beneath its feet.
 *
 * The vector is `guest.needs.length` segments wide — the needs THIS guest actually carries,
 * which is not necessarily every need the content defines: a guest migrated from an older
 * save carries the vector it formed under the content of its own era, and that is a true
 * statement about it rather than a gap to fill in.
 *
 * `tick` IS THE WORLD'S, AND IT IS HERE FOR THE FUSE ALONE. It is the only quantity in this file
 * that is not read off the guest, because the one deadline left in the model is a clock
 * comparison rather than a stored countdown (`lobbyFractionOf`).
 *
 * IT APPENDS TO A LIST RATHER THAN CALLING A GRAPHICS OBJECT (G-035). The guest is drawn as a
 * `figure` primitive — greyscale artwork, runtime tint — and the marks around it are plain
 * shapes. Nothing here knows what Pixi is, which is what lets the recorder draw the same guest.
 */
export function drawGuest(
  out: Primitive[],
  content: BoundContent,
  palette: Palette,
  guest: Guest,
  x: number,
  baseY: number,
  geometry: GuestGeometry,
  tick: number,
  facing: Facing,
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
  const failed = urgent !== null && isNeedEmptyIn(content, urgent);

  const top = baseY - bodyHeight;
  const tint = guestTintOf(content, palette, guest);
  const housed = guest.roomEntityId !== NO_ENTITY;

  out.push({ kind: 'figure', x, y: baseY, scale: geometry.scale, facing, tint, filled: housed });

  drawNeedVector(out, content, palette, guest, x, top - 3, geometry, urgent);
  drawLobbyFuse(out, content, guest, x, baseY, geometry, tick);

  // AND THE ALARM IS A HALO ROUND THE WHOLE FIGURE, not a three-pixel cap on its head.
  if (failed) {
    out.push({
      kind: 'rect',
      x: x - bodyWidth / 2 - 3,
      y: top - 3,
      w: bodyWidth + 6,
      h: bodyHeight + 6,
      stroke: { width: 2, colour: INK.alarm },
    });
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
 * body, below the feet. A watcher can read all three at once, and the one that is absent for
 * most guests is absent rather than encoded as an ambiguous shade of a mark that is always
 * there.
 *
 * IT IS SPATIALLY THE OPPOSITE OF THE NEED VECTOR ON PURPOSE. Needs stack ABOVE the head and
 * this sits BELOW the feet, so "the clock on this guest" and "what this guest wants" cannot be
 * misread for one another at a glance, however crowded the tile gets.
 *
 * IT TURNS ALARM AT THE SAME `FAILING_AT` THE COLUMNS USE, which is the point of sharing the
 * threshold: a hotel where the lobby is going red is the same reading as a hotel where the bars
 * are, and a watcher does not have to learn two scales.
 */
function drawLobbyFuse(
  out: Primitive[],
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
  const originX = x - bodyWidth / 2;
  // The track is the whole width, so a short bar reads as "most of it gone" rather than as a
  // small mark — the same reason the need columns have a track behind them.
  out.push({ kind: 'rect', x: originX, y: baseY + 2, w: bodyWidth, h: 3, fill: INK.soot, alpha: 0.85 });
  const lit = Math.max(1, Math.round(bodyWidth * left));
  out.push({
    kind: 'rect',
    x: originX,
    y: baseY + 2,
    w: lit,
    h: 3,
    fill: left <= FAILING_AT ? INK.alarm : INK.paper,
  });
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
 *   BIGGER. Columns are 4px on a 1px gap instead of 3 on 1, and 14px tall.
 *
 *   ON A PLATE. The whole strip sits on a dark ground, so a column is read against the same
 *   background whether the guest is standing in a near-white bedroom or a dark basement.
 *   Exactly the lesson the item pips already carry — a mark whose legibility depends on what
 *   it happens to be standing on is a mark that disappears somewhere. **In isometric it
 *   matters MORE, not less: a guest stands on a tile whose colour is the room's, with a wall
 *   of a second shade behind its head.**
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
  out: Primitive[],
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
  const left = x - width / 2;
  const top = baseY - needHeight;

  out.push({ kind: 'rect', x: left - 2, y: top - 2, w: width + 4, h: needHeight + 4, fill: INK.soot, alpha: 0.85 });

  guest.needs.forEach((need, i) => {
    const segX = left + i * (segmentWidth + segmentGap);
    const fraction = stockFractionOf(content, need);
    // A need the content cannot name fills its whole column magenta: unanswerable, and loud
    // about it. Never a full bar in a plausible colour, which is the reassuring direction.
    if (fraction === null) {
      out.push({ kind: 'rect', x: segX, y: top, w: segmentWidth, h: needHeight, fill: UNKNOWN });
      return;
    }
    const tint = palette.needColour(need.needId);
    const met = isNeedFull(need);
    const dying = !met && (isNeedEmptyIn(content, need) || fraction <= FAILING_AT);
    const filled = met ? needHeight : Math.max(1, Math.round(needHeight * fraction));
    out.push({ kind: 'rect', x: segX, y: top, w: segmentWidth, h: needHeight, fill: tint, alpha: 0.28 });
    out.push({ kind: 'rect', x: segX, y: baseY - filled, w: segmentWidth, h: filled, fill: dying ? INK.alarm : tint });
    // A met need is capped, so "full" and "finished" are different pictures.
    if (met) out.push({ kind: 'rect', x: segX, y: top, w: segmentWidth, h: 2, fill: INK.paper });
    // THE EMPHASIS, AND IT IS THE HALF OF THE REDUCTION WORTH KEEPING: the column a watcher
    // should look at first is outlined. The question "who is in trouble" is answered without
    // the other three needs having to be thrown away to answer it.
    if (urgent !== null && need.needId === urgent.needId) {
      out.push({
        kind: 'rect',
        x: segX - 1.5,
        y: top - 1.5,
        w: segmentWidth + 3,
        h: needHeight + 3,
        stroke: { width: 1, colour: INK.paper, alpha: 0.9 },
      });
    }
  });
}
