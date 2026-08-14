// The need vector (G-012), as STOCKS (G-027b, ADR-0017 §1).
//
//   A guest forms one instance of every need type the content defines, each carrying one
//   integer: how far below full it is. A need is never "done". It decays, it is refilled by
//   being served, and it decays again — the loop is oscillation, not completion.
//
// THE SPLIT THIS MODULE OWNS. `guests.ts` owns what a guest DOES — which room it takes, which
// provider it engages, when it leaves. This module owns what a need IS: how it decays, when a
// guest wants it, and how the tally of met and unmet is kept. That is the same seam
// `validity.ts` has with `guests.ts`, and it exists for the same reason: neither file has to be
// opened to change the other.
//
// ONE FIELD WHERE THERE WERE TWO, AND THE DELETED ONE WAS THE DEADLINE. A G-012 need carried
// `progressRemaining` (provision still owed) and `patienceRemaining` (a fuse). ADR-0017 removes
// the deadline from the model outright, so the fuse has nothing to burn: what is left is a
// level, carried as a DEFICIT so that "full" is 0 and needs no content to recognise.
//
// THE CLOSED FORM, and it is integer arithmetic end to end (I2):
//
//     deficit  += 1                          on a tick it decays and nothing serves it
//     deficit  -= refillPerTick              on a tick something serves it
//     both clamped into [0, capacityTicks]
//     pressure  = floor(deficit x 10,000 / capacityTicks), clamped one below the whole
//
//   so for a need nothing ever serves, with `t` THE WORLD'S TICK COUNTER — which after a run is
//   the tick ABOUT TO BE SIMULATED, not the last one that ran:
//
//     deficit(t) = min(capacityTicks, arrivalDeficit + (t - 1) - arrivedTick)
//
//   where `arrivalDeficit` is `max(1, wantLine)` — the want line, except under content that
//   declares none, where it is the one tick that keeps "barely wanting" from meaning "full".
//   See `formNeedVector`; on every table that declares a line it IS the line.
//
//   exactly, at every t, with no accumulated float and no repeated non-integer add. THE `- 1`
//   IS CHECK-IN and the oracle must not depend on which `t` a reader picks: a guest is created
//   DURING tick `arrivedTick`, after that tick's decay pass has already run, so the tick it
//   walks in on costs it nothing. `needs.stock.test.ts` asserts this form over 100,000
//   iterations of `advanceNeeds`, character for character.
//
//   IT DRIVES `advanceNeeds` DIRECTLY, WHERE `needs.decay.test.ts` DROVE A WORLD, and the
//   difference is exactly the `- 1` above. The retired file ran `run(createWorld(...))` and
//   compared its oracle against `world.tick`, so CHECK-IN WAS INSIDE WHAT IT MEASURED; the
//   successor counts its own iterations, and the `- 1` is a correction its reader applies by
//   hand rather than a term any assertion in it can be wrong about. Said here because this
//   paragraph capitalises the half the closed-form test no longer exercises — what still steps
//   a world past an arrival is `guest.stay.test.ts` and `stock.idle.test.ts` in tools/headless.
//
// WHAT DECAY COUNTS IS THE ROLE'S BUSINESS, AND IT IS THE MODEL'S ONE ASYMMETRY. An engagement
// need decays in WALL time. The lodging need decays in AWAY time and is HELD while the guest is
// in its own room — that is ADR-0017 §2 ("activity draws a stock down") as a mechanism rather
// than a sentence, and `advanceNeed` carries the two implementations it was chosen over.
//
// A GUEST ARRIVES AT ITS WANT LINE on every need: wanting everything, just barely. That costs no
// field and no content number, and it is what makes a 1,440-tick stay the steady state rather
// than one long transient.
//
// No Set, no Map, no float, no wall clock. The vector is a plain array, strictly ascending by
// need id, and every number in it is a non-negative safe integer.
//
// ============================================================================
// R1 — "A DERIVATION THAT OUTLIVES THE MODEL IT WAS DERIVED FROM", AND WHERE IT HIDES.
// THIS IS THE DEFECT CLASS OF THE GOAL THAT WROTE THIS FILE. Three critique sweeps found
// ELEVEN instances of it. Read this before writing a comment that quotes a number.
//
// ADR-0017 deleted `satisfyTicks`, `patienceTicks`, `progressRemaining` and `patienceRemaining`,
// and with them every derivation that stood on one: the 480/480 stay floor, the 300/360/300 lcm,
// the 201/721/10,001 reachable-score counts, "entertainment last", "a served need's patience
// regenerates", "9,999 falls out of `isNeedPending`". The CODE was replaced in one goal. The
// SENTENCES were not, and the pattern in which they survived is sharp enough to state:
//
//   THE SITES A PLAN NAMES GET REPAIRED. THE SITES A READER MEETS FIRST DO NOT.
//
// Every one of the eleven survivors was one of four things — **an error message, a docstring, a
// file header, a `describe` title** — while the call site, the assertion and the body ten lines
// away had all been rewritten correctly. A plan enumerates call sites; nobody writes "and the
// paragraph above it" on a task list. The worst instance was a docstring on a function the SAME
// DIFF created, carrying verbatim the docstring of the function it replaced.
//
// SO THE RULE, AND IT IS CHEAP: when a model changes, grep the DELETED VOCABULARY, not the
// deleted call sites, and read every hit FOR TENSE. A mention is fine — this repository keeps
// its history deliberately — but it must be fenced as history, in the shape
// `packages/content/src/schema.ts`'s countdown-era block uses: named as the era it describes,
// past tense, with what replaced it. A present-tense sentence about a deleted field is a lie
// with a citation.
//
// TWO OF THE FOUR SURFACES ARE EXECUTABLE STRINGS AND ARE NOW SCANNED RATHER THAN REMEMBERED:
// `tools/headless/src/deleted-vocabulary.test.ts` fails on deleted vocabulary in a live refusal
// message or a test title, with the historical mentions registered by name. The other two are
// prose and no predicate can tell their tense; they are what this paragraph is for.
// ============================================================================

import { findNeedType, needTypesInOrder, wantAtOf, wantLineOf } from './content.js';
import type { BoundContent, NeedTypeData } from './content.js';
import type { ContentId } from './entities.js';

// THE WANT LINE MOVED TO `content.ts` AND IS RE-EXPORTED FROM HERE (round 1), so no caller
// changed. It had to move because the bind-time refusal that keeps the line above 0
// (`assertEveryNeedIsWantedOnArrival`) computes it, and `content.ts` cannot import this module.
// One definition, four readers; the alternative was a fourth spelling of the arithmetic inside
// the check that guards it, which is ADR-0021's proxy defect.
export { wantLineOf };

/**
 * What KIND of thing served a need (G-013).
 *
 * A CLOSED UNION IN CODE, with the assignment in JSON — the `NeedRole`, `TransactionReason`
 * and `RoomInvalidityReason` precedent. Which item or room provides what is content; that
 * "a room" and "an item" are the two kinds of provider the simulation treats differently
 * is a fact about the simulation (a guest LODGES in one and only ever ENGAGES the other).
 * Neither member is a content id — neither is snake_case — so ADR-0003 is untouched.
 */
export type ProviderKind = 'room' | 'item';

/**
 * One need a guest has formed, and how far below full it has fallen.
 *
 * ONE FIELD, AND THE PARAGRAPH THAT USED TO BE HERE DESCRIBED TWO. It read "the two countdowns
 * are exactly the fields a pre-G-012 guest carried (`patienceRemaining` and `restRemaining`)",
 * which was G-012's migration argument and was true until ADR-0017 §1 deleted both countdowns —
 * **in the diff this sentence survived, in the file that declares the rule against exactly that.**
 * The migration chain it described is still real and is stated where it belongs, once: v5 -> v6
 * reshaped a guest's two countdowns into a one-entry vector and v12 -> v13 carried the surviving
 * one onto `deficit` (`save.ts`, and the header above).
 */
