// WHAT RECENT GUESTS SAID, AS WORDS (G-066b).
//
// ==========================================================================================
// THE HOTEL HAD A VOICE AND NOBODY COULD HEAR IT. G-065 wrote the table, G-066a bought the
// storage — `world.recentRemarks`, a ring of the last 48 departures, save v25 — and
// `grep -ri remark apps/game/src` returned NOTHING. This file is the half that puts it in
// front of a person.
//
// ------------------------------------------------------------------------------------------
// ONE SELECTION PATH, AND THIS FILE DOES NOT CONTAIN IT.
//
// `spokenRemarkFrom` (packages/sim/src/reviews.ts) turns a stored record into a sentence, and
// it is the same function `remarkFor` reaches at a departure. G-066a's entire design argument
// is that there is exactly ONE path from a stay to a line — so "what the guest said as it left"
// and "what the feed shows for that departure" are the same code and cannot drift. A HUD that
// re-implemented the choice, or cached the rendered text, would spend that.
//
// So nothing here selects, ranks, ties or substitutes. It reverses a ring, takes a bounded
// prefix, and formats a score. Every sentence on screen came out of the simulation's own
// selector, under a book the simulation's own binder refused to accept with a hole in it.
//
// ------------------------------------------------------------------------------------------
// THE SCORE IS NOT DRAWN AS STARS, AND THAT IS ADR-0082 RATHER THAN TASTE.
//
//   star rating   a professional INSPECTION of what the hotel HAS.       `rating.ts`.
//   review score  what ONE GUEST thought of ONE STAY.                    here.
//
// They are two currencies, they can and should disagree, and `rating.ts` prints the
// distinction beside the glyphs for exactly that reason. Reusing U+2605 here would put the two
// judgements in the same visual vocabulary on the same screen, which is the blur that ruling
// exists to prevent. A review score is printed in digits, over the scale the CONTENT declares
// — `reviewScoreMin`/`reviewScoreMax` in `guest-rules.json` — so a rebalance of the scale
// renames the label with no edit here.
//
// ------------------------------------------------------------------------------------------
// NO DOM AND NO PIXI, for `rating.ts`'s reason and it is load-bearing rather than tidy:
// `hud.ts` draws these lines into the browser and `scripts/record-frames.ts` writes them into
// the caption of a recorded SVG frame, and that second host is typechecked with
// `types: ["node"]` and no DOM lib. One formatter, two surfaces — so the frame a WATCH is
// written from says exactly what the player's panel said.
//
// NO CONTENT ID IS SPELLED HERE (ADR-0003). A remark's `needId` never reaches this layer at
// all: `spokenRemarkFrom` consumes it and returns text.
// ==========================================================================================

import { reviewScaleOf, spokenRemarkFrom } from '@hotelsim/sim';
import type { BoundContent, RemarkBook, RemarkRecord } from '@hotelsim/sim';

/**
 * HOW MANY DEPARTURES THE PANEL SHOWS AT ONCE, AND WHAT THE TABLE'S SIZE IS DERIVED FROM.
 *
 * ==========================================================================================
 * THE PANEL SIZE IS A LAYOUT DECISION AND IS LABELLED ONE. §2.1 governs GATE thresholds — "a
 * number a gate compares against" — and nothing compares against this; it is the same kind of
 * number as `GUEST_POSITIONS_SHOWN` in `main.ts`. E-013 is an OPEN human complaint that the
 * chrome already takes 45% of a 580px pane (WATCH #33), so the panel is small on purpose and
 * is drawn OVER the stage rather than in a new chrome row, which costs the HUD zero cells.
 *
 * WHAT IS DERIVED IS THE CONTENT TABLE, FROM THIS NUMBER. `spokenRemarkFrom` breaks a tie with
 * `guestId % tied` over rows of equal rank, so in the worst case the simulation can produce —
 * every record in ONE (score, need, hours) cell, with consecutive guest ids — the number of
 * DISTINCT lines a window of the feed can hold is exactly the number of rows in that cell. So:
 *
 *   REQUIREMENT: no two lines visible on the panel at one time are word for word identical,
 *                in the worst case above.
 *   THEREFORE:   `guest-remarks.json` carries at least this many rows in every cell.
 *
 * It carries exactly four, in all twenty-five cells (5 scores x (4 needs + 1 wildcard)), and
 * the requirement is MEASURED rather than asserted — `--days 3 --seed 42 --rooms 1
 * --amenities 0 --demand` is a four-record feed whose every record is score 1, `Comfort`, five
 * unserved hours, and it renders four different lines. Before G-066b it rendered one line four
 * times (WATCH #34).
 *
 * WHAT THIS DOES NOT CLAIM, because the honest limit is short: the guarantee rests on the
 * guest ids in the window being CONSECUTIVE, which is what the simulation produces when a
 * hotel departs everyone it admits. Ids ascend by ARRIVAL and two guests can depart in the
 * opposite order (`assertRecentRemarks` says so about the ring's order), so a window whose ids
 * all share a residue mod four would repeat. That case has not been observed and is not
 * engineered against.
 * ==========================================================================================
 */
export const REMARKS_SHOWN = 4;

/**
 * One departure, as the two things a reader wants: how they scored it and what they said.
 *
 * A PURE FUNCTION OF A RECORD, A BOOK AND THE CONTENT. No world, no tick, no clock — so the
 * same record produces the same words in the browser and in a recorded frame.
 */
export type FeedLine = {
  /** `1/5` — this guest's score over the scale the content declares. Never a star glyph. */
  readonly score: string;
  /** The line itself, from `spokenRemarkFrom`, with `{hours}` already replaced. */
  readonly text: string;
};

/**
 * The most recent departures first, bounded by `limit`.
 *
 * NEWEST FIRST, AND THE RING IS OLDEST FIRST — `recordRemark` appends and evicts index 0, so
 * the last element is the newest departure. A feed that read in ring order would put the
 * freshest thing at the bottom of a panel whose bottom edge is where lines fall off.
 *
 * IT IS REBUILT FROM WORLD STATE, NEVER ACCUMULATED. The panel holds no list of its own: this
 * is a fold over `world.recentRemarks`, which is hashed, saved state, so a reload shows the
 * same feed and nothing here can disagree with the simulation about who left.
 */
export function describeFeed(
  content: BoundContent,
  book: RemarkBook,
  ring: readonly RemarkRecord[],
  limit: number,
): readonly FeedLine[] {
  // `undefined` IS CONTENT THAT DECLARES NO REVIEW SCALE, and `bindGuestRemarks` has already
  // refused to produce a book under it — so this cannot be taken while a `RemarkBook` exists.
  // The fallback prints the score alone rather than inventing a denominator.
  const scale = reviewScaleOf(content);
  const lines: FeedLine[] = [];
  for (let index = ring.length - 1; index >= 0 && lines.length < limit; index -= 1) {
    const record = ring[index];
    if (record === undefined) continue;
    lines.push({
      score: scale === undefined ? String(record.score) : `${record.score}/${scale.max}`,
      text: spokenRemarkFrom(book, record).text,
    });
  }
  return lines;
}
