// THE SCALING BOUNDS, AND THE DERIVATION THAT PLACES THEM (G-020c).
//
// Imported by `tools/gates/scaling.mjs` (which applies them) and by
// `tools/headless/src/scaling.bound.test.ts` (which pins the arithmetic). It holds no I/O and
// spawns nothing, so the derivation can be exercised without a stopwatch.
//
// WHY THIS FILE EXISTS AT ALL. `needs.scaling.test.ts:190` used to read `const BOUND = 2.5`
// under a comment saying "1.74 x 1.5 = 2.61, held at 2.5" — a derivation in PROSE THAT
// NOTHING EXECUTED. `sim-critic` found the same shape in `tripwire.mjs` at G-020b and
// demonstrated what it costs: nudging a hand-typed ceiling loosened that bound by 8.3% with
// every check green. The readings below are NUMBERS, the two constraints on each bound are
// COMPUTED from them, and `scaling.bound.test.ts` nudges a reading and watches the bound move.
//
// THE RULE, AND WHY IT IS NOT ADR-0015's. ADR-0015 places a bound at the geometric mean of a
// NOISE FLOOR and the smallest regression, and it explicitly reserves that for a bound whose
// measured quantity is noise: "a noise floor is not a signal ... a perfect null of 1.0000
// yields 1.5000 too". These three quantities are SIGNALS — a need vector really does cost
// more than one need — and `DECISIONS.md:735-737` names 1.74, 1.281 and 4.2 as exactly that,
// keeping G-010's rule for them: MEASURED x 1.5, THEN HELD AT OR BELOW.
//
// SO EACH BOUND HAS TWO CONSTRAINTS AND THEY POINT IN OPPOSITE DIRECTIONS:
//
//   CEILING   trunc(median x 1.5, 4dp)     the bound may not be looser: past this it admits
//                                          a regression of the class it exists to catch.
//                                          The median comes from ONE STATED REGIME.
//   FLOOR     max over EVERY OBSERVED      the bound may not be tighter: at or below this it
//             reading, in every regime     has already been seen firing on nothing.
//
// AND THE BOUND IS THE CEILING EXACTLY — THERE IS NO FREE PARAMETER IN THIS FILE.
// "Measured x 1.5, then HELD AT OR BELOW" leaves a range, and a number chosen from inside a
// range is a number nobody can source (§2.1). Every value in that range is also a value a
// later editor can nudge. So the constant is pinned to EQUALITY with its own derivation — the
// shape `tripwire.mjs`'s `BOUND` refusal uses — and the floor is a separate refusal rather than a
// second
// input to choose between. Nudge a reading and the constant no longer matches; the gate
// refuses to start and names the new figure, in either direction.
//
// WHAT THAT DID TO THE FOUR BOUNDS WHEN THE RULE ARRIVED AT G-020c, stated with its direction
// because two of them loosened. **HISTORY: these are not the shipped numbers.** They are kept
// because the rule's first application is the evidence that it is a derivation and not a
// widening — a uniform rule that moved two bounds down and two up.
//
//   rooms-saturated   6    -> 5.7516   TIGHTER
//   rooms-bench       6    -> 4.6119   TIGHTER (that axis never had its own bound; it shared)
//   needs             2.5  -> 3.1135   LOOSER, AND FORCED: quiet readings of 2.5906, 2.6534 and
//                                      2.5903 were above the incumbent, so 2.5 was a bound the
//                                      instrument had already been observed clearing with
//                                      nothing to find
//   density           1.9  -> 2.0239   LOOSER BY 6.5%, AND NOT FORCED — it moved because the
//                                      MEDIAN moved, and the rule is applied uniformly
//
// AND WHAT THE G-032a RE-TAKE DID. **HISTORY: these are not the shipped numbers either.**
// Kept for the same reason as the row above it. ADR-0015's REPLACE half: the
// workload moved on three counts at once — the cadence 32 -> 96 (ADR-0021), the `one-need` arm's
// vector 1 -> 3 (G-027b made a lodging-only table unbindable), and `stayDurationTicks` 480 ->
// 1440 under every arm in both rotations (ADR-0017). The campaign was re-taken and REPLACES; not
// one reading was pooled.
//
//   needs             3.1135 -> 1.7181   TIGHTER, AND IT IS THE ARMS RATHER THAN THE SIM: the
//                                        axis is 4-against-3 needs where it was 4-against-1, so
//                                        the signal it measures is a third of what it was
//   density           2.0239 -> 2.1856   LOOSER, and the LOADED floor is why it is worth
//                                        watching: 2.0415 against this ceiling is a 1.07x margin
//   rooms-saturated   5.7516 -> 5.6532   TIGHTER
//   rooms-bench       4.6119 -> 4.1218   TIGHTER
//
// THREE TIGHTER, ONE LOOSER, ON A RULE NOBODY TOUCHED. That is the same evidence the G-020c row
// above offers: a derivation that only moves when a reading moves cannot be steered, and the
// direction of the movement is not a thing its author chose.
//
// AND WHAT THE G-039b-B1 RE-TAKE DID, WHICH IS THE SHIPPED SET.
//
// THE DRIFT GUARD COULD NOT SEE THE BUILDING GET CIRCULATION. The fingerprints below were spelled
// `name:rooms/arrivals/amenities/needTypes/stay` and nothing else, so three workload changes
// landed after G-032a without moving one character of them: `guestCellsPerTick`, a CONTENT dial
// that decides whether a guest walks at all; G-039b-alpha's CORRIDOR SPINE; and G-038a-iii-b's
// STAIRWELL. **Proof by history rather than by argument, and checked against the commit: 91d8e37
// moved every seeded room in both of these rotations and the recorded fingerprint string did not
// change one byte.** `check:scaling` was green over it and over the two goals after it. That is
// ADR-0039 §2's own sentence — *"a guard spelled entirely in the flags it guards cannot see the
// content redefine what a flag means"* — ONE CONTENT FIELD OVER FROM THE FILE THAT WROTE IT.
//
// AND IT IS WORSE THAN "A DIAL COULD MOVE UNSEEN": THE SHIPPED READINGS WERE TAKEN WITH TRAVEL
// OFF. `dfe26b9` (G-023b-ii, "travel is ON in the shipped game") ADDED `guestCellsPerTick` to
// `guest-rules.json` on 2026-08-21, and `16ef890` (G-032a) recorded the campaign on 2026-08-14 —
// `git merge-base --is-ancestor 16ef890 dfe26b9` is true. So for the goals between them the four
// bounds were derived from a hotel in which no guest ever walked, judging one in which every guest
// does, and the drift guard had no term that could say so. The goal ordering reads the other way
// round and is not the evidence; the commit graph is.
//
// SO THE READINGS WERE STALE AND NOT ONLY THE REFUSAL, AND THE CHEAP-LOOKING MOVE WAS REFUSED.
// Editing the recorded fingerprint to the new format and keeping the arrays would have left four
// bounds judging a workload the campaign was never taken at — pooling across configurations, which
// is the exact move ADR-0015's REPLACE half forbids, in the file that forbids it. The campaign was
// RE-TAKEN instead: twelve quiet and eight loaded readings per axis, all four axes, both rotations,
// in ONE SITTING with the blocks alternating quiet/loaded and a discarded warm-up reading opening
// each regime. Not one reading was pooled, and the guard now carries the guest speed and the two
// counts of circulation commands each arm's own schedule emits.
//
//   needs             1.7181 -> 1.8219   LOOSER, AND THIS IS NOW THE AXIS TO WATCH: its pooled
//                                        margin is 1.0584x, the thinnest figure in this file
//   density           2.1856 -> 2.1063   TIGHTER, and it is no longer the thin one at 1.2329x
//   rooms-saturated   5.6532 -> 5.5888   TIGHTER
//   rooms-bench       4.1218 -> 4.4592   LOOSER
//
// TWO TIGHTER, TWO LOOSER, ON A RULE NOBODY TOUCHED — the third campaign in a row whose directions
// were not a thing its author chose. The four movements are stated as the history of a CONSTANT,
// which is what a diff shows; they are NOT a measurement compared across sittings, and no reading
// from an earlier campaign is quoted against one below (`CLAUDE.md` rule 3).
//
// THE REJECTED ALTERNATIVE, RECORDED BECAUSE IT LOOKS SAFER AND IS NOT: cap each new bound at
// the incumbent, so a bound may only ever tighten. That imports a median measured inside
// vitest's parallel workers, under the four-arm rotation, at a sample count this instrument no
// longer uses — pooling a reading from a configuration that no longer exists, which is the
// exact move ADR-0015's REPLACE half forbids. A uniform rule that moves two bounds down and
// two up is also its own evidence that it is not a widening dressed as a derivation.
//
// THE TWO CAN CROSS, AND ON THIS REPO'S OWN RECORDED FIGURES THEY VERY NEARLY DID — G-016's
// recorded median 1.74 gives a ceiling of 2.6100, and `sim-critic` measured a QUIET reading of
// 2.6534 on a clean extraction of HEAD (n=10, one fresh process per run, win32/12cpu). The
// floor was ABOVE the ceiling, which is the whole reason this file exists rather than a
// relocated constant.
//
// WHEN THEY CROSS, THE GATE REFUSES TO START. It does not widen, it does not pick the looser
// of the two, and it does not fall back to the incumbent constant: §9 makes editing a gate to
// pass a stop condition, and ADR-0015's "when the two margins stop being useful the rule says
// the instrument is too noisy to gate" was PROSE NOTHING EXECUTED until G-020b put a brake in
// code (`tripwire.mjs`'s `MAX_NOISE_CEILING`, after a 106% "noise" ceiling shipped green). This is
// that
// shape, ported: a limit derived from figures already in the file, refusing in code.
//
// THE PRE-REGISTERED RESPONSE TO A CROSSING — written before the campaign was taken, because a
// response chosen after seeing the reading is a response chosen to make the reading pass:
//
//   1. The instrument's SAMPLES PER READING rises (5 -> 9) and the WHOLE CAMPAIGN IS RE-TAKEN.
//      A max over more samples within a reading is a tighter max; that is a change to the
//      instrument, which is allowed, and not to the bound, which is not.
//   2. Re-taking REPLACES, never pools (ADR-0015): a different sample count is a different
//      configuration, and a pooled max is monotone non-decreasing, so pooling would loosen the
//      floor permanently and silently.
//   3. If it still crosses, the axis is UNGATEABLE and that is reported as a §2.0 finding with
//      its readings — an escalation, not a wider number.
//
// THE RATCHET, NAMED. The floor is a pooled max, so it can only ever rise. What stops that
// rising quietly forever is the ceiling above it: the two constraints are computed from
// different statistics of the same campaign, and the gate dies the moment they meet. There is
// no configuration of the readings in which a noisier instrument produces a looser gate.

