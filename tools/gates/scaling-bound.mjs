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
// shape `tripwire.mjs:343` uses — and the floor is a separate refusal rather than a second
// input to choose between. Nudge a reading and the constant no longer matches; the gate
// refuses to start and names the new figure, in either direction.
//
// WHAT THAT DID TO THE FOUR BOUNDS, STATED WITH ITS DIRECTION BECAUSE TWO OF THEM LOOSENED:
//
//   rooms-saturated   6    -> 5.7516   TIGHTER
//   rooms-bench       6    -> 4.6119   TIGHTER (that axis never had its own bound; it shared)
//   needs             2.5  -> 3.1135   LOOSER, AND FORCED: quiet readings of 2.5906 (here),
//                                      2.6534 and 2.5903 (`sim-critic`, two harnesses) are
//                                      above the incumbent, so 2.5 was a bound the instrument
//                                      had already been observed clearing with nothing to find
//   density           1.9  -> 2.0239   LOOSER BY 6.5%, AND NOT FORCED — the worst observed
//                                      reading is 1.6154, well under either number. It moved
//                                      because the MEDIAN moved (1.281 -> 1.3493) in a
//                                      different configuration, and the rule is applied
//                                      uniformly rather than per-axis
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
// code (`tripwire.mjs:384-402`, after a 106% "noise" ceiling shipped green). This is that
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
//   needs                  2.0757 -> 2.1636  (+4.2%)        2.5906 -> 2.9733  (+14.8%)
//   density                1.3493 -> 1.3829  (+2.5%)        1.6154 -> 1.5619  (-3.3%)
//   rooms-saturated        3.8344 -> 3.7255  (-2.8%)        4.2525 -> 4.3803  (+3.0%)
//   rooms-bench            3.0746 -> 3.8136  (+24.0%)       3.9312 -> 4.1044  (+4.4%)
//
// THREE OF THE FOUR MOVE UP ON THE MEDIAN AND THREE OF THE FOUR MOVE UP ON THE MAX. The claim
// is false as a generalisation, and the axis it was WRITTEN about (density) is the only one it
// holds for on the tail. What is true and what this file relies on instead: the FLOOR pools
// every reading in every regime observed, so a bound is placed above what load has actually
// been seen doing rather than above a model of what it ought to do.
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
  workload: '60 rooms, an arrival every 32 ticks, seed 42, 4,320 ticks (six simulated hours); the rooms rotation varies rooms and arrivals together',
  samples: 'each reading is a ratio of medians of 5 in-process samples, arms interleaved with the order alternating, one warm-up discarded',
  aggregation: 'MEDIAN of the quiet readings for the signal; MAX over every reading in every regime for the noise floor',
  regime: 'quiet and loaded both measured on win32/12cpu, node 22.16; loaded = 12 busy processes on 12 cores (tools/gates/arm/load.mjs)',
  // Compared against the arms module at startup, because a campaign is only evidence for the
  // configuration it was taken at (ADR-0015's REPLACE half, and `tripwire.mjs:301-325`'s
  // executable version of it: a 3-day arm under a 30-day bound passed at exit 0 until it did).
  //
  // AND THE ROTATION FINGERPRINTS ARE PART OF THE CONFIGURATION, NOT DECORATION. The four
  // scalars below describe the NEED rotation only; the room rotation runs 25 and 100 rooms at
  // arrivals 20, 5, 60 and 15, and the dense arm runs 20 amenities. Comparing only the scalars
  // left the brake inspecting nothing for two of four axes — `sim-critic` changed
  // `saturated-100` to 200 rooms and nothing refused. Each string is `name:rooms/arrivals/
  // amenities/needTypes` per arm, IN ORDER, so adding, removing, renaming or re-sizing an arm
  // moves it. That is the same claim this file makes about rotations everywhere else: an arm
  // set is part of the workload.
  configuration: Object.freeze({
    rooms: 60,
    arrivalEveryTicks: 32,
    seed: 42,
    ticks: 4_320,
    samplesPerArm: 5,
    fingerprints: Object.freeze({
      needs:
        'idle:0r/999999a/1m/4n one-need:60r/32a/1m/1n full-vector:60r/32a/1m/4n dense-providers:60r/32a/20m/4n',
      rooms:
        'idle:0r/999999a/1m/4n saturated-25:25r/20a/1m/4n saturated-100:100r/5a/1m/4n bench-25:25r/60a/1m/4n bench-100:100r/15a/1m/4n',
    }),
  }),
  axes: Object.freeze({
    needs: Object.freeze({
      rotation: 'needs',
      // A bound alone is also satisfied by the two arms swapping places, so every axis whose
      // arms have a KNOWN order asserts it. See `density` for the one that does not.
      direction: true,
      quiet: Object.freeze([
        1.8763, 1.9977, 2.0234, 2.0269, 2.0455, 2.0621, 2.0757, 2.1163, 2.1288, 2.1319, 2.1810, 2.5906,
      ]),
      loaded: Object.freeze([1.7462, 1.9030, 2.0967, 2.1495, 2.1636, 2.5619, 2.7996, 2.9733]),
    }),
    density: Object.freeze({
      rotation: 'needs',
      // NO DIRECTION ASSERTION, AND IT IS MEASURED RATHER THAN INHERITED. `needs.scaling.test.ts`
      // declined this assertion on the grounds that load compresses the density signal towards
      // 1. That reasoning is now known to be wrong about the need axis, so it was re-checked
      // here rather than carried over: the density ratio's own QUIET spread crosses 1 —
      // 0.9915 is in the readings below, at n=12, with nothing to find. The conclusion holds
      // and the stated reason has changed.
      direction: false,
      quiet: Object.freeze([
        0.9915, 1.1459, 1.1988, 1.2199, 1.2554, 1.2799, 1.3493, 1.3920, 1.4821, 1.4990, 1.5382, 1.6154,
      ]),
      loaded: Object.freeze([1.2284, 1.2320, 1.2456, 1.2749, 1.3829, 1.3947, 1.4767, 1.5619]),
    }),
    'rooms-saturated': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        3.1047, 3.3839, 3.4900, 3.5369, 3.7391, 3.8134, 3.8344, 3.8977, 3.9521, 3.9589, 4.1546, 4.2525,
      ]),
      loaded: Object.freeze([3.0356, 3.1531, 3.2088, 3.6209, 3.7255, 3.9084, 4.0062, 4.3803]),
    }),
    'rooms-bench': Object.freeze({
      rotation: 'rooms',
      direction: true,
      quiet: Object.freeze([
        2.1788, 2.2876, 2.4074, 2.9137, 2.9925, 3.0022, 3.0746, 3.1520, 3.1641, 3.3369, 3.5537, 3.9312,
      ]),
      loaded: Object.freeze([2.3596, 2.5910, 3.0958, 3.1834, 3.8136, 3.8214, 3.8677, 4.1044]),
    }),
  }),
});

/**
 * The bounds as written constants, so changing one is a visible edit in a diff — and each is
 * PINNED TO EQUALITY with `trunc(quiet median x 1.5, 4dp)` below, so it cannot drift from the
 * readings in either direction.
 *
 * They are written out rather than computed into a variable for the reason `tripwire.mjs:330`
 * gives: a bound that only ever exists as an expression is a bound no diff ever shows moving.
 */
export const BOUNDS = Object.freeze({
  needs: 3.1135,
  density: 2.0239,
  'rooms-saturated': 5.7516,
  'rooms-bench': 4.6119,
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
 *   needs                    3.1135                 3.1033         +0.33%
 *   density                  2.0239                 1.9719         +2.64%
 *   rooms-saturated          5.7516                 5.7358         +0.28%
 *   rooms-bench              4.6119                 4.5576         +1.19%
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
 * in either direction — the same "BOUND is not its own derivation" refusal `tripwire.mjs:343`
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
