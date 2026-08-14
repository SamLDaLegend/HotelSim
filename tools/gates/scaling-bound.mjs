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
// AND WHAT THE G-032a RE-TAKE DID, WHICH IS THE SHIPPED SET. ADR-0015's REPLACE half: the
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
//   needs                  1.1454 -> 1.1307  (-1.3%)        1.2446 -> 1.2793   (+2.8%)
//   density                1.4571 -> 1.6144 (+10.8%)        1.4946 -> 2.0415  (+36.6%)
//   rooms-saturated        3.7688 -> 4.0638  (+7.8%)        3.9925 -> 4.4252  (+10.8%)
//   rooms-bench            2.7479 -> 2.7241  (-0.9%)        2.9546 -> 3.1600   (+7.0%)
//
// THE GENERALISATION IS STILL FALSE AND THE RE-TAKE SAYS SO IN A NEW SHAPE. Two of four move up
// on the median and FOUR OF FOUR move up on the max. The previous campaign read three and three;
// the sentence that stood here described those readings and has been re-derived from these
// rather than carried, because a load claim is a claim about a measurement and this measurement
// is a different one (ADR-0015 REPLACE; ADR-0027 on what a replacement inherits).
//
// What is true and what this file relies on instead: the FLOOR pools every reading in every
// regime observed, so a bound is placed above what load has actually been seen doing rather than
// above a model of what it ought to do.
//
// AND THE DENSITY AXIS IS NOW THE THIN ONE — SAID HERE BECAUSE IT IS THE FIRST THING A LATER
// READER SHOULD KNOW. Its loaded max is 2.0415 against a ceiling of 2.1856: a margin of 1.07x,
// where the other three sit at 1.34x, 1.28x and 1.30x. Nothing refuses — `bound > floor` holds —
// but this is the closest this project has come to ADR-0016's crossing, and the pre-registered
// response if it ever crosses is in this file's header: MORE SAMPLES PER READING AND A RE-TAKEN
// CAMPAIGN, never a wider number.
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
  workload: '60 rooms, an arrival every 96 ticks, seed 42, 4,320 ticks (six simulated hours); the rooms rotation varies rooms and arrivals together',
  samples: 'each reading is a ratio of medians of 5 in-process samples, arms interleaved with the order alternating, one warm-up discarded',
  aggregation: 'MEDIAN of the quiet readings for the signal; MAX over every reading in every regime for the noise floor',
  regime: 'quiet and loaded both measured on win32/12cpu, node 22.16; loaded = 12 busy processes on 12 cores (tools/gates/arm/load.mjs)',
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
  configuration: Object.freeze({
    rooms: 60,
    arrivalEveryTicks: 96,
    seed: 42,
    ticks: 4_320,
    samplesPerArm: 5,
    fingerprints: Object.freeze({
      needs:
        'idle:0r/999999a/1m/4n/1440s one-need:60r/96a/1m/3n/1440s full-vector:60r/96a/1m/4n/1440s dense-providers:60r/96a/20m/4n/1440s',
      rooms:
        'idle:0r/999999a/1m/4n/1440s saturated-25:25r/20a/1m/4n/1440s saturated-100:100r/5a/1m/4n/1440s bench-25:25r/60a/1m/4n/1440s bench-100:100r/15a/1m/4n/1440s',
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
      // THE EVIDENCE IS A READING THE SHIPPED GATE PRODUCED, not an argument. On a `pnpm
      // verify` run immediately after the campaign landed, `check:scaling` reported
      //
      //     FAIL  needs  0.9732  full-vector / one-need
      //
      // — the full vector measured CHEAPER than the smallest bindable one. Same instrument,
      // same configuration, same 5-sample protocol as every reading below; it is simply the
      // 21st reading, and it is under 1. **At a one-need lever the arms differed by 4x the
      // per-need work and the order was never in doubt. At 4-against-3 the true ratio is close
      // enough to 1 that this instrument's own spread crosses it**, which is precisely the
      // state `density` declines the assertion for.
      //
      // IT IS NOT POOLED INTO THE QUIET ARRAY BELOW, AND THE REASON IS `DECLARED_READINGS` —
      // THE TWO REASONS FIRST GIVEN WERE BOTH WRONG AND ARE WITHDRAWN.
      //
      //   ~~Adding it would move the median and therefore the bound.~~ **It would not.** The
      //   median is `sorted[floor(n/2)]`: index 6 of 12 and index 6 of 13 are both 1.1454, so
      //   `trunc(1.1454 x 1.5, 4)` is 1.7181 either way — and the floor is a MAX, which a low
      //   tail cannot move. Checked, not reasoned: the arithmetic is one line and it was never
      //   run. `PARKING.md`'s entry on this axis states it correctly, so the same commit carried
      //   both the right arithmetic and the wrong one, in two ledgers.
      //
      //   ~~Pairing is within a sitting, so a reading from another sitting cannot pool.~~ **This
      //   repository has already ruled against that position.** G-020b's admitted arm spanned
      //   TWO sittings, was ruled in on ADR-0015's anti-curation clause — a reading does not stop
      //   counting because it was filed under a different heading — and it moved the bound.
      //   `tripwire.mjs` records that as "the mechanism working".
      //
      // WHAT IS ACTUALLY TRUE, AND IT IS EXECUTED RATHER THAN ARGUED: `DECLARED_READINGS` pins
      // this arm at twelve, and `deriveAxis` REFUSES when an array's length disagrees with the
      // declared count — *"re-take the campaign and update the declared count together; do not do
      // either alone."* A thirteenth reading is therefore not a thing that can be quietly added;
      // it is a re-take. That is the guard talking, not a preference, and it is the one reason
      // that survives contact with the file.
      //
      // It is recorded here, where the decision it informs is made.
      //
      // WHAT IS LOST, STATED RATHER THAN ABSORBED: nothing now catches the two arms swapping
      // places on this axis. That was worth having and it is not available — an assertion the
      // instrument has been measured contradicting is not a tight gate, it is a gate that fires
      // on nothing (ADR-0016). The bound still binds, and `anti-vacuity` still proves both arms
      // are doing real work.
      // =================================================================================
      direction: false,
      // ===============================================================================
      // THE OBSERVATION THAT WARRANTS DECLINING IT — AS DATA, NOT AS PROSE (verification pass).
      //
      // This was `directionWaiver: '0.9732 — check:scaling, shipped gate, ...'`, a STRING, and
      // the predicate read the first number-ish run of text out of it and asked only that it be
      // <= 1. So `'0.5 — I decided this'` passed, and so did `'0'`. **The free parameter had
      // moved from the boolean to the string the boolean deferred to** — in the block whose
      // headline is that this file has none.
      //
      // A `value` the predicate reads as a NUMBER, beside the `source` that says where it came
      // from, is the smallest thing that is actually evidence. It is not pooled into the arrays
      // above: `DECLARED_READINGS` pins those at twelve and eight, and `deriveAxis` refuses a
      // count that disagrees — which is what makes admitting a reading a re-take rather than an
      // edit, in both directions.
      // ===============================================================================
      observations: Object.freeze([
        Object.freeze({
          value: 0.9732,
          source: 'check:scaling, shipped gate, on a pnpm verify run during G-032a',
        }),
      ]),
      // ===================================================================================
      // THE LEVER COLLAPSED, AND THAT IS WHY THIS AXIS FELL FROM ~2.08 TO ~1.15 (G-032a).
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
        1.0357, 1.0712, 1.0866, 1.1003, 1.1177, 1.1454, 1.1454, 1.1572, 1.1703, 1.1752, 1.2045, 1.2446,
      ]),
      loaded: Object.freeze([1.0226, 1.0642, 1.0691, 1.0759, 1.1307, 1.1326, 1.2726, 1.2793]),
    }),
    density: Object.freeze({
      rotation: 'needs',
      // ===============================================================================
      // THE ASSERTION IS ON AGAIN, AND THIS IS THE AXIS WHOSE WARRANT HAD INHERITED (sweep 3).
      //
      // It read: *"measured rather than inherited ... the density ratio's own QUIET spread
      // crosses 1 — 0.9915 is in the readings below."* **0.9915 was in the CADENCE-32 array and
      // this diff replaced it.** The shipped minimum is 1.2453 quiet and 1.2881 loaded; nothing
      // in either array is under 1, and three post-campaign readings (1.4252 / 1.5046 / 1.5258)
      // are not either.
      //
      // So the one axis claiming its declined assertion was MEASURED is the one that inherited
      // it — **eight lines below the block that hunts exactly this on `needs` and cites this
      // axis as its precedent**, in the commit that re-took the campaign. ADR-0027's class,
      // twice in one file, and the second instance was inside the repair for the first.
      //
      // TURNING IT ON IS A TIGHTENING DERIVED FROM READINGS, NOT A CHOICE. The dense arm runs
      // twenty of each amenity against the sparse arm's one at the same need count, so it must
      // cost more, and every reading on record agrees. The two axes' distances above 1 are
      // stated rather than divided: density's lowest recorded reading is 1.2453, and `needs`'
      // campaign low was 1.0357 before the shipped gate read 0.9732.
      // ===============================================================================
      direction: true,
      quiet: Object.freeze([
        1.2453, 1.3883, 1.4118, 1.4206, 1.4231, 1.4269, 1.4571, 1.4581, 1.4693, 1.4706, 1.4719, 1.4946,
      ]),
      loaded: Object.freeze([1.2881, 1.2893, 1.4572, 1.5739, 1.6144, 1.6489, 1.7593, 2.0415]),
    }),
    'rooms-saturated': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        3.5561, 3.5588, 3.5631, 3.6499, 3.6736, 3.7287, 3.7688, 3.7902, 3.7984, 3.8014, 3.8625, 3.9925,
      ]),
      loaded: Object.freeze([3.5177, 3.6514, 3.8244, 3.8416, 4.0638, 4.1837, 4.3324, 4.4252]),
    }),
    'rooms-bench': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        2.6317, 2.6508, 2.6590, 2.6854, 2.6890, 2.7374, 2.7479, 2.7489, 2.8086, 2.8088, 2.8388, 2.9546,
      ]),
      loaded: Object.freeze([2.0609, 2.1989, 2.2163, 2.4875, 2.7241, 2.9744, 3.0225, 3.1600]),
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
  needs: 1.7181,
  density: 2.1856,
  'rooms-saturated': 5.6532,
  'rooms-bench': 4.1218,
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
 * columns from the readings. One row was wrong when it was written (rooms-bench read 4.5502 and
 * +1.36%; it is 4.5576 and +1.19%), found by `sim-critic` recomputing it by hand, in a table
 * whose whole point was to make the free parameter's cost checkable. A table built to be
 * checkable and left unchecked is this project's oldest defect wearing a new hat.
 *
 *   axis              upper middle (shipped)   mean of middles   difference
 *   needs                    1.7181                 1.7181         +0.00%
 *   density                  2.1856                 2.1630         +1.04%
 *   rooms-saturated          5.6532                 5.6231         +0.54%
 *   rooms-bench              4.1218                 4.1139         +0.19%
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
