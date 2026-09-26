// Reviews: a departing guest leaves an integer score derived from its own stay.
//
// Write-only from the simulation's point of view: no decision in packages/sim may consult a
// review. `tools/headless/src/review.boundary.test.ts` enforces this both by source scan (derived
// from this file's exports; the read accessors may appear only here, `save.ts` and `index.ts`) and
// behaviourally (changing only the review scale must not change any other outcome).
//
// The score:
//
//   windowTicks = min(stay, (dissatisfactionCapacityTicks + relief x stay) / (1 + relief))
//   band(need)  = floor((windowTicks - unserved) x bands / windowTicks), clamped to bands - 1
//   band(hotel) = floor(stars x bands / topTierStars), same function, same clamp
//   score       = min + floor((SUM band(need) + band(hotel)) / (needCount + 1))
//   score       = min   if the stay did not run its course
//
// It integrates over the stay (`unservedTicks`) rather than reading needs at the departure
// instant, which would mostly measure the arrival cadence. It is a mean of bands rather than the
// worst band, so it responds to amenities even for guests who never got a bed.
//
// The double rounding is deliberate: the per-need floor is what makes one badly starved need cost
// a band. Pooling into a single division (`floor((n*w - SUM unserved) * bands / (n*w))`) lets a
// guest with one need starved 80% of the stay still score the top band. The cost is that a need
// starved for the whole stay costs only one band.
//
// Properties that hold by construction:
//   - A top review requires every term in the top band, hence every need met (report law A).
//   - A guest whose vector includes the lodging need and never got a bed cannot score the top.
//     (A v5-migrated guest with no lodging need is the tested exception.)
//   - Serving any one need for longer never lowers the score.
//
// Do not introduce a weighted mean here without re-measuring: weighting by per-need size once let
// a guest miss any single amenity and still score the top band.
//
// `unservedTicks` on the lodging row is the lobby wait. What it cannot tell apart is *why* a need
// went unserved (no provider, busy provider, far provider).
//
// Integer arithmetic, no randomness, no clock; every input is the guest's own state and content.

import { firstGuestRules, needTypesInOrder, starTiersInOrder } from './content.js';
import type { BoundContent } from './content.js';
import { letDownWindowOf, needBandOf } from './needs.js';
import type { NeedState } from './needs.js';

/**
 * The scores this content admits: consecutive integers from `min` to `max`.
 *
 * `bands` is derived rather than a content field, so a table cannot declare a band count that
 * disagrees with its range.
 */
export type ReviewScale = {
  readonly min: number;
  readonly max: number;
  /** `max - min + 1`. Derived here and nowhere else. */
  readonly bands: number;
};

/**
 * The review scale this content declares, or `undefined` if it declares none. Content without a
 * scale leaves no reviews at all; there is no default score.
 */
export function reviewScaleOf(bound: BoundContent): ReviewScale | undefined {
  const rules = firstGuestRules(bound);
  const min = rules?.reviewScoreMin;
  const max = rules?.reviewScoreMax;
  if (min === undefined || max === undefined) return undefined;
  return { min, max, bands: max - min + 1 };
}

/**
 * The review a departing guest leaves, or `undefined` under content that declares no scale.
 *
 * The review measures the whole stay, including facilities: the hotel's star rating (`standing`)
 * enters as one more unweighted term in the mean. One term for the hotel rather than one per
 * facility type, so adding a room type to content does not re-weight every review. It is banded
 * by `needBandOf` with window = top tier stars, so it quantises exactly like a need. Adding a term
 * can only make the top harder to reach, which keeps law A intact (a bonus on top would not).
 *
 * Keep the mean. Do not reintroduce a worst-part measure (a `min` over bands, a cap by the lowest
 * term) under another name.
 *
 * `standing` is the rating at departure. A facility built mid-stay is credited in full; snapshotting
 * at arrival would be wrong in the mirror direction and cost saved state.
 *
 * Takes the guest's parts rather than the guest to avoid an import cycle with `guests.ts`.
 *
 * `cutShort` is decided by the caller (`isCutShort`, an exhaustive switch over departure reasons).
 * Only `checkedOut` and `visitEnded` ran their course; every other departure scores the floor —
 * a guest who storms out or was never housed should not leave four stars, and an eviction scores
 * the hotel's conduct rather than the guest's experience. Report law B is an inequality, so it
 * tolerates the floor not distinguishing those cases.
 *
 * `stayTicks` is the window `unservedTicks` is a share of. `depart` computes it once and passes
 * the same value here and to `recordNeedsAtDeparture`.
 */