export type NeedState = {
  readonly needId: ContentId;
  /**
   * HOW EMPTY THIS NEED IS, in ticks of stock (G-027b, ADR-0017 §1). **0 is full**;
   * `capacityTicks` is empty.
   *
   * Rises by one on every tick the need decays and falls by `refillPerTick` on every tick
   * something serves it, clamped at both ends. It replaces the two countdowns a G-012 need
   * carried, and one field replaces two because a stock has one state: `patienceRemaining` was
   * a fuse that only a task with a deadline needs, and there are no deadlines left.
   *
   * ---------------------------------------------------------------------------
   * A DEFICIT AND NOT A LEVEL, AND THE THREE REASONS ARE ALL STRUCTURAL.
   *
   *   1. `assertNeedVector` stays CONTENT-FREE. "Full" is `deficit === 0`, which needs no
   *      capacity to check — where "level === capacityTicks" would need one, and that
   *      validator runs at every load with no content in hand and must keep one definition.
   *   2. IDENTITY-RETURN SURVIVES AT BOTH ENDS. A full need being topped up and an empty need
   *      nothing is serving both come back by reference, so a sleeping guest and a guest with
   *      no café to go to each allocate nothing per tick. Under a level, the clamps land on
   *      different constants and one of the two ends is lost.
   *   3. The v12 -> v13 migration is a same-kind carry: `progressRemaining` was "ticks this
   *      need still owes, 0 = satisfied" and so is this. What it cannot preserve is the
   *      FRACTION, because the cap it was a fraction of is content and a migration may not
   *      read content (ADR-0008). See `migrateV12ToV13`.
   * ---------------------------------------------------------------------------
   *
   * WHAT MAKES IT RISE DEPENDS ON THE NEED'S ROLE, and that is the model's one asymmetry: an
   * engagement need decays in WALL time, the lodging need in AWAY time. See `advanceNeed`.
   */
  readonly deficit: number;
  /**
   * What kind of provider last served this need, or `null` if nothing ever has (G-013,
   * re-derived at G-027b).
   *
   * ---------------------------------------------------------------------------
   * THE IFF BECAME AN IMPLICATION, AND THE HALF THAT DIED DID SO BY DESIGN RATHER THAN BY
   * NEGLECT. It used to read: non-null if and only if `progressRemaining === 0`.
   *
   *   SURVIVES   `deficit === 0`  ⇒  `metBy !== null`. A need can only reach full by being
   *              served, so a full need with nothing recorded is a satisfaction the tally
   *              could not attribute and `metByItem` would silently under-count. Content-free,
   *              so `assertNeedVector` still checks it at every commit and every load.
   *   DIES       `metBy !== null`  ⇒  `deficit === 0`. Under a stock a need that WAS full and
   *              has decayed still remembers what filled it, and that is a true statement
   *              about its history rather than a contradiction. A task had no history to
   *              remember; a stock does.
   *
   * That is the whole difference, and it is why the field's meaning moved from "what FINISHED
   * it" to "what last SERVED it": nothing finishes any more.
   * ---------------------------------------------------------------------------
   *
   * WHY IT IS STORED AT ALL, WHICH IS THE QUESTION TO ASK OF ANY NEW STATE. G-013's
   * criterion asks a run to report satisfactions delivered by an item and by a room, and
   * that is NOT derivable from final state: the engagement is released on the very tick
   * the need resolves, so by the time the guest departs and the tally moves, nothing
   * anywhere remembers what served it. The alternative — counting deliveries as they
   * happen, needing no field — was rejected because its migration cannot be made exactly
   * true: a v6 world's past deliveries are unrecoverable from its bytes.
   *
   * THE v6 -> v7 DEFAULT IS ARGUED FROM THE ERA, NOT CHOSEN (ADR-0008): in a v6 world items
   * were not providers, so every satisfaction recorded there WAS a room's, and a met need
   * migrates to `'room'` exactly rather than approximately.
   */
  readonly metBy: ProviderKind | null;
  /**
   * How many times THIS GUEST has walked out on a provider it had engaged for this need
   * (G-014b). 0 for a need nobody has ever abandoned.
   *
   * ------------------------------------------------------------------------------------
   * WHY THE COUNTER LIVES ON THE GUEST'S NEED AND NOT ON THE TALLY — MAJOR 4(b), DECIDED.
   *
   * `NeedOutcome` is COUNTED AT DEPARTURE, NOT WHEN A NEED RESOLVES (see its own note), and
   * `recordNeedsAtDeparture` is the only thing that inserts a row. Incrementing an
   * `abandoned` counter on the TALLY at the moment a guest abandoned something would create
   * rows before any departure and break that law outright — `met + unmet === departed` per
   * row is exactly what it buys, and a row conjured mid-stay makes it an inequality nobody
   * can state. So the abandonment is recorded HERE, on the guest's own need, and folded into
   * the tally on the way out with everything else. One departure, one fold, one law intact.
   *
   * THE COST, STATED RATHER THAN DISCOVERED: it is a SECOND v8 -> v9 default. `NeedState`
   * gains this field and `NeedOutcome` gains `abandoned`, so the migration argues two values
   * from the era instead of one — and both are exactly 0, because a v8 guest could not
   * abandon anything (`reserve` returned early for any engaged guest). Neither is a default
   * standing in for missing information; see `migrateV8ToV9`.
   *
   * IT IS A COUNT AND NOT A FLAG, because a guest can abandon the same need more than once
   * in a stay. It never decreases and it is never cleared: a need that was abandoned and
   * later met is a real and interesting history, and flattening it to "was it abandoned"
   * would lose the difference between a guest that dithered once and one that dithered five
   * times — which is the whole quantity the margin is tuned against.
   * ------------------------------------------------------------------------------------
   */
  readonly abandonCount: number;
  /**
   * How many ticks the HOTEL has left this need unserved while the guest wanted it (G-028a).
   *
   * ------------------------------------------------------------------------------------
   * IT IS AN INTEGRAL, AND THAT IS THE WHOLE POINT — the departure tally is a SNAPSHOT, and a
   * snapshot of a population that arrives on a fixed cadence and stays a fixed length reads every
   * guest at the same phase of the same deterministic cycle. `recordNeedsAtDeparture` has said so
   * about itself since G-027b and named this field as the replacement it was deferring.
   *
   * WHAT COUNTS IS `isNeedUnservedNow` AND NOTHING ELSE, so there is one definition of "the hotel
   * is letting this guest down on this need right now" and the dissatisfaction stock asks the same
   * one (`wantsSomethingUnserved` is a fold over it). Three exclusions live in that predicate and
   * every one of them is somebody's ruling rather than a convenience:
   *
   *   NOT WANTED       a need below its want line is not being pursued (the hysteresis).
   *   BEING SERVED     the room or the engagement is serving it this tick.
   *   EXCUSED          ADR-0026 as amended: the lodging need of a guest that HOLDS a room. At
   *                    home it is served anyway; away it is decaying because the guest chose to
   *                    go out, and charging that to the hotel is a floor nobody can pay down.
   *
   * IT IS WRITE-ONLY INSIDE THE TICK (G-028a's fence). No branch anywhere in this package may
   * read it to decide anything: this goal ships the instrument, and the goal that makes the
   * review read it moves `met`, `unmet` and `report.ts`'s review law A in the same diff, because
   * those three are coupled and a build where one has moved and the others have not exits 1.
   *
   * NEVER RESET AND NEVER DRAINED, unlike `Guest.dissatisfaction`, which is a mood and recovers.
   * This is a measurement of a stay, so the only thing that ends it is the stay.
   * ------------------------------------------------------------------------------------
   */
  readonly unservedTicks: number;
};

/**
 * What became of every instance of one need type, counted.
 *
 * The `GuestOutcomes` argument exactly: a departed guest is not kept, so its needs leave
 * no trace, and a counter is what keeps the per-tick cost flat instead of growing with
 * the age of the run.
 *
 * COUNTED AT DEPARTURE, NOT AT THE MOMENT A NEED RESOLVES, and the reason is a law rather
 * than a convenience. Every guest forms one instance of every need type, so counting at
 * departure makes `met + unmet === departed` an exact identity per row that costs O(1) to
 * check — where counting at the transition would leave the tally including needs of guests
 * who are still here, and the only way to check it would be to walk every live guest's
 * vector every tick. `satisfied` has always worked this way for the same reason.
 *
 * `unmet` IS ONE NUMBER OVER ONE FATE NOW, AND IT USED TO BE TWO. Under the countdowns it
 * covered "ran out of patience" and "still pending when the guest left" — two ends a need could
 * come to, and the reason G-015 planned to split the tally by reason. A stock has neither: a
 * need is not a task, so it cannot fail and it cannot be outstanding. It is simply BELOW ITS
 * WANT LINE at the tick its guest walks out, or it is not.
 */