// -------------------------------------------------------------------------------------------
// WHAT LOAD DOES TO THESE RATIOS — MEASURED PER AXIS, BECAUSE THE GENERALISATION IT REPLACES
// WAS FALSE AND WAS LOAD-BEARING.
//
// `needs.scaling.test.ts` carried this, in its strongest form, as the reason its bound was
// safe: "contention adds roughly the same ABSOLUTE cost to both arms — so load pulls any ratio
// towards 1. That makes the bound flake-proof (LOAD CAN ONLY PUSH THE READING DOWN, NEVER UP)."
// A bound was then placed on the strength of it.
//
// Measured, same instrument, same sitting design, quiet against 12 busy processes on 12 cores,
// n=12 quiet and n=8 loaded per axis (the readings below):
//
//   axis              quiet median -> loaded median      quiet max -> loaded max
//   needs                  1.2146 -> 1.2154  (+0.1%)        1.3518 -> 1.7213  (+27.3%)
//   density                1.4042 -> 1.4646  (+4.3%)        1.5466 -> 1.7084  (+10.5%)
//   rooms-saturated        3.7259 -> 3.5485  (-4.8%)        4.0662 -> 4.4884  (+10.4%)
//   rooms-bench            2.9728 -> 2.9846  (+0.4%)        3.5301 -> 3.4326   (-2.8%)
//
// THE GENERALISATION IS STILL FALSE AND THE RE-TAKE SAYS SO IN A THIRD SHAPE. Three of four move
// up on the median and three of four move up on the max. The two campaigns before this one read
// (2 up, 4 up) and (3 up, 3 up); the sentence that stands here is re-derived from THESE readings
// rather than carried, because a load claim is a claim about a measurement and this measurement is
// a different one (ADR-0015 REPLACE; ADR-0027 on what a replacement inherits). The three counts
// are not quoted against each other as measurements — they agree only on the sign of the answer to
// "can load push a ratio up", which is yes, in every campaign that has asked.
//
// AND `rooms-bench` IS THE CASE THAT SHOWS WHY THE FLOOR POOLS RATHER THAN PREFERRING A REGIME:
// its worst reading in this campaign is a QUIET one (3.5301 against a loaded 3.4326), so a floor
// taken from the loaded arm alone would sit under a reading a normal `pnpm verify` produced.
//
// What is true and what this file relies on instead: the FLOOR pools every reading in every
// regime observed, so a bound is placed above what load has actually been seen doing rather than
// above a model of what it ought to do.
//
// AND THE `needs` AXIS IS NOW THE THIN ONE — SAID HERE BECAUSE IT IS THE FIRST THING A LATER
// READER SHOULD KNOW, AND IT IS NO LONGER `density`. `needs` has a loaded max of 1.7213 against a
// ceiling of 1.8219: a pooled margin of 1.0584x, where the other three sit at 1.2329x, 1.2452x and
// 1.2632x. Nothing refuses — `bound > floor` holds on all four — but this is the closest this
// project has come to ADR-0016's crossing, and the pre-registered response if it ever crosses is in
// this file's header: MORE SAMPLES PER READING AND A RE-TAKEN CAMPAIGN, never a wider number.
//
// THE QUIET MARGIN IS THE ONE A RED `pnpm verify` SHOULD BE READ AGAINST, and on this axis it is
// 1.3478x — `verify` runs quiet, and the 1.0584x above is what a hostile regime has already been
// measured eating. Both are printed by the gate on every row, for exactly this reason.
//
// WHY THIS AXIS AND NOT ANOTHER, STATED SO IT IS NOT MISTAKEN FOR THE SIM GETTING SLOWER: `needs`
// is `full-vector` against `one-need` and G-027b collapsed that lever from 4 needs against 1 to 4
// against 3. Its two arms are the CLOSEST IN COST of any pair in this file — a quiet median of
// 1.2146 against density's 1.4042 and the room axes' 3.7259 and 2.9728 — so it is the axis where
// the instrument's spread is largest RELATIVE to the signal, which is also why it is the one axis
// that declines the direction assertion.
//
// THE PART THAT SURVIVES, because it needs no stopwatch: contention adds an absolute cost to
// every arm, so a ratio between two arms of SIMILAR cost is compressed. That is a statement
// about arms, not about ratios — and these arms are not of similar cost (an idle world is 1
// us/tick against a 60-room hotel's 12). The old sentence generalised a property of one arm
// pair to every arm pair in the file.
// -------------------------------------------------------------------------------------------