export function reviewOf(
  bound: BoundContent,
  needs: readonly NeedState[],
  cutShort: boolean,
  stayTicks: number,
  standing: number,
): number | undefined {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) return undefined;
  if (cutShort) return scale.min;
  // `assertNeedVector` refuses an empty vector; without this guard it would score the top band.
  if (needs.length === 0) return undefined;
  // Mean of the bands: each `needBandOf` floors once, then this floors once more (see header).
  // Walks the vector the guest formed, not the content table, so migrated guests are scored on the
  // needs they have.
  const windowTicks = letDownWindowOf(bound, stayTicks);
  let total = 0;
  let terms = 0;
  for (const need of needs) {
    total += needBandOf(scale.bands, windowTicks, need.unservedTicks);
    terms += 1;
  }
  // The hotel as one more term. Content with no star ladder gets the needs-only mean: no inspection
  // is not the same as a zero-star hotel.
  const topStars = topTierStarsOf(bound);
  if (topStars !== undefined) {
    total += needBandOf(scale.bands, topStars, topStars - standing);
    terms += 1;
  }
  return scale.min + Math.floor(total / terms);
}

/**
 * The highest star count this content's ladder awards, or `undefined` if it declares none.
 * The last row, because `normaliseStarTiers` sorts ascending by stars and refuses duplicates at
 * bind time; `assertDemandCoversTheLadder` uses the same definition.
 */
function topTierStarsOf(bound: BoundContent): number | undefined {
  const tiers = starTiersInOrder(bound);
  return tiers[tiers.length - 1]?.stars;
}

/** One row of the review distribution: a score, and how many guests left it. */
export type ReviewOutcomeRow = {
  readonly score: number;
  readonly count: number;
};

/**
 * A world's review distribution, empty.
 *
 * Sparse rows, created on first use, ascending by score. The scale is content, and the load-time
 * shape check runs without content, so a fixed-length table could not be validated at load.
 */
export function createReviewOutcomes(): readonly ReviewOutcomeRow[] {
  return [];
}