export type NeedOutcome = {
  readonly needId: ContentId;
  /** Instances that were at or above their want line — satisfied, not wanting — when their guest left. */
  readonly met: number;
  /** Instances that were below it: still wanting, at departure. */
  readonly unmet: number;
  /**
   * How many of `met` were delivered BY AN ITEM (G-013).
   *
   * ONE NUMBER, NOT TWO, AND BY-ROOM IS DERIVED — `met - metByItem`. Two stored counters
   * that must sum to a third is two chances for a departure path to move one and not the
   * other, and the failure would be silent because each would still look like a plausible
   * count. This is the same call `balanceOf` makes about cash (I4) and `urgencyOf` makes
   * about urgency, one scale down: keep one record, derive the rest.
   */
  readonly metByItem: number;
  /**
   * How many times an instance of this need was ABANDONED — a guest walking out on a
   * provider it had engaged for it, because another need beat it by the content-defined
   * margin (G-014b).
   *
   * NOT A PARTITION OF `met` OR OF `unmet`, AND THAT IS THE FIRST THING TO UNDERSTAND ABOUT
   * IT. A guest departs exactly once and so resolves each need exactly once, which is what
   * makes `met + unmet === departed` an identity. It abandons ZERO OR MANY TIMES, so this
   * counter is unbounded above by anything in this row and belongs to no conservation law.
   * That asymmetry is why the abandonment is NOT a row in G-015's departure table: a law
   * that had to skip a row would be the vacuity shape that table exists to prevent.
   *
   * WHAT CAN AND CANNOT CATCH A MISFILING HERE — the matrix, in the shape G-015's own
   * cross-subsystem note was made to carry, because "there is no witness" is a claim that
   * needs evidence like any other:
   *
   *   CAUGHT  a negative, fractional or NaN count, at every commit and every load
   *           (`assertNeedOutcomes` below, and `assertNeedVector` for the guest-side field).
   *   CAUGHT  a count that appeared before ANY guest carrying the need departed — the
   *           `met + unmet === 0` clause below. This is the structural witness for the
   *           decision above: an implementation that incremented the TALLY mid-stay trips it
   *           on the first abandonment of the run. It stops witnessing once the first
   *           departure lands, so it is a real check with a stated blind spot rather than a
   *           general one.
   *   CAUGHT  an abandonment counted under content that cannot produce one — a saturating
   *           margin, or fewer than two engagement need types. Content is the separate input
   *           (ADR-0007 as amended at G-013), and the law lives in `buildSummary`, where
   *           content is in hand, beside the `metByItem` attribution laws.
   *   NOT     an abandonment filed against the CHALLENGER's row instead of the incumbent's.
   *           It conserves the total, moves no other number, and no second input records who
   *           was abandoned. Pinned by driving a switch and reading the row
   *           (`utility.hysteresis.test.ts`), never by a law.
   *   NOT     an abandonment dropped on an exit path. `depart` is the one route out and
   *           `recordNeedsAtDeparture` the one fold, so this is structural rather than
   *           checked — the same argument G-012 makes for the reservation release.
   */
  readonly abandoned: number;
  /**
   * Σ `NeedState.unservedTicks` over the instances counted in this row (G-028a).
   *
   * A SUM AND NOT A SHARE, and the division is the report's. Two integers on disk with the
   * division at the point of reading is the `ReviewScale.bands` discipline: a stored share
   * would be a second rounding, taken per departure, that nothing could re-derive.
   */
  readonly unservedTicks: number;
  /**
   * Σ stay length over the same instances — the DENOMINATOR `unservedTicks` is a share of.
   *
   * PER ROW RATHER THAN ONE FIGURE ON THE WORLD, because a row counts the guests that carried
   * THIS need: a guest migrated from v5 formed one need, so its stay belongs to one row and not
   * to the other three. One world-level total would silently divide by stays that never
   * contributed to the numerator.
   *
   * `unservedTicks <= instanceTicks` is the bound `assertNeedOutcomes` carries. It is a real
   * check rather than an identity: the numerator is accumulated per tick inside the tick loop
   * and the denominator is computed once at departure from the guest's own arrival tick, so
   * nothing but agreement between the two makes it hold.
   */
  readonly instanceTicks: number;
};

/**
 * A world's need tally, empty.
 *
 * EMPTY RATHER THAN ONE ROW PER NEED TYPE, and that is what lets the v5 -> v6 migration
 * default honestly. A migration has no content and so cannot know what needs exist; rows
 * are therefore inserted on the first departure that resolves one, in ascending id order,
 * and a world that has never had a departure has no rows whatever created it. The report
 * prints a row per need type from CONTENT, so a need with nothing to say still appears.
 */
export function createNeedOutcomes(): readonly NeedOutcome[] {
  return [];
}