/**
 * THE READINGS MUST BE AS MANY AS THE CAMPAIGN SAYS THEY ARE — AND THAT IS NOT A THRESHOLD.
 *
 * WHY THERE IS NO LONGER A NUMBER HERE. This started as `MIN_READINGS_PER_REGIME = 7`, sourced
 * in a comment to "G-020c pre-registers n >= 7 per regime". `sim-critic` checked: the goal block
 * says no such thing. The only n>=7 in it is Campaign 3's POWER TO RESOLVE A 1.3x MULTIPLE,
 * which is a property of that comparison and not a blanket floor — and this goal's own Campaign
 * 1 pre-registered n=5 loaded and was right to. **§2.1: a number nobody can source is not a
 * gate, it is a superstition with CI access**, and it was one three constants above the file's
 * own claim to have no free parameter.
 *
 * WHAT REPLACES IT IS A PIN, NOT A LIMIT. The campaign DECLARES how many readings it took per
 * regime; the derivation asserts the arrays still contain that many. It answers the question a
 * floor was reaching for — has somebody quietly thinned an arm, flattering the max? — without
 * inventing a quantity nobody stated. A max over few readings is systematically smaller than a
 * max over many (`workload.mjs`'s equal-n argument), so the honest guard is that the count
 * cannot drift from the count that was claimed.
 *
 * Raising or lowering these is a visible edit that must come with re-taken readings, which is
 * exactly the property the removed constant did not have.
 */
