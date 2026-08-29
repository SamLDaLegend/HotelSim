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
 *
 * ===========================================================================================
 * 872 -> 856 AT G-023b-ii, RE-TAKEN WITH THE BOUND CAMPAIGN IN ONE COMMIT AS THE PIN DEMANDS,
 * AND THE BOUND'S VALUE IS UNCHANGED. Shipped content declared `guestCellsPerTick: 3`, so
 * guests spend ticks walking and this hotel holds fewer of them at once. `--rooms 60
 * --arrivals 96 --seed 42`, 30 days, guest-frames over ticks — an exact deterministic integer
 * count, so n=1 is the whole distribution and there is no aggregation and no regime to state.
 *
 * **THE BOUND STAYS AT 1.4640 BY HUMAN RULING (ADR-0056), NOT BY OMISSION.** What that ruling
 * re-takes is this constant: the pin must describe the hotel the gate now runs, and the
 * campaign's own reach is printed by `tripwire.mjs` rather than implied.
 *
 * ===========================================================================================
 * 856 -> 850 AT G-039b-alpha, RE-TAKEN ALONE, AND ADR-0058 IS WHY THAT IS LEGITIMATE.
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution — the run is deterministic, so a second
 * invocation returns the same integer. AGGREGATION: none; one division, rounded once. REGIME:
 * none applies — no clock is read, so nothing about the machine or its load can reach this
 * number. `workload.concurrency.test.ts` re-measures it on every run of `pnpm test` rather than
 * trusting this line.
 *
 * WHY IT MOVED: G-039b-alpha gave the seeded plate a SPINE — a run of corridor along the plot's
 * near row that joins the plate's lanes to each other and puts the entrance on circulation —
 * and moved every seeded room one column right and one row back to make room for it. Every
 * journey in this hotel is a different journey, so the hotel holds a different number of guests
 * at once. **Six hundredths of a guest, on a workload where every room moved.**
 *
 * RE-TAKEN ALONE, AND THE BOUND CAMPAIGN IS NOT RE-TAKEN, PER ADR-0058 (orchestrator ruling,
 * forced by a review that found the standing instruction literally unexecutable). The clause
 * that said the two must move TOGETHER was written when the bound was free to move; ADR-0056
 * froze the bound by human ruling, `tripwire.mjs` refuses to run if the bound and its derivation
 * disagree, and two of the campaign's three arms materialise their own committed content and
 * therefore cannot be re-taken at today's occupancy at all. **A pin re-taken alone against a
 * frozen bound cannot produce the disagreement the clause existed to prevent — it can only make
 * the pin true**, and the gate PRINTS the gap rather than implying it.
 *
 * AND IT WILL MOVE AGAIN, TWICE, BY DESIGN. G-040 (parties) changes who holds a room and G-041
 * re-derives every need rate; both move occupancy. **Each re-takes this constant when it moves
 * it.** This goal deliberately does not pre-pay for either — a pin taken now for a hotel two
 * planned goals will replace is a number that is wrong the moment it is written.
 * ===========================================================================================
 *
 * AND 848 IS WITHDRAWN. The figure carried in `GOALS.md`'s G-023b-ii block was measured under
 * a probe taken BEFORE G-038c, which added `floorConstructionCostPence` and
 * `maxLodgingFloorsFromEntrance` and moved this hotel. Re-measured on today's tree the same
 * quantity reads 856. `CLAUDE.md` rule 3: never compare an absolute against a figure recorded
 * in another session — and the travel-OFF census reproduces G-032a's committed table byte for
 * byte at every one of its thirteen cadences, which is what says the instrument is sound and
 * the stale figure was the tree.
 * ===========================================================================================
 * 850 -> 827 AT G-038a-iii-b, RE-TAKEN ALONE AGAIN, UNDER THE SAME ADR-0058 RULING.
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution. AGGREGATION: none; one division,
 * rounded once. REGIME: none applies — no clock is read.
 *
 * WHY IT MOVED: `report.ts`'s `schedule` now declares a STAIRWELL — `layStair` on every floor of
 * the plot at `(column 1, row 0)`, derived in `shaftCell` from the intersection of the two
 * spines. This workload's one amenity is in the BASEMENT and all sixty of its bedrooms are on
 * floor 0, so every engagement journey in it is a cross-floor journey, and a cross-floor journey
 * now costs a walk to that column instead of rising through the ceiling from wherever the guest
 * stood. **Twenty-three hundredths of a guest — four times the spine's six**, which is the right
 * order for a change that roughly doubles move events on this shape
 * (`travel.stairs.report.test.ts`: 910 -> 1,948).
 *
 * **THE GAP AGAINST THE CAMPAIGN WIDENS AND `tripwire.mjs` PRINTS IT.** The bound campaign was
 * taken at `occupancyWhenTaken: 872`; the gap was 2.5% at 872 -> 850 and is 5.2% at 872 -> 827.
 * The bound STAYS at 1.4640 (ADR-0056, human) and is not re-derived. What the ruling requires is
 * that the pin describe the hotel the gate now runs, and the gate print its campaign's reach
 * rather than imply it — both of which this re-take does. The campaign is a NOISE campaign; the
 * argument that its spread is occupancy-sensitive has never been made or measured, and if
 * somebody makes it the response is a re-take, not a wider bound (ADR-0021).
 *
 * AND G-040 STILL OWES ITS OWN RE-TAKE, unchanged by this one.
 * ===========================================================================================
 * 827 -> 1203 AT G-041, RE-TAKEN ALONE AGAIN, UNDER THE SAME ADR-0058 RULING, AND IT IS THE
 * LARGEST MOVE THIS CONSTANT HAS EVER MADE.
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution — the quantity is deterministic, so one
 * reading IS the distribution. AGGREGATION: none; one division, rounded once. REGIME: none
 * applies — no clock is read.
 *
 * WHY IT MOVED: the need RATES were re-derived (ADR-0054, ADR-0057). `refillPerTick` is now the
 * rate a FULLY APPOINTED room reaches — 14 where it was 7, with a service floor of a half — and
 * this tree carries no quality fold yet, so every room in this workload serves at that ceiling.
 * **This workload is the STARVED end of the measurement on purpose**: sixty bedrooms behind ONE
 * amenity. Its guests used to spend their stay queueing and give up; they now get served and
 * stay, and a guest that stays is a guest-frame. 8.27 -> 12.03 concurrent guests, a 45% rise
 * from a change that touched no room count and no cadence.
 *
 * **THIS IS THE MOVE THE FOLD IS EXPECTED TO REVERSE**, and saying so is the point of writing it
 * here rather than in a journal: G-037a's quality fold makes a bare room serve at the FLOOR
 * rather than the ceiling, and this workload's rooms are bare. A goal that merges it re-takes
 * this constant again and should find it heading back towards 827 — if it does not, the fold is
 * not doing what ADR-0054 ordered, and this pin is one of the two places that would say so.
 *
 * **THE GAP AGAINST THE CAMPAIGN WIDENS AGAIN AND `tripwire.mjs` PRINTS IT.** The bound campaign
 * was taken at `occupancyWhenTaken: 872`; the gap was 5.2% at 872 -> 827 and is 38.0% at
 * 872 -> 1203. The bound STAYS at 1.4640 (ADR-0056, human) and is not re-derived, and the
 * campaign is not re-taken — two of its three arms materialise their own committed content and
 * cannot be re-taken at today's occupancy at all (ADR-0058). What the ruling requires is that
 * the pin describe the hotel the gate now runs, which this re-take does.
 * ===========================================================================================
 * 1203 -> 1275 AT G-040b-ii, RE-TAKEN ALONE AGAIN, UNDER THE SAME ADR-0058 RULING. **THIS IS
 * THE RE-TAKE THE G-040 ROW ABOVE SAYS IS OWED, AND IT IS THE SMALLEST MOVE THIS CONSTANT HAS
 * MADE SINCE G-039b-alpha.**
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution — the quantity is deterministic, so one
 * reading IS the distribution. AGGREGATION: none; one division, rounded once. REGIME: none
 * applies — no clock is read.
 *
 * WHY IT MOVED: `guest-rules.json` declares `partySizeWeights: [3, 1]`, whose realised cycle is
 * **1, 1, 2** — so four guests walk in for every three arrival commands and a pair shares one
 * bedroom (ADR-0072; `party.content.test.ts` pins the cycle off a run).
 *
 * **AND THE INTERESTING PART IS HOW LITTLE IT MOVED: +6.0% FROM +33.3% MORE GUESTS.** This
 * workload is sixty bedrooms behind ONE amenity — the starved end of the measurement, on purpose
 * — so the extra arrivals are not extra residents: they reach their dissatisfaction ceiling
 * sooner and leave. **The building is not what binds it; the service is.** A goal that reads
 * this constant as "occupancy scales with arrivals" has the wrong model of this hotel, and 12.03
 * -> 12.75 against a dial that multiplies the population by 4/3 is the number that says so.
 *
 * **THE GAP AGAINST THE CAMPAIGN WIDENS AGAIN AND `tripwire.mjs` PRINTS IT.** The bound campaign
 * was taken at `occupancyWhenTaken: 872`; the gap was 38.0% at 872 -> 1203 and is 46.2% at
 * 872 -> 1275. The bound STAYS at 1.4640 (ADR-0056, human) and is not re-derived, and the
 * campaign is not re-taken — two of its three arms materialise their own committed content and
 * cannot be re-taken at today's occupancy at all (ADR-0058). What the ruling requires is that
 * the pin describe the hotel the gate now runs, which this re-take does.
 *
 * **G-037a's FOLD IS STILL EXPECTED TO SEND THIS BACK DOWN**, and the expectation is unchanged
 * by this goal: a bare room serves at the FLOOR rather than the ceiling, and this workload's
 * rooms are bare. The party dial pushes in the opposite direction and by far less.
 * ===========================================================================================
 * 1275 -> 1258 AT G-054, RE-TAKEN ALONE AGAIN, UNDER THE SAME ADR-0058 RULING. **-1.3%, and it
 * is the smallest move this constant has ever made.**
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution — the quantity is deterministic, so one
 * reading IS the distribution. AGGREGATION: none; one division, rounded once. REGIME: none
 * applies — no clock is read.
 *
 * WHY IT MOVED: G-054 stopped settling an exact tie between equally-pressed needs by ascending
 * content id and started settling it per guest (`needTieBreakRank`, ADR-0078). No content moved,
 * no room count moved, no cadence moved: the guests of this hotel now reach for different things
 * first, so they queue at different providers and their stays end fractionally sooner.
 *
 * **AND THE SIZE IS THE INTERESTING PART, AGAIN IN THE SAME DIRECTION AS THE G-040b-ii NOTE.**
 * This workload is sixty bedrooms behind ONE amenity, so essentially nobody is served whatever
 * they reach for first — **the tie-break has almost nothing to decide here, and -1.3% is what
 * "almost nothing" reads as**. A goal that expects G-054 to move a starved hotel has the wrong
 * model of it: the change acts on WHICH need goes unserved, and at one amenity the answer is
 * still all of them. The hotels where it matters are the ones above the provider bottleneck,
 * which this one is a long way below.
 *
 * **THE GAP AGAINST THE CAMPAIGN NARROWS FOR THE FIRST TIME AND `tripwire.mjs` PRINTS IT.** The
 * bound campaign was taken at `occupancyWhenTaken: 872`; the gap was 46.2% at 872 -> 1275 and is
 * 44.3% at 872 -> 1258. The bound STAYS at 1.4640 (ADR-0056, human) and is not re-derived, and
 * the campaign is not re-taken — two of its three arms materialise their own committed content
 * and cannot be re-taken at today's occupancy at all (ADR-0058).
 *
 * ===========================================================================================
 * 1258 -> 1244 AT G-046, RE-TAKEN ALONE AGAIN, UNDER THE SAME ADR-0058 RULING. **-1.1%, and it
 * is now the smallest move this constant has ever made.**
 *
 * **THE FIVE SLOTS.** WHAT: concurrent guests in hundredths, as guest-frames divided by ticks —
 * an exact deterministic integer count. WORKLOAD: `--rooms 60 --amenities 1 --arrivals 96
 * --seed 42`, 30 simulated days, this file's own constants, run through `report.ts`'s schedule.
 * SAMPLE COUNT: n = 1, which is the whole distribution — the quantity is deterministic, so one
 * reading IS the distribution. AGGREGATION: none; one division, rounded once. REGIME: none
 * applies — no clock is read.
 *
 * WHY IT MOVED: G-046 made a door a PLACE. A guest walks to the cell beside the room it is going
 * to and stands in it for a tick before it turns in, so every journey is one cell and one tick
 * longer. No content moved, no room count moved, no cadence moved; guests spend more of a stay
 * walking, and this hotel's stays end fractionally sooner.
 *
 * **AND THE SIZE IS THE INTERESTING PART, IN THE SAME DIRECTION AS THE G-054 NOTE ABOVE AND FOR
 * A DIFFERENT REASON.** This workload is sixty bedrooms behind ONE amenity, so essentially
 * nobody is served whatever they reach for and however far they walk — **the door has almost
 * nothing to change here, and -1.1% is what "almost nothing" reads as**. The arms where it bites
 * are the ones above the provider bottleneck, and G-046's own report measures those.
 *
 * **THE BOUND IS UNTOUCHED AND THE CAMPAIGN IS NOT RE-TAKEN.** The gap against the campaign's
 * `occupancyWhenTaken: 872` narrows again, 44.3% -> 42.7%, and `tripwire.mjs` prints it. This
 * constant is a RECORDED MEASUREMENT of what the benchmark holds, not a threshold: re-taking it
 * is what ADR-0058 instructs and what `workload.concurrency.test.ts`'s own failure message
 * spells out. Editing the BOUND would be the forbidden move; this is not it.
 * ===========================================================================================
 */