/** Index of `needId` in an ascending list, or -1. Mirrors `indexOfId` in `entities.ts`. */
function indexOfNeed<T extends { readonly needId: ContentId }>(list: readonly T[], needId: ContentId): number {
  let low = 0;
  let high = list.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const found = list[mid];
    if (found === undefined) return -1;
    if (found.needId === needId) return mid;
    if (found.needId < needId) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/** O(log n). The guest's instance of `needId`, or undefined if it formed none. */
export function findNeedState(needs: readonly NeedState[], needId: ContentId): NeedState | undefined {
  const index = indexOfNeed(needs, needId);
  return index === -1 ? undefined : needs[index];
}

/** O(log n). The tally row for `needId`, or undefined if nothing has resolved one yet. */
export function needOutcomeOf(outcomes: readonly NeedOutcome[], needId: ContentId): NeedOutcome | undefined {
  const index = indexOfNeed(outcomes, needId);
  return index === -1 ? undefined : outcomes[index];
}

/**
 * The vector a guest forms on arrival: one instance of EVERY need type, ascending by id.
 *
 * Ascending because the content table is already normalised that way (`bindContent`), so
 * no sort exists here to get wrong and the order does not depend on the order a designer
 * typed the needs in (I2).
 */
export function formNeedVector(content: BoundContent): readonly NeedState[] {
  const needTypes = content.content.needTypes ?? [];
  const wantAt = wantAtOf(content);
  const needs: NeedState[] = [];
  for (const needType of needTypes) {
    needs.push({
      needId: needType.id,
      // A GUEST ARRIVES AT ITS WANT LINE ON EVERY NEED (G-027b): it walks in wanting everything,
      // just barely. Derived from content rather than stored per need, so it costs no field and
      // no number — and it is what makes the whole 1,440-tick stay the steady state rather than
      // one long transient. Arriving EMPTY was measured and rejected: rest alone would take most
      // of the stay to clear. Arriving FULL was rejected on the sentence that a guest which does
      // not want a bed does not book one.
      // ============================================================================
      // AND NEVER AT 0 — THE `max` IS THE PRE-STOCK ERA, NOT A FUDGE (round 1).
      //
      // A deficit of 0 is a FULL need, and a full need that nothing has served is the one vector
      // `assertNeedVector` refuses: it would throw on this guest's first commit. The line reaches
      // 0 only when the content declares no want line at all (`wantAtOf` answers the era's 0), and
      // for that content "one tick below full" IS the era's own reading — a pre-G-027b guest
      // pursued a need whenever any provision was outstanding, which is `deficit >= 1` exactly.
      //
      // IT IS NOT COVERING FOR A DESIGNER'S ZERO. A want line that was WRITTEN and floors to 0 is
      // refused at bind time, by name, with the need named (`assertEveryNeedIsWantedOnArrival`),
      // so this `max` is only ever load-bearing for content that predates the field. On any table
      // whose line is at least 1 — every shipped one — it changes nothing.
      // ============================================================================
      deficit: Math.max(1, wantLineOf(needType, wantAt)),
      // Nothing has served it yet, and the deficit above is at least 1, so this is consistent
      // with `assertNeedVector`'s "full implies attributed" from the first tick. UNTIL ROUND 1
      // THIS READ "the line is above 0 for any want line a designer can write" — and three
      // schema-valid documents said otherwise, each of them throwing here, one commit later,
      // from inside the tick.
      metBy: null,
      // Nothing has been walked out on yet either (G-014b).
      abandonCount: 0,
      // And the hotel has not had a tick in which to let this guest down yet (G-028a). A guest
      // is created DURING its arrival tick, after that tick's decay pass has already run, so
      // the tick it walks in on cannot have gone unserved — the same `- 1` the closed form in
      // this file's header applies to the deficit, for the same reason.
      unservedTicks: 0,
    });
  }
  return needs;
}

/**
 * Full: this need has as much as it can hold. **Not terminal** — it decays again next tick.
 *
 * The stock-model successor to `isNeedMet`, and the rename is the point rather than tidiness:
 * "met" named a task that was over, and the thing this asks is a momentary state a need passes
 * through several times a stay.
 */
export function isNeedFull(need: NeedState): boolean {
  return need.deficit === 0;
}

/**
 * Empty: this need has nothing left. **Not terminal either** — being served refills it.
 *
 * The successor to `isNeedFailed`, and it is a level rather than a fate. Its consequence is that
 * pressure saturates here, so the utility function can no longer separate this need from another
 * that is also empty.
 *
 * IT IS NOT WHAT MAKES A GUEST LEAVE, AND THIS SENTENCE USED TO SAY IT WOULD BE. It read "the
 * consequence that makes it matter to a guest — leaving because nothing has served it — is the
 * next goal's", and that goal ran and chose a different quantity: dissatisfaction fills from the
 * WANT LINE, not from empty (`wantsSomethingUnserved` below). ADR-0026 is the reason — an
 * engagement need can only empty once in a 1,440-tick stay, so a rule keyed here would be a step
 * function with no graded region to be tuned in.
 */
export function isNeedEmpty(needType: NeedTypeData, need: NeedState): boolean {
  return need.deficit >= needType.capacityTicks;
}

/**
 * WANTED: the guest is pursuing this need. **The one predicate the guest loop acts on**, and
 * the hysteresis lives here rather than in the scorer.
 *
 * A SCHMITT TRIGGER, WHICH IS WHY IT TAKES `beingServed`. Wanting STARTS when the deficit
 * reaches the want line and STOPS only at FULL — so the two thresholds differ and a guest
 * cannot flicker in and out of wanting a thing on consecutive ticks. Expressed without a stored
 * flag: a need is wanted if it is at or past the line, OR if something is already serving it
 * and it is not yet full. `stepGuests` knows which needs are being served this tick; nothing
 * else has to.
 *
 * THE `deficit > 0` CLAUSE IS THE TOP OF THE TRIGGER — "a full need is never wanted" — and that
 * is the whole of its job (corrected at round 1). It used to be described as carrying the
 * pre-stock era as well: `wantAtOf` answers 0 for content that predates the want line, and at a
 * line of 0 this reads "wanted iff not full", which is what a guest did when a need was a task
 * with outstanding provision. THAT CONTENT NO LONGER REACHES THIS FUNCTION. A guest is formed AT
 * its want line, so a line of 0 forms a full need nothing has served — refused by
 * `assertNeedVector` at the first commit and now by `bindContent` at load
 * (`assertEveryNeedIsWantedOnArrival`). The clause is unchanged and still load-bearing; what is
 * gone is the second reading, which described a document this simulation cannot run.
 */
export function isNeedWanted(
  needType: NeedTypeData | undefined,
  need: NeedState,
  wantAtBasisPoints: number,
  beingServed: boolean,
): boolean {
  if (need.deficit <= 0) return false;
  // A need this content does not define has no capacity for a line to be a fraction OF, so the
  // line is 0 and this reads "wanted iff not full" — the `advanceNeed` contract for the same
  // case, and the same answer the task model gave a need with outstanding provision. It cannot
  // be PURSUED either way: `reserve` skips a need whose type it cannot resolve.
  if (needType === undefined) return true;
  return beingServed || need.deficit >= wantLineOf(needType, wantAtBasisPoints);
}

/**
 * How badly this guest wants it: **the deficit itself**, an integer count of ticks of stock
 * (G-027b).
 *
 * IT IS NO LONGER DERIVED, AND THAT IS THE HEADER'S "URGENCY IS DERIVED, NEVER STORED" GOING
 * THE OTHER WAY ON PURPOSE. Under two countdowns, urgency was `patienceTicks - patienceRemaining`
 * — a quantity the state did not carry, computed from content so that the v5 -> v6 migration
 * could invent nothing. A stock stores the want directly, so the number that used to be derived
 * IS the field, and there is still exactly one copy of it. What is derived now is the FRACTION
 * (`pressureBasisPoints`), which is the thing decisions are actually compared on.
 *
 * Kept as a named function, and still taking content, because callers outside this module ask
 * "how much does this guest want that" without holding a need type — and because deleting an
 * exported name to save an indirection is a diff nobody can review as one line.
 */
export function urgencyOf(content: BoundContent, need: NeedState): number {
  return findNeedType(content, need.needId) === undefined ? 0 : need.deficit;
}


/*
 * `compareNeedPriority` WAS HERE AND WAS DELETED AT G-014a. NAMED, NOT DISCOVERED.
 *
 * It ranked two pending needs by the fraction of patience each had spent, as an exact
 * cross-multiplication — `urgencyA * patienceB` against `urgencyB * patienceA`, integer and
 * lossless — with ties broken on the lower need id. It was the whole of a guest's choice at
 * G-012, and it compared needs only: it had nothing to say about WHICH provider.
 *
 * `pressureBasisPoints` in `utility.ts` replaces it, and the replacement is LOSSY. Flooring
 * each fraction into basis points can tie where the cross-multiplication separated, so this
 * is a behaviour change and not a refactor. It is exactly equivalent for content whose
 * DENOMINATORS have a least common multiple under 10,000, and the sufficiency argument, the
 * shipped denominators and what executes them all live in `utility.ts`'s header — one copy,
 * because this paragraph carried a second and it went stale.
 *
 * IT READ "the shipped 300 / 360 / 300 table does, at 1,800" UNTIL θ-a SWEEP 2, and every term
 * of that was a countdown-era `patienceTicks` table. The denominator is `capacityTicks` now, and
 * `utility.test.ts` drives a FIXED pair of denominators rather than the shipped ones — the
 * shipped table is checked in `tools/headless`, because this package never sees content.
 * **That sentence had seven other copies, chased across two sweeps; this was the eighth.**
 *
 * Why a scalar had to replace a comparator: G-014b needs "beats it by a margin", and a
 * comparator cannot express a margin. `a beats b` and `a beats b by this much` are
 * different questions, and only the second can carry hysteresis.
 *
 * The tie rule survives unchanged. A tie now falls through to the lower need id because
 * `reserve` walks the vector in ascending id and keeps the incumbent, which is the same
 * answer this function's last line gave.
 */

/**
 * IS THE HOTEL LETTING THIS GUEST DOWN RIGHT NOW? True when any need it carries is WANTED, is not
 * one of the two things the tick is serving, and is not one the guest has CHOSEN to leave behind
 * (θ-b1, ADR-0017 4(b), ADR-0026 as amended).
 *
 * **The one input to the dissatisfaction stock**, and it lives here rather than in `guests.ts` for
 * the reason every other need predicate does: this module owns what a need IS and when a guest
 * wants it; that one owns what the guest DOES about it. `guests.ts` calls this with the same
 * `servedA`/`servedB` pair it has just handed `advanceNeeds`, so "served" means one thing per tick
 * and there is no second answer to disagree with the first.
 *
 * ---------------------------------------------------------------------------
 * WANTED, NOT EMPTY — WHICH IS THE WHOLE OF ADR-0026 IN ONE PREDICATE.
 *
 * The rejected design filled a counter while a need was EMPTY and reset it to zero when anything
 * served it. Under the shipped table an engagement need decays from its want line to empty in
 * `1400 - 420 = 980` ticks and a stay is 1,440, so a need can empty at most ONCE per stay and one
 * serving ends it for good: "how long has this guest been empty" is very nearly a yes/no question,
 * and a threshold over it is a coin toss on which side of the provider throughput limit the hotel
 * sits. Measured across that limit, the run-shaped rule moved from 0% of residents evicted to
 * 77.5% on a 4.7% change in occupancy.
 *
 * The want line is crossed and re-crossed several times a stay, so the SHARE of ticks a guest
 * spends unserved is a continuous quantity that degrades smoothly with contention. That share is
 * what the stock integrates.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * `excusedNeedId` IS THE AMENDMENT, AND IT IS THE HOTEL'S CULPABILITY MADE EXPLICIT.
 *
 * ADR-0017 §2 makes rest decay in AWAY time and nowhere else: being busy is the only thing that
 * costs a guest its sleep, on purpose. The first build of this predicate then charged that decay
 * TO THE HOTEL — a guest sitting in the cafe has its lodging need wanted and unserved by
 * construction, so the stock filled while the hotel was doing everything right.
 *
 * IT WAS THE DOMINANT CASE, NOT A CORNER. `ai-critic` measured the share of fill-ticks driven
 * ONLY by the lodging need while the guest was engaged at a provider: **8.7 % at
 * `--amenities 1` and 48.4 % at `--amenities 5`.** In a hotel that works, half the stock was the
 * guest's own dinner trip, and **no amount of building could pay it down**.
 *
 * > A stock is only a design dial if playing well can pay it down. If some of its fill is
 * > structural, the dial has a floor nobody can see.
 *
 * So the caller names the one need the guest has chosen to leave behind, and it is the LODGING
 * need of a guest that HOLDS A ROOM: at home that need is being served and is skipped anyway;
 * away, it is decaying because the guest went out. A guest holding NO room excuses nothing — the
 * hotel really is failing to give it a bed — which is why the decision is the caller's, in
 * `guests.ts`, where what the guest is holding is known.
 * ---------------------------------------------------------------------------
 *
 * BOOLEAN AND NOT A COUNT, deliberately. A guest wanting three things it cannot get is not three
 * times as let down as one wanting one: the fill rate is a property of the guest's experience, and
 * a count would make it a property of the content table's arity. See
 * `dissatisfactionReliefPerTickSchema` in `packages/content`, where the fill rate of 1 is derived.
 *
 * EARLY-EXITS ON THE FIRST HIT and RESOLVES THE NEED TYPE BY POSITION, both for the reason
 * `advanceNeeds` and `reserve` do — this runs for every guest on every tick. Measured paired
 * against the binary-search spelling of the same predicate: 1.017x against 1.062x/1.094x. The
 * cheap half of the wanting test (`deficit === 0`) is asked before the type is resolved, exactly
 * as `reserve` asks it.
 */
export function wantsSomethingUnserved(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
): boolean {
  const needTypes = needTypesInOrder(content);
  const maybeAligned = needs.length === needTypes.length;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    if (isNeedUnservedNow(content, needTypes, maybeAligned ? i : -1, need, servedA, servedB, wantAtBasisPoints, excusedNeedId)) {
      return true;
    }
  }
  return false;
}

