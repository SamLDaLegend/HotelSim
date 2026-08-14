// THE HOTEL THE GATES MEASURE — the single source, the way `budget.mjs` is the single
// source of I5's budget.
//
// WHY THIS FILE EXISTS (G-020a, inherited from G-018 round 2). `sim-critic` found that
// mutating `bench.mjs`'s `ROOMS 60 -> 3` or `ARRIVAL_EVERY_TICKS 32 -> 3200` left EVERY
// test in the repo green. The file that looks like it pins the bench's workload —
// `tools/headless/src/bench.workload.golden.test.ts` — declared its OWN copies of both
// constants under a comment saying they were "`bench.mjs`'s own figures, so this pin and
// that gate describe the same building", and never read `bench.mjs`. It was the
// duplicated-constant shape G-018 removed from the budget, still live one file over,
// with a comment asserting the property it lacked.
//
// So the values move here, every consumer imports them, and the golden hash is now taken
// at the numbers the gate runs. Change one and the golden goes red, which is the whole
// point: a workload nothing pins is a workload anyone can quietly shrink.
//
// THESE VALUES ARE EXTRACTED, NOT RETUNED. Byte-identical to what `bench.mjs` declared
// before this change. G-020a re-sizes nothing; it only makes the numbers checkable.
//
// WHAT THE VALUES MEAN, AND THE LIMITATION THAT IS NOT WHAT YOU EXPECT — the long form
// lives at the head of `bench.mjs` and is not restated here. In short: G-010's
// optimisation made tick cost O(guests), not O(rooms), so ROOMS is not this workload's
// cost driver and ARRIVAL_EVERY_TICKS is. The honest axis is CONCURRENT GUESTS.

/** G-010: a real hotel rather than a three-room toy. See `bench.mjs`'s head first. */
export const ROOMS = 60;

/**
 * THE CALIBRATED OCCUPANCY OF THIS BENCHMARK, AND THE ONLY NUMBER IN THIS FILE THAT IS A
 * TARGET RATHER THAN A SETTING (G-027a, human ruling — ADR-0021; re-frozen at G-032a).
 *
 * IN HUNDREDTHS OF A GUEST, AND MEASURED RATHER THAN DIVIDED. It read
 * `TARGET_CONCURRENT_GUESTS = 15` until G-032a, where 15 was `stayDurationTicks /
 * ARRIVAL_EVERY_TICKS` — arithmetic over two content constants, which is not occupancy and had
 * stopped being close to it. θ-b1 caught that: the quotient read 15 at 14.77 concurrent guests,
 * at 6.40 and at 8.72, because ADR-0017 made departure a function of dissatisfaction rather than
 * of the clock and the effective stay became EMERGENT. **Once effective stay is emergent, the
 * quotient is a property of the content table and the occupancy is a property of the run.**
 *
 * WHY THIS NUMBER AND NOT ANOTHER: it is not derived from anything and it must not be. It is
 * the occupancy `tripwire.mjs`'s bound campaign was MEASURED at — the G-032a re-take, at this
 * file's own `ROOMS` / `ARRIVAL_EVERY_TICKS` / `SEED` — so re-deriving it would make the bound
 * describe a hotel nobody calibrated against. A historical fact about a campaign, frozen for
 * the reason ADR-0008 freezes any such fact, and moved only by the goal that re-takes the
 * campaign.
 *
 * IT IS PINNED MECHANICALLY, AND THE PIN IS A MEASUREMENT: `workload.concurrency.test.ts` runs
 * this hotel through the tick and divides guest-frames by ticks. It goes red on any change that
 * moves the benchmark's occupancy, by name, with the number in hand — which the quotient it
 * replaced could not do at three different occupancies.
 *
 * ONE PLACE, NOT TWO. The test used to carry its own `MEASURED_CONCURRENT_HUNDREDTHS` beside
 * this constant, so the calibrated occupancy and the observed one were two literals that could
 * disagree — the duplicated-constant shape ADR-0021 exists about, inside the file written to
 * close ADR-0021. The test now measures against THIS.
 */
export const TARGET_CONCURRENT_HUNDREDTHS = 872;