/** Index of `score` in an ascending list, or -1. Mirrors `indexOfNeed` in `needs.ts`. */
function indexOfScore(rows: readonly ReviewOutcomeRow[], score: number): number {
  let low = 0;
  let high = rows.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = rows[mid];
    if (found === undefined) return -1;
    if (found.score === score) return mid;
    if (found.score < score) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * How many guests left this score. O(log n). Returns 0 for an absent row (rows appear on first
 * use, so absent means nobody).
 */
export function reviewCountOf(rows: readonly ReviewOutcomeRow[], score: number): number {
  const index = indexOfScore(rows, score);
  return index === -1 ? 0 : (rows[index]?.count ?? 0);
}

/** How many reviews this world holds. A fold, never a stored field. */
export function totalReviews(rows: readonly ReviewOutcomeRow[]): number {
  let total = 0;
  for (const row of rows) total += row.count;
  return total;
}

/**
 * One more guest left `score`. The one place the distribution moves.
 * Keeps rows ascending, so stored order never depends on departure order.
 */
export function recordReview(rows: readonly ReviewOutcomeRow[], score: number): readonly ReviewOutcomeRow[] {
  const next: ReviewOutcomeRow[] = [];
  let inserted = false;
  for (const row of rows) {
    if (!inserted && row.score === score) {
      next.push({ score, count: row.count + 1 });
      inserted = true;
      continue;
    }
    if (!inserted && row.score > score) {
      next.push({ score, count: 1 });
      inserted = true;
    }
    next.push(row);
  }
  if (!inserted) next.push({ score, count: 1 });
  return next;
}

/**
 * Throws if a review distribution could not have come from this simulation.
 *
 * Content-free, because it runs at load; whether a score is inside the scale is the report's job.
 * Every row has `count >= 1`. The total may be below the departure count (a migrated world has
 * departures from before reviews existed), so it is an inequality here and an equality in the
 * report.
 */
export function assertReviewOutcomes(rows: readonly ReviewOutcomeRow[], departed: number): void {
  let previous: number | undefined;
  let total = 0;
  rows.forEach((row, index) => {
    if (!Number.isInteger(row.score)) {
      throw new Error(`Review outcomes are invalid: row ${index} has a score of ${String(row.score)}, which is not an integer`);
    }
    if (!Number.isInteger(row.count) || row.count < 1) {
      throw new Error(
        `Review outcomes are invalid: row ${index} (score ${row.score}) has a count of ${String(row.count)}; ` +
          'rows appear when a guest leaves that score, so every row carries at least one',
      );
    }
    if (previous !== undefined && row.score <= previous) {
      throw new Error(
        `Review outcomes are invalid: row ${index} has score ${row.score} after ${previous}. Rows are strictly ` +
          'ascending by score, so a duplicate or an out-of-order row would put two spellings of the same ' +
          'distribution in the state hash.',
      );
    }
    previous = row.score;
    total += row.count;
  });
  if (total > departed) {
    throw new Error(
      `Review outcomes are invalid: ${total} review(s) against ${departed} departed guest(s). A guest leaves at ` +
        'most one review, on the way out, so the distribution can never hold more than the departure table does.',
    );
  }
}

// Remarks: what the guest actually says. `reviewOf` turns a stay into an integer; this turns the
// same stay into a sentence from `guest-remarks.json`.
//
// Nothing is stored beyond `RemarkRecord` (below), and the remark table is deliberately not
// injected content: it is outside `contentHash`, so rewording a line invalidates no save and moves
// no determinism hash. `bindGuestRemarks` is its separate door.
//
// Nothing is drawn from the PRNG — that would make every economic figure depend on how many guests
// spoke. Variety comes from the guest id instead.

/**
 * Minutes in an hour, which is ticks in an hour. Not imported from `world.ts` because that would
 * be an import cycle; `review.remark.test.ts` asserts the two agree.
 */
export const TICKS_PER_HOUR = 60;

/**
 * One row of the remark table, as `packages/sim` sees it. Declared structurally rather than
 * imported from `packages/content`.
 *
 * An absent `needId` is a wildcard: the row matches whatever the guest's worst-served need was.
 */
export type GuestRemarkData = {
  readonly id: string;
  readonly name: string;
  readonly score: number;
  readonly needId?: string | undefined;
  readonly minUnservedHours?: number | undefined;
  readonly text: string;
};

/**
 * A remark table checked against the content it will be spoken under. Only obtainable from
 * `bindGuestRemarks`, so every table `remarkFor` sees has passed the coverage check.
 */
export type RemarkBook = {
  /** Ascending by `id`; see `bindGuestRemarks`. */
  readonly rows: readonly GuestRemarkData[];
};

/** A line a guest said, and the score it goes with. */
export type SpokenRemark = {
  /** The content id of the row that was chosen. */
  readonly remarkId: string;
  /** The score `reviewOf` gave the same stay. One call answers both, so they cannot disagree. */
  readonly score: number;
  /** The row's `text`, with every placeholder replaced by a number the simulation measured. */
  readonly text: string;
};

/** `minUnservedHours` absent means "always available". Spelled once. */
const minHoursOf = (row: GuestRemarkData): number => row.minUnservedHours ?? 0;

/**
 * The one placeholder a remark may carry. Also spelled in `guestRemarkSchema`;
 * `remark.content.test.ts` checks no rendered shipped line still contains it.
 */
const HOURS_PLACEHOLDER = '{hours}';

/**
 * Check a remark table against the content it will be spoken under, and fix its order.
 *
 * Requires total coverage at zero severity: for every score in the scale and every need type, at
 * least one row with `minUnservedHours` 0 must match. A hole would otherwise surface only when a
 * particular guest leaves with a particular grievance. Rows naming unknown needs or out-of-scale
 * scores are refused first, so a typo is reported as a typo.
 *
 * Rows are sorted by `id` (code-unit comparison, not locale) so document order cannot affect which
 * line a guest says.
 */
export function bindGuestRemarks(bound: BoundContent, remarks: readonly GuestRemarkData[]): RemarkBook {
  const scale = reviewScaleOf(bound);
  if (scale === undefined) {
    throw new Error(
      'Guest remarks are unreachable: this content declares no review scale, so no guest leaves a review ' +
        'for a remark to accompany. Give the guest rules a reviewScoreMin and a reviewScoreMax, or ship no remarks.',
    );
  }
  const needTypes = needTypesInOrder(bound);
  if (needTypes.length === 0) {
    throw new Error(
      'Guest remarks are unreachable: this content declares no need types, so no guest can form a need ' +
        'vector and none can be reviewed. Give it a need table, or ship no remarks.',
    );
  }
  const rows = [...remarks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of rows) {
    if (row.score < scale.min || row.score > scale.max) {
      throw new Error(
        `Guest remark "${row.id}" is unreachable: it is filed at score ${row.score}, and this content's ` +
          `review scale runs from ${scale.min} to ${scale.max}. No guest can leave that score.`,
      );
    }
    if (row.needId !== undefined && needTypes.every((need) => need.id !== row.needId)) {
      throw new Error(
        `Guest remark "${row.id}" is unreachable: it complains about "${row.needId}", which this content ` +
          'declares no need type for. No guest can form that need, so nothing can select this line.',
      );
    }
  }
  for (let score = scale.min; score <= scale.max; score += 1) {
    for (const need of needTypes) {
      const covered = rows.some(
        (row) => row.score === score && minHoursOf(row) === 0 && (row.needId === undefined || row.needId === need.id),
      );
      if (covered) continue;
      throw new Error(
        `Guest remarks do not cover every outcome: a guest scoring ${score} whose worst-served need was ` +
          `"${need.id}" has nothing to say. Every score and every need needs at least one row that is ` +
          'available from zero unserved hours — one row per score with no needId covers a whole row of the grid.',
      );
    }
  }
  return Object.freeze({ rows: Object.freeze(rows) });
}

/**
 * The need this guest is going to complain about: the one it went longest without. Ties go to the
 * lower `needId`, explicitly, rather than to vector position.
 */
function grievanceOf(needs: readonly NeedState[]): NeedState | undefined {
  let worst: NeedState | undefined;
  for (const need of needs) {
    if (worst === undefined) {
      worst = need;
      continue;
    }
    if (need.unservedTicks > worst.unservedTicks) {
      worst = need;
      continue;
    }
    if (need.unservedTicks === worst.unservedTicks && need.needId < worst.needId) worst = need;
  }
  return worst;
}

/**
 * How strongly a row claims this grievance; higher wins. Specificity dominates severity by
 * construction: it is multiplied by one more than the largest possible severity term.
 */
function rankOf(row: GuestRemarkData, hours: number, needId: string): number {
  const specific = row.needId === needId ? 1 : 0;
  return specific * (hours + 1) + minHoursOf(row);
}

/**
 * What a departing guest says about its stay, or `undefined` if this content has no review scale.
 *
 * Not on the departure path: `depart` stores a `RemarkRecord` and a host renders it later with
 * `spokenRemarkFrom`. This is the composition of the two, for tests and hosts holding a whole stay.
 * The score is computed here rather than passed in, so the stars and the sentence cannot disagree.
 *
 * Selection:
 *   1. Candidates are rows at this score whose severity gate the grievance clears and which name
 *      the grievance need or none.
 *   2. A row naming the need beats a wildcard.
 *   3. Among equally specific rows, the highest severity gate wins.
 *   4. Remaining ties are settled by `guestId` modulo the tied count, in ascending-id order.
 */
export function remarkFor(
  book: RemarkBook,
  bound: BoundContent,
  needs: readonly NeedState[],
  cutShort: boolean,
  stayTicks: number,
  standing: number,
  guestId: number,
): SpokenRemark | undefined {
  const score = reviewOf(bound, needs, cutShort, stayTicks, standing);
  if (score === undefined) return undefined;
  const record = remarkRecordOf(needs, score, guestId);
  if (record === undefined) return undefined;
  return spokenRemarkFrom(book, record);
}

/** Step 1 of the selection order. */
function selectable(row: GuestRemarkData, score: number, hours: number, needId: string): boolean {
  if (row.score !== score) return false;
  if (minHoursOf(row) > hours) return false;
  return row.needId === undefined || row.needId === needId;
}

/**
 * The `guestId`-th row of the tied set, in the book's ascending-id order. A second walk rather
 * than an array built in the first, since ties are rare. `(n % t + t) % t` keeps negative ids in
 * range.
 */
function nthTied(
  book: RemarkBook,
  score: number,
  hours: number,
  needId: string,
  bestRank: number,
  guestId: number,
  tied: number,
): GuestRemarkData {
  const wanted = ((guestId % tied) + tied) % tied;
  let seen = 0;
  for (const row of book.rows) {
    if (!selectable(row, score, hours, needId)) continue;
    if (rankOf(row, hours, needId) !== bestRank) continue;
    if (seen === wanted) return row;
    seen += 1;
  }
  // Unreachable: the walk visits exactly `tied` rows. Throws so a divergence between the two walks
  // is loud.
  throw new Error(`Guest remark tie-break walked ${seen} row(s) of ${tied} at a score of ${score}.`);
}

// The feed: what recent departures said, kept in `World.recentRemarks`.
//
// Stores the four inputs to selection, not the rendered line or a remark id: the remark table is
// not fingerprinted, so a stored id could dangle after an edit, and stored text would freeze the
// wording. The need id is a fingerprinted content id and cannot dangle. The score is stored
// rather than re-derived so it always agrees with `reviewOutcomes`.
//
// Capacity 48 = 24 parties/day (top of the demand curve) x 2 guests/party, so a player checking
// once a simulated day sees every departure in steady state. `remark.capacity.test.ts` re-checks
// it against content. A burst of evictions can exceed it; the oldest records are dropped.
//
// A plain array, oldest first, written by append; nothing draws from the PRNG.

/** The four values a remark is re-derived from, recorded at departure. Frozen. */
export type RemarkRecord = {
  /** Tie-break input for selection step 4. */
  readonly guestId: number;
  /** `reviewOf`'s score for the same stay. */
  readonly score: number;
  /** The worst-served need: a content id from the need table. */
  readonly needId: string;
  /** That need's unserved ticks. `{hours}` renders `floor(this / TICKS_PER_HOUR)`. */
  readonly unservedTicks: number;
};

/** How many departures the feed keeps: 24 parties a day x at most 2 guests. See the section header. */
export const RECENT_REMARKS_CAPACITY = 48;

/** A world that has had no departures, so nobody has said anything. */
export function createRecentRemarks(): readonly RemarkRecord[] {
  return Object.freeze([]);
}

/**
 * The record a departing guest leaves behind. Takes the score `depart` just recorded in
 * `reviewOutcomes`, so the feed and the histogram cannot disagree. `undefined` only for an empty
 * need vector, which `reviewOf` has already refused.
 */
export function remarkRecordOf(
  needs: readonly NeedState[],
  score: number,
  guestId: number,
): RemarkRecord | undefined {
  const grievance = grievanceOf(needs);
  if (grievance === undefined) return undefined;
  return Object.freeze({
    guestId,
    score,
    needId: grievance.needId,
    unservedTicks: grievance.unservedTicks,
  });
}

/**
 * Append one record, evicting the oldest when full. Copies rather than mutates; the copy is
 * bounded by `RECENT_REMARKS_CAPACITY`.
 */
export function recordRemark(
  ring: readonly RemarkRecord[],
  record: RemarkRecord,
): readonly RemarkRecord[] {
  const next = ring.length < RECENT_REMARKS_CAPACITY ? [...ring, record] : [...ring.slice(1), record];
  return Object.freeze(next);
}

/**
 * The line a stored record renders to, under a book bound to the content it will be shown with.
 * The one selection path, shared by `remarkFor` and hosts reading the feed. Throws on a record no
 * bound book can answer.
 */
export function spokenRemarkFrom(book: RemarkBook, record: RemarkRecord): SpokenRemark {
  const { score, needId } = record;
  const hours = Math.floor(record.unservedTicks / TICKS_PER_HOUR);
  let best: GuestRemarkData | undefined;
  let bestRank = 0;
  let tied = 0;
  for (const row of book.rows) {
    if (!selectable(row, score, hours, needId)) continue;
    const rank = rankOf(row, hours, needId);
    if (best === undefined || rank > bestRank) {
      best = row;
      bestRank = rank;
      tied = 1;
      continue;
    }
    if (rank === bestRank) tied += 1;
  }
  // `bindGuestRemarks` guarantees a candidate for every score and need, so this is a postcondition.
  if (best === undefined) {
    throw new Error(
      `No guest remark for a score of ${score} with "${needId}" as the worst-served need. ` +
        'A bound book covers every score and every need, so this one did not come from bindGuestRemarks.',
    );
  }
  const chosen = tied === 1 ? best : nthTied(book, score, hours, needId, bestRank, record.guestId, tied);
  return Object.freeze({
    remarkId: chosen.id,
    score,
    text: chosen.text.split(HOURS_PLACEHOLDER).join(String(hours)),
  });
}

/**
 * The laws the feed obeys, checked at the tick boundary (when a departure moved the ring) and at
 * load.
 *
 * Content-free: no more records than the capacity or than departures, and integer non-negative
 * fields. Departure order is not checked — guest ids ascend by arrival, not departure.
 */
export function assertRecentRemarks(ring: readonly RemarkRecord[], departed: number): void {
  if (ring.length > RECENT_REMARKS_CAPACITY) {
    throw new Error(
      `Save is corrupt: world.recentRemarks holds ${ring.length} records, more than the ` +
        `${RECENT_REMARKS_CAPACITY} the feed keeps`,
    );
  }
  if (ring.length > departed) {
    throw new Error(
      `Save is corrupt: world.recentRemarks holds ${ring.length} records but only ${departed} guest(s) ` +
        'have departed, and every record is a departure',
    );
  }
  ring.forEach((record, index) => {
    for (const key of ['guestId', 'score', 'unservedTicks'] as const) {
      const value = record[key];
      if (!Number.isInteger(value)) {
        throw new Error(`Save is corrupt: world.recentRemarks[${index}].${key} is not an integer`);
      }
    }
    if (record.unservedTicks < 0) {
      throw new Error(`Save is corrupt: world.recentRemarks[${index}].unservedTicks is negative`);
    }
    if (record.needId.length === 0) {
      throw new Error(`Save is corrupt: world.recentRemarks[${index}].needId is empty`);
    }
  });
}