/**
 * IS THE HOTEL LETTING THIS GUEST DOWN ON **THIS** NEED RIGHT NOW? (G-028a.)
 *
 * THE ONE DEFINITION, AND IT WAS THE LOOP BODY ABOVE UNTIL THIS GOAL. `wantsSomethingUnserved`
 * is now a fold over it and `accumulateUnservedTicks` is the same walk keeping a counter, so the
 * mood a guest is in and the measurement of what the hotel did to it cannot answer this question
 * differently. Extracting it rather than writing a second copy is ADR-0021's proxy rule: the
 * alternative was a fourth spelling of the same three exclusions inside the thing that counts them.
 *
 * THE CHEAP HALF IS STILL ASKED FIRST — `deficit === 0`, one integer compare, before any type
 * resolution — because that ordering was measured rather than assumed (see the block above) and
 * this predicate runs for every need of every guest on every tick. The type is therefore resolved
 * HERE rather than by the caller: a caller that resolved it first, to pass it in, would have paid
 * for the lookup on the needs this returns `false` for without asking.
 *
 * `positionalIndex` is the index in the guest's vector, or -1 when the vector cannot be aligned
 * with the content table at all — the `advanceNeeds` convention, passed as a number so that no
 * closure and no options object is allocated per need per tick.
 *
 * `beingServed` is FALSE at the `isNeedWanted` call by construction: the two served ids are
 * skipped by name above. That is the near side of the hysteresis — a need between full and its
 * want line does not count against the hotel, which is the same line `reserve` will not chase.
 */
function isNeedUnservedNow(
  content: BoundContent,
  needTypes: readonly NeedTypeData[],
  positionalIndex: number,
  need: NeedState,
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
): boolean {
  // A FULL NEED IS NOT WANTED, and this is one integer compare before any type resolution.
  if (need.deficit === 0) return false;
  // Something is serving it this tick, so the hotel is not failing the guest on this one.
  if (need.needId === servedA || need.needId === servedB) return false;
  // And the guest's own excursion is not the hotel's fault (ADR-0026 as amended).
  if (need.needId === excusedNeedId) return false;
  const positional = positionalIndex === -1 ? undefined : needTypes[positionalIndex];
  const needType =
    positional !== undefined && positional.id === need.needId ? positional : findNeedType(content, need.needId);
  return isNeedWanted(needType, need, wantAtBasisPoints, false);
}

/**
 * One tick of every need's `unservedTicks`. **THE ONE PLACE THAT COUNTER MOVES** (G-028a).
 *
 * Returns the same array by reference when the hotel served (or owed) everything this guest
 * wanted, and reuses every entry that did not move — the `advanceNeeds` contract, for the same
 * reason: this runs for every live guest on every tick.
 *
 * ---------------------------------------------------------------------------
 * THE REFERENCE RESULT IS THE DISSATISFACTION INPUT, AND THAT IS AN IDENTITY RATHER THAN A
 * COINCIDENCE: this allocates a new vector if and only if some need satisfied
 * `isNeedUnservedNow`, which is exactly the condition `wantsSomethingUnserved` returns `true`
 * for. `needs.unserved.test.ts` drives both over the same inputs and asserts they cannot
 * disagree.
 *
 * IT IS NOT WIRED THAT WAY AT THE CALL SITE, DELIBERATELY, AND THIS GOAL IS WHY. G-028a promises
 * that nothing but the state hash moves; step 4b's `letDown` is what decides whether a guest
 * walks out, so re-deriving it from an allocation in the diff that introduces the allocation
 * would put the one property the seam rests on at risk to save a walk of a four-element array.
 *
 * THE COST OF DECLINING IT IS MEASURED RATHER THAN GUESSED, AND `PARKING.md` CARRIES IT: two
 * independent paired campaigns, both arms interleaved in one sitting, non-overlapping
 * distributions, agreeing on the ratio. The merge is a result waiting for a goal rather than a
 * note, because the identity it would rest on — a new vector comes back exactly when the guest
 * wants something unserved — is already SWEPT in `needs.unserved.test.ts` rather than assumed.
 * ---------------------------------------------------------------------------
 *
 * IT DOES NOT CLAMP. `capacityTicks` bounds a deficit because a stock is finite; the time a
 * hotel spends failing a guest is bounded only by the stay, and `assertNeedOutcomes` carries
 * that bound where the stay length is known.
 */
export function accumulateUnservedTicks(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  wantAtBasisPoints: number,
  excusedNeedId: ContentId | null,
): readonly NeedState[] {
  const needTypes = needTypesInOrder(content);
  const maybeAligned = needs.length === needTypes.length;
  let next: NeedState[] | null = null;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    const unserved = isNeedUnservedNow(
      content,
      needTypes,
      maybeAligned ? i : -1,
      need,
      servedA,
      servedB,
      wantAtBasisPoints,
      excusedNeedId,
    );
    if (!unserved) {
      if (next !== null) next.push(need);
      continue;
    }
    if (next === null) next = needs.slice(0, i);
    next.push({ ...need, unservedTicks: need.unservedTicks + 1 });
  }
  return next ?? needs;
}

/**
 * One tick of the whole vector's stocks.
 *
 * `servedA` and `servedB` are the needs something is serving this tick — the lodging need while
 * the guest is IN its own room (not merely holding it: ADR-0017 §3, and `stepGuests` step 4 owns
 * that predicate), and the need it is engaged for. Two parameters rather than a predicate
 * callback because this runs for every live guest on every tick, and a closure per guest per
 * tick is the allocation shape G-010 spent a goal removing.
 *
 * `away` IS THE THIRD INPUT AND IT ONLY REACHES THE LODGING NEED. It is what makes "activity
 * draws a stock down" (ADR-0017 §2) a mechanism rather than a sentence: rest decays while the
 * guest is out and is HELD while it is in its room, so being busy is the only thing that costs
 * rest. See `advanceNeed` for the three cells and for the arm that separates this law from the
 * two implementations that look like it.
 *
 * RETURNS THE SAME ARRAY BY REFERENCE when no entry moved, and reuses every entry that did not.
 * Under a stock model nothing is terminal, so the old reason a vector was reusable is gone — and
 * TWO reasons survive, one at each end, which is why the deficit is stored rather than the level:
 * a FULL need being served (a sleeping guest) and an EMPTY need nothing serves (a guest with no
 * cafe to go to) both clamp onto their own value and come back by reference.
 *
 * THE NEED TYPE IS RESOLVED BY POSITION WHEN IT CAN BE (G-016), unchanged: `formNeedVector`
 * builds one entry per need type in the content table's own ascending order, so `needs[i]` and
 * `needTypesInOrder(content)[i]` are the same need for any guest that formed its vector under
 * THIS content. Checked per entry by a string identity compare, with a fallback to the search
 * for a guest whose vector predates the table.
 */
export function advanceNeeds(
  content: BoundContent,
  needs: readonly NeedState[],
  servedA: ContentId | null,
  servedB: ContentId | null,
  servedByKind: ProviderKind,
  away: boolean,
  lodgingNeedId: ContentId | undefined,
): readonly NeedState[] {
  const needTypes = needTypesInOrder(content);
  // A vector of a different length cannot be positionally aligned with the table at all, so
  // the per-entry check below is skipped rather than failed four times.
  const maybeAligned = needs.length === needTypes.length;
  let next: NeedState[] | null = null;
  for (let i = 0; i < needs.length; i += 1) {
    const need = needs[i];
    if (need === undefined) continue;
    const positional = maybeAligned ? needTypes[i] : undefined;
    const needType =
      positional !== undefined && positional.id === need.needId
        ? positional
        : findNeedType(content, need.needId);
    // `servedA` is the LODGING room, so it is a room by construction — nothing else can serve
    // that need (`bindContent` refuses an item that provides it). `servedB` is the engagement,
    // and its kind is whatever the guest is engaged with. Scalars rather than a pair or a
    // closure: this runs for every need of every guest on every tick.
    const servedBy = need.needId === servedA ? 'room' : need.needId === servedB ? servedByKind : null;
    const moved = advanceNeed(needType, need, servedBy, need.needId === lodgingNeedId ? away : true);
    if (moved !== need && next === null) {
      next = needs.slice(0, i);
    }
    if (next !== null) next.push(moved);
  }
  return next ?? needs;
}

/**
 * One tick of one stock. Returns the same object when nothing moved.
 *
 * ---------------------------------------------------------------------------
 * THREE CELLS, AND THE THIRD IS LOAD-BEARING RATHER THAN TIDY (G-027b).
 *
 *   served                       deficit -= refillPerTick, clamped at 0
 *   not served, DECAYING         deficit += 1, clamped at capacityTicks
 *   not served, NOT DECAYING     unchanged - the entry is returned by reference
 *
 * The third cell is what a guest sitting in its own room does to its rest: it neither sleeps
 * nor tires. `decaying` is `true` for every engagement need on every tick — they decay in wall
 * time — and for the lodging need only while the guest is AWAY.
 *
 * IT SEPARATES THIS LAW FROM THE TWO IMPLEMENTATIONS THAT LOOK LIKE IT, and both of those were
 * built and rejected during this goal rather than imagined:
 *
 *   UNIFORM DECAY — the lodging need decays in wall time like the others. Reads +1 in the third
 *   cell. It satisfies ADR-0017 §3's sentence and implements none of §2: activity costs
 *   nothing, because the stock falls at the same rate whatever the guest does.
 *   UNCONDITIONAL REFILL — the room tops rest up whenever the guest is present. Reads -r in the
 *   third cell. It makes the drawdown observable and then starves rest of any deficit to
 *   accumulate: the binding quantity becomes the longest CONTIGUOUS away run, which is an
 *   artefact of the order a guest happens to pursue its needs in — the same phase-alignment
 *   fragility `utility.ts` records as the cause of ADR-0017's cliff. A sizing rule that depends
 *   on phase alignment is not a sizing rule.
 *
 * So one arm — read the lodging deficit's change in all three cells — discriminates this law
 * from both, and it is the same arm that catches the second of them, which is the defect that
 * made the lodging need decorative in this goal's first number set. `needs.stock.test.ts`
 * drives it.
 * ---------------------------------------------------------------------------
 *
 * Takes the need TYPE rather than the content, because the caller has already resolved it —
 * positionally where it could, by search where it could not. `undefined` still means "this
 * content does not define the need": such a need cannot be clamped against a capacity nobody
 * declared, so it is HELD rather than guessed at, exactly as patience was.
 */