export const DECLARED_READINGS = Object.freeze({ quiet: 12, loaded: 8 });

/**
 * THE ANTI-VACUITY FLOOR, WHICH LEAVES `pnpm test` WITH THE BOUNDS (G-020c ruling 7).
 *
 * A ratio of two constants passes trivially: if both arms were dominated by fixed overhead the
 * criterion would be measuring nothing and still be green (ADR-0007). So each rotation's real
 * arms must cost this multiple of an idle world of the same length.
 *
 * It is a TIMING assertion, so it belongs on this side of the seam. Leaving it in vitest would
 * have left a stopwatch inside `pnpm test` — with the scan in `stopwatch.scan.test.ts` green,
 * because it would have been the only one left and nobody would have looked at it again.
 */
export const NOT_OVERHEAD_DOMINATED = 2;

/**
 * THE CAMPAIGN. Readings are numbers; everything below is computed from them.
 *
 * `CLAUDE.md` RULE 4'S FIVE SLOTS — what it measured, over what workload, at what sample
 * count, aggregated how, and UNDER WHAT REGIME. The fifth is not a footnote: G-020b measured
 * the same `--null` quantity at +2.38% quiet and +9.73% loaded, over 4x apart, and three
 * findings in one goal came from numbers that did not say which machine state produced them.
 *
 * THE REGIMES ARE KEPT APART ON PURPOSE, and which one feeds which constraint is the part a
 * later editor will get wrong:
 *
 *   SIGNAL (the median, feeding the ceiling)   the QUIET arm only. One stated regime.
 *   NOISE  (the max, feeding the floor)        EVERY regime observed, pooled.
 *
 * Taking the median from the loaded arm would widen the ceiling — and that is the regime-mixing
 * this goal exists to stop. Under load the need ratio is not merely noisier, it MOVES, so a
 * loaded median is a different quantity wearing the same name.
 */