export const TARGET_CONCURRENT_HUNDREDTHS = 1244;

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
 * time, the quotient was believed to restore fifteen concurrent guests. **What it restored was
 * 8.72**, which is what `TARGET_CONCURRENT_HUNDREDTHS` recorded until G-023b-ii, measured; it
 * records **8.56** now, for the reason that constant gives. The literal is right and the
 * reasoning that chose it was not — so the value stays and the justification for it is now
 * "this is the cadence the shipped campaign was taken at", which is checkable.
 *
 * ===========================================================================================
 * AND AT G-023b-ii THE SHIPPED CADENCE STOPPED BEING A LOCAL MINIMUM OF THE AXIS. IT STAYS AT
 * 96 ANYWAY, AND THIS IS WHY — SAID HERE RATHER THAN LEFT FOR A READER TO INFER.
 *
 * G-032a's census found 96 sitting BELOW both its neighbours and read a mechanism off it:
 * round cadences phase-lock against a 1,440-tick stay, and the chosen ones come out extrema.
 * With travel declared the lock is gone — the same census, same hotel, same seed:
 *
 *     arrivals    90   91   92   93   94  [95]  [96]  [97]  98   99  100  101  102
 *     travel off 927  952  868  872  894  900   872   890  875  871  843  852  848
 *     travel on  897  876  885  868  867  870   856   850  839  873  836  832  845
 *
 * 96 is a local minimum of the first row and a point on a DOWNWARD SLOPE of the second.
 *
 * 1. **96 WAS NEVER CHOSEN FOR MINIMALITY.** It arrived at G-027a because `1440 / 96 = 15` was
 *    believed to restore fifteen concurrent guests — a quotient this file's own paragraphs
 *    above record as not-occupancy. Minimality was DISCOVERED by G-032a's census a milestone
 *    later; it was a finding about the axis, never the warrant for the literal. So losing it
 *    costs the value nothing it ever had.
 * 2. **MOVING IT WOULD FORCE THE RE-DERIVATION ADR-0056 JUST RULED OUT.** `arrivalEveryTicks`
 *    is one of the four fields `tripwire.mjs` compares against `BOUND_CAMPAIGN.configuration`
 *    at startup, so a new cadence makes that gate REFUSE until the whole bound campaign is
 *    re-taken — which is the question a human answered on 2026-08-21 by keeping 1.4640.
 * 3. **THE CLAIM THE CENSUS IS LOAD-BEARING FOR SURVIVES INTACT**: a reading taken at one
 *    cadence is a claim about THAT cadence and is not poolable across cadences (ADR-0015's
 *    REPLACE half, ADR-0037 amendment 2). One tick still moves the axis by ~1.6% with travel
 *    on. What was lost is the EXTREMUM, not the sensitivity.
 *
 * THE MECHANISM CLAIM IS PARKED WITH ITS TEST rather than restated: if round cadences
 * phase-lock, the travel-on minima should still fall on divisors of `stayDurationTicks`. They
 * do not — 94, 98 and 101 are the local minima above and none divides 1,440 — so the census
 * either has a different mechanism under travel or none. `PARKING.md` carries the sweep that
 * would decide it.
 * ===========================================================================================
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