/**
 * THE ARRIVAL INTERVAL. It INFLUENCES concurrent guests; it does not set them.
 *
 * ===========================================================================================
 * THIS DOCBLOCK CONTRADICTED THE CONSTANT TWENTY-THREE LINES ABOVE IT UNTIL G-032a's SWEEP 1.
 *
 * It opened *"sets concurrent guests, which is what these measurements actually measure"* and
 * then said *"`1440 / 96 = 15` puts the benchmark back on the occupancy its bound was calibrated
 * at"* — while `TARGET_CONCURRENT_HUNDREDTHS` above had just been rewritten to say that quotient
 * **is not occupancy and had stopped being close to it**, reading 15 at 14.77, at 6.40 and at
 * 8.72 concurrent guests. Two constants in one file, disagreeing about what the benchmark holds,
 * with the correction sitting above the claim it corrected.
 *
 * It also read *"`tripwire.mjs`'s 1.4557 is untouched"* — **the bound this same commit moved**,
 * to 1.4640, by re-deriving it from a re-taken campaign.
 *
 * ADR-0038 rule 3, verbatim and unheeded: *after correcting a claim, read the two comments either
 * side of it.* The repair and the defect shared a subject, the fix got the attention, and the
 * neighbour inherited the assumption.
 * ===========================================================================================
 *
 * 32 -> 96 AT G-027a, AND IT WAS A RESTORATION RATHER THAN A RETUNE (ADR-0021, human). At the
 * time, the quotient was believed to restore fifteen concurrent guests. **What it restored is
 * 8.72**, which is what `TARGET_CONCURRENT_HUNDREDTHS` now records, measured. The literal is
 * right and the reasoning that chose it was not — so the value stays and the justification for it
 * is now "this is the cadence the shipped campaign was taken at", which is checkable.
 *
 * IT STAYS A LITERAL AND IS NOT DERIVED FROM CONTENT AT RUNTIME, deliberately. This gate is
 * a PAIRED RATIO: `measure.mjs` hands the same `--arrivals` to both arms, and a constant
 * that computed itself from content would let two arms built from two revisions run two
 * different workloads. A stale literal is a comparability problem you can see; a
 * self-adjusting one is a comparability problem you cannot. What was missing was never
 * derivation — it was an executed check that the literal still means what this file says.
 *
 * The header's "THESE VALUES ARE EXTRACTED, NOT RETUNED" is still true of G-020a, and this
 * is the first time any of them has moved since.
 */
export const ARRIVAL_EVERY_TICKS = 96;

/** I5's own wording is `--seed 42`, and every pinned golden was taken at it. */
export const SEED = 42;