export const CAMPAIGN = Object.freeze({
  what: "the sim's per-tick cost ratio between two arms of one rotation, measured by tools/headless/src/scaling-harness.ts",
  workload:
    '60 rooms, an arrival every 96 ticks, seed 42, 4,320 ticks (six simulated hours); the rooms rotation varies rooms ' +
    'and arrivals together; every arm is built by the runner schedule that lays a stairwell and a corridor spine, and ' +
    'runs under content declaring guestCellsPerTick, so guests walk — see the rotation fingerprints below',
  samples:
    'each reading is a ratio of medians of 5 in-process samples, arms interleaved with the order alternating, one ' +
    'warm-up discarded; 12 quiet and 8 loaded readings per axis, taken in one sitting with the blocks alternating ' +
    'quiet/loaded and one further whole reading discarded at the start of each regime',
  aggregation: 'MEDIAN of the quiet readings for the signal; MAX over every reading in every regime for the noise floor',
  regime: 'quiet and loaded both measured on win32/12cpu, node 22.16.0; loaded = 12 busy processes on 12 cores (tools/gates/arm/load.mjs --workers 12)',
  // Compared against the arms module at startup, because a campaign is only evidence for the
  // configuration it was taken at (ADR-0015's REPLACE half, and the executable version of it in
  // `tripwire.mjs`'s configuration-drift refusal: a 3-day arm ran under a 30-day bound at exit 0
  // until that refusal existed).
  //
  // CITED BY NAME AND NOT BY LINE NUMBER, throughout this file (G-032a sweep 1). Five citations
  // here pointed into `tripwire.mjs` by line; they were exact when written and **G-032a's own
  // diff broke every one of them** by adding a campaign above their targets. A line number is a
  // claim that goes stale on somebody else's edit and that nothing checks — the class
  // `prose-citations.test.ts` exists for. A name moves with the thing it names.
  //
  // AND THE ROTATION FINGERPRINTS ARE PART OF THE CONFIGURATION, NOT DECORATION. The four
  // scalars below describe the NEED rotation only; the room rotation runs 25 and 100 rooms at
  // arrivals 20, 5, 60 and 15, and the dense arm runs 20 amenities. Comparing only the scalars
  // left the brake inspecting nothing for two of four axes — `sim-critic` changed
  // `saturated-100` to 200 rooms and nothing refused. Each string is `name:rooms/arrivals/
  // amenities/needTypes` per arm, IN ORDER, so adding, removing, renaming or re-sizing an arm
  // moves it. That is the same claim this file makes about rotations everywhere else: an arm
  // set is part of the workload.
  // AND THE STAY DURATION IS A TERM SINCE G-032a (ADR-0039 §2). Every term here used to be a
  // FLAG, and ADR-0017 tripled `stayDurationTicks` — changing the occupancy of every arm in both
  // rotations — without moving one character of either string. The `needs` rotation refused only
  // because its cadence happened to move with it; the `rooms` rotation's fingerprint was
  // BYTE-IDENTICAL to the campaign's, so it would have been judged against readings taken at a
  // third of its occupancy. A guard spelled entirely in the flags it guards cannot see the
  // content redefine what a flag means.
  //
  // AND THE GUEST SPEED AND THE CIRCULATION ARE TERMS SINCE G-039b-B1, BECAUSE THE SENTENCE ABOVE
  // WAS APPLIED TO ONE FIELD AND WENT ON BEING TRUE OF THE NEXT ONE. `guestCellsPerTick` decides
  // whether a guest walks at all; `layCorridor` and `layStair` counts are what the arm's own
  // schedule emits, so G-039b-alpha's spine — which moved EVERY seeded room in both rotations —
  // and G-038a-iii-b's stairwell now move the string. The terms are `Nv`, `Nc` and `Nx`;
  // `scaling-harness.ts` carries the legend.
  //
  // PROVEN BY A PAIRED MUTATION RATHER THAN BY THE ARGUMENT ABOVE (ADR-0022 recipe, files copied
  // out and sha256-compared after). One cell was taken off `spineCells` — the same class of change
  // G-039b-alpha made, and it moves every seeded floor's corridor count:
  //
  //   guard at HEAD (`.../4n/1440s`)             `check:scaling` EXIT 0, four rows PASS
  //   guard with these terms                     EXIT 1, "THE CAMPAIGN WAS TAKEN AT A DIFFERENT
  //                                              CONFIGURATION", 21c/98c/99c/156c -> 20c/96c/97c/154c
  //
  // The same A/B was run for the stairwell (`shaftCells` one floor shorter: 23x -> 22x, EXIT 1)
  // and for the content dial (`3v` -> `9v`, EXIT 1). The first row is the defect this goal exists
  // for, executed: the old guard is not merely thought to be blind, it was watched being blind.
  configuration: Object.freeze({
    rooms: 60,
    arrivalEveryTicks: 96,
    seed: 42,
    ticks: 4_320,
    samplesPerArm: 5,
    fingerprints: Object.freeze({
      needs:
        'idle:0r/999999a/1m/4n/1440s/3v/21c/23x one-need:60r/96a/1m/3n/1440s/3v/98c/23x full-vector:60r/96a/1m/4n/1440s/3v/99c/23x dense-providers:60r/96a/20m/4n/1440s/3v/156c/23x',
      rooms:
        'idle:0r/999999a/1m/4n/1440s/3v/21c/23x saturated-25:25r/20a/1m/4n/1440s/3v/64c/23x saturated-100:100r/5a/1m/4n/1440s/3v/157c/23x bench-25:25r/60a/1m/4n/1440s/3v/64c/23x bench-100:100r/15a/1m/4n/1440s/3v/157c/23x',
    }),
  }),
  axes: Object.freeze({
    needs: Object.freeze({
      rotation: 'needs',
      // =================================================================================
      // THE DIRECTION ASSERTION COMES OFF, AND IT IS MEASURED RATHER THAN INHERITED —
      // WHICH IS THE SENTENCE `density` HAS CARRIED SINCE G-020c AND I DID NOT APPLY.
      //
      // A bound alone is also satisfied by the two arms swapping places, so an axis whose arms
      // have a KNOWN order asserts `ratio > 1`. This one did, from G-020c, when the lever was
      // 4 needs against 1 and the median was ~2.08. **G-032a re-took the campaign after
      // G-027b collapsed the lever to 4 against 3 — and carried the flag across untouched.**
      // That is ADR-0027's class exactly: a replacement inheriting an assumption from the
      // thing it replaced, in the re-take whose entire subject is not doing that.
      //
      // THE EVIDENCE WAS A READING THE SHIPPED GATE PRODUCED, AND G-039b-B1 REPLACED IT WITH ONE
      // FROM ITS OWN CAMPAIGN. Until this re-take the warrant was a single out-of-campaign
      // `observations` entry — `FAIL needs 0.9732 full-vector / one-need`, reported by
      // `check:scaling` on a `pnpm verify` run just after the G-032a campaign landed. **That
      // reading was taken at a configuration this campaign REPLACES** — no corridor spine, no
      // declared stairwell — so carrying it forward as live evidence about the arms measured below
      // is the pooling ADR-0015's REPLACE half forbids. It is retired, and the `observations` array
      // on this axis with it. The mechanism is untouched: `directionProblems` still reads
      // `observations`, and `scaling.bound.test.ts` still drives it over an axis that has one.
      //
      // WHAT REPLACES IT IS IN THE ARRAYS THEMSELVES: this campaign's loaded arm carries **0.9827**
      // — the full vector measuring CHEAPER than the smallest bindable one, at the shipped
      // configuration, in the twenty readings below. The flag is now warranted by a reading the
      // derivation already holds rather than by a note standing beside it, which is strictly the
      // stronger version of "derived from the readings".
      //
      // **At a one-need lever the arms differed by 4x the per-need work and the order was never in
      // doubt. At 4-against-3 the true ratio is close enough to 1 that this instrument's own spread
      // crosses it** — the quiet arm's lowest is 1.0247 and the loaded arm's is 0.9827.
      //
      // AND THE SUB-1 READING IS A LOADED ONE, WHICH IS SAID RATHER THAN GLOSSED. The SIGNAL in
      // this file is taken from the quiet arm alone, on purpose. `direction` is not a signal: it is
      // the claim that these two arms cannot swap places, and an arm pair that swaps under
      // contention is an arm pair that swaps. `deriveAxis` pools every observed regime for exactly
      // the questions that are about the instrument rather than about the sim.
      //
      // A READING CANNOT BE ADDED TO AN ARRAY BY HAND EITHER, AND THAT IS EXECUTED RATHER THAN
      // ARGUED: `DECLARED_READINGS` pins the quiet arm at twelve and the loaded arm at eight, and
      // `deriveAxis` REFUSES when an array's length disagrees with the declared count — *"re-take
      // the campaign and update the declared count together; do not do either alone."* A
      // twenty-first reading is not a thing that can be quietly added; it is a re-take.
      //
      // WHAT IS LOST, STATED RATHER THAN ABSORBED: nothing now catches the two arms swapping
      // places on this axis. That was worth having and it is not available — an assertion the
      // instrument has been measured contradicting is not a tight gate, it is a gate that fires
      // on nothing (ADR-0016). The bound still binds, and `anti-vacuity` still proves both arms
      // are doing real work.
      // =================================================================================
      direction: false,
      // ===============================================================================
      // NO `observations` ARRAY, AND THE MECHANISM IS STILL THERE (G-039b-B1).
      //
      // The field exists for a reading the campaign arrays do not hold, and it was built once the
      // hard way: it began as `directionWaiver: '0.9732 — check:scaling, shipped gate, ...'`, a
      // STRING, whose predicate read the first number-ish run of text out of it and asked only
      // that it be <= 1 — so `'0.5 — I decided this'` passed, and so did `'0'`. **The free
      // parameter had moved from the boolean to the string the boolean deferred to**, in the
      // block whose headline is that this file has none. A `value` the predicate reads as a
      // NUMBER, beside the `source` that says where it came from, is the smallest thing that is
      // actually evidence.
      //
      // NO SHIPPED AXIS NEEDS ONE ANY MORE. The single entry it carried was a reading from the
      // configuration this campaign replaces, and the re-taken loaded arm holds a sub-1 reading of
      // its own — so the warrant moved from a note beside the arrays INTO them. `directionProblems`
      // is unchanged and `scaling.bound.test.ts` drives it over axes that do carry observations,
      // including the two shapes that made the string version worthless.
      // ===============================================================================
      // ===================================================================================
      // THE LEVER COLLAPSED AT G-032a, AND THAT IS WHY THIS AXIS SITS NEAR 1 AT ALL — its quiet
      // median was ~2.08 before it and reads 1.2146 in the campaign below.
      //
      // `one-need` is no longer one need. G-027b's stock model made a table with a lodging need
      // and nothing else UNBINDABLE — the lodging stock decays only in away time, and away time
      // is generated by engagement needs — so `lodgingOnly` now searches for the smallest table
      // that binds and finds THREE. The axis is 4-against-3 where it was 4-against-1.
      //
      // `scaling-arms.ts` states the consequence and it is worth repeating where the readings
      // are: **one need of difference is a thin lever to read a per-need cost off.** These
      // readings are not comparable with the pre-G-027b ones and do not pool with them; the
      // bound they derive is TIGHTER, which is the derivation following the instrument rather
      // than anybody choosing.
      // ===================================================================================
      quiet: Object.freeze([
        1.0247, 1.0415, 1.0882, 1.1027, 1.1898, 1.1986, 1.2146, 1.2509, 1.2663, 1.3385, 1.3464, 1.3518,
      ]),
      loaded: Object.freeze([0.9827, 1.0714, 1.1566, 1.2040, 1.2154, 1.3464, 1.6352, 1.7213]),
    }),
    density: Object.freeze({
      rotation: 'needs',
      // ===============================================================================
      // THE ASSERTION IS ON AGAIN, AND THIS IS THE AXIS WHOSE WARRANT HAD INHERITED (sweep 3).
      //
      // It read: *"measured rather than inherited ... the density ratio's own QUIET spread
      // crosses 1 — 0.9915 is in the readings below."* **0.9915 was in the CADENCE-32 array and
      // the G-032a diff replaced it**, leaving a warrant citing a number that was no longer in the
      // file. G-039b-B1 replaced those arrays in turn, so the figures that discharged it are
      // restated below FROM THE CURRENT ARRAYS rather than carried — which is the same discipline
      // the paragraph is about, applied to the paragraph.
      //
      // So the one axis claiming its declined assertion was MEASURED is the one that inherited
      // it — **eight lines below the block that hunts exactly this on `needs` and cites this
      // axis as its precedent**, in the commit that re-took the campaign. ADR-0027's class,
      // twice in one file, and the second instance was inside the repair for the first.
      //
      // TURNING IT ON IS A TIGHTENING DERIVED FROM READINGS, NOT A CHOICE. The dense arm runs
      // twenty of each amenity against the sparse arm's one at the same need count, so it must
      // cost more, and every reading on record agrees. **RE-CHECKED AGAINST THE G-039b-B1 ARRAYS
      // RATHER THAN CARRIED**, which is the whole of the defect this block records: the lowest
      // reading in the twenty below is 1.2321, and it is a LOADED one — nothing in either array is
      // under 1. The two axes' distances above 1 are stated rather than divided: density's lowest
      // is 1.2321 and `needs`' is 0.9827, which is why one asserts the direction and one does not.
      // ===============================================================================
      direction: true,
      quiet: Object.freeze([
        1.3093, 1.3263, 1.3557, 1.3651, 1.3963, 1.3994, 1.4042, 1.4181, 1.4415, 1.4601, 1.4890, 1.5466,
      ]),
      loaded: Object.freeze([1.2321, 1.2798, 1.3733, 1.3745, 1.4646, 1.5550, 1.6744, 1.7084]),
    }),
    'rooms-saturated': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        3.2047, 3.3396, 3.4521, 3.5013, 3.5348, 3.6978, 3.7259, 3.7511, 3.8281, 3.9399, 3.9702, 4.0662,
      ]),
      loaded: Object.freeze([3.1185, 3.2345, 3.2771, 3.3011, 3.5485, 3.8434, 3.9761, 4.4884]),
    }),
    'rooms-bench': Object.freeze({
      rotation: 'rooms',
      direction: true,
      // THE ONE AXIS WHOSE WORST READING IS A QUIET ONE (G-039b-B1): 3.5301 quiet against 3.4326
      // loaded, so the pooled floor and the quiet floor are the same number and the two margins
      // the gate prints are equal. That is not a curiosity — it is the reason the floor pools
      // every regime instead of taking the loaded arm as "the worst case".
      quiet: Object.freeze([
        2.7255, 2.7930, 2.8239, 2.8575, 2.8780, 2.9466, 2.9728, 3.0515, 3.0679, 3.0982, 3.1789, 3.5301,
      ]),
      loaded: Object.freeze([2.2629, 2.4729, 2.7697, 2.9614, 2.9846, 3.0621, 3.3323, 3.4326]),
    }),
  }),
});

