// THE LOSE STATE, AS WORDS (G-070, ADR-0109).
//
// ==========================================================================================
// **THE LOSE STATE WARNS AND CHANGES NOTHING MECHANICALLY** — the human's ruling, and it is the
// reason this file is a formatter and nothing else. Rejected in the same sitting: an insolvency
// state with teeth (no building, arrivals dry up, staff leave), and warn-then-bite. There is no
// mechanic here to find, because there is not supposed to be one.
//
// NOTHING HERE COMPUTES ECONOMICS. `solvencyOf` in `packages/sim` decides the three numbers AND
// decides whether to warn (`isLosing`); this turns them into three strings. That is G-066b's
// rule — ONE SELECTION PATH — and the reason `describeFeed` holds no selection either: two
// places that both decide when to warn are two places that can disagree about whether the hotel
// is losing, and the player would be looking at one of them.
//
// NO DOM AND NO PIXI, DELIBERATELY, AND IT IS LOAD-BEARING RATHER THAN TIDY — `rating.ts`'s
// argument, one system over. `hud.ts` draws this into the browser and
// `scripts/record-frames.ts` writes it into the caption of every recorded SVG frame, and that
// second host is typechecked with `types: ["node"]` and no DOM lib. **One formatter, two
// surfaces**, so the frame a WATCH is written from says exactly what the player's HUD said —
// which is what ADR-0013 demands of a perceptual finding and what this goal's WATCH rests on.
// ==========================================================================================
//
// THE THREE FACTS ARE THE HUMAN'S OWN PREVIEW, AND IT IS THE SPECIFICATION:
//
//     cash -£2,340.00  ·  losing £410 a night  ·  4 nights to nothing
//
// which is G-062's rating cell one system over — *what am I* / *why am I that* / *what next* —
// the shape the human ruled to be the core of that system.
//
// **THE PREVIEW'S ARITHMETIC DOES NOT CLOSE AS WRITTEN AND THAT IS THE DESIGN.** Negative cash
// with four nights left is only coherent if "nothing" is something other than cash: the runway
// is measured against `balance + liquidationValue`, `canDrawLoan`'s own gate quantity, which is
// how much hotel is left to sell before you cannot come back. ADR-0108 makes bankruptcy
// RECOVERABLE, so the third fact says **how long recovery remains possible**. See
// `packages/sim/src/solvency.ts` for the derivation; this file must not restate it.
//
// AND SINCE G-072 THE SELECTOR ALSO DECIDES WHETHER THE NIGHT IS EVIDENCE AT ALL — a night in
// which no stay could have completed carries a full night's upkeep against structurally zero
// revenue, so it is a startup artefact rather than a rate. **THAT RULE IS NOT HERE AND MUST NOT
// COME HERE.** It arrives through `isLosing` like everything else, because the tick this file
// would have to consult in order to hold an opinion of its own is exactly the thing that would
// let the HUD and a recorded frame's caption disagree about whether the hotel is losing.

import { isLosing } from '@hotelsim/sim';
import type { Solvency } from '@hotelsim/sim';
import { moneyOf } from './money.js';

/**
 * The three facts as three strings, or `null` when there is nothing to warn about.
 *
 * `null` RATHER THAN EMPTY STRINGS, because "do not draw this at all" is a different instruction
 * from "draw it with nothing in it", and the surface that costs pixels is the one the caller has
 * to be able to skip. E-013 is an open human complaint about how much of the page the chrome
 * takes; a warning that is always present is a permanent tax on the picture.
 */
export type SolvencyText = {
  /** WHAT AM I. `cash -£2,340.00`. */
  readonly cash: string;
  /** WHY AM I THAT. `losing £410.00 a night`. */
  readonly burn: string;
  /** WHAT NEXT. `4 nights to nothing`. */
  readonly runway: string;
};

/**
 * IT IS A PURE FUNCTION OF A `Solvency` AND NOTHING ELSE. No world, no tick, no clock — so the
 * same reading produces the same words in the browser and in a recorded frame.
 */
export function describeSolvency(solvency: Solvency): SolvencyText | null {
  // THE VISIBILITY RULE IS ASKED FOR, NOT RE-DERIVED. `isLosing` is the simulation's own
  // predicate and it is deliberately not "the balance is negative": a hotel can be deep in debt
  // with plenty left to sell and in credit one night from the end of its options.
  if (!isLosing(solvency)) return null;
  const nights = solvency.nightsRemaining;
  const perNight = 0 - (solvency.lastNightPence ?? 0);
  return {
    cash: `cash ${moneyOf(solvency.balancePence)}`,
    // `losing £410.00 a night`, with the sign already spent by the word. Printing
    // `losing -£410.00` would say the opposite twice and read as a double negative.
    burn: `losing ${moneyOf(perNight)} a night`,
    runway: runwayWords(nights ?? 0),
  };
}

/**
 * `4 nights to nothing`, `1 night to nothing`, or — at zero — a sentence rather than a count.
 *
 * ZERO IS NOT WRITTEN AS "0 nights". `nightsRemaining` floors at 0, and it reads 0 when the hotel
 * would not survive tonight OR when its reserves are already gone; "0 nights to nothing" invites
 * a player to read it as a countdown that has finished, which would be a claim about a game-over
 * this build does not have (ADR-0109: the lose state changes nothing mechanically). What is
 * TRUE at zero is the thing the runway measures: there is no longer enough hotel to sell.
 *
 * The plural is this layer's grammar to get right, exactly as `describeRating`'s `1 star` is —
 * unlike a room type's name, which belongs to content and is never bent.
 */
function runwayWords(nights: number): string {
  if (nights <= 0) return 'nothing left to sell';
  return `${nights} ${nights === 1 ? 'night' : 'nights'} to nothing`;
}

/**
 * The three facts on one line, for a host with no columns — a recorded frame's caption.
 *
 * The separator is the one the human's preview used and the one `hud.ts` puts between cells, so
 * a caption and a HUD strip read the same way.
 */
export function solvencyLine(text: SolvencyText): string {
  return `${text.cash} · ${text.burn} · ${text.runway}`;
}
