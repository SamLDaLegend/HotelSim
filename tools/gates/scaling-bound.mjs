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
// AND WHAT THE G-039b-B1 RE-TAKE DID. **HISTORY: these are not the shipped numbers either.**
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
// AND WHAT THE G-040b-ii RE-TAKE DID, WHICH IS THE SHIPPED SET.
//
// THE CAMPAIGN HAD TO BE RE-TAKEN AND THE TERM HAD TO LAND IN THE SAME COMMIT, because a
// fingerprint term without a re-take makes this gate refuse outright ("THE CAMPAIGN WAS TAKEN AT
// A DIFFERENT CONFIGURATION") and a re-take without the term is a campaign whose configuration
// the guard still cannot see. `guest-rules.json` declares `partySizeWeights: [3, 1]`, realised
// cycle **1, 1, 2** — four guests for every three arrival commands, two lodgers to a bedroom —
// and `scaling-arms.ts` feeds EVERY arm `loadContent()`, so every arm's population moved.
//
//   needs             1.8729 -> 1.8421   TIGHTER
//   density           1.6386 -> 1.9937   LOOSER BY 22%, and it is the thin axis again at 1.0726x
//   rooms-saturated   5.2458 -> 5.4669   LOOSER
//   rooms-bench       2.6487 -> 3.4083   LOOSER BY 29%, the largest movement since G-042's own
//
// **THREE LOOSER AND ONE TIGHTER, WHICH IS THE DIRECTION THAT DESERVES SUSPICION, SO HERE IS THE
// MECHANISM AND THE CONTROL.** Every axis in this file is a ratio of a busier arm over a quieter
// one. The dial adds a third more guests to BOTH arms of every pair — but a bedroom holds two,
// so the arm with more ROOMS absorbs more of them: `saturated-100` and `bench-100` hold their
// extra guests where `saturated-25` turns some away, and `dense-providers` has twenty of each
// amenity to serve its extra guests where `full-vector` has one. **The signal each axis measures
// therefore GREW, and a bound that is 1.5x a grown signal is a looser bound measuring a bigger
// effect.** That is not a widening: the rule is untouched, the medians moved because the arms
// did, and the one axis whose dearer arm gains nothing from extra beds — `needs`, which is
// 4-needs against 3 at the same room count — is the one that tightened.
//
// **AND THE DIRECTION FLAGS WERE RE-CHECKED AGAINST THE NEW ARRAYS RATHER THAN CARRIED**, which
// is ADR-0027's class and the thing every re-take in this file has had to be told twice:
//
//   density   `false` -> **`true`**, WARRANTED BY THIS CAMPAIGN'S OWN ARRAYS: not one of its
//             twenty readings is below 1, the lowest being 1.0698, where G-042's campaign had
//             five under it. The flag comes back ON because the readings say so — the same rule,
//             read the other way, that took it off at ADR-0069. **This is a STRICTER gate than
//             the one it replaces**, and the magnitude bound ADR-0069 placed beside it is
//             untouched: it is the file's uniform rule and it still applies.
//   needs     stays `false`, and its warrant moves back INTO the arrays: three of its eight
//             loaded readings are below 1 (0.7343, 0.9538, 0.9558), where G-042 had none and had
//             to lean on an out-of-campaign observation.
//   the two room axes keep `true`; their lowest readings are 2.7263 and 1.6092.
//
// **AND THE `observations` ENTRY ON `needs` IS RETIRED**, for the reason G-039b-B1 retired the
// one before it: 0.8986 was measured at a configuration this campaign REPLACES — no party dial —
// so carrying it forward as live evidence about the arms measured below is the pooling
// ADR-0015's REPLACE half forbids. The array warrant makes it unnecessary as well as improper.
//
// AND WHAT THE G-042 RE-TAKE DID. **HISTORY: these are not the shipped numbers.**
//
// A HUMAN RULING RATHER THAN A SWEEP FINDING (ADR-0069, E-011). G-041 re-derived the need rates
// around ADR-0054's "refillPerTick is the rate a FULLY APPOINTED room reaches" (ADR-0057, option
// a). At those rates a well-provisioned hotel's guests are idle roughly 70% of the stay, and AN
// IDLE GUEST IS CHEAP. Every axis in this file is a ratio of a busier arm over a quieter one, so
// a content change that makes guests cheap compresses ALL FOUR — and the density axis, whose
// dense arm IS the well-provisioned hotel, was compressed onto its own `ratio > 1` floor. The
// gate's premise became false; the content did not break it.
//
// THE RULING REQUIRED THE CAMPAIGN RE-TAKEN ON THIS CONTENT, not composed from readings taken on
// the tree before it — `CLAUDE.md` rule 3, and ADR-0015's REPLACE half in the file that carries
// it. Not one reading below is pooled with an earlier campaign, and no figure from one is quoted
// against one from this.
//
//   needs             1.8219 -> 1.8729   LOOSER
//   density           2.1063 -> 1.6386   TIGHTER BY 22%, and it is the thin axis again at 1.1002x
//   rooms-saturated   5.5888 -> 5.2458   TIGHTER
//   rooms-bench       4.4592 -> 2.6487   TIGHTER BY 41%, the largest movement this file has made
//
// THREE TIGHTER, ONE LOOSER — and the three are tighter because the SIM GOT CHEAPER TO RUN AT THE
// TOP OF EVERY AXIS, which is the direction that cannot be a widening dressed as a derivation.
// A re-take that produced four looser bounds on a content change nobody re-measured would deserve
// the suspicion; this one hands back 22% and 41% of two windows.
//
// AND THE TIGHTENING HAS TEETH, WHICH IS A PAIRED MUTATION RATHER THAN THE PARAGRAPH ABOVE
// (ADR-0022 recipe: every modified and untracked file copied out first, `sha256` and `git status
// --porcelain` compared after, nothing reverted with `git checkout` or `git restore`). The
// mutation is the class this axis exists to catch — work QUADRATIC IN THE PROVIDER COUNT inside
// `providersFor`, so the dense arm pays for its twenty amenities and the sparse arm does not:
//
//   sim mutated + THESE bounds        EXIT 1, "density: 1.7812 is at or above the 1.6386 bound"
//   sim mutated + the campaign        EXIT 0, "PASS density 1.7355" — the replaced bound is BLIND
//     this one replaces                 to a regression this one catches
//   sim clean + THESE bounds          EXIT 0, "PASS density 1.1862" — the control
//
// **The middle row is the point.** A re-derivation that only ever loosened would have no such row
// to show; this one names a defect that would have shipped green under the numbers it replaces.
//
// AND THE DIRECTION FLAGS WERE RE-CHECKED AGAINST THE NEW ARRAYS RATHER THAN CARRIED, which is
// ADR-0027's class and the thing every re-take in this file has had to be told twice:
//
//   density   `true` -> `false`, WARRANTED IN BOTH REGIMES BY THIS CAMPAIGN'S OWN ARRAYS: 2 of 12
//             quiet readings and 3 of 8 loaded readings are below 1, the lowest 0.9466. The
//             ruling's shape, and G-039b-B1's precedent one axis over — the flag flips because
//             the campaign says so. See the block at the readings for the magnitude bound that
//             replaces it and for why 1 was never a bound this instrument could carry.
//   needs     stays `false`, and the warrant CHANGED: its twenty readings are now all above 1
//             (lowest 1.0502), so the sub-1 reading that used to sit in its loaded arm is gone.
//             It is warranted by an `observations` entry instead — a reading of this instrument
//             at THIS configuration, which is the distinction G-039b-B1's retirement turned on.
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
//   needs                  1.2281 -> 1.1396  (-7.2%)        1.3232 -> 1.3665   (+3.3%)
//   density                1.3292 -> 1.3814  (+3.9%)        1.4481 -> 1.8588  (+28.4%)
//   rooms-saturated        3.6446 -> 3.7344  (+2.5%)        3.9931 -> 4.6112  (+15.5%)
//   rooms-bench            2.2722 -> 2.3901  (+5.2%)        2.4413 -> 2.6137   (+7.1%)
//
// THE GENERALISATION IS STILL FALSE AND THE RE-TAKE SAYS SO IN A FIFTH SHAPE: three of four move
// up on the median, and ALL FOUR move up on the max — for the second campaign running. The four
// campaigns before this one read (2 up, 4 up), (3 up, 3 up), (3 up, 3 up) and (2 up, 4 up); the sentence that
// stands here is re-derived from THESE readings rather than carried, because a load claim is a
// claim about a measurement and this measurement is a different one (ADR-0015 REPLACE; ADR-0027 on
// what a replacement inherits). The four counts are not quoted against each other as measurements —
// they agree only on the sign of the answer to "can load push a ratio up", which is yes, in every
// campaign that has asked.
//
// AND EVERY AXIS'S WORST READING IS A LOADED ONE IN THIS CAMPAIGN TOO, as it was in the one
// before it, where in the campaign before THAT `rooms-bench`'s was quiet. That is a change in the readings and not in the rule — the floor pools
// because "the loaded arm is always the worse one" is a claim about the instrument that has been
// false in a shipped array of this file, not because it is false today.
//
// What is true and what this file relies on instead: the FLOOR pools every reading in every
// regime observed, so a bound is placed above what load has actually been seen doing rather than
// above a model of what it ought to do.
//
// AND THE `density` AXIS IS THE THIN ONE FOR THE THIRD CAMPAIGN RUNNING. It has a loaded max of
// 1.8588 against a ceiling of 1.9937: a pooled margin of **1.0726x**, where the other three sit at
// 1.3480x, 1.1856x and 1.3040x. **Its window is thinner than it was (1.1002x -> 1.0726x) while
// three of four widened**, and the reason is in the load table above: this axis's loaded MAX moved
// +28.4% against its quiet max, the largest single movement in this file's history. Nothing
// refuses — `bound > floor` holds on all four — and the pre-registered response if one ever
// crosses is in this file's header: MORE SAMPLES PER READING AND A RE-TAKEN CAMPAIGN, never a
// wider number.
//
// THE QUIET MARGIN IS THE ONE A RED `pnpm verify` SHOULD BE READ AGAINST, and on this axis it is
// 1.3768x — `verify` runs quiet, and the 1.0726x above is what a hostile regime has already been
// measured eating. Both are printed by the gate on every row, for exactly this reason.
//
// WHY THIS AXIS AND NOT ANOTHER, STATED SO IT IS NOT MISTAKEN FOR THE SIM GETTING SLOWER:
// `density` is `dense-providers` against `full-vector`, and its two arms are still the CLOSEST IN
// COST of any pair in this file — a quiet median of 1.3292 against the room axes' 3.6446 and
// 2.2722 — so it is the axis where the instrument's spread is largest RELATIVE to the signal.
// **What changed at G-040b-ii is that the signal GREW and stopped crossing 1**: at 16 concurrent
// guests rather than 12 the dense arm's twenty amenities finally have somebody queueing for them,
// so the arm pair no longer swaps places under contention and the direction assertion comes back
// on. The spread did not narrow; the thing it is a spread AROUND moved away from 1.
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
  // AND THE PARTY DISTRIBUTION IS A TERM SINCE G-040b-ii, WHICH IS THE THIRD APPLICATION OF THE
  // SAME SENTENCE AND THE LARGEST. `scaling-arms.ts` feeds every arm `loadContent()`, so
  // `partySizeWeights` multiplies every arm's guest population and puts two lodgers in every
  // bedroom — and it moves NO flag: the cadence `a` is unchanged, and what changed is how many
  // guests one tick of it brings. The term is `Np` and it is the weight TABLE rather than a mean,
  // because `[1, 1]` and `[3, 1]` have different means and `[1, 1]` and `[0, 1]` do not have
  // different means but do have different cycles; `scaling-harness.ts` carries the legend.
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
        'idle:0r/999999a/1m/4n/1440s/3v/21c/23x/3-1p one-need:60r/96a/1m/3n/1440s/3v/98c/23x/3-1p full-vector:60r/96a/1m/4n/1440s/3v/99c/23x/3-1p dense-providers:60r/96a/20m/4n/1440s/3v/156c/23x/3-1p',
      rooms:
        'idle:0r/999999a/1m/4n/1440s/3v/21c/23x/3-1p saturated-25:25r/20a/1m/4n/1440s/3v/64c/23x/3-1p saturated-100:100r/5a/1m/4n/1440s/3v/157c/23x/3-1p bench-25:25r/60a/1m/4n/1440s/3v/64c/23x/3-1p bench-100:100r/15a/1m/4n/1440s/3v/157c/23x/3-1p',
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
      // AND AT G-042 THE WARRANT MOVED BACK OUT, WHICH IS WHAT "DERIVED FROM THE READINGS" COSTS
      // WHEN THE READINGS MOVE. G-039b-B1's loaded arm carried 0.9827 and this campaign's twenty
      // readings are ALL above 1 — lowest 1.0502 — because G-041's rates made an idle guest cheap
      // and this axis's dearer arm is the one with more needs to be idle about. So the array
      // warrant is gone, and the flag would have to come ON if nothing else were on record.
      //
      // SOMETHING ELSE IS ON RECORD, AND SUPPRESSING IT TO EARN A TIGHTER FLAG WOULD BE THE
      // DISHONEST MOVE. The `observations` entry below is a reading of THIS instrument at THIS
      // configuration — same fingerprint, byte-compared — from the abandoned first sitting of this
      // very campaign. **That is the distinction G-039b-B1's retirement turned on**: it retired an
      // observation taken at a configuration the campaign REPLACED, which is pooling; this one is
      // taken at the configuration the campaign is OF, which is evidence.
      //
      // **At a one-need lever the arms differed by 4x the per-need work and the order was never in
      // doubt. At 4-against-3 the true ratio is close enough to 1 that this instrument's own spread
      // crosses it** — the quiet arm's lowest is 1.0740, the loaded arm's is 1.0502, and the
      // instrument has been watched putting a loaded reading at 0.8986 with nothing changed.
      //
      // AND THE SUB-1 READING IS A LOADED ONE, WHICH IS SAID RATHER THAN GLOSSED — it was one in
      // G-039b-B1's arrays and it is one in G-042's observation. The SIGNAL in
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
      // THE `observations` ARRAY, AND WHY IT IS A NUMBER AND NOT A SENTENCE.
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
      // AND IT CANNOT BE USED TO FLATTER THE FLOOR, WHICH IS THE OTHER HALF OF THE MECHANISM:
      // `directionProblems` REFUSES an observation above the campaign's worst reading, because a
      // high excursion belongs in the floor and pooling one by hand is the move `DECLARED_READINGS`
      // exists to refuse. An observation can only ever make this file's claims WEAKER.
      // ===============================================================================
      // ===================================================================================
      // THE LEVER COLLAPSED AT G-032a, AND THAT IS WHY THIS AXIS SITS NEAR 1 AT ALL — its quiet
      // median was ~2.08 before it and reads 1.2486 in the campaign below.
      //
      // `one-need` is no longer one need. G-027b's stock model made a table with a lodging need
      // and nothing else UNBINDABLE — the lodging stock decays only in away time, and away time
      // is generated by engagement needs — so `lodgingOnly` now searches for the smallest table
      // that binds and finds THREE. The axis is 4-against-3 where it was 4-against-1.
      //
      // `scaling-arms.ts` states the consequence and it is worth repeating where the readings
      // are: **one need of difference is a thin lever to read a per-need cost off.** These
      // readings are not comparable with the pre-G-027b ones and do not pool with them; the bound
      // they derive is far TIGHTER than the 4-against-1 era's, which is the derivation following
      // the instrument rather than anybody choosing.
      // ===================================================================================
      // ===================================================================================
      // AND AT G-040b-ii THE `observations` ARRAY IS RETIRED AND THE WARRANT IS BACK IN THE
      // ARRAYS, WHICH IS G-039b-B1's RETIREMENT HAPPENING FOR THE SECOND TIME AND FOR THE SAME
      // REASON. 0.8986 was measured at a configuration this campaign REPLACES — no party dial —
      // so carrying it as live evidence about the arms measured below is the pooling ADR-0015's
      // REPLACE half forbids. **THREE of this campaign's eight loaded readings are below 1**
      // (0.7343, 0.9538, 0.9558), so the flag is warranted by the readings themselves and needs
      // no observation at all. The mechanism is untouched: `directionProblems` still reads
      // `observations`, and `scaling.bound.test.ts` still drives it over an axis that has one.
      // ===================================================================================
      quiet: Object.freeze([
        1.0898, 1.1608, 1.1770, 1.1918, 1.2159, 1.2205, 1.2281, 1.2386, 1.3189, 1.3191, 1.3204, 1.3232,
      ]),
      loaded: Object.freeze([0.7343, 0.9538, 0.9558, 1.0581, 1.1396, 1.1400, 1.3452, 1.3665]),
    }),
    density: Object.freeze({
      rotation: 'needs',
      // ===============================================================================
      // THE DIRECTION ASSERTION COMES OFF AND A MAGNITUDE BOUND STANDS IN ITS PLACE — HUMAN
      // RULING, ADR-0069 ON E-011, OPTION (a). THE DERIVATION IS WRITTEN HERE, AT THE NUMBERS.
      //
      // WHAT MOVED, AND IT IS THE SIM RATHER THAN THE INSTRUMENT. G-041 re-derived the need rates
      // around ADR-0054 (ADR-0057, option a). At the declared service floor ONE provider already
      // sustains the whole occupancy of this rotation's arms, so the dense arm's twenty of each
      // amenity buy capacity nobody queues for, while its guests spend roughly 70% of the stay
      // idle — and an idle guest is cheap. The sparse arm's guests queue. **Provider density
      // stopped buying tick cost**, which is a true statement about the simulation. ADR-0069's own
      // measurement of that drop is a pairing of two CONTENTS and therefore lives in the ruling,
      // not in this file; nothing below is quoted against it.
      //
      // WHY `ratio > 1` CANNOT STAND, FROM THE ARRAYS BELOW AND NOTHING ELSE. **Five of these
      // twenty readings are under 1** — 0.9645 and 0.9669 quiet, 0.9466, 0.9862 and 0.9982 loaded.
      // A floor that a quarter of the campaign's own readings violate is not a tight gate, it is a
      // gate that fires on weather (ADR-0016). It is not merely a loaded-arm effect either: the
      // QUIET arm crosses too, which is the state `needs` was never in.
      //
      // AND THE SHIPPED GATE HAD ALREADY BEEN WATCHED STRADDLING IT: 1.0547 and 0.9732 on the SAME
      // TREE in two `pnpm verify` runs forty minutes apart (E-011). That is the ±0.04 band the
      // ruling requires the replacement bound to sit outside of.
      //
      // THE MAGNITUDE BOUND, AND EVERY STEP OF IT IS ARITHMETIC OVER THE ARRAYS:
      //
      //   quiet median (upper middle of twelve)            1.0924
      //   BOUND = trunc(1.0924 x 1.5, 4dp)                 1.6386     <- the file's uniform rule
      //   worst reading in ANY regime (the floor)          1.4894
      //   SEPARATION = 1.6386 - 1.4894                     0.1492     <- 3.7x the +/-0.04 band
      //   pooled margin 1.1002x, quiet margin 1.3048x
      //
      // **IT IS DERIVED AND NOT CHOSEN, AND THE ORDER OF OPERATIONS IS THE EVIDENCE.** The rule is
      // the one that placed the other three bounds and it was not touched; the separation is a
      // CONSEQUENCE of it, computed afterwards, and no step of it has a number this goal picked.
      // Had the readings put the floor within 0.04 of the ceiling, `deriveAxis` would REFUSE the
      // axis — `bound > floor` and `floor < ceiling` are both executed — and the pre-registered
      // response in this file's header is more samples and a re-taken campaign, never a wider
      // number. The retired floor at 1 fails that same test on its face: 1 is not near the
      // readings, it is INSIDE them.
      //
      // WHAT THE AXIS STILL SAYS, so "it stops being able to say anything" is not quietly true.
      // Twenty amenities of each kind against one must not cost 1.6386x the sparse arm's tick.
      // That is the sub-linearity-in-provider-count claim this axis was built for at G-013, and it
      // is the half that survives; `anti-vacuity` still proves both arms do real work, and the
      // rotation's `ordering` row still checks a pair whose order is not in doubt.
      //
      // WHAT IS LOST, STATED RATHER THAN ABSORBED: nothing now catches these two arms swapping
      // places. That was worth having and it is not available at this instrument's spread.
      //
      // AND THE ALTERNATIVE THAT WOULD HAVE KEPT IT WAS REFUSED BY NAME. E-011's option (c) —
      // re-cut the density arms so the dense one is still service-bound and the direction survives
      // — is **tuning a workload to keep a test interesting**. G-039b-alpha refused it by name,
      // §9 makes it a stop condition, and ADR-0069 records the refusal so it is visible rather
      // than assumed. The arms below are byte-identical to the ones the campaign this replaces
      // measured; the rotation fingerprint above says so and the gate checks it every run.
      // ===============================================================================
      // ===============================================================================
      // **AND AT G-040b-ii THE DIRECTION ASSERTION COMES BACK ON, BECAUSE THE READINGS SAY SO.**
      // Not one of this campaign's twenty readings is below 1 — the lowest is 1.0698, and G-042's
      // arrays had FIVE under it — so `directionProblems` refuses the `false` flag outright:
      // *"declines the direction assertion while every recorded reading exceeds 1"*. The flag is
      // derived, and this is what derived costs when the readings move back.
      //
      // **WHY THEY MOVED, AND IT IS NOT THE ARMS BEING RE-CUT.** They are byte-identical to the
      // ones ADR-0069 ruled on — E-011's option (c) is still refused, and the fingerprint above
      // still says so. What moved is the POPULATION: the shipped party cycle 1, 1, 2 puts 16
      // concurrent guests in this rotation's hotel where 12 stood, and `SUSTAINED_BY_ONE_PROVIDER`
      // is 15 — so the dense arm's twenty amenities have somebody queueing for them for the first
      // time since G-041, and the arm pair stops swapping places under contention.
      //
      // **THIS IS A STRICTER GATE THAN THE ONE IT REPLACES, WHICH IS THE ONLY DIRECTION AN AGENT
      // MAY MOVE ONE.** ADR-0069's magnitude bound is untouched — it is this file's uniform rule
      // and it still applies — and what is added back is the claim the ruling had to give up:
      // these two arms cannot swap places. If a later campaign crosses 1 again, the same
      // predicate takes it off again, and the ruling's reasoning is on the page above for
      // whoever reads it next.
      // ===============================================================================
      direction: true,
      quiet: Object.freeze([
        1.1402, 1.1461, 1.2043, 1.2402, 1.2454, 1.3129, 1.3292, 1.3358, 1.3674, 1.3951, 1.4052, 1.4481,
      ]),
      loaded: Object.freeze([1.0698, 1.2679, 1.3092, 1.3096, 1.3814, 1.4388, 1.6546, 1.8588]),
    }),
    'rooms-saturated': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        3.3591, 3.4384, 3.5061, 3.5821, 3.6233, 3.6268, 3.6446, 3.6492, 3.7485, 3.7661, 3.9319, 3.9931,
      ]),
      loaded: Object.freeze([2.7263, 3.3303, 3.6266, 3.6916, 3.7344, 4.1015, 4.2418, 4.6112]),
    }),
    'rooms-bench': Object.freeze({
      rotation: 'rooms',
      direction: true,
      // IT WAS THE ONE AXIS WHOSE WORST READING WAS A QUIET ONE, AND AT G-042 IT IS NOT: the
      // shipped array before this one held 3.5301 quiet against a loaded 3.4326, and here the
      // loaded arm's 2.3477 tops the quiet arm's 2.2433. **The example moved; the rule did not.**
      // The floor pools every regime because "the loaded arm is the worst case" is a claim about
      // this instrument that a shipped array of this file has already falsified once — which is
      // an argument from the record rather than from today's twenty readings.
      quiet: Object.freeze([
        1.7474, 1.8926, 1.9835, 2.0678, 2.1772, 2.2084, 2.2722, 2.3569, 2.3604, 2.3915, 2.4324, 2.4413,
      ]),
      loaded: Object.freeze([1.6092, 1.9795, 2.1533, 2.2864, 2.3901, 2.4783, 2.5116, 2.6137]),
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
  needs: 1.8421,
  density: 1.9937,
  'rooms-saturated': 5.4669,
  'rooms-bench': 3.4083,
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
 *   needs                    1.8421                 1.8364         +0.31%
 *   density                  1.9937                 1.9815         +0.62%
 *   rooms-saturated          5.4669                 5.4535         +0.25%
 *   rooms-bench              3.4083                 3.3604         +1.43%
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