/**
 * The bounds as written constants, so changing one is a visible edit in a diff — and each is
 * PINNED TO EQUALITY with `trunc(quiet median x 1.5, 4dp)` below, so it cannot drift from the
 * readings in either direction.
 *
 * They are written out rather than computed into a variable for the reason `tripwire.mjs`'s
 * `BOUND` docblock
 * gives: a bound that only ever exists as an expression is a bound no diff ever shows moving.
 */
export const BOUNDS = Object.freeze({
  needs: 1.8219,
  density: 2.1063,
  'rooms-saturated': 5.5888,
  'rooms-bench': 4.4592,
});

/**
 * THE UPPER MIDDLE VALUE FOR AN EVEN COUNT, DECLARED RATHER THAN ASSUMED.
 *
 * `sorted[floor(n/2)]` is this repository's convention everywhere a median is taken —
 * `measure-arm.mjs`, `measure.mjs`, `tripwire.mjs`, the two scaling files since G-010 — and for
 * an even count it returns the UPPER of the two middle readings rather than their mean. Every
 * quiet arm here is n=12, so the choice is live on all four axes.
 *
 * IT IS AN UNDECLARED FREE PARAMETER UNLESS IT IS DECLARED, IN A FILE WHOSE OWN CLAIM IS THAT
 * IT HAS NONE — `sim-critic`, and the direction is the uncomfortable one: the upper middle is
 * the LOOSER choice on every axis.
 *
 * TABLE-ROW-PIN — `scaling.bound.test.ts` parses the four rows below and recomputes both
 * columns from the readings. One row was wrong when it was written — at the G-020c readings, which
 * two campaigns have since replaced, `rooms-bench` read 4.5502 and +1.36% where the arithmetic gave
 * 4.5576 and +1.19% — found by `sim-critic` recomputing it by hand, in a table whose whole point
 * was to make the free parameter's cost checkable. **Those two figures are HISTORY and are not in
 * the table below**; what stops the incident recurring is the parse-and-recompute arm, which is why
 * the four rows are re-derived and not retyped on every re-take. A table built to be checkable and
 * left unchecked is this project's oldest defect wearing a new hat.
 *
 *   axis              upper middle (shipped)   mean of middles   difference
 *   needs                    1.8219                 1.8099         +0.66%
 *   density                  2.1063                 2.1027         +0.17%
 *   rooms-saturated          5.5888                 5.5677         +0.38%
 *   rooms-bench              4.4592                 4.4395         +0.44%
 *
 * KEPT, FOR TWO REASONS THAT ARE NOT "IT WAS ALREADY LIKE THAT". A median that is one of the
 * OBSERVED readings is a reading the instrument actually produced, which is the property every
 * other statistic in this file has (the floor is an observed maximum, not an interpolation);
 * and changing the convention here alone would make this file's medians incomparable with every
 * other median in the repo. The cost is stated above rather than absorbed, and the tighter
 * alternative is one line away for anyone who decides the trade differently.
 */
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** Truncated, never rounded: §2.1's rule is "held at or below", and rounding to nearest can
 *  round up. G-020b shipped a bound 0.007% above its own derivation exactly that way. */