function advanceNeed(
  needType: NeedTypeData | undefined,
  need: NeedState,
  servedBy: ProviderKind | null,
  decaying: boolean,
): NeedState {
  if (servedBy === null) {
    // Held: not decaying at all, or already empty. Both come back by reference, which is the
    // second of the two identity-return ends the deficit exists to preserve.
    if (!decaying) return need;
    const capacity = needType?.capacityTicks;
    if (capacity === undefined || need.deficit >= capacity) return need;
    return {
      needId: need.needId,
      deficit: need.deficit + 1,
      // Carried, never cleared. What last served this need is a fact about its history, and a
      // stock has history where a task had none — see `NeedState.metBy`.
      metBy: need.metBy,
      // Carried, never reset. Decay says nothing about a guest's history of walking out on this
      // need, and a counter that decay quietly cleared would under-report exactly the guest the
      // margin is tuned against — one that keeps changing its mind (G-014b).
      abandonCount: need.abandonCount,
      // Carried, and NOT incremented here (G-028a). Decay and neglect are different questions:
      // a need decays on every tick nothing serves it, including ticks the guest does not want
      // it and ticks its own excursion caused — and only `accumulateUnservedTicks` knows which
      // of those the hotel is answerable for. One writer, in one place.
      unservedTicks: need.unservedTicks,
    };
  }
  // Served. A full need being topped up is the FIRST identity-return end: a sleeping guest whose
  // rest is already full allocates nothing, tick after tick, for as long as it sleeps.
  if (need.deficit === 0 && need.metBy === servedBy) return need;
  const refill = needType?.refillPerTick ?? 1;
  const deficit = need.deficit > refill ? need.deficit - refill : 0;
  return {
    needId: need.needId,
    deficit,
    // WRITTEN ON EVERY SERVED TICK, where it used to be written once on the transition to zero.
    // "What last served it" is the honest reading under a model where nothing finishes, and the
    // guest that eats half its dinner at a vending machine and the rest at the cafe is recorded
    // against the cafe — the same answer the transition rule gave, for the same reason.
    metBy: servedBy,
    abandonCount: need.abandonCount,
    // Carried. A served tick is one this need is NOT unserved on, which is a statement the
    // accumulator makes by not incrementing rather than one made twice here.
    unservedTicks: need.unservedTicks,
  };
}

/**
 * A guest walks out on the provider it had engaged for this need (G-014b). THE ONE PLACE
 * `abandonCount` MOVES.
 *
 * THE DEFICIT IS UNTOUCHED, and that is the whole of it under a stock. A guest interrupted
 * halfway through dinner has had half a dinner, so the level it reached is RETAINED — the rule
 * G-012 settled at seeding for a provider that stopped providing, and abandoning is the same
 * event chosen rather than suffered. From the next tick the need simply decays again, like any
 * other need nothing is serving.
 *
 * (It read "PROGRESS AND PATIENCE ARE UNTOUCHED … patience is untouched because the need reverts
 * to WAITING" until θ-a sweep 3. Two of those nouns are ADR-0017's deleted fields and the second
 * half named a penalty that could not be applied to a field that no longer exists. What is left
 * of the argument is the first half, and it is unchanged: retention is the decision.)
 *
 * IT DOES NOT RELEASE ANYTHING. The reservation lives on the guest and is given back through
 * `release` in `guests.ts`, which is the one place `held` shrinks; a need module that also
 * touched the room search would be a second release site and would break the short-circuit
 * that depends on there being one (see `findFreeRoom`).
 *
 * Returns the same object when the need is already FULL, so a caller that somehow reached a
 * need nobody could still be serving cannot invent a history for it. The tick cannot produce
 * that state — a need that reaches full has its engagement released in step 5, before step 7
 * can abandon anything.
 *
 * THE GUARD IS `deficit === 0` AND NOT `!isNeedWanted`, deliberately, and the difference is the
 * hysteresis. A need between its want line and full IS still being pursued while something
 * serves it, which is exactly the guest this function exists for: one that walks out on a
 * half-finished meal. Asking the wanting predicate here would need the content and the serving
 * flag, and would answer "not wanted" for the very case being recorded.
 */
export function abandonNeed(needs: readonly NeedState[], needId: ContentId): readonly NeedState[] {
  const index = indexOfNeed(needs, needId);
  if (index === -1) return needs;
  const need = needs[index];
  if (need === undefined || need.deficit === 0) return needs;
  const next = needs.slice();
  next[index] = { ...need, abandonCount: need.abandonCount + 1 };
  return next;
}

/**
 * SATISFIED: at or above this need's want line, asked with the content in hand (G-027b).
 *
 * THE ONE DEFINITION OF "MET" FOR ANYTHING THAT REPORTS ON A STAY — the departure tally and the
 * review both call it, so a guest cannot be satisfied to the reviewer and unmet to the report.
 * It is a BAND and not a point: a stock sits at exactly full for about one tick per cycle, so
 * "full at departure" would report almost nothing met and say nothing about the stay.
 *
 * A need whose type this content does not define counts as NOT satisfied — the `urgencyOf`
 * contract, and the same answer the task model gave a need with outstanding provision.
 */
export function isNeedSatisfiedIn(content: BoundContent, need: NeedState): boolean {
  if (need.deficit === 0) return true;
  const needType = findNeedType(content, need.needId);
  if (needType === undefined) return false;
  return need.deficit < wantLineOf(needType, wantAtOf(content));
}

/**
 * Record what became of every need a departing guest formed. THE ONE PLACE THE TALLY MOVES.
 *
 * A merge of two ascending lists rather than a row-by-row insert, so a departure costs one
 * pass and one allocation whatever the guest was carrying. Rows are created here on first
 * use, which is why `createNeedOutcomes` can be empty and why the migration can default to
 * `[]` without knowing what needs exist.
 *
 * Every instance is counted exactly once — met if it was met, unmet otherwise — so
 * `met + unmet` advances by exactly one per row per departing guest that carried that
 * need. That is the identity `assertNeedOutcomes` bounds and the report checks exactly.
 *
 * IT TAKES CONTENT SINCE G-027b, AND THAT IS WHAT "MET" NOW COSTS. Under a task model "met"
 * was `progressRemaining === 0`, readable from the need alone. Under a stock it is a BAND and
 * not a point: a need sits at exactly full for about one tick per cycle, so counting "full at
 * departure" would report ~0 met for every engagement need and say nothing about the stay. Met
 * is therefore "at or above the want line when the guest left" — satisfied, not wanting — which
 * needs the capacity and the line, both content. `depart` already holds content, so no call
 * site gains a lookup.
 *
 * IT IS A SNAPSHOT AND IT IS HONEST ABOUT BEING ONE. "Was satisfied when it left" is a weaker
 * statement than "was satisfied throughout", and the stock-shaped replacement — time spent
 * unserved — is a per-need accumulator, which is saved state and was deferred to the goal that
 * paid for a schema bump. **That goal is G-028a and the accumulator is `unservedTicks`.** It is
 * folded here, beside the snapshot, and this is the paragraph that says why both are present:
 *
 * ---------------------------------------------------------------------------
 * THE SNAPSHOT COLUMNS ARE UNTOUCHED IN THIS GOAL, AND THAT IS A DECISION RATHER THAN AN
 * OVERSIGHT (ADR-0034 §2). `met` and `unmet` are what `report.ts`'s review law A compares the
 * top-review count against, and the review is what produces that count — so redefining `met`
 * without redefining the score, or the score without `met`, makes a build that exits 1 on a
 * well-provisioned hotel. The two move together, in the goal that changes the scorer. Until then
 * this function reports BOTH: what was true at the instant the guest left, and how long the
 * hotel spent failing it. The first is measured to be a phase artefact at the shipped cadence;
 * the second is what replaces it.
 *
 * WHAT THE OLD SPELLING ASSERTED AND WHAT THIS ONE STILL ASSERTS (ADR-0027, by class rather than
 * by call site):
 *
 *   KEPT  every instance counted exactly once — `met + unmet` advances by one per row per
 *         departing guest that carried the need, which is the identity the report checks exactly.
 *   KEPT  `metByItem <= met`, with by-room derived rather than stored.
 *   KEPT  `abandoned` folded once, on the way out, so no row can exist before a departure.
 *   KEPT  one merge of two ascending lists: one pass, one allocation, rows created on first use.
 *   KEPT  ONE definition of "met", shared with the review through `isNeedSatisfiedIn`, so the
 *         tally and the review cannot disagree about a guest.
 *   ADDED `unservedTicks` and `instanceTicks`, which advance on the same instances and by
 *         construction cannot advance on any others — they are folded in the same branch.
 *
 * WHAT IT NOW PERMITS THAT THE OLD ONE FORBADE: nothing. Every counter above still moves exactly
 * when it moved before, and this goal adds no reader for the two new ones outside the report.
 * ---------------------------------------------------------------------------
 *
 * `stayTicks` IS THE DENOMINATOR AND THE CALLER COMPUTES IT, from the departing guest's own
 * arrival tick. It is not a wait and it is not read as one: it is how long there WAS to fail
 * this guest in, and a guest that gave up in the lobby has a short one. Passed rather than
 * derived here because this module cannot see a guest (`guests.ts` owns that type, and a
 * circular import is an error in `.dependency-cruiser.cjs`).
 */