/**
 * How long `sim:measure` runs each arm. THE INSTRUMENT'S ARM LENGTH AND NOTHING ELSE'S.
 *
 * WHICH WAY THIS DEPENDENCY POINTS, stated correctly because the first version stated it
 * backwards. It said the golden pinned this value; the code had made this value pin the
 * golden — `bench.workload.golden.test.ts` read it for its own `DAYS`, so changing the
 * instrument's arm length would have moved two committed hashes and five hand-checked
 * counts in the sharpest golden in the repo. Since the likeliest response to a noisy reading
 * is a LONGER ARM, that coupling would have turned the golden's "IF A HASH BELOW MOVES, STOP"
 * into routine re-pinning, which is how a golden stops being evidence.
 * (This sentence used to source that response to "this instrument's ±10% noise floor". THAT
 * FIGURE IS WITHDRAWN — see `arm/measure-arm.mjs`, G-020c: it carried no load condition, and
 * the argument never needed a number.)
 *
 * So the golden owns its own run length again, and nothing but `measure.mjs` reads this.
 * The two still describe the same simulated history, and that is now WITNESSED rather than
 * arranged: `tools/gates/check-measure.mjs` computes the expected hash by SPAWNING THE
 * SHIPPED CLI — `sim:run --quiet`, the real zod-validated loader and the real `schedule()`
 * — at whatever this value says, and asserts the arms reproduce it. Change this number and
 * that check re-derives; the golden does not move.
 *
 * THIRTY DAYS, RAISED FROM FIVE AT G-020b, AND THE RAISE IS THE WHOLE REASON A BOUND IS
 * POSSIBLE. `measure-arm.mjs` listed two levers for a tighter noise floor: `--repeat`
 * (measured, linear cost) and A LONGER ARM (unmeasured). G-020b measured the longer arm and
 * it wins on both axes.
 *
 * WHAT WAS MEASURED · over what workload · at what sample count · aggregated how · UNDER WHAT
 * REGIME — `CLAUDE.md` rule 4's FIVE slots. The regime became slot 5 by human ruling DURING
 * this goal, and this block is one of the three failures cited for it: it claimed "all four
 * slots" and gave no load condition.
 *
 *   the `sim:measure --null` ratio — two arms one COMMENT apart, state hashes identical, so
 *   every reading's true value is 1.000 and any departure is this instrument's own noise —
 *   over 60 rooms / an arrival every 32 ticks / seed 42, arm length varied · arm lengths
 *   ALTERNATED AND ROTATED, arm lengths against each other, ACROSS TWO SITTINGS — n=4 each in
 *   the first, n=5 each in the second (`CLAUDE.md` rule 1 is satisfied by the pairing WITHIN
 *   each sitting, which is what makes the readings poolable across them) · min..max ·
 *   REGIME: QUIET, no deliberate concurrent load, 12-core developer machine. Under load the
 *   same quantity reads materially worse — `tripwire.mjs`'s `LOADED_OBSERVATIONS` carries the
 *   live figure, and a ratio's noise is a property of the machine's load as much as of the
 *   workload.
 *
 *   *(The `+9.73%` that stood here was the CADENCE-32 loaded reading. G-032a re-measured it and
 *   `LOADED_OBSERVATIONS` now says something else — so this LIVE cross-reference pointed at a
 *   number the file it cites no longer holds, four lines above the block correctly fenced as
 *   history. The figure is not restated here: one place, and it is the array.)*
 *
 *   AND THESE TWO ROWS EXIST IN A SECOND FILE. `tools/gates/arm/measure-arm.mjs` carries the
 *   same measurement; `check-tripwire.mjs` compares them and requires the fence on that copy.
 *   One measurement, two copies — correct both or neither:
 *
 *     5 days    n=9 interleaved    0.9572 .. 1.0984      11.8-13.9s per reading
 *     30 days   n=9 interleaved    0.9268 .. 1.0238      36.5s per reading
 *
 *   BOTH ROWS WERE TAKEN AT CADENCE 32, AND AT G-032a THAT MAKES THEM HISTORY.
 *   ~~The 30-day row is an arm of the bound campaign, and its 1.0238 sets the shipped
 *   NOISE_CEILING.~~ It was, from G-020b until G-032a. **ADR-0015's REPLACE half retired it**:
 *   the shipped cadence moved 32 -> 96 (ADR-0021), so this row measures a hotel holding a
 *   different population and cannot count toward a campaign taken at 96. `tripwire.mjs` carries
 *   the re-taken arms, and `check-tripwire.mjs` refuses if this one is pasted back in.
 *
 *   **THE ARGUMENT THEY SUPPORT IS UNAFFECTED, WHICH IS WHY THEY STAY.** It is a comparison
 *   BETWEEN TWO ARM LENGTHS at one cadence — 5 days against 30 — and its conclusion is that the
 *   longer arm has the tighter tail at nearly the marginal cost of the ticks. Nothing in that
 *   depends on which cadence both sides were measured at, so re-taking it would spend an hour
 *   moving two numbers and changing no decision. **What these rows may NOT be used for is a
 *   noise ceiling**: that is a claim about one configuration and this is not that configuration.
 *
 *   ~~AND THE DUPLICATION THAT USED TO BE CHECKED HERE IS GONE WITH THE ARM. There is ONE copy
 *   now — this one — so a guard comparing two things would be inspecting one.~~ **WITHDRAWN.**
 *   `tripwire.mjs`'s copy did go with the retired arm, but `arm/measure-arm.mjs` carries the
 *   same rows and always did, so the premise was false and the guard it justified deleting has
 *   been restored over BOTH surviving copies.
 *
 *   **It survived nineteen lines below the paragraph added in the same fix saying there are
 *   two** — one docblock, two answers, and the fix was for an instance of this exact class.
 *   ADR-0038 rule 3: after correcting a claim, read the two comments either side of it. The
 *   comment nineteen lines up was read; this one was not.
 *
 *   THE EQUAL-n PAIR IS THE COMPARISON. A max over few samples is systematically smaller
 *   than a max over many, so quoting a short arm's n=19 tail against a long arm's n=5 would
 *   flatter the long arm by construction. Both figures above are n=9, same sitting design.
 *   (The shipped 5-day arm's full record is n=20, 0.7646 .. 1.2064 — the top of that range
 *   was contributed by `sim-critic` and sits OUTSIDE the n=19 the builder had measured,
 *   which is itself the argument for not trusting a short arm's tail.)
 *
 * WHY A LONGER ARM AND NOT `--repeat`. 80% of a 5-day invocation's wall time is process
 * startup and tsx compilation, not simulation: two arms x six samples x three timed runs x
 * 7,200 ticks is ~3.9s of measured work inside ~19s of wall clock. Lengthening the arm buys
 * measured window at nearly the marginal cost of the ticks alone, while `--repeat` pays the
 * startup again every time. Measured: `--repeat 7` at 5 days costs ~83s; a single 30-day
 * reading costs ~36.5s and has the tighter tail.
 *
 * WHAT THE LONGER ARM STILL CANNOT SEE, stated rather than hidden: a cost that only appears
 * after an occupancy history longer than 30 simulated days.
 *
 * AND CHANGING THIS NUMBER IS CHEAP BECAUSE G-020a MADE IT CHEAP. The golden owns its own
 * run length, so this raise moves NO committed hash; `check-measure.mjs` re-derives its
 * cross-check by spawning the shipped CLI at whatever this says. That decoupling was done
 * one goal before the raise that needed it.
 */
export const MEASURE_DAYS = 30;