const truncate4 = (value) => Math.floor(value * 1e4) / 1e4;

/**
 * Everything the gate needs about one axis, all of it computed. Returns the two constraints,
 * the shipped bound, the two margins, and — if the axis cannot be gated — the reason.
 */
export function deriveAxis(axis) {
  const readings = CAMPAIGN.axes[axis];
  if (readings === undefined) throw new Error(`no campaign readings for axis "${axis}"`);
  const bound = BOUNDS[axis];
  if (bound === undefined) throw new Error(`no bound for axis "${axis}"`);
  const quiet = readings.quiet;
  const all = [...readings.quiet, ...readings.loaded];
  const problems = [];
  for (const [regime, declared] of Object.entries(DECLARED_READINGS)) {
    if (readings[regime].length !== declared) {
      problems.push(
        `the ${regime} arm carries ${readings[regime].length} readings and the campaign declares ${declared}. ` +
          'A max over fewer readings is systematically smaller, so a thinned arm is a flattering floor. ' +
          'Re-take the campaign and update the declared count together; do not do either alone.',
      );
    }
  }
  const signal = quiet.length > 0 ? median(quiet) : Number.NaN;
  const ceiling = truncate4(signal * 1.5);
  const floor = all.length > 0 ? Math.max(...all) : Number.NaN;
  const quietFloor = quiet.length > 0 ? Math.max(...quiet) : Number.NaN;
  if (Number.isFinite(floor) && Number.isFinite(ceiling) && floor >= ceiling) {
    problems.push(
      `THE INSTRUMENT IS TOO NOISY TO GATE THIS AXIS: the worst observed reading ${floor.toFixed(4)} is at or ` +
        `above the ceiling ${ceiling.toFixed(4)} = trunc(${signal.toFixed(4)} quiet median x 1.5). ` +
        'Raise the samples per reading and RE-TAKE the campaign (replace, do not pool). Do NOT widen the bound.',
    );
  }
  return {
    axis,
    rotation: readings.rotation,
    direction: readings.direction,
    quiet,
    loaded: readings.loaded,
    signal,
    ceiling,
    floor,
    quietFloor,
    bound,
    // TWO MARGINS AGAINST NOISE, NEVER ONE. `pnpm verify` runs quiet, so the margin a reader
    // wants when judging a red is the quiet one; the pooled margin is what says how much of
    // the window a hostile regime has already eaten. Reporting only the first would overstate
    // the gate; only the second would understate what a normal run has to survive.
    marginAboveQuietNoise: bound / quietFloor,
    marginAboveNoise: bound / floor,
    problems,
  };
}