export function recordNeedsAtDeparture(
  content: BoundContent,
  outcomes: readonly NeedOutcome[],
  needs: readonly NeedState[],
  stayTicks: number,
): readonly NeedOutcome[] {
  if (needs.length === 0) return outcomes;
  // ONE DEFINITION, NOT A SECOND COPY OF THE COMPARISON. `isNeedSatisfiedIn` is what the review
  // asks too, so the tally and the review cannot disagree about a guest — which is the property
  // `metByItem <= met` and `Σ reviews === departed` both quietly depend on.
  const satisfied = (need: NeedState): boolean => isNeedSatisfiedIn(content, need);
  const merged: NeedOutcome[] = [];
  let i = 0;
  let j = 0;
  while (i < outcomes.length || j < needs.length) {
    const row = outcomes[i];
    const need = needs[j];
    if (need === undefined) {
      if (row !== undefined) merged.push(row);
      i += 1;
      continue;
    }
    if (row === undefined || row.needId > need.needId) {
      merged.push({
        needId: need.needId,
        met: satisfied(need) ? 1 : 0,
        unmet: satisfied(need) ? 0 : 1,
        metByItem: byItem(need, satisfied(need)),
        abandoned: need.abandonCount,
        unservedTicks: need.unservedTicks,
        instanceTicks: stayTicks,
      });
      j += 1;
      continue;
    }
    if (row.needId < need.needId) {
      merged.push(row);
      i += 1;
      continue;
    }
    merged.push({
      needId: row.needId,
      met: row.met + (satisfied(need) ? 1 : 0),
      unmet: row.unmet + (satisfied(need) ? 0 : 1),
      metByItem: row.metByItem + byItem(need, satisfied(need)),
      // The guest's whole history of walking out on this need, added once, on the way out —
      // which is what keeps `met + unmet === departed` true of the same row (G-014b).
      abandoned: row.abandoned + need.abandonCount,
      // Numerator and denominator advance in the SAME branch as `met + unmet` (G-028a), so a
      // row can never carry a stay it did not count an instance for, or an instance whose stay
      // it did not count. That is what makes `unservedTicks <= instanceTicks` checkable rather
      // than hopeful.
      unservedTicks: row.unservedTicks + need.unservedTicks,
      instanceTicks: row.instanceTicks + stayTicks,
    });
    i += 1;
    j += 1;
  }
  return merged;
}

/**
 * 1 when an ITEM delivered this need, 0 otherwise (G-013).
 *
 * Reads `metBy` rather than re-deriving anything, and takes the caller's own `met` answer
 * rather than asking a second time — so a need counted into `met` and a need counted into
 * `metByItem` cannot disagree about whether it was satisfied. `assertNeedOutcomes` bounds
 * `metByItem <= met`, and this is what makes that true at the site rather than by luck.
 *
 * WHAT IT CAN UNDER-COUNT, SAID RATHER THAN DISCOVERED (G-027b). `metBy` is what LAST SERVED
 * the need, so a need that is above its line because an item served it reads `item` exactly.
 * A need that reached its line and was never served at all — impossible today, because a guest
 * arrives AT the line and only serving moves it down — would read `null` and count into `met`
 * without counting here. The inequality holds in the direction that matters and the gap is
 * unreachable through the tick.
 */
function byItem(need: NeedState, met: boolean): number {
  return met && need.metBy === 'item' ? 1 : 0;
}

/**
 * Throws if a need vector could not have come from this simulation.
 *
 * Called from `assertGuestStoreInvariants`, so it runs at every commit AND at every load
 * — "a valid vector" has one definition, the discipline every other store invariant here
 * keeps. Content-free on purpose: `assertWorldShape` has no content, and a check that
 * needed some would either be skipped at load or be a second, laxer definition.
 *
 * A guest with NO needs is refused. It could never act, never leave and never be counted:
 * a guest exists to want something.
 *
 * IT TAKES THE GUEST ID, NOT A DESCRIPTION (G-016). The call site used to pass
 * `` `guest ${guest.id}` ``, so a string was CONCATENATED for every guest on every tick to
 * label a message that is only ever read when something throws. Built at the call site it
 * crosses a call boundary; built here it is unreachable on the non-throwing path.
 *
 * IT IS KEPT ON PRINCIPLE, NOT ON A MEASUREMENT, AND THE HONEST NUMBER IS ~0%. Measured
 * paired and interleaved against the build without it: 6,260ms -> 6,296ms on the 365-day
 * bench, which is inside the run-to-run spread. An earlier reading claimed 34% and was
 * WRONG — the machine drifted nearly 2x faster across that session, and the two arms had
 * been timed minutes apart. Removing a per-guest-per-tick allocation is still the right
 * shape, and `needs.test.ts` pins that the message is still built and still names the
 * guest, but nobody should cite a saving for it.
 *
 * AND IT DOES NOT SETTLE THE QUESTION G-016 WAS SET TO ANSWER — READ THIS BEFORE REPEATING
 * THE CLAIM. An earlier draft of this comment said that no-opping the whole scan body was
 * SLOWER than making it cheaper, and concluded that G-010's "make the check cheaper, not
 * rarer" was vindicated by measurement. That was an artefact of the same drift. Re-measured
 * paired: `assertGuestStoreInvariants` costs **~20% of the 365-day bench** (6,348ms with it,
 * 5,030ms without) and making it cheaper recovered almost none of that. Whether to gate or
 * sample it is therefore still OPEN, still needs its own argument, and still needs a record
 * of what coverage would be surrendered. Nothing here is gated or sampled; the load path is
 * untouched; this inspects exactly what it always inspected.
 */
export function assertNeedVector(needs: unknown, guestId: number): asserts needs is readonly NeedState[] {
  // Built HERE and not at the call site — see above. Every throw below reads it, so the
  // message a developer sees is unchanged; `needs.test.ts` pins that it still names the
  // guest, because "build the message later" is only correct if it is still built.
  const describeGuest = `guest ${guestId}`;
  if (!Array.isArray(needs)) {
    throw new Error(`Guest store is invalid: ${describeGuest} has a need vector that is not an array`);
  }
  if (needs.length === 0) {
    throw new Error(
      `Guest store is invalid: ${describeGuest} has formed no needs. A guest exists to want something, so it can never act or leave.`,
    );
  }
  let previous = '';
  for (let i = 0; i < needs.length; i += 1) {
    const need: unknown = needs[i];
    if (typeof need !== 'object' || need === null) {
      throw new Error(`Guest store is invalid: ${describeGuest} has a hole in its need vector at index ${i}`);
    }
    const entry = need as NeedState;
    if (typeof entry.needId !== 'string' || entry.needId.length === 0) {
      throw new Error(`Guest store is invalid: ${describeGuest} has a need with an empty needId at index ${i}`);
    }
    // Strictly ascending, so lookup is a binary search and the order cannot depend on how
    // the vector was assembled (I2).
    if (i > 0 && entry.needId <= previous) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has needs out of order — "${entry.needId}" after "${previous}"; a need vector is strictly ascending by id`,
      );
    }
    previous = entry.needId;
    // WRITTEN OUT RATHER THAN LOOPED OVER A LITERAL TABLE, and this is the same defect
    // G-010 removed from `assertGuestStoreInvariants` — reintroduced here by copying its
    // shape. The loop form allocates one array per NEED per GUEST per TICK, which with a
    // four-need vector is four times the churn that cost a goal to remove. The check is
    // unchanged in what it inspects and in what it says; only the allocation is gone.
    //
    // The 4.7%-of-tick-self-time figure this comment used to carry was taken inside G-012's
    // drift window and has been withdrawn rather than restated: it was never re-measured
    // paired. The change stands on its shape, which is the one G-010 spent a goal removing,
    // and not on a number.
    // ONE NUMBER WHERE THERE WERE TWO (G-027b). It is not bounded ABOVE here and that is not
    // an omission: the ceiling is `capacityTicks`, which is content, and this validator runs at
    // every load with no content in hand — the same reason it has never bounded patience. A
    // deficit past its capacity is reachable through the v12 -> v13 migration and reads as
    // "empty" everywhere that matters (`isNeedEmpty` compares `>=`, `pressureBasisPoints`
    // clamps), so it is a legal state rather than an unchecked one.
    if (!Number.isSafeInteger(entry.deficit) || entry.deficit < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer deficit on need "${entry.needId}"`,
      );
    }
    // `metBy` IS NON-NULL IF AND ONLY IF THE NEED IS MET (G-013), and both halves matter.
    // A met need with no provider kind is a satisfaction the tally could not attribute, so
    // `metByItem` would silently under-count; a pending need that names one is a save
    // claiming something finished a job it is still doing. Neither is reachable through the
    // tick — `advanceNeed` writes the field on the transition and nowhere else — which is
    // exactly why it is checked here, on the path that faces bytes this build did not write.
    // Typed wider than the field for the reason `engagement` is: at LOAD an absent key and
    // a null are different statements, and `canonicalise` throws on undefined.
    const metBy: ProviderKind | null | undefined = entry.metBy;
    if (metBy === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no metBy field on need "${entry.needId}". A need that nothing ` +
          'has finished carries null, so the key is always present (it is hashed state).',
      );
    }
    if (metBy !== null && metBy !== 'room' && metBy !== 'item') {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has metBy "${String(metBy)}" on need "${entry.needId}"; a need is ` +
          'finished by a room or by an item, or by nothing yet.',
      );
    }
    // FULL IMPLIES ATTRIBUTED, AND THE CONVERSE IS GONE ON PURPOSE (G-027b). A need can only
    // reach a zero deficit by being served, so a full need recording nothing is a satisfaction
    // `metByItem` could not attribute. The other direction — attributed implies full — was true
    // of a task and is FALSE of a stock: a need that was filled and has since decayed still
    // remembers what filled it, which is history rather than contradiction. See `NeedState.metBy`.
    if (metBy === null && entry.deficit === 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has need "${entry.needId}" full but records nothing that served ` +
          'it. A stock only reaches full by being served, and every such tick attributes itself to a room or an item.',
      );
    }
    // `abandonCount` IS HASHED STATE, so the key is always present (G-014b). Typed wider than
    // the field for the reason `metBy` is: at LOAD an absent key and a 0 are different
    // statements, and only the check can tell a v9 world from a v8 one that skipped its
    // migration. There is no cross-field clause here and that is not an omission — see the
    // matrix on `NeedOutcome.abandoned`: nothing in a need vector's own numbers bounds how
    // many times its guest changed its mind.
    const abandonCount: number | undefined = entry.abandonCount;
    if (abandonCount === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no abandonCount field on need "${entry.needId}". A need nobody ` +
          'has walked out on carries 0, so the key is always present (it is hashed state).',
      );
    }
    if (!Number.isSafeInteger(abandonCount) || abandonCount < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer abandonCount on need "${entry.needId}"`,
      );
    }
    // `unservedTicks` IS HASHED STATE, so the key is always present (G-028a) — the `metBy` and
    // `abandonCount` precedent, and the same reason: at LOAD an absent key and a 0 are different
    // statements, and only the check can tell a v16 world from a v15 one that skipped its
    // migration. There is no cross-field clause and that is not an omission: nothing in a need's
    // own numbers bounds how long the hotel left it unserved. The stay does, and this validator
    // runs where no guest is in hand — the reason it has never bounded a deficit against
    // `capacityTicks` either. `assertNeedOutcomes` carries that bound, at departure, per row.
    const unservedTicks: number | undefined = entry.unservedTicks;
    if (unservedTicks === undefined) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has no unservedTicks field on need "${entry.needId}". A need the ` +
          'hotel has never failed carries 0, so the key is always present (it is hashed state).',
      );
    }
    if (!Number.isSafeInteger(unservedTicks) || unservedTicks < 0) {
      throw new Error(
        `Guest store is invalid: ${describeGuest} has a negative or non-integer unservedTicks on need "${entry.needId}"`,
      );
    }
  }
}

/**
 * Throws unless the need tally could describe this run.
 *
 * Rows ascending and unique, counters non-negative integers, and — the cross-field half —
 * NO ROW CAN HAVE RESOLVED MORE INSTANCES THAN GUESTS HAVE DEPARTED. Every departing guest
 * resolves each of its own needs exactly once, and only a departing guest moves this
 * tally, so `met + unmet` can never overtake the departure count.
 *
 * WHY THAT IS AN INEQUALITY AND NOT THE IDENTITY IT LOOKS LIKE. A world MIGRATED from v5
 * carries guests that formed a single need, because that is all a v5 guest had; when one
 * of those departs, its row advances and the others do not. So equality holds for every
 * world `createWorld` produced and cannot be asserted here without making a migrated save
 * unloadable. The report checks the identity exactly, where every guest provably formed
 * the full vector (`buildSummary` in tools/headless).
 */
export function assertNeedOutcomes(outcomes: readonly NeedOutcome[], departed: number): void {
  if (!Number.isSafeInteger(departed) || departed < 0) {
    throw new Error(`Need outcomes are invalid: departed must be a non-negative safe integer, got ${String(departed)}`);
  }
  let previous = '';
  for (let i = 0; i < outcomes.length; i += 1) {
    const row = outcomes[i];
    if (row === undefined) {
      throw new Error(`Need outcomes are invalid: hole in the tally at index ${i}`);
    }
    if (typeof row.needId !== 'string' || row.needId.length === 0) {
      throw new Error(`Need outcomes are invalid: the row at index ${i} has an empty needId`);
    }
    if (i > 0 && row.needId <= previous) {
      throw new Error(
        `Need outcomes are invalid: rows must be strictly ascending by needId, found "${row.needId}" after "${previous}"`,
      );
    }
    previous = row.needId;
    // Written out rather than looped over a literal table — the `assertNeedVector` and
    // `assertGuestOutcomes` discipline: the loop form allocates one array per ROW on every
    // load and every report.
    assertTallyCounter('met', row.needId, row.met);
    assertTallyCounter('unmet', row.needId, row.unmet);
    assertTallyCounter('metByItem', row.needId, row.metByItem);
    assertTallyCounter('abandoned', row.needId, row.abandoned);
    assertTallyCounter('unservedTicks', row.needId, row.unservedTicks);
    assertTallyCounter('instanceTicks', row.needId, row.instanceTicks);
    // AND THE HOTEL CANNOT FAIL A GUEST FOR LONGER THAN THE GUEST WAS HERE (G-028a). Both sides
    // advance in the same branch of `recordNeedsAtDeparture` — the numerator accumulated one tick
    // at a time inside the tick loop, the denominator computed once from the guest's arrival tick
    // — so nothing but agreement between those two makes this hold, which is what stops it being
    // an identity. It is the `metByItem <= met` clause one column over: the report divides these,
    // and a numerator over its denominator would print a share above one whole.
    if (row.unservedTicks > row.instanceTicks) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.unservedTicks} unserved tick(s) against ` +
          `${row.instanceTicks} tick(s) of stay. A need cannot go unserved for longer than its guests were here, ` +
          'and the report divides one by the other.',
      );
    }
    // AND THE ITEM SHARE CANNOT EXCEED THE WHOLE (G-013). By-room is DERIVED as
    // `met - metByItem`, so this is the clause that keeps the derived number from going
    // negative — a row claiming more item deliveries than satisfactions would make the
    // report print a negative count rather than fail.
    if (row.metByItem > row.met) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.metByItem} instance(s) delivered by an item ` +
          `but only ${row.met} met. By-room is derived as met - metByItem, so this would report a negative count.`,
      );
    }
    if (row.met + row.unmet > departed) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.met + row.unmet} resolved instance(s) but only ` +
          `${departed} guest(s) have departed. A need is counted once, when the guest that formed it leaves.`,
      );
    }
    // AND AN ABANDONMENT CANNOT PRECEDE THE DEPARTURE THAT CARRIED IT (G-014b). This is the
    // structural witness for counting `abandoned` at departure rather than at the moment a
    // guest walks out: an implementation that incremented this tally mid-stay would create a
    // row with `met + unmet === 0` and a non-zero count, and it would do so on the first
    // abandonment of the run. It is deliberately NOT `abandoned <= departed` — a guest may
    // abandon the same need many times, so no such bound exists — and it stops witnessing
    // once the first guest carrying this need has left. A real check with a stated blind
    // spot; see the matrix on `NeedOutcome.abandoned` for the rest of it.
    if (row.abandoned > 0 && row.met + row.unmet === 0) {
      throw new Error(
        `Need outcomes are invalid: need "${row.needId}" records ${row.abandoned} abandonment(s) but no instance of it ` +
          'has resolved. Abandonments are folded out of a departing guest\'s own need state, so a row cannot carry ' +
          'one before a guest that formed the need has left.',
      );
    }
  }
}

/** One tally counter is a non-negative safe integer. Named so the message says which. */
function assertTallyCounter(field: string, needId: ContentId, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `Need outcomes are invalid: ${field} for "${needId}" must be a non-negative safe integer, got ${String(value)}`,
    );
  }
}