/** Every axis the campaign carries, in a stable order. */
export const AXES = Object.freeze(Object.keys(CAMPAIGN.axes).sort());

/**
 * The whole derivation, as the gate consumes it: every axis, plus the reasons any of them
 * cannot be gated. A bound that is not strictly inside its own two constraints is a refusal,
 * in either direction — the same "BOUND is not its own derivation" refusal that
 * `tripwire.mjs`'s `BOUND !== derived` check
 * makes, generalised to a rule with two sides.
 */
export function deriveAll() {
  const axes = AXES.map((axis) => deriveAxis(axis));
  const refusals = [];
  for (const derived of axes) {
    for (const problem of derived.problems) refusals.push({ axis: derived.axis, why: problem });
    if (derived.problems.length > 0) continue;
    if (!(derived.bound > derived.floor)) {
      refusals.push({
        axis: derived.axis,
        why:
          `BOUND ${derived.bound} is at or below the worst observed reading ${derived.floor.toFixed(4)}. ` +
          'The gate would fire on a reading this instrument has already produced with nothing to find.',
      });
    }
    if (derived.bound !== derived.ceiling) {
      refusals.push({
        axis: derived.axis,
        why:
          `BOUND ${derived.bound} is not its own derivation: trunc(${derived.signal.toFixed(4)} quiet median ` +
          `x 1.5, 4dp) = ${derived.ceiling.toFixed(4)}. A reading changed, or the constant was typed by hand. ` +
          'Re-derive it; do not round up, and do not pick a number from inside the range.',
      });
    }
  }
  return { axes, refusals };
}
