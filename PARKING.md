# PARKING

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-27, the last goal to LAND is G-051b and it CLOSES THE BUILD LOOP. `HOTELSIM.md` §1.1's fifteenth mark said the opposite in as many words — "arrivals come from the command log on a fixed cadence, so nothing a player builds changes how many guests arrive, and the build loop is an open chain that terminates in cash" — and that sentence is STRUCK. `runDemand` is a new SECOND PHASE of the tick, between `applyCommands` and `runGuests`: it derives the hotel's star rating through `starRatingIn` and puts the parties that rating earns into the same doorway a `guestArrives` fills. TWO OF THE FIFTEEN MARKS MOVE, IN THE SAME COMMIT AS THE CODE AND IN BOTH FILES — `raise demand`, which is one of the FOURTEEN TERMS, and the CLOSURE, which is the FIFTEENTH MARK and is a claim rather than a term — so the count is now TWELVE TERMS EXIST, TWO ARE OWED (`quality` and `raise reputation`, both build-loop, neither a hole in the loop) and the fifteenth mark HOLDS. THE CLOSURE, END TO END, IN EXACT INTEGERS, THREE ARMS ONE FLAG APART at `--days 30 --seed 42 --rooms 12 --amenities 2` with `--facilities` moving 0 -> 1 (which seeds ONE OF EACH of the three facility types, so THREE ROOMS, valid rooms 18 -> 21), one real CLI run each, no aggregation, regime win32/12cpu quiet: rating 3 -> 4 stars, arrivals 240 -> 480 guests, revenue 1,972,000p -> 3,944,000p, balance 1,302,000p -> 3,079,000p. THE MIDDLE ARM IS WHAT MAKES IT A MEASUREMENT RATHER THAN A COINCIDENCE: it builds the same three rooms with arrivals PINNED at the three-star rate (`--arrivals 240`) and its revenue does not move by ONE PENNY while its balance falls 195,000p — so a facility is a PURE COST exactly as ADR-0102 §3 said in prose, and the 1,972,000p belongs to the RATING. ADR-0078's dominance is removed, and it is removed through the channel G-051a built rather than by repricing anything. THE CURVE IS CONTENT (I3) — `demand.json`, one row, `partiesPerDayByStars` INDEXED BY THE RATING ITSELF because index 0 is the unrated hotel and belongs to no tier — AND IT IS THE ONE TABLE IN THIS PROJECT THAT IS DERIVED RATHER THAN A DESIGN STATEMENT. The stated requirement is "a hotel that meets a tier's own requirements can FILL THE BEDROOMS THAT TIER ASKS FOR", which with `star-tiers.json`'s bedroom minimums and `guest-rules.json`'s 1,440-tick stay against a 1,440-tick day forces [0, 1, 3, 6, 12, 24] and leaves NO VALUE CHOSEN; `partiesPerDaySchema` carries the derivation at the point of use and `demand.report.test.ts` re-runs the arithmetic against all three files ON DISK, so a ladder retune reddens it and says the curve is now a claim nothing supports. ONE NUMBER IN IT IS A DESIGN STATEMENT AND IS LABELLED ONE: the headroom multiple is 1.0 — no slack — and the requirement is MET at that multiple rather than asserted, 232/240, 464/480 and 928/960 housed at three, four and five stars, 96.7% at every rung with the shortfall being the walk to the room. THE SEED STILL HAS NO ECONOMIC EFFECT AND THAT WAS CHECKED RATHER THAN INHERITED: `demand.ts` is integer arithmetic on the tick counter and draws NOTHING, so three seeds over 365 days give byte-identical arrivals, revenue and balance with only `world.stateHash` moving. A per-tick PRNG draw was the obvious build and is refused for an evidence reason rather than a purity one — it would have made the seed an economic axis for the first time and demoted every economic figure in this project from a READING to one draw of a distribution. NOTHING IS STORED: no demand and no rating on `World`, so SAVE STAYS v24, there is no migration, no `without-*` stripper and the permanent v1 fixture is untouched (ADR-0006); `starRatingIn` is memoised behind the `ValidityCache`, which is outside state by construction, and the phase costs ONE MULTIPLY, ONE MODULO AND ONE COMPARISON on the 1,416 ticks a day that open no demand slot. THE HARNESS CLAMPS BY DEFAULT AND THAT IS WHY THE WHOLE EVIDENCE BASE SURVIVES: `loadContent`'s new `Market` parameter defaults to `commanded`, which READS AND VALIDATES `demand.json` and then WITHHOLDS it from the injected registry, so the fingerprint is missing a KEY rather than carrying an empty one and A CLAMPED RUN WAS BYTE-IDENTICAL TO THE RUN IT ALWAYS WAS — the default CLI arm hashed `c455f8fc521180e8` and the determinism gate hashed `c967bdb98dac9b0d`, both PREDICTED BEFORE THAT RUN AND BOTH UNMOVED BY IT, as were save v24 and summary 4. **BOTH OF THOSE HASHES ARE STALE AS OF THE UNCOMMITTED G-059 AND ARE KEPT IN THE PAST TENSE RATHER THAN RESTATED: the I2 gate now hashes `5ec2e730e128d91c` and the default CLI arm `20d40348d9b196bc`, both measured. See the STAMP INVERSION note at the foot of this stamp.** `--arrivals` is therefore no longer the world, it is a LABORATORY CLAMP, and `--demand` releases it; the two are REFUSED TOGETHER because a run with both sources firing is a measurement of neither. `apps/game` takes the curve unconditionally and `scenario.ts` no longer issues a single `guestArrives`, so the loop closes in the one place a human can watch it. THE I2 GATE COVERS THE PHASE AND NOT ITS ARITHMETIC, stated narrowly rather than left to be assumed: `determinism-log.ts` is COMMANDED, so `runDemand` runs on all 100,000 of the gate's ticks — preconditions, `demandRun` flag, return-by-reference, position — while not one slot opens under it. The arithmetic is covered by `demand.determinism.test.ts` in the gate's own four-check shape WITH A CENSUS proving the path fired (112 and 17 guests that no command log names), and by an exhaustive unit test over every party count the slot table can express, because `slots / parties` truncating is right at 1, 2, 3, 4, 6, 8, 12 and 24 and wrong at 5, 7, 9, 10 and 11. THE TICK'S EXHAUSTIVE PHASE SEARCH GREW 17.2x AND WAS KEPT EXHAUSTIVE: a sixth phase takes it from 19,531 sequences to 335,923, the flat enumeration TIMED OUT at vitest's 30,000ms under full-suite load while passing in 13.07s alone, and capping it was refused because the only thing that search has ever caught is a phase that could be DROPPED or DUPLICATED and both live at exactly the lengths a cap removes. It is now a PRUNED WALK whose prune is a proof — `runPhases` aborts at the first phase that throws, so every extension of a throwing prefix throws at the same phase — with a `covered` counter asserted equal to the whole space so the prune cannot quietly become a cap. Proof-of-bite: drop the `demandRun` clause and TWO sequences survive instead of one, sha256 identical after restore. AND THE GOAL FOUND A PRE-EXISTING LAW THAT ASSERTS SOMETHING FALSE, WHICH IS STRUCK RATHER THAN ROUTED AROUND: `report.ts`'s "no room type provides it => met - metByItem MUST be 0" is contradicted by `byItem`'s own docblock in `needs.ts`, which has said since G-028b that `metByItem` UNDER-counts and that a row can count into `met` having been served by no room at all. `met` became the top per-need BAND over the stay (ADR-0037), so a guest EVICTED before anything served a need is trivially in that need's top band. `--days 5 --seed 42 --rooms 24 --amenities 1 --demolish 2880 --demand` gives 4 `evictedRoomGone` and `guest_comfort` at met 32 / metByItem 31, and the report REFUSED A LEGITIMATE RUN AS A VIOLATION. No commanded schedule can reach it — `schedule` starts both walks at `BUILD_START_TICK` and commands apply in log order, so an arriving party always claims its room AFTER the same tick's demolition — which is why seven seeds times four cadences found nothing. WHAT IS LOST IS NAMED: the round-2 note claimed the law fired in BOTH directions and only the ITEM direction survives, so a build that attributed an item-served need to a ROOM is now caught by nothing; the repair is a third counter, `metByNothing`, which is a `World` field and therefore a save bump, and it is PARKED WITH ITS TEST ALREADY RUN. `byItem`'s falsified clause — "it belongs to the lodging row rather than to an engagement one" — is corrected in place, and `provider.report.test.ts`'s bite case is INVERTED rather than deleted so the absence is pinned instead of looking like a gap nobody measured. SWEEP 1 THEN FOUND THE SAME CLASS SIX MORE TIMES IN THIS GOAL'S OWN BLAST RADIUS, AND THE CLASS IS ADR-0084's: a claim that was true when written and that THIS COMMIT falsified. `commands.ts` and `guests.ts` both said the command log "fully describes who arrived and when (I2)" — the stated determinism argument for `guestArrives` being payloadless, and false under `--demand`, where this goal's own test pins 112 and 17 guests no command log names. What I2 rests on is now written where those sentences were: SAME SEED + SAME COMMAND LOG + SAME INJECTED CONTENT, with arrivals replayable because `demand.ts` draws nothing. Four more deferrals died the same way — "party formation becomes random when demand does, which is M4" in `guests.ts` and `packages/content`'s schema (demand arrived and IS NOT random, so the event retired nothing), "until M4 gives arrivals a demand model" in `content.ts` (it did, and the party cycle did not move), `report.ts`'s "a fixed cadence stands in for it" 1,150 lines above the same file's new and correct "IT WAS THE WORLD AND IT IS NOW A CLAMP", and `apps/game/src/scenario.ts`'s "there is no demand model until M4" 120 lines above the banner this same commit added saying the stand-in had expired. RE-RUNNING THE SWEEP AFTER FIXING THOSE FIVE FOUND A SIXTH FAMILY — four test files justifying an untuned `partySizeWeights` with "demand is M4's" — and THE VERIFICATION PASS THEN FOUND AN ELEVENTH AND A TWELFTH THAT SPLIT THE CLASS IN TWO. Mode (1) is THE DATE PASSES AND NOBODY LOOKS, which is the first ten. Mode (2) is THE DATE NAMED WAS NEVER THE REAL TRIGGER, and only reading past the first paragraph finds it: `cli.stdout.test.ts`'s seed-honesty test carried a STANDING INSTRUCTION TO DELETE ITSELF addressed to "whoever lands the M4 demand model" — that landed HERE and the test did NOT go red, because `demand.ts` draws nothing, so obeying it would have deleted a guard that had just become PERMANENTLY VALID rather than expiring, and its own docblock stated the true trigger four lines below the false one ("the moment GUEST BEHAVIOUR READS THE RNG"). `PARKING.md` carried the same promise ending "-> M4, as a planned retirement" and now points at a GOAL rather than a milestone. THE TWELFTH IS `PARKING.md`'s amenity-scale item, which carried BOTH modes at once and whose falsification test was RUN rather than re-parked: at `--rooms 12 --facilities 1 --demand`, one run per amenity level, the AFFORDABLE density is TWO sets (balance 3,079,000p against 1,276,000p and 2,944,000p) and the top review band is UNANIMOUS there, so it resolves in its first branch — the scale needs a term oversupply cannot buy — and routes to E-014. So the grep is NECESSARY AND NOT SUFFICIENT: it surfaces a mode-(2) site and tells the reader the wrong thing about it, and the rule that follows is that A DEFERRAL NAMES AN EVENT THE ARTEFACT CAN OBSERVE — "a milestone lands" is not one, "a guest draws from the stream" is. In every one of the twelve the ARGUMENT survived and only the DEFERRAL died, which is why each is a rewrite rather than a deletion; two further sites in DONE goal blocks and one in the M0 sign-off record are LEFT ALONE on ADR-0008, because the test is whether a sentence is a LIVE INSTRUCTION to a future reader and not whether it names a milestone. THREE REGIONS WHERE A BUILD DOES NOT PAY, AND THE THIRD IS THE SHARPEST THING THIS GOAL HANDS TO G-060. Two are FLAT: capped at 3 below the facility gate (bedrooms 7 through 11 cost upkeep and earn nothing), and flat at 5 above the top tier, where a five-star hotel that keeps building banks 192,228,000p over 1,000 days with nothing left to buy — `--rooms 24 --amenities 3 --facilities 1 --demand --days 1000 --seed 42`, 32,000 arrived, one run, exact integers. THE THIRD IS NEGATIVE AND THE DEFERRAL DID NOT NAME IT: taking the FIFTH STAR raises the rating, doubles arrivals exactly as the curve promises, and LOSES MONEY, because tier 5 doubles the bedroom clause while its amenity clause counts VARIETY and never LOAD. `--days 30 --seed 42 --amenities 2 --facilities 1 --demand`, ONE BEDROOM APART: 23 rooms is 4 stars, 480 arrived, 3,944,000p, 0 dissatisfied; 24 rooms is 5 stars, 960 arrived, 3,867,500p and 477 dissatisfied — revenue down 76,500p, balance down 151,500p, and over a year 49,504,000p against 47,846,500p with 6,026 dissatisfied. THE CLAMPED CONTROL NAMES THE COST AS DEMAND'S: the identical build at `--arrivals 120` is 75,000p of pure upkeep with zero dissatisfied. The correct play under the shipped tables is now "never take the fifth star unless you also add a third amenity set", worth +48,591,500p over a year, AND NOTHING IN THE GAME SAYS SO. It is pinned in `demand.report.test.ts` and goes RED when G-060 fixes it; the test that used to claim "the curve is monotone SO no building is strictly punished" is retitled to what it actually checks, because monotone in the CURVE is not monotone in the OUTCOME. (`90,864,000p` stood in six places here as the five-star figure and is the FOUR-star hotel — ADR-0103 §3's seed-invariance arm — wrong by 2.1x and load-bearing; a number quoted without the arm that produced it arrives meaning something else.) THE AMENITY BOTTLENECK IS THE FINDING TO HAND ON, AND THE NOVELTY CLAIM IS NARROWED TO WHAT A `--demand` ARM SUPPORTS: the bottleneck itself is pre-existing and was always visible to a harness that supplied enough arrivals, so an arm under the clamp says nothing new by this goal's own byte-identity argument. WHAT IS NEW IS THAT A PLAYER CAN NOW REACH THAT ARRIVAL RATE BY BUILDING — measured under `--demand` at 24 bedrooms and five stars, a third amenity set moves revenue from 3,867,500p to 7,888,000p over 30 days and takes 477 dissatisfied departures to zero. Amenity capacity is the largest un-bought improvement in this economy and it is discoverable only through the departure table. BOTH TAILS CHECKED, AND EACH FIGURE NAMES ITS ARM. `--rooms 1 --amenities 0` ends a year at -412,500p under BOTH regimes; `--rooms 0 --amenities 0 --build 1440` ends at -662,500p under BOTH. Demand never changes the loss, only who is disappointed: 486 and 485 departures that paid nothing, against 5,837 under the clamp on each — a twelfth as many. Overbuilding is punished and survivable: 24 bedrooms with one amenity set is 3 stars and +1,709,500p over a year under demand, against -21,784,500p when a harness supplied 24 parties a day to the same building. Winning is not automatic — from nothing at `--build 1440` the hotel reaches 3 stars and +197,000p over a year, solvent, where the same campaign under the old clamp ends at -428,500p. GATE READINGS, FROM THE PROCESS: `pnpm verify` FOURTEEN ROWS, VERIFY_EXIT read out of a log. Unreliable: 2 gates, 0 defects, and a THIRD is a stop condition (§2.0) — **but the two are not in the same state, and the difference is a MARGIN rather than a tally.** **I4 went unreliable at G-059's sweep 1**: the same tree on the same machine failed one run and passed three, and the cause was FOUND rather than reinterpreted — `demand.report.test.ts`'s *"ONE BUILD ON THE SHIPPED LADDER"* case had no declared budget and fell to the shared 30,000ms, with in-suite readings of 27,761 / 19,661 / 18,722ms. **Run-to-run noise on an identical tree is 1.41x and its headroom was 1.08x: the budget was smaller than the contention.** REPAIRED IN THE SAME GOAL with the house pattern — a declared **90,000ms against a worst-ever in-suite reading of 27,761ms, which is 3.24x against noise of 1.41x** — and the shared literal was NOT raised. **THAT RATIO IS THE DISCHARGE AND IT NEEDS NO FURTHER RUN.** An earlier draft of this line counted GREEN RUNS instead and called I4 *unreliable-until-a-second-observation*; that adopts the very thing §2.0 forbids, because *green on the run I took* carries exactly as little as *red on the run I took*. **A tally of passes is not evidence about an instrument; a margin over measured noise is.** And the budget change RESETS THE CLOCK correctly: every green taken at 30,000ms observed a DIFFERENT instrument and says nothing about the 90,000ms one. **`check:scaling` is the unrepaired one for the two reasons I4 no longer has: no found cause and no margin.** E-014 was OPEN ON THE HUMAN at G-051b and that goal did not touch `reviews.ts`, `needBandOf`, `isCutShort` or the review scale. **E-014 IS NOW RULED (ADR-0104, human): the review is a measurement of the WHOLE STAY INCLUDING FACILITIES, the mean survives, and G-059 changes all four of those things. THAT WORK IS UNCOMMITTED AT THIS STAMP.** **STAMP INVERSION, AND THE FIRST EXPLANATION WRITTEN HERE WAS WRONG — THIS ONE IS MEASURED. The digest BODIES below carried G-059's new hashes correctly while this AS-OF LINE did not, the reverse of ADR-0039 §1's four recorded failures. The cause is not what this line first claimed. `digestOf` (stamp.mjs) slices from `## DIGEST` to the `---`, WHICH INCLUDES THIS AS-OF LINE, and `factViolations` takes the FIRST match — so `check:stamp` READS THE STAMP AS THE BODY. Measured across all four ledgers: `save`, `summary` and `I2` all resolve INSIDE this line; only `measure golden` resolves in the body, and only in GOALS.md and JOURNAL.md, because DECISIONS.md and PARKING.md carry no golden at all. And the I2 fact declares `shipped: null`, so `factViolations` skips the tree comparison entirely — **the I2 hash is compared against NOTHING**, only against three other copies of the same sentence. That is how this line rotted with the gate green. **IT IS INHERITED, NOT G-059's**: the same probe against HEAD reads `i2=c967bdb98dac9b0d(STAMP)`. Parked with its invocation; the gate is NOT edited here.***

- **261 BULLETS and 55 SECTIONS** — two units, both named, because they are **two denominators and
  this line stated one figure under the other's noun** (§4.1). Counted below the digest so neither
  includes itself: `awk '/^## /&&!/DIGEST/{f=1} f' PARKING.md | grep -c '^- '` gives the bullets,
  `grep -c '^## '` gives the sections. **The method is stated because the previous figure could not
  be re-derived** (`CLAUDE.md` rule 5) — **and re-running it at G-053a returned 261 against a stated
  257, with the same 261 at the previous commit**, so the number had gone stale by four without
  anybody re-deriving it. *(Re-derived at G-055, which added a SECTION and no bullets — 261 and 50.
  The bullet count is unchanged because G-055's three items are prose blocks; **the two units moving
  independently is the reason this line names both.**)*
  **RE-DERIVED AT G-051a AND THE SECTION FIGURE WAS STALE BY THREE — the stated method returns 53 at
  HEAD, not 50**, so three sections landed between G-055 and here without this line moving. It is 54
  now, and **the sixth instance of the class this bullet exists to record.**
  **AND THE BULLET COUNT IS FLAT ACROSS THREE GOALS AT 261, WHICH MUST NOT BE READ AS "PARKING HAS
  STOPPED GROWING" (§9).** G-055, G-052a and G-051a all wrote NUMBERED PROSE ITEMS rather than `- `
  bullets, so the counter's own unit does not see them — **five items landed at G-051a and the
  number did not move.** *The stop condition is about scope leaking into goals; read it off the
  SECTIONS, or off the items, and not off a grep for a hyphen.*
  **Newest source: G-051a** (five items at BUILD — the palette's seven-room ceiling, the colour
  field's case, the rating's missing perceptual channel, the saturation G-051b inherits, and why a
  facility cannot cheaply require equipment — three more at SWEEP 1 — the viewer palette has
  no gate, five stars is unreachable by play, and **a test that recomputes its claim's own
  definition** — and **three at SWEEP 2, one of which WITHDRAWS a sweep-1 item**: item 7's own
  falsification test refuted it the day it was written, so it is struck in place and replaced by
  **the two tier clauses that cannot both be satisfied** and **the player walk's two distinct
  stranding defects**), before it **G-052a**, before it **G-055** (three things the
  timeout repair measured and did not fix), before it **G-053a** (is `capacity` vacuous on non-lodging types),
  **each item with its falsification test attached** (§4). **G-020a's zero is discharged**;
  the §9 warning that PARKING must keep growing stands for next time.
- **THE DWELL TERM IS NO LONGER A HYPOTHESIS.** Parked at G-014b PLAN with its test; the same
  goal's WATCH *was* that test and returned **positive** — 35 of 38 abandonments leave a need
  past half its `satisfyTicks`. **Fourth parked hypothesis settled by a goal that did not plan
  to run it; first time the goal that parked it also answered it.** A margin cannot guarantee
  completion — that needs `M >= 12000`, over the 10000 ceiling.
- **DISCHARGED AT G-057 (ADR-0093)**: scenario capital was a **hard prerequisite of M4** and the
  MECHANISM is built — a scenario declares `openingCapitalPence`, read once by `createWorld`.
  **AND THE "~75%" THIS LINE CARRIED FOR TWO MILESTONES WAS WRONG**: re-measured on the tree it is
  **150% at the default invocation and 1,575% at the `--rooms 60` bench**, because `--amenities`
  seeds one of EACH of three amenity types and the old figure counted bedrooms only. **The flip
  from `supplementsCapital` to `drawnFromCapital` is M4's first act**; it is one content field.
- **The costed lever, pinned and unpulled**: sampling the guest-store scan recovers
  **18.4%** of I5. Gating on change detection is **dead and measured** — do not re-argue it.
- **Heaviest clusters**: M3 owes movement, queues, distance-as-a-score-term (**and the
  spread that scoring cannot fix**) — **G-023 takes movement, G-024/G-025 the queues, G-026
  the score term, and M3 exit must answer or re-park whatever none of them reached.**
  M6 owes `placeItem`, item cost, archetypes.
- **NEWEST, FROM G-022**: the stamp gate's **CRLF splice hazard** — `findStamp` indexes by
  `\n` while `replaceStamp` splices by the file's own newline, live but dormant by where a
  newline falls, **in the gate whose job is keeping four ledgers agreeing** ·
  `hysteresis.report.test.ts`'s load sensitivity · and **dependency-cruiser is the largest
  unbitten scanner left, and it sits inside I1** — its six forbidden rules have never been
  observed red by any committed test.
- **Watch for**: privacy as a room-type property — content can put a provider in a bedroom
  today and a stranger walks in. **No linter is still configured** (verified 2026-08-12).

---

Everything discovered mid-goal that is not in the goal. It gets written down here and
it does not get built now (`HOTELSIM.md` §4).

If a proposed feature does not feed the guest loop, the money loop or the build loop,
this is where it lives — not in the sprint.

**PARKING.md not growing is a stop condition** (§9). It means scope is leaking into
goals instead of being deferred.

Format: one line, with the goal or session it came out of and where it belongs.

---

## Deferred during bootstrap (2026-08-07)

- **Lint and format (ESLint / Prettier / Biome)** — no linter is configured. The six
  invariant gates plus strict TypeScript are the quality bar for M0. Revisit after M0
  sign-off; a linter now would generate churn the critics have to read past.
- **Coverage thresholds** — `pnpm test` reports coverage but enforces no number.
  Deliberate: §9 lists "test coverage added to satisfy a number rather than to pin
  behaviour" as an anti-pattern. Revisit only if coverage turns out to be falling.
- **Git hooks / pre-commit `pnpm verify`** — CI runs it; local hooks can wait.
- **Migration test fixtures** — `packages/sim/src/save.ts` has an empty migration list
  because nothing predates v1. The first real schema bump needs a stored v1 fixture
  blob committed to the repo so migrations are tested against real old data, not
  against a synthesised one. -> G-003 or first bump after it.
- **`Set`/`Map` iteration-order detection in the determinism gate** — statically
  undecidable in general, so `test:determinism` bans the wall-clock and unseeded-random
  sources mechanically and leaves iteration order to `sim-critic`'s failure catalogue.
  Revisit if a real divergence ever slips through.
- **A `--json` output mode for `sim:run`** — the balance critic's standing mandate is to
  run 1000-day simulations across many seeds and report a distribution. Parsing the
  human-readable summary will get old. -> M4, or G-006 if it is cheap.
- **Benchmarking tick cost against agent count** — `sim:bench` measures total wall time
  for 365 days, which catches a slowdown but does not tell you whether cost is linear
  in agent count. §6.1 asks `sim-critic` to watch for worse-than-linear growth; a
  dedicated scaling bench would make that mechanical. -> M3, when there are enough
  agents for it to mean anything.
- **`packageManager` / corepack** — pnpm was installed globally via npm because corepack
  could not write shims into `C:\Program Files\nodejs`. CI pins pnpm explicitly, so this
  only affects local dev on this machine.

## Deferred out of G-001 (2026-08-07)

Raised by `sim-engineer` at PLAN and deliberately kept out of the diff.

- **Typed component data on entities** — position, occupancy, need vectors. `Entity` is
  `{id, kind}` and nothing more at G-001. -> G-002 / G-004.
- **A system registry / ordered `runSystems` phase** — the slot between `applyCommands`
  and `commitEntities` is documented in a comment in `tick.ts`. Deliberately not written
  as an empty phase named after a feature that does not exist. -> the first goal that
  needs a second system.
- **Command acknowledgements** — the host learning which id a `spawnEntity` produced.
  Predictable today because ids are monotonic, but brittle to rely on. -> whenever a
  host actually needs it.
- **Validating `Entity.kind` against injected content at spawn time** — needs the content
  pipeline to exist. -> G-002.
- **`assertWorldShape` rejecting unknown top-level keys** — real hardening, belongs with
  the migration work rather than ahead of it. -> G-003.
- **Secondary indices (`kind -> EntityId[]`)** for O(1) queries by kind. Would be derived,
  rebuilt on load, never hashed. Not needed until a query is measurably slow. -> M2/M3.
- **Entity generation counters** for stale-handle detection. Monotonic non-reused ids
  already make a stale handle *fail* rather than *alias*, which is the property that
  matters. -> only if handles start being held across saves.
- **`spawnedAt` on `Entity`** — would make phase ordering directly observable in state.
  Probably useful, but G-004 may want `Entity` shaped differently. -> G-004.
- **`sim:bench` (I5) does not exercise the entity store** — the CLI runs with no command
  schedule, so 365 days simulate zero entities and the bench says nothing about tick cost
  under load. Fixing it means giving the CLI a real workload, which is G-006's day cycle.
  -> **G-006, treat as a dependency**. This sharpens the earlier parked item about
  benchmarking tick cost against agent count.

## Deferred out of G-002 (2026-08-07)

Raised by `sim-engineer` at PLAN. The first two are **gate defects** — gates are
orchestrator-owned (ADR-0004), so they are fixed in their own labelled commit rather
than inside a feature diff.

- ~~**GATE DEFECT — `check:content` skips wrapper objects.**~~ **RESOLVED `8f1b7ff`.**
  The old logic inspected **0 ids** for any wrapper-object or nested file while reporting
  "ok". Now walks the document depth-first with a JSON-path breadcrumb; a file yielding
  no ids at all, and duplicate ids, are both violations.
- ~~**GATE DEFECT — the snake_case pattern is written twice.**~~ **RESOLVED `8f1b7ff`.**
  `tools/gates/lib/content-id.mjs` is now the source of truth, with
  `content-id-agreement.test.ts` cross-checking it against the live Zod schema on 16
  hand-picked and 729 generated ids — two live values, not a copied literal.
- **A `--content <path>` flag for `sim:run`** so a host can inject alternative content,
  and so the CLI's non-zero exit on bad content is testable without a temp repo.
  -> G-006, or whenever the balance sweeps need it.
- **Projecting the content fingerprint to sim-visible fields only** — today *any*
  injected field moves the fingerprint, including display-only text, so a typo fix in a
  room's `name` invalidates saves. Conservative direction (false alarm, never silent
  divergence), deliberately chosen at G-002. -> revisit when content churn makes it hurt.
- **Migrating saves across a content change** — today the answer is "refuse to load, with
  a legible error". Accepted for M0, where a content edit genuinely is a different
  simulation. It will not survive M6, where content churn is constant. -> M5/M6.
- **Rooms as spatial entities** — grid position, enclosure, doors. G-002 gives the sim a
  room *type*, not a room. -> M1.
- **Room variety, items, staff roles, guest archetypes** (M6) and **construction cost**
  (M1). The schema is deliberately one table with four fields.
- **`apps/game` loading content** -> M5, and not before M0 sign-off (§9).

## Deferred out of G-004 (2026-08-07)

Raised by `ai-engineer` at PLAN and BUILD, and deliberately kept out of the diff.

- **A demand model inside the simulation.** Arrival is a `guestArrives` COMMAND issued by
  the host, on a fixed cadence, because how often guests turn up is demand and demand is
  M4. The consequence to keep in view: `--seed` does not yet change guest behaviour at
  all — the guest loop draws no randomness — so `sim:run --days 30 --seed 7` and
  `--seed 8` differ only in the RNG stream carried in state. -> **M4**, and note it
  against G-006 so nobody reads `--seed` as a claim about guest variety.
- **`--rooms` and `--arrivals` flags for `sim:run`.** The CLI seeds a fixed 3 rooms and
  one arrival every 120 ticks, as named constants. Tuning them from the command line is
  useful for balance sweeps. -> **G-006**, with `--json` and `--content`.
- **A room -> occupant index. ~~MEASURED THRESHOLD: I5 FAILS ABOVE ~50 ROOMS.~~ -> M1,
  not M2/M3.** Finding a free room is O(rooms) per waiting guest per tick, so the guest
  loop is O(waiting x rooms). `ai-critic` measured it at G-004, balanced hotel, 365 days.

  **THE THRESHOLD, ITS TABLE AND THE CONCLUSION THEY SUPPORTED ARE ALL WITHDRAWN AT
  G-018.** Four rows of absolutes and a 365-day projection against the invented 10s
  budget, taken in a session nobody can re-enter (`CLAUDE.md` rule 5). "I5 fails above
  ~50 rooms" was a statement about that budget and not about this simulation: taken at
  face value, the worst row's 27.7s is **~7% of the derived budget**, so the conclusion
  reverses whether or not you trust the number. What survives needs no stopwatch, and it
  is why the item was right for reasons the threshold was not carrying:

  - **The shape.** Per-tick cost rose ~52x between the 3-room and 75-room arms of one
    sitting, for 25x the rooms and 35x the guests — superlinear in the product.
  - **The isolation.** 1,000 rooms with 0 guests, and 1 room with 5 guests, were both
    cheap in that same sitting: neither term alone matters, the product does.

  **The routing stands on those grounds rather than on the withdrawn threshold** — and it
  was executed. **M1 is the milestone that hands room count to the player**, so it met
  this as a known cost, the way ADR-0006 made G-004 meet the save fixture; G-010 then
  removed the product term with a candidate-list scan and a release-counter short-circuit
  rather than with the index below. Deliberately NOT optimised at G-004, because the
  bench ran 3 rooms and neither G-005 nor G-006 added any: **optimising against a gate
  that is not failing is speculative work.** That argument never depended on where the
  gate sat, which is the one part of this entry the re-derivation leaves untouched.

  If it is ever built it is DERIVED state — rebuilt on load, never saved, never
  authoritative — because the single source of truth for a reservation is the field on
  the guest, and a second copy is exactly how this class of leak is normally introduced.
- **The per-tick guest invariant scan, severable from the index above.**
  `assertGuestStoreInvariants` and `assertGuestOutcomes` run on **every** tick and cost
  ~7.24 µs/tick at 96 guests — roughly a quarter of that case's total — rebuilding a `Set`
  and binary-searching per resting guest, 1,440 times a simulated day, to check a
  postcondition the tick cannot violate. Defensible at 3 guests, load-bearing at 100.
  Cheaper to address than the index and independent of it: sample it, or gate it behind
  the same reasoning that makes `commitEntityDraft` return by reference on an idle tick.
  **Do not simply delete it** — it is what makes a reservation leak loud, and it runs at
  load as well as at commit. -> M1, with the index.
- **`appendTransaction` copies the whole log on every append — MEASURED at G-005,
  survives M0 and the critic's sweeps, breaks at M4 density.** economy-engineer's
  benchmark (median of 5): 3,650 appends (365 days) 19ms · 12,000 (1000-day sweep) 299ms
  · 24,000 (~2x M4 density) 3.1s · 120,000 did not finish in 120s — allocation is ~n²/2
  elements and GC dominates. Restructuring now would change the hashed shape of
  `World.ledger` and owe a migration for a problem M0 does not have. ~~Trigger: ~15k
  appends per run.~~

  **CORRECTED AT G-010 — the trigger was off by ~3x and the standalone benchmark
  over-predicted in-run cost by an order of magnitude.** G-010 profiled the *real run*
  with `node --cpu-prof` and measured this at **0.7% of self-time at 22,245 appends** —
  past the old trigger and immaterial. The knee does arrive, roughly an order of
  magnitude later than the microbenchmark implied: **13.1% at 43,800 appends**.
  **Corrected trigger: ~40k appends per run.** The shape of the concern was right; its
  location was not. This is the **second parked measurement in two goals** taken where
  the thing it measured was not the thing that drives cost — a standalone benchmark of
  one function is not a measurement of a system, and this record should not carry
  another one without a profile beside it. -> M4.

## Deferred out of G-010 (2026-08-08)

- **I5 CAN NO LONGER BE SIZED BY ROOM COUNT, and that is the goal's own success.**
  G-010 made tick cost **O(guests), not O(rooms)** — idle rooms are free. Measured at
  365 days with arrivals held constant, ~~`--rooms 20` 6,643ms · `--rooms 60` 6,653ms ·
  `--rooms 120` 6,877ms~~ — the absolutes are withdrawn at G-018, and the ratio that
  carried the point survives them: **20, 60 and 120 rooms all landed within 4% of each
  other in one sitting.** So the bench's `--rooms 60` meets G-010's criterion by its
  letter while measuring roughly what a 20-room hotel would. The honest axis is
  **concurrent guests** (`--arrivals`). Recorded in `bench.mjs` itself so the next
  person sizing that gate meets it. -> whichever milestone next touches I5's shape.
- ~~**A busy 60-room hotel does not fit in the 10s budget.**~~ **WITHDRAWN AT G-018 —
  BOTH THE FIGURES AND THE CLAIM.** It rested on `--arrivals 16` (~30 concurrent) at
  10,849ms and "108%", and on the shipped arm's "45%", all absolutes against the invented
  budget and none re-measurable paired. Against the derived budget a busy 60-room hotel
  fits several times over, so the claim is simply false now, and the "headroom, not
  realism" justification for `--arrivals 32` dies with it — `bench.mjs` has been rewritten
  to rest that choice on comparability with the pinned goldens instead.
  **What survives, and it is the part that was always worth parking:** occupancy, not
  room count, is what makes the guest path expensive, and the gate's workload is a
  quarter-occupied 60-room shell rather than the busy hotel the requirement names.
  -> M3/M4, when circulation and wages make the guest path heavier anyway.
- **`assertGuestStoreInvariants` is now 14.7% of tick self-time** (was 5.3%), because
  everything around it got faster. Its allocations are gone; what remains is a binary
  search per resting guest, **linear in guests, not rooms**. Deliberately neither gated
  nor sampled — it is what makes a reservation leak loud, and it runs at load too.
  -> revisit only with a number.
- **Guest-object churn** — one allocation per resting guest per tick, inherent to the
  immutable design. -> only if a profile puts it above the invariant scan.
- **The I2 gate has no reference hash**, so it compares runs to each other and can never
  catch a *consistently* wrong result. A stale cache that is stale identically every run
  passes it. This is correct for what I2 is — a determinism gate, not a correctness one —
  but it means cache-invalidation clauses 4 and 5 (content identity, bounds equality)
  **cannot be witnessed at the gate by construction**, because the harness runs one
  content and one plot per run. Their witnesses are unit tests, and the reachable case is
  a host stepping two worlds with one cache. Recorded so nobody assumes I2 covers it.
- **Splitting the outcome tally by reason.** `unsatisfied` is "gave up waiting" and
  `evicted` is "the room stopped existing"; when guests can fail for more reasons than
  that, the tally wants to become a table rather than four counters. -> M2, with reviews.
- **Party size.** `capacity` is the size of the party a room holds, and a party is one
  guest at M0, so a room takes at most one booking. Multi-guest parties need arrivals to
  carry a size. -> M1/M6.
- **Need decay and the need vector.** One need, formed on arrival, satisfied by one
  provider, with no decay and no scoring. -> M2.
- **Reviews.** A guest leaves with a recorded outcome, not an opinion. The outcome is the
  raw material a review is computed from. -> M2.
- **Moving payment to nightly settlement.** DECIDED AT G-005: payment stays at departure.
  The goal statement names two events on purpose — revenue is guest-driven, upkeep is
  clock-driven — and per-night charging is proration, which is pricing, which is M4.
  `runSettlement` is exactly where M4's per-night pricing lands, by deleting the
  `payForStay` call and adding one fold. -> M4.

## Deferred out of G-005 (2026-08-07)

Raised by `economy-engineer` at PLAN.

- **Bankruptcy / game-over on a negative balance.** The fold is signed, nothing gates on
  it, and the sim ticks on below zero (pinned by test). Clamping would require the stored
  balance I4 forbids. -> M4.
- **Per-room settlement itemisation.** One aggregated upkeep transaction per night at M0;
  a per-room breakdown is a reporting feature. -> M4.
- **Migrating legacy free-text reasons into the union.** DECLINED PERMANENTLY unless a
  goal needs it: rewriting history to satisfy a type invents semantics, needs v3, and
  breaks the v1 fixture's pinned hash for nothing. The union governs what the sim
  *writes*; `assertTransaction` at load requires only a non-empty string.
- **The M4 rounding rule** — round half up, once, at settlement. G-005 needs no rounding
  at all (integer sums and products only); the rule is stated in `settlement.ts`'s header
  so M4 inherits a decision rather than an accident. -> M4.

## Deferred out of G-006 (2026-08-07)

Raised by `sim-engineer` at PLAN.

- **Per-day time series in `--json`.** Balance sweeps will want trajectories, not
  endpoints. The M4 sweep tooling is the consumer; `SUMMARY_SCHEMA_VERSION` exists so
  the shape change is a detected version bump, not a misparse. -> M4.
- **A multi-seed sweep driver** (`--runs N` or similar). Until M4's demand model, seeds
  are one anecdote — the balance-critic can shell-loop. -> M4.
- **A JSON Schema document for `RunSummary`.** Only if a consumer outside this repo ever
  appears. -> never, unless.
- **`--ticks` + `--json` partial-day semantics** — a partial-day run reports
  `nights < days` because `dayOf` floors. Correct; noted in `report.ts`'s header; nothing
  built. -> if a consumer ever trips on it.
- ~~**The seed-honesty test is designed to go red at M4.**~~ **RE-POINTED AT G-051b, AND THE DUE
  DATE WAS BOUND TO THE WRONG EVENT.** `cli.stdout.test.ts` asserts seeds 42 and 43 differ only in
  the seed and state-hash lines. **M4's demand model landed at G-051b and the test did NOT go
  red**, because `demand.ts` draws nothing — so the retirement this item promised would have been
  the deliberate deletion of a guard that had just become permanently valid. **The real trigger is
  not a milestone at all: it is GUEST BEHAVIOUR READING THE RNG**, which the test's own docblock
  stated correctly four lines below the wrong one. -> **the goal that makes `stepGuests` draw**,
  which is the event this test can observe.

  **AND THE FIRST RE-POINT NAMED AN OWNER AND STATED IT AS A TRIGGER, WHICH IS THIS ITEM'S OWN
  DEFECT COMMITTED IN ITS OWN REPAIR.** It read *"-> item 12 (stochastic demand), and only if that
  goal is taken"*. **Item 12 would not fire this test.** `runDemand` is `TICK_PHASES[1]` and
  `stepGuests` is reached from `runGuests`, `TICK_PHASES[2]`; **neither calls the other**. And the
  seed-honesty arm is the CLAMPED default — market `commanded`, no curve injected — so
  `partiesArrivingAt` returns 0 at its `slots === 0` guard before any arithmetic runs. **A
  stochastic `demand.ts` would redden item 12's own `--demand` arm and leave this test green.**
  Item 12 is a defensible NEIGHBOUR and was never a trigger; the trigger is a guest drawing from
  the stream.

## Deferred out of G-008 (2026-08-07) — balance-critic's findings, adjudicated

Five MAJORs and two MINORs from the first non-vacuous balance sweep in the project. Two
were fixed in G-008 (the free-room dominance and the false schema comment); these are the
deferrals, each with the reason it is not G-008's.

- **THE OVERBUILD SPIRAL HAS NO TERMINATOR. -> M4, as a named obligation.** The cash brake
  is the economy's only negative feedback and cannot stop overbuilding (ADR-0009).
  Measured: `--build 10080` reaches **−38,214,000p at 2,000 days, falling exactly
  −23,000p/day with no floor**. M4 must give the spiral an end — bankruptcy, demand
  response, or both. **Balance signal nobody would guess: a SLOWER build cadence is
  WORSE**, because cash accrues between attempts so more attempts pass the affordability
  test. `--build 10080` ends 36M behind `--build 120`. Test against that, do not
  rediscover it.
- **Per-night billing, and what it does to construction cost. -> M4.** ADR-0010 keeps
  `nightlyRatePence` per-stay and documents the coupling.
  ~~When M4 bills pro-rata, the margin falls to 5,957.5p/room-day and 250,000p becomes a
  **42-day payback instead of 11**~~ — **CORRECTED 2026-08-12 (G-027a, ADR-0020/0021).
  THE FOURTH COPY OF ADR-0010's ARITHMETIC, AND RULING C'S SWEEP FOUND THREE.** Two things
  in that sentence are now false: **the fall has already happened at G-027a**, and
  **pro-rata billing is not what caused it** — a 1,440-tick stay already spans exactly one
  night, so per-night proration changes nothing at the shipped numbers. The realised margin
  is **3.63:1**, not the ~2.38:1 predicted, because the stay clock runs from **arrival**, so
  a queued guest holds its room for less than the full duration and a busy hotel fits up to
  1.14 stays per room-day. **The payback figure is withdrawn rather than restated**
  (`CLAUDE.md` rule 5) — it was computed under a check-in-relative clock that no longer
  exists, which is rule 4's first slot: it measured a different quantity wearing the same
  units. **What survives, and is the part M4 needs**: per-night billing is no longer the
  lever that makes construction a real decision, because the margin already moved without
  it — so M4 must re-derive the payback against ADR-0020's figures before treating
  construction cost as balanced. **Found by `ai-critic` at G-027a sweep 1, in the file M4
  reads first; struck rather than deleted (ADR-0008) because a reader should see that this
  arithmetic propagated to four places and that the sweep which found three declared itself
  complete.** **Do not also raise
  `constructionCostPence`**; balance-critic showed raising it cannot fix the sink, because
  total useful lifetime spend is bounded by N* x C and N* is demand-bounded at 4 (a 1% sink
  against lifetime revenue, rising only to 8% at 2,000,000p).
- **THE ZERO-ROOMS / ZERO-BALANCE ABSORBING STATE. -> M4 design call, flagged for human
  ruling at M1 sign-off.** No rooms means no revenue means the balance never moves means
  every build is refused forever. Reachable in three legal commands from the shipped
  default: `--rooms 3 --demolish 1` scraps the inherited rooms before any revenue arrives.
  1,000 days later: 12,000 guests arrived, 11,999 unsatisfied, every player action refused,
  no notification. "Starting capital is parked" and "the game has a reachable dead state
  with no exit" are different claims, and the second is what shipped. Candidate closures:
  starting capital, a demolition refund (but see the 247,500p threshold below), or a loan.
- **`capacity` is read by nothing.** A room earns the same whether capacity is 1, 2 or 4,
  and one guest occupies one room. The v1 fixture already prices against it
  (`fixtureSuite`, capacity 4 at 19,900p), so somebody has already reasoned from a number
  the simulation ignores. It does enter the content fingerprint, so it is not free.
  ~~-> M2, with party sizes.~~ **MILESTONE TAG CORRECTED 2026-08-08 -> M6.** Party size is
  parked to M1/M6 in the G-004 block, so this entry pointed at a milestone that does not
  own the work it depends on. M2 gives a guest several *needs*, not several *guests*.
  Caught by `ai-engineer` while collecting parked items for the M2 breakdown — a parking
  note is only useful if its destination is real.
- **A demolition refund reopens the G-005 upkeep dodge above 247,500p** — 99% of
  construction cost. Now recorded in `build.ts`'s header, because it is the number a future
  designer needs and the threshold moves with upkeep's share of build cost. -> M4.
- **The build window shortens at fast cadences.** At `--build 5` the schedule exhausts the
  plot on day ~5.8 with 2,390,000p unspent. Real, and correct given the plot cap; the fix
  is starting capital or a larger plot, not predicting refusals in the host. -> M4.

## Deferred out of G-007 (2026-08-07)

Raised by `sim-engineer` at PLAN. G-007 builds the coordinate substrate only.

- **`entityAt(world, cell)` and neighbour queries.** Functions over the placements, not
  fields — they add no state and owe no migration, which is the point of storing position
  on the entity rather than in cells. -> G-009, which needs them for enclosure.
- **A derived cell -> entity index.** Only when a scan is measurably slow, and then as
  DERIVED state: rebuilt on load, never saved, never authoritative. Same wording as the
  room -> occupant index, for the same reason — a second record of who is where is the
  drift G-004 closed by construction. -> G-008/G-010.
- **Multi-cell footprints** (`widthCells` as content on the room type). The stored shape
  stays one origin cell per entity, so this costs no migration when it lands. -> G-008.
- **Overlap and occupancy rules.** Two entities may share a cell at G-007; the gap is
  pinned by a test so changing it is visible. -> G-008, recorded in its goal block.
- **`compareCells`** — written when something first needs to sort cells (floor then
  column, explicit and locale-free). Deliberately not written unused: a comparator with
  no caller is a thing to get wrong for free. -> G-009.
- **Unplaced-as-invalid.** An unplaced room cannot be enclosed, so "unplaced" is a natural
  invalidity reason G-009 inherits rather than invents. At G-007 an unplaced room is still
  a live provider and still pays upkeep, deliberately, so the migration changes no
  economics. -> G-009.
- **Growing or shrinking the plot as a command, and per-scenario plots as content.**
  Bounds are world state (a save carries its own plot, and `assertWorldShape` validates
  placements against the SAVE's bounds, not the build's), so expanding the plot later is a
  migration-free change. Making bounds content would move every content fingerprint and
  leave the permanent fixture a husk that loads and can never tick. -> M6.
- **Vertical circulation and adjacency for pathing** -> M3.
- **`createWorld` taking custom bounds** — only if a test ever needs it; the default plot
  (floors −2..20, columns 0..79, 1,840 cells) plus floor 999 covers out-of-bounds testing.
- **Turn-away at the door.** A guest who finds the hotel full waits in the lobby and
  gives up when its patience runs out; there is no "saw the queue and left" path,
  because that is a demand behaviour. -> M4.
- **GATE OBSERVATION — `check:content` cannot see a cross-reference.** `collectIds` walks
  the document for `id` fields, so `"provides": ["nihgt_rest"]` in `room-types.json` is
  invisible to it. Not fixed here: gates are orchestrator-owned (ADR-0004), and
  `bindContent` rejecting an unprovided need and an undefined reference — on every host
  start, against the actually-parsed registry — is a stronger check than a text scan
  could be. Recorded so the choice is deliberate rather than an oversight.
- **`sim:bench` now does real work.** The 365-day run simulates 4,380 arrivals and 3,282
  paid stays instead of zero entities, which is most of the parked G-001 item about the
  bench exercising nothing. ~~I5 moved 8.8% -> ~16% of budget for that reason.~~ Both
  percentages are withdrawn at G-018, **and no ratio is offered in their place**: they were
  taken in different goals and therefore different sittings, so dividing one by the other
  would be the cross-session comparison `CLAUDE.md` rule 3 forbids. The surviving statement
  is qualitative and needs no stopwatch — the bench went from simulating zero entities to
  simulating thousands, and got materially dearer for that reason. What is
  still missing is tick cost measured AGAINST agent count rather than in total. -> M3.

## Deferred out of G-008 (2026-08-07)

Raised by `sim-engineer` at PLAN and BUILD, and deliberately kept out of the diff.

- **Multi-cell footprints** (`widthCells` as content on the room type). Re-parked from
  G-007 with the argument that decides it: **G-009 is the first goal that genuinely needs
  a room to have EXTENT**, because enclosure is computed over the cells a room occupies —
  so landing footprints there puts them in the goal that can falsify them. A content field
  whose only consumer is code written to consume it is decorative, and it would move every
  content fingerprint for nothing. The stored shape stays one origin cell per entity, so
  this still costs no migration when it lands. **`roomAt` in `build.ts` is the single site
  that generalises**: one loop, one predicate. -> **G-009**.
- **Per-command acknowledgement — WHICH build was refused, and where.** `BuildOutcomes`
  counts refusals by reason, so a host learns how many and why by category, never which.
  This sharpens the parked G-001 item "command acknowledgements"; its real consumer is the
  M5 UI that wants to flash the offending cell red, which is also the first host that can
  do anything with the answer. -> **M5**.
- **Occupancy as a load-time store invariant.** `assertEntityStoreInvariants` rejects an
  out-of-bounds placement at load but NOT two rooms in one cell. That is not an oversight:
  occupancy is CONTENT-DEPENDENT (a cell is occupied when a *room* stands on it, so an item
  inside a room can share its cells at M2), and that function has no content. The
  alternative — a per-commit cell-uniqueness scan — is O(n) on every tick with entity churn,
  paid to police a world the simulation cannot produce, in the goal immediately before G-010
  measures tick cost. -> revisit only if `assertWorldShape` ever gains content.
- **Starting capital as a scenario parameter.** A world opens with a balance of zero, so
  the first build is refused for insufficient funds until revenue arrives. That is what puts
  the refusal path inside the exit criterion for free, and it is coherent for a scenario that
  starts with an inherited hotel — but a hotel with NO rooms could never build its first one.
  -> **M4**, with the demand model, where "how does a run start" becomes a real question.
- **Demolish refund or fee as a content rate.** Demolition is free: any fraction is a
  designer's number, therefore content, therefore pricing, therefore M4. Zero is the only
  value here that is not a balance decision. -> **M4**.
- **A derived cell -> entity index.** `roomAt` scans the placements, O(entities) PER BUILD
  COMMAND — not per tick, and builds are rare by construction. If it ever measures slow it
  is DERIVED state: rebuilt on load, never saved, never authoritative. Same wording as the
  room -> occupant index, for the same reason. -> **G-010**, if measurement asks for it.
- **`assertGuestOutcomes` and `assertGuestStoreInvariants` still run on EVERY tick** and
  still allocate. G-008 fixed its own instance of this — `assertBuildOutcomes` ran per tick
  and cost 0.28 us/tick, ~22% of the whole tick, because its unknown-key sweep allocated an
  `Object.keys` array; it is now conditional on the value having changed. **The guest pair
  has the same shape and was left alone deliberately**, because it is already parked out of
  G-004 with a measurement (~7.24 us/tick at 96 guests) and belongs to whoever does that
  work. -> **G-010**, alongside the room -> occupant index.
- **Room variety and per-type construction costs as a balance lever.** One room type at
  250,000p. The interesting decisions (a cheap room that earns little against an expensive
  one that earns more) need more than one row in the table. -> **M6**.
- **A `--build`/`--demolish` schedule that names a CELL or an ID** rather than a cadence.
  The CLI's flags are a workload knob for sweeps; scripting an exact build order is what a
  UI does. -> **M5**.
- **A fast `--build` cadence runs out of PLOT before it runs out of run** (critique round
  1). The schedule is pre-generated, so its walk cannot observe a refusal and must advance
  on every attempt; the plot is 1,680 cells from the ground up, so `--build 5` over 30 days
  stops scheduling builds on day ~5.8 with 1,677 attempts spent. Since this fix the runner
  simply STOPS there rather than emitting commands it can prove are off-plot, so nothing is
  misreported — but a sweep at a very fast cadence measures a shorter build window than its
  `--days` suggests. Pacing attempts to affordability would put the sim's pricing rule in
  the host; the honest fix is a schedule the host can revise as the run goes. -> **M4**,
  with the demand model, alongside starting capital. **G-009 UPDATE:** the player's walk
  now packs one room per column but starts on floor 1, so it is 1,600 cells rather than
  1,680, and the inherited hotel's walk is 840 rather than 1,680 because it leaves a
  corridor. The window moves with those numbers; the arithmetic is derived in
  `report.test.ts` rather than written down as a literal.

## Deferred out of G-009 (2026-08-08)

Raised by `sim-engineer` at PLAN and BUILD, and deliberately kept out of the diff.

- **Multi-cell footprints (`widthCells`), re-parked a third time — now to M6, with the
  argument that finally settles it.** G-008 sent them here on the grounds that "G-009 is
  the first goal that genuinely needs a room to have EXTENT". It turned out not to, and the
  reason is worth keeping: the enclosure rule is **per cell** — every cell of a footprint
  needs a floor beneath it — so a one-cell room is not vacuous, it can fail and it can
  *become* false. Extent adds exactly one case, the PARTIALLY supported wide room, which
  refines a rule that already bites rather than supplying its substance. `roomCellsOf` in
  `validity.ts` is written and named as the single seam: every rule iterates it, so landing
  width later is one function body plus a content field, and the stored shape stays one
  origin cell per entity, so it still owes **no migration**. -> **M6**, with room variety.
- **`placeItem` / `removeItem` as player commands — AND THE LIMITATION THEY WOULD FIX,
  STATED PLAINLY: `missingItem` IS NOT PLAYER-REACHABLE AT M1.** `buildRoom` furnishes the
  room it places and `demolishRoom` takes the furniture with it, so no sequence of player
  commands can produce a room that is missing an item it requires. The reason is only
  reachable from a host scenario (`spawnEntity`), from a save, or from a test that
  constructs it — which is enough for the exit criterion and is how `unplaced` has always
  been reached, but it is a real limit and a reader would otherwise assume it away. M6's
  item variety is what makes furnishing a player DECISION, and on that day this reason
  becomes reachable the way the other three already are. -> **M6**.
- **Item cost, item quality, item decay, items that provide needs of their own.** An item
  type is `{id, name}` and nothing else, and a built room's furniture is free. Every one of
  those is a field added to `itemTypeSchema` later rather than a shape changed. -> **M6**.
- **Corridors, and what they do to the door rule.** "A door is a free cell beside the room
  on its floor" is the honest reading while an empty cell is the only thing a corridor
  could be. When M3 gives circulation an identity the predicate NARROWS — from "a free
  cell" to "a corridor cell" — and `computeRoomInvalidity` is the one place it changes.
  Vertical circulation then makes "reachable from the entrance" a further condition, which
  is a THIRD thing and not this one. -> **M3**.
- **Splitting `evicted` by reason.** A guest whose room was demolished and a guest whose
  room stopped being valid are both `evicted`, because they are the same event from the
  guest's point of view: the thing it was paying for is gone. When the outcome tally becomes
  a table this is one of the rows. -> **M2**, with reviews (it sharpens the item already
  parked out of G-004).
- **Validity cached across ticks.** The placement index and the per-room answers are
  tick-local and rebuilt on the first question of every tick. Making them survive between
  ticks is the same DERIVED-state discipline as the room -> occupant index: rebuilt on load,
  never saved, never authoritative. Measured cost below. -> **G-010**, which owns tick cost.
- **Support is transitive, and the one-pass computation is what keeps it affordable.**
  Critique round 1 found that "the cell below holds a room" said nothing about whether THAT
  room was supported, so one sacrificial room in mid-air carried an arbitrarily tall tower
  of valid providers. Fixed by resolving the whole building in a single ascending-floor
  pass over the index that was already being sorted (`groundedRooms`), which is O(n log n)
  with no recursion — a per-room chain walk would have been O(n x height) in the goal
  before G-010 measures tick cost. **The seam to know about:** the pass folds over
  `roomCellsOf`, so a multi-cell footprint needs every cell either at the earth or over a
  grounded room, and that case needs no change here when width lands at M6.
- ~~**I5 IS AT 28% OF BUDGET, UP FROM ~14.7%.**~~ **THIS COST +75%, MEASURED, PAIRED, NOT
  ESTIMATED** — the percentages of the invented budget are withdrawn at G-018 and the
  paired ratio is exactly what survives them (`CLAUDE.md` rule 2).
  `pnpm sim:bench`, median of 5, same machine, `git stash` between: **1.75x**, a
  regression on a gate that stayed green; **a further +8% after transitive support**, which
  adds one bounded pass per tick and does not change the shape of the cost. Decomposed by
  running the same 365 days
  under a content set whose room type requires nothing (3 entities instead of 6), direct
  spawn, median of 5: **roughly a fifth of the run was the FURNITURE** — the bench's entity
  count doubled, and `findFreeRoom` scans every entity per waiting guest per tick — and
  **roughly a quarter was the VALIDITY machinery** itself (one sorted index per tick that
  has guests, plus a memoised check per candidate room). Deliberately not optimised here:
  ~~it is under the 40% the plan set as the escalation line~~ (that line was a fraction of
  the invented budget and is withdrawn with it), and optimising it is G-010's goal, not
  this one. **What G-010
  should know:** the furniture half is fixed by a room-scoped scan (items can never satisfy
  `roomTypeProvides`, so they are pure overhead in that loop), and the validity half is
  fixed by making the index survive a tick in which entity membership did not change.
- **Scaling spot readings, for G-010 to start from rather than rediscover. READ BOTH ROWS —
  THE FIRST ONE CANNOT SEE WHAT G-010 IS MEASURING.**

  | workload | 25 -> 100 rooms | note |
  |---|---|---|
  | `--arrivals` at default (guest load held constant) | **2.17x** | 96 of the 100 rooms sit empty all year |
  | occupancy tracking room count (`--arrivals 19 / 10 / 5`) | **4.70x** | 25->50 is 1.58x, **50->100 is 2.97x** — superlinear at the top |

  The first row is the reading G-009's builder recorded (5.9 -> 12.3 µs/tick, 2.08x,
  reproduced by `sim-critic` at 2.17x). **It was taken with the guest load — the dominant
  cost driver — held constant while rooms quadrupled**, so almost every added room was
  never occupied and the measurement could not see room-count scaling at all. G-010's own
  criterion is "tick cost at 100 rooms under 6x that at 25", and its sibling criterion
  requires a bench workload at 60+ rooms, which implies the *opposite* workload. Starting
  from the first row would be ADR-0007's shape one level up: a measurement that inspects
  nothing, handed to the goal whose whole purpose is to measure.

  Under the honest workload the margin is **78% of G-010's limit and superlinear at the
  top end**, so the goal has real work to do rather than a number that is already inside
  its bound. Also worth knowing before designing the bench: ~~`--rooms 100 --arrivals 5`
  takes 109s for 365 days — 10.9x the entire I5 budget.~~ **Withdrawn at G-018** — an
  absolute compared against the invented budget, which it beat by 10.9x and the derived one
  by not at all (~28%). The surviving statement is the 4.70x row above: a fully occupied
  100-room hotel is a different workload from the bench's, and it is the workload that
  scales badly.

  Caught by `sim-critic` at G-009 round 1, checking a number the *next* goal depends on.
- **An invalid room is charged full upkeep and the player is not told.** Validity gates
  provision and nothing else, so a badly built room is a pure loss — deliberately, and
  consistent with the reading G-007 gave unplaced rooms and with ADR-0009's trap. The CLI
  now REPORTS the tally by reason, but a player has no notification. -> **M5** for the
  notification, **M4** for whether the loss should have a floor.
- **An item type no room requires is not validated.** `bindContent` rejects a `requires`
  naming an item that does not exist, but not an item nothing requires — because M6's table
  will be full of those on its first day, and rejecting them would make adding an item
  before the room that uses it impossible. The asymmetry with `assertNeedsAreSatisfiable`
  is deliberate: an unprovided NEED is guaranteed unhappiness, an unrequired ITEM is
  furniture waiting for a room. -> revisit only if dead content becomes a real problem.
- **`entityAt(world, cell)` as a general query — deliberately NOT written.** Only the
  lookups with callers exist (`roomAtCell`, `kindAtCell`, both private to `validity.ts`).
  Same reasoning that kept `compareCells` unwritten until G-009 gave it a caller: a query
  with no consumer is a thing to get wrong for free. -> whenever something needs it.
- **The two CLI layouts are a host decision that will not survive M5.** `roomCell` leaves a
  corridor (the inherited hotel) and `builtRoomCell` packs tight on the floor above (the
  player). Both exist to give a sweep a workload; when a UI dispatches builds, the layout is
  the player's and both go. -> **M5**. **G-012 UPDATE: there are now THREE**, the new one
  being `amenityCell` (the basement). It is in the basement because putting amenities on the
  ground floor took G-011's criterion A down — see the note in `report.ts`.

## Deferred out of G-012 (2026-08-08)

Raised by `ai-engineer` at PLAN and BUILD, and deliberately kept out of the diff.

- **G-016 IS TRIGGERED. THE NEED VECTOR COSTS 2.41x HEAD's TICK COST**, against the 70%
  promotion line in its own goal block — **a line that no longer exists: G-018 derived the
  budget, and a trigger phrased as a percentage of it can no longer fire.** The 2.41x is a
  paired ratio and is untouched; what is gone is the mechanism that promoted a goal from it. The two fixes below are in the diff because a red
  gate is not shippable and both were mistakes rather than missing optimisations: the
  engagement selector was O(needs²) comparisons with two binary searches each, paid by every
  unengaged guest every tick (~~27.7% of tick self-time~~ — WITHDRAWN, see below), and
  `assertNeedVector` allocated a literal table per need per guest per tick — the exact
  allocation shape G-010 spent a goal removing from `assertGuestStoreInvariants`, copied back
  in by copying its shape. A third, `isNeedPending` derived from the other two predicates
  rather than written out, cost ~~a further 11%~~ — **2.2%, re-measured at G-016**. All three
  were verified behaviour-preserving against G-010's bar: the golden state hash
  `0dc63018abda9764` is unmoved by any of them.

  **EVERY PERCENTAGE IN THIS ENTRY WAS TAKEN INSIDE A MACHINE-DRIFT WINDOW AND IS NOT
  RELIABLE.** G-016 re-measured them paired and interleaved: the 11% is 2.2%, and the 27.7%
  and 4.7% were never re-measured at all and are withdrawn rather than restated. The three
  changes are all still correct and all still shipped — two of them rest on a complexity or
  allocation argument that needs no stopwatch — but **do not cite a number from this entry.**
  See the G-016 section at the end of this file.

  **REPORT THE RATIO, NOT THE ABSOLUTE, AND HERE IS WHY.** This machine drifted ~30% slower
  over the session — HEAD itself, unchanged, measures **4,618ms now against the 3,510ms
  recorded at G-011** — so an absolute reading taken today says whatever the thermal state
  says. Paired and INTERLEAVED (stash between arms, three rounds, medians):

  | | HEAD | G-012 |
  |---|---|---|
  | 365 days, `--rooms 60 --arrivals 32` | **4,618ms** | **11,151ms** |

  **Ratio 2.41x, and the ratio is the whole finding.** ~~Normalised onto the project's
  recorded HEAD figure that is 8,476ms, 84.8% of budget — which independently agrees with
  `ai-critic`'s 84.3%, measured hours apart. Absolute readings on this machine today range
  8.0s to 11.2s and DO fail the gate at the top of that range.~~ **All of that is withdrawn
  at G-018**, and the last sentence is the one to notice: those readings failed a budget
  that was ~39x tighter than any stated requirement, so "DO fail the gate" described the
  gate and not the simulation. Against the derived budget the same range is ~2-3%.
  Whoever takes G-016 should re-measure HEAD alongside rather than
  trusting any single number in this file (the G-010 lesson, third time recorded).

  **WHAT IS LEFT IS INHERENT AND IS G-016's**, and the profile is flat rather than
  dominated: `stepGuests` 19.5%, `advanceNeeds` 11.7%, `assertGuestStoreInvariants` 7.9%
  plus `claimEntity` 5.5%, GC 3.5%. The vector multiplies per-guest work by need count and
  there are now two reservations per guest for the invariant scan to check, so the honest
  next moves are the ones G-016 names — a flat positional need array, or sampling the
  per-tick invariant scan. **Do not size that work from this note alone: profile first**
  (the G-010 lesson, twice recorded).

  **AND G-016 MUST SAY WHICH OF TWO THINGS IT IS OPTIMISING**, because `ai-critic` measured
  a split the profile above understates. No-opping the body of `assertGuestStoreInvariants`
  takes the run from 8.22s to 6.66s: **1.56s, 19% of the whole run, against ~0.4s at HEAD —
  a ~4x growth in per-tick RE-VALIDATION of state the tick has just produced.** That is
  VALIDATION POLICY, not guest-loop cost, and it is a different question with a different
  answer (sample it, or gate it on a changed store) from "the vector costs N times more per
  guest". Inheriting a fifth of the RUN as though it were structural simulation cost
  is how a scaling goal ends up optimising the wrong thing. Not acted on here.
  (G-018: "a fifth of the I5 budget" as this read before was a coincidence of the invented
  budget sitting near the run's own length. The proportion of the run is what was meant and
  is what survives; the two stopped being interchangeable when the budget was derived.)

- **AN AMENITY EARNS NOTHING AND COSTS UPKEEP, so a rational player builds none.**
  `payForStay` charges for the LODGING room only (ADR-0010), so the three amenity room
  types this goal ships are pure cost: measured on the 2-day golden, upkeep went -15,000p
  -> -24,000p and nothing came back. That is not a defect of this goal — it is the money
  loop having no channel for "guests were happier" until reviews (G-015) feed reputation
  and demand (M4) — but it means a balance sweep run today will conclude amenities are a
  mistake, and it will be right. -> **M4**, with demand response.

- **A CHEAP ROOM TYPE WEAKENS `canDrawLoan`, AND CONTENT ALONE CAN REOPEN ADR-0011'S DEAD
  STATE.** `minConstructionCostOf` is the cheapest build across ALL room types, and
  eligibility is `balance + liquidation < cheapest`. Ship an amenity cheaper than a bedroom
  and a hotel that can afford a café but not a bedroom stops being "stuck" — while earning
  nothing, because only a bedroom earns. Contained here by pricing every amenity at the
  bedroom's `constructionCostPence` (250,000p), so `minConstructionCostOf` is unmoved and no
  economy code changed. The general fix is to make it the cheapest room that can EARN, which
  is economy's call and not this goal's. -> **M4**, with bankruptcy and demand.

- **ENGAGEMENT DOES NOT SUSPEND REST**, so a guest is served by its bedroom and by one
  amenity at the same time. Considered and rejected at PLAN for three reasons, the strongest
  being that suspending rest lengthens every stay and therefore MOVES REVENUE inside a goal
  ruled not to touch money. The honest version of exclusivity is travel time, and the guest
  statement itself separates the two ("holds its lodging room for the whole stay AND engages
  one provider at a time"). -> **M3**, with circulation.

- **`unmet` IS ONE NUMBER COVERING TWO FATES** — a need that ran out of patience, and one
  still pending when its guest left. Splitting it is the same change that turns the four
  guest outcome counters into a table by reason, already parked out of G-010. -> **G-015**.

- **THE DETERMINISM LOG EATS TWO OF ITS THREE AMENITIES.** Its despawn pass (ids 1, 4, 7…)
  and demolish pass (ids 2, 7, 12…) walk upward through the id space, and the amenities
  spawn at tick 47 with low ids. One survives to tick 100,000, which is enough for
  engagement coverage to continue to the end — `needs.determinism.test.ts` asserts the
  coverage rather than the survival, because the coverage is the thing that matters. If a
  future pass takes the last one, that test goes red. -> only if it does.

- **AMENITY ROOM TYPES REQUIRE NO ITEMS (`requires: []`).** Deliberate: an item type whose
  only consumer is code written to consume it is decorative, and G-013 is the goal that
  makes items providers. On that day a café's coffee machine becomes the thing that provides
  `guest_nourishment`, and the room becomes the place it stands. -> **G-013**.

- **`capacity` IS STILL READ BY NOTHING, AND ON AN AMENITY IT NOW CONTRADICTS THE
  SIMULATION EIGHTFOLD.** The three amenity room types set `capacity: 8`, which reads as
  "eight guests can use this at once" — and a provider serves exactly ONE, with
  `countOrphanedReservations` counting a second as a LEAK. Dead content was already true of
  `standard_room`, where 2 versus 1 was merely unused; 8 versus 1 reads as a design
  statement. The number becomes true when M3 makes a provider a queue with capacity, and
  `capacity` itself is parked to M6 with party size. -> **M6** / **M3**, whichever lands
  first; do not "fix" it by editing the 8 to a 1, because that states the opposite design.

- **A GUEST STARTS ENGAGEMENTS IT CANNOT FINISH, AND THIS IS G-014's BASELINE.** Measured on
  the criterion run (`--days 30 --seed 7 --rooms 6`): **72 of 356 departures — 20% — leave
  mid-engagement**, and **~10% of all amenity service time is spent on engagements that end
  unmet**, holding the only café against a guest who could have finished. The guest has no
  notion of whether it has TIME to finish: `compareNeedPriority` scores pressure and nothing
  else. A time-remaining term is exactly what G-014's utility scoring is for — "a score over
  urgency and provider fit" — and it is the term that turns this from waste into a decision.
  Checked by `ai-critic` and NOT a measurement artefact: it does not prop up criterion 2,
  because entertainment and nourishment are honestly oversubscribed either way. -> **G-014**,
  as a number to improve against rather than a defect to rediscover.

## Deferred out of G-016 (2026-08-08)

Raised by `ai-engineer` at BUILD, and deliberately kept out of the diff.

- **CORRECTION TO THE G-012 ENTRY ABOVE — "MAKE IT CHEAPER, NOT RARER" IS *NOT* VINDICATED,
  AND THE PER-TICK INVARIANT SCAN IS STILL 20% OF THE RUN.** G-012's entry asked G-016 to
  say whether it was optimising guest-loop cost or validation policy, and warned that gating
  the scan would need its own argument. Mid-goal I reported that no such argument was needed,
  because an ablation appeared to show that no-opping `assertGuestStoreInvariants` entirely
  was SLOWER than making it cheaper. **That measurement was wrong and the conclusion with
  it.** Re-measured paired and interleaved on the shipped build:

  | | 365-day bench |
  |---|---|
  | G-016 with the scan | **6,348ms** |
  | G-016 with the scan body no-opped | **5,030ms** |

  **The scan costs ~20% of the run, and G-016's changes recovered almost none of it.**
  Whether to gate or sample it is therefore STILL OPEN, still needs its own argument, and
  still needs an explicit record of what coverage is surrendered and how a reservation leak
  would still be caught. `assertNeedVector`'s header carries the same correction so nobody
  reads the vindication out of the code. -> **an explicit human/orchestrator ruling**, not a
  builder's choice.

- **THE MACHINE DRIFTED ~2x FASTER ACROSS ONE SESSION, AND IT INVALIDATED FOUR OF THIS
  GOAL'S FIVE HEADLINE NUMBERS.** The identical G-012 build measured **3,087ms** early and
  **1,740ms** later on the same 120-day workload; HEAD measured **2,898ms** against the
  3,510ms recorded at G-011, so this machine is now FASTER than the record rather than the
  ~30% slower that G-012's entry reports. Every lever timed against a baseline captured at a
  different moment was inflated — the `depart` hoist was reported at 14% and is 9.5%, and
  the lazy assertion message was reported at 34% and is ~0%. **The only readings that
  survived were the ones taken paired and interleaved in the same minutes, and the one ratio
  that never needed correcting was `needs.scaling.test.ts`'s, because interleaving is
  built into it.** PARKING.md has now recorded this lesson three times (G-009, G-010, G-012);
  this is the fourth and the most expensive. **Do not accept an absolute reading in this
  repository that was not taken against a same-session paired control.**

- **`appendTransaction` COPIES THE WHOLE LEDGER ON EVERY APPEND, AND IT IS NOW 9% OF THE
  BENCH.** `[...log, transaction]` is O(ledger) per append, so a run's ledger cost is
  quadratic in its length: at 365 days the log reaches ~16,400 entries and `payForStay`
  copies all of it on every completed stay — **519ms of a 5,667ms run**, and rising with run
  length. Pre-existing at HEAD and untouched by this goal. It is `ledger.ts`, so it is the
  economy pair's, and the fix is a persistent-list or chunked append that keeps `balanceOf`
  a pure fold (I4). -> **M4**, with the economy pass.

- **`stepTick` ALLOCATES ONE `TickState` PER PHASE PER TICK.** Five `{...state}` spreads plus
  `beginTick`'s object, so ~6 objects per tick whatever the tick does — ~125ms per 120 days
  when it was last profiled. It is the tick scheduler, so it is `sim-engineer`'s, and the
  shape of the fix (a mutable tick-local carrier, exactly as `EntityDraft` and `RoomSearch`
  already are) is one the codebase already uses everywhere else. -> **whoever next owns a
  tick-cost goal**.

- **EAGER WORK FOR A MESSAGE OR A TABLE NOBODY READS — THE SHAPE, NAMED, BECAUSE IT IS NOW
  THE FOURTH INSTANCE.** G-010 removed a literal table allocated per guest per tick from
  `assertGuestStoreInvariants`; G-012 reintroduced the same shape in `assertNeedVector` and
  caught it; G-012 also found `isNeedPending` derived rather than written out; G-016 found a
  template literal built per guest per tick for a throw message. Each was invisible in a flat
  profile and each was in an assertion or a predicate rather than in simulation logic. **The
  general fix is a scan or a lint** — "no template literal, array literal or object literal
  evaluated on a non-throwing path inside a per-tick loop" — which is a `tools/gates` change
  and therefore explicitly out of this goal's scope. -> **a gate goal**, when one exists.

---

## Deferred at G-013 PLAN and by the observability ruling (2026-08-08)

- **`placeItem` / `removeItem`** — the player command that puts an item in a room. Its
  arrival is what relaxes G-013's reachability rule from "required by a room type" to
  "placeable", so this parked item and that check are the same decision seen twice.
  -> **M6**.

- **Item cost, quality and decay.** An item type at G-013 is `{id, name, provides}` and
  nothing else. -> **M6**, with upkeep.

- **A provider serving more than one guest at once.** That is a queue with capacity, and
  M3's statement is literally "queued shared resources". -> **M3**.

- **Travel to a provider, and distance as a score term.** Until there is movement, provider
  choice is tie-broken by lowest entity id. Fourth goal to lean on "there is no movement
  yet". -> **M3**.

- **AN ITEM IN A PRIVATE ROOM IS PUBLICLY USABLE.** Content can put a provider inside a
  bedroom and a stranger will walk in to use it. Shipped content avoids this by luck
  (`single_bed` provides nothing), not by rule. Privacy is a room-type property that does
  not exist yet — and this is §6.1's "reads as stupid to a watching player" in its most
  literal form, which from G-017 is a thing someone can actually see. -> **M3/M6**.

- **Item-provided lodging — a sleeping pod.** G-013 refuses it at load, on the grounds that
  a guest lodges in a room and engages a provider, and `payForStay` looks up a room type.
  Making it work is a change to the lodging model, not to the registry. -> **M6**.

- **Reachability does not ask whether the host room type can ever BE valid.** Guaranteed
  today by `assertRequiredItemsExist`; worth re-checking when room types grow constraints.
  -> **M6**.

- **Delivery provenance richer than a kind.** G-013 records *room* or *item*, not which
  entity or which room. M5's notifications will want the entity. -> **M5**.

- **A general "no allocation on a per-tick non-throwing path" scan** now has a fifth
  instance to justify it (see the cluster above). -> **a gate goal**.

- **PROMOTED OUT OF PARKING, RECORDED HERE SO THE TRAIL SURVIVES: scenario capital.** It
  was parked at G-011 as "closing it properly needs a scenario-capital mechanism". ADR-0013
  §5 makes it a **hard prerequisite of the first M4 goal** — M4 does not start until it
  lands. The reason it stopped being a nice-to-have: `--rooms 3` carries 375,000p of hidden
  capital against a 500,000p starting constant, and every balance sweep and every bench in
  this project used that flag, so `balance-critic`'s entire accumulated evidence base was
  measured in a world with 75% more effective opening capital than the shipped figure.
  Harmless while nothing is tuned against it. Not harmless at M4.

## Deferred out of G-013 (2026-08-08)

Raised by `ai-engineer` at PLAN and BUILD, and deliberately kept out of the diff.

- **`placeItem` / `removeItem`, AND THE RULE THEY RELAX RATHER THAN DELETE.**
  `assertNeedsAreSatisfiable` now demands a need have a REACHABLE provider, where an item is
  reachable only if some room type `requires` it — because `buildRoom` furnishes what it
  places and that is the only door. When `placeItem` lands, **every** item type becomes
  reachable and the clause becomes the pre-M6 statement it always was. It should be relaxed
  deliberately, with the shipped content re-checked, rather than discovered by somebody
  wondering why a rule stopped firing. -> **M6**.
- **AN ITEM INSIDE A PRIVATE ROOM IS PUBLICLY USABLE, and the shipped content only avoids it
  by choice.** A provider is an entity, and nothing asks whose room it stands in — so an
  item required by `standard_room` that provided a need would let a stranger walk into a
  guest's bedroom to use it. `single_bed` provides `[]`, so it cannot happen today, and
  `bindContent` would not object if it could. Privacy is a property of the ROOM TYPE and the
  fix belongs with whoever gives circulation an identity. -> **M3/M6**.
- **A PROVIDER STILL SERVES EXACTLY ONE GUEST, and `capacity: 8` now contradicts the
  simulation in two places rather than one.** An amenity room says 8 and an item in it says
  nothing at all; both serve one. Do not "fix" it by editing the 8 — that states the opposite
  design. It becomes true when a provider is a queue with capacity. -> **M3**.
- **AN ITEM'S PROVISION IS BORROWED WHOLE, WITH NO REASON OF ITS OWN.** `isProviding` answers
  yes/no; it cannot say "the chair is fine, the room has no floor". `RoomInvalidityReason` is
  a closed union for rooms and an item has no equivalent, so a UI wanting to explain why a
  guest is not being served has one bit. Deliberate — a second tally keyed on the same facts
  is the drift this codebase closes by construction five times over — but it is a real limit
  for the notification M5 will want. -> **M5**.
- **`metBy` RECORDS A KIND, NOT A PROVIDER.** It says "a room" or "an item", not WHICH one
  and not which room the item stood in. That is all criterion 2 needs and all that can be
  stored for one integer's worth of hashed state; a UI that wants "you were fed at the café
  on floor 2" needs provenance, which is a bigger field and a bigger migration. -> **M5/M6**.
- **THE ENGAGEMENT BUDGET IS A BALANCE LEVER NOBODY HAS SWEPT.** `sum(engagement
  satisfyTicks)` against `night_rest.satisfyTicks` decides whether a guest can have
  everything; it is now exactly 480 = 480, which makes contention the deciding factor. Raising
  it makes the vector unsatisfiable by construction and lowering it makes amenities free. It
  is a designer's dial with no sweep behind it, and it interacts with provider COUNT — adding
  a provider makes a need cheap, which is what happened to `guest_nourishment` here.
  -> **M4**, with demand.
- **THE `--amenities` FLAG IS NOW A DENSITY KNOB AND THE BENCH RUNS IT AT 1.** The scaling
  arm measures 20; the I5 bench measures 1, which is the starved hotel. So I5 still describes
  a hotel with four providers, and a player who builds twenty amenities is not represented in
  any gate. Same shape as G-010's finding that `--rooms 60` measures a 20-room hotel.
  -> whichever milestone next touches I5's shape (**G-018** is re-deriving its budget and
  should know this).

  **G-018 KNEW, AND DELIBERATELY CHANGED NOTHING.** It re-derived the BUDGET and left the
  WORKLOAD alone, so this item is untouched and now has a second half: the requirement the
  budget is derived from says a 60-room HOTEL, and the bench runs a 60-room SHELL at roughly
  a quarter occupancy with four providers. The gap is between the gate's workload and the
  requirement's, not between the gate's workload and its budget, so no number here needs
  re-measuring — but the first goal to re-size this workload should close both halves at
  once, and should expect the reading to rise several-fold when it does. Recorded in
  `HOTELSIM.md` §2.1.3 and in `bench.mjs` so it cannot be discovered a third time.
- ~~**THE DENSITY RATIO COMPRESSES UNDER LOAD, so the new scaling criterion is weaker in CI
  than in isolation.**~~ **DISCHARGED AND HALF-FALSIFIED AT G-020c — this was the gate goal.**
  The observation held for the axis it was taken on and **not** as the generalisation it was
  written as. Re-measured on all four axes, one instrument, quiet (n=12) against 12 busy
  processes on 12 cores (n=8), `win32/12cpu`: **three of four axes move UP on the median and
  three of four move UP on the max** — `needs` 2.0757 → 2.1636 median and 2.5906 → 2.9733 max,
  `rooms-bench` 3.0746 → 3.8136 median. Only `density` — the axis the note was written about —
  compresses on the tail (1.6154 → 1.5619). The original figures (1.274-1.411 isolated,
  1.003-1.172 in-suite) were taken inside vitest's parallel workers, which no longer runs any
  timing bound. **What replaced it**: `tools/gates/scaling-bound.mjs` places every bound above
  the worst reading observed in EVERY regime, so the bound rests on what load was seen doing
  rather than on a model of what it ought to do.
- **`release` AT STEP 2 OF `stepGuests` IS UNOBSERVABLE, AND WILL STOP BEING SO.** Deleting it
  leaves the whole suite green, because that site fires exactly when the provider has stopped
  providing: `freed` is null, so nothing is un-marked, and the id it removes from `held` is one
  no candidate list contains. It is kept as a POSTCONDITION (ADR-0007's amendment) so that
  "every reservation that ends goes through `release`" stays a property of one function.
  **M3's queues and M6's `placeItem` both make a still-usable provider reachable at that site**,
  and on that day it becomes load-bearing and needs a witness. Recorded so nobody deletes it
  for coverage in the meantime.
- **AMENITIES STILL EARN NOTHING AND NOW COST MORE.** G-012 recorded that an amenity is pure
  upkeep; this goal adds provider ITEMS to two of them, which are free to place and free to
  keep, so the direction is unchanged but the shipped hotel has two more entities and the same
  revenue. Still M4's, with demand response — but note the new asymmetry a balance sweep will
  find: an item provider costs NOTHING at all, so the cheapest way to serve a need is now an
  item in a room the player already wanted. That is a real strategy and it is unpriced.
  -> **M4/M6**, with item cost.

## Deferred out of G-013 critique round 1 (2026-08-08)

- **G-012's CRITERION PINS A PROPERTY OF THE CONTENT TABLE, AND ANY FUTURE PROVIDER CAN FLIP
  IT. THIS IS THE STRUCTURAL FINDING OF THE ROUND AND NEITHER BUILDER NOR CRITIC NAMED IT
  FIRST — the orchestrator did.** "At least TWO different need types have a non-zero met
  count AND a non-zero unmet count" is a statement about how many rows of the shipped table
  straddle met-and-unmet at `--days 30 --seed 7 --rooms 6`. Adding a provider to a need makes
  that need cheap and can push it to `met/0`, removing a straddling row — which is exactly
  what G-013 did to `guest_nourishment` (356/0), leaving one row where the criterion needs
  two, and why `guest_comfort.satisfyTicks` went 60 -> 150 as compensation. **G-014 and G-015
  both touch this table.** A goal that adds a provider, an archetype that varies which needs a
  guest forms, or a review model that changes stay length can each silently falsify a
  previous milestone's signed-off criterion, and the failure looks like an unrelated red test
  two goals later. Either the criterion should be restated as a property of the SIMULATION
  rather than of one content table, or every goal touching the table should re-run G-012's
  invocation deliberately. -> **G-014, as a check to run at PLAN**, and a candidate for a
  charter note if it happens twice.
- **THE ENGAGEMENT BUDGET AS A DESIGN RULE — A HYPOTHESIS FOR M4'S SWEEP, IN THOSE WORDS.**
  `sum(engagement satisfyTicks)` against `night_rest.satisfyTicks` is currently 480 = 480
  exactly, so a guest can have everything only if it never waits and contention decides the
  rest. That is an interesting property and it may be a real rule — but it appeared for the
  first time in the same commit as the number it was used to justify, which is choosing and
  then justifying (`HOTELSIM.md` §2.1), and it is withdrawn as a derivation. It is worth
  TESTING: sweep the ratio (well under 1, exactly 1, well over 1) against satisfaction spread
  and review means, and see whether a rule falls out. If one does, it is a stated requirement
  and numbers may then be derived from it. -> **M4**, with the demand sweep.
- ~~**NOTHING IN THE REPORT WITNESSES CORRECT ATTRIBUTION.**~~ **WITHDRAWN AT CRITIQUE ROUND
  2 — IT WAS FALSE, AND LEAVING IT WOULD HAND M4 A FALSE STATEMENT ABOUT ITS OWN TOOLING.**
  Round 1 removed a vacuous `metByRoom + metByItem === met` violation, and I concluded from
  that that no report-level check was possible, because "the code attributes correctly" is a
  property of the code. `ai-critic` found the counter-example in the function I had just
  edited: `buildSummary` holds CONTENT, and content pins the attribution outright wherever a
  need has a single KIND of provider — no room type provides it, so by-room must be 0; no
  item type provides it, so by-item must be 0. Neither is an identity over the two stored
  numbers; each cross-references the tally against a separate input, which is exactly what
  the deleted check lacked. It ships, it fires in both directions, and three of the four
  shipped rows are pinned by it.
  **WHAT IS STILL TRUE, AND IS NOW THE ONLY REMAINING GAP:** a need that BOTH kinds provide
  — `guest_nourishment` today — cannot be checked this way, because nothing in content
  decides its split. Its witnesses are the by-item total, the negative control, and the two
  committed bench hashes. -> **M4's sweep tooling**, if it ever needs more than that.
  **THE GENERAL LESSON IS NOT PARKED — IT IS `ADR-0007`'s G-013 AMENDMENT.** "Deleting a bad
  check is not evidence that no good one exists" is a rule about how to respond to a vacuity
  finding, so it belongs beside the rule that produces them, not in a file of deferred work
  attached to a struck-through entry a reader is meant to skip. Ruled by `ai-critic` at
  round 3 and filed by the orchestrator. This entry stays as history and points there.

## Deferred out of G-018 (2026-08-08)

Raised by `sim-engineer` while re-deriving I5's budget. Nothing here was built: the goal
changed one constant, its derivation, and the records that quoted it.

- **A REGRESSION TRIPWIRE, WHICH I5 IS NOT AND NEVER WAS.** The derived budget is a sanity
  ceiling — 389,333ms against a run that measures ~7.7s — so it catches a catastrophe and
  nothing smaller. The instrument this project has actually used for eighteen goals is a
  **paired ratio against a same-sitting baseline**: arms interleaved, warm-up discarded,
  medians of >=5, ratio quoted and absolute discarded (`CLAUDE.md`, "Measuring
  performance"). It found G-012's 2.41x and corrected G-016's retracted figures, and it
  exists only as a discipline in a prose file. Making it a command is a real goal with real
  design questions — what baseline, committed where, and how it avoids becoming the
  machine-drift generator that CLAUDE.md's rules exist to survive. **Explicitly NOT built here:**
  G-018 was ruled to change one number and add no gate, and a tripwire invented in the same
  commit as the ceiling it replaces would inherit the ceiling's whole problem.
  **-> PROMOTED OUT WHILE THIS ENTRY WAS BEING WRITTEN: it is G-020, a hard prerequisite of
  M3**, seeded by the orchestrator as the human's own consequence of widening the ceiling.
  The G-013 density-ratio item points at the same slot and should be read beside it.
- **THE PROMOTION MECHANISM IS DEAD AND HAS NO REPLACEMENT. THAT IS THE POINT, NOT A GAP.**
  **ONE** parked trigger is phrased as "`sim:bench` exceeds 70% of the I5 budget": the
  needs-scaling successor recorded inside G-016's block. Against a derived budget it can
  never fire. (Round 1 correction: this entry originally said TWO and named G-019 as owning
  one. **G-019 has no trigger and never had one** — a coverage claim that inspected nothing,
  inside the entry whose whole job is to record which triggers are dead. Established by
  `grep -rn "70%" --include=*.md --exclude-dir=node_modules .`, which returns TEN lines
  (thirteen without the exclusion — three are dependency readmes): one live trigger, FOUR
  historical mentions of G-016's own discharged trigger — `DECISIONS.md`, `GOALS.md`,
  `JOURNAL.md` and this file — and five lines of G-018's own commentary on them. The
  subordinate count read "three" until round 2, inside the sentence that claims to report
  what the grep returns.) The
  human's complaint was that a made-up constant was promoting goals; a sourced ceiling
  promotes nothing, and G-018 deliberately invented no replacement threshold — doing so
  inside this goal would have minted the second superstition in the goal that exists to
  delete the first. A replacement must be a ratio against a paired baseline — **G-020**,
  now seeded, whose own bound owes the derivation §2.1 requires of it. Until it lands,
  **a performance goal is promoted by a measured ratio quoted in a critique, which is how
  every one of them has actually been promoted so far.**
- **TWO COMMENTS IN `packages/sim` CITE RATIOS AGAINST A CONSTANT THAT HAS MOVED.**
  `loan.ts:279` ("235% of the whole I5 budget") and `tick.ts:686-687` ("5.3x the I5 budget
  before this branch existed"). Both are now false — against the derived budget they are
  ~6% and ~14% — and G-018's exit criterion forbids it touching `packages/`, correctly:
  a goal about a number in `tools/gates` has no business editing simulation files.
  **WHEN A GOAL NEXT LEGITIMATELY OPENS EITHER FILE, THESE ARE DELETED, NOT RESTATED.**
  Both are instances of `ADR-0007`'s amendment — a comment offered as evidence may not
  carry a figure no test pins — so restating them against the new budget would re-commit
  the original error with fresh arithmetic. What each comment is really claiming survives
  without any figure: the loan path was catastrophically expensive before it was fixed, and
  the branch in `tick.ts` skips work that once dominated the run. Say that, cite the goal,
  and stop. -> **the next goal to touch `loan.ts` or `tick.ts` for its own reasons.**

- **`roomWentBad` COVERAGE IN THE I2 PROOF IS ONE INCIDENTAL EVENT (G-014a).** The census
  reads `finished 1075 · roomWentBad 1 · itemDisappeared 1 · itemSurvived 2`; it read **3**
  for `roomWentBad` before G-014a. The two lost events were guests engaged with a sealed
  **games room**; the sealing pass now targets a **lounge**, which can never produce the
  cause — `hotel_lounge` has `"provides": []` and `providersFor` only admits entities whose
  kind provides the need, so it is **structural, not observed**. The survivor is the
  **despawn walk removing entity id 19 at tick 26,009** (observed at 26,010), a café that
  happened to have a guest in it. No shipped room type both provides a need and hosts a
  sole-provider item, so one sealed host cannot cover both causes; a third wave needs free
  floor-0 columns the log's cell audit has not established. `provider.determinism.test.ts`
  asserts `> 0` and **deliberately not `=== 1`**, because the survivor is incidental and
  `=== 1` would go red on any unrelated schedule shift, leaving a future author unable to
  tell "I broke the cause" from "I moved a tick". -> **a goal that owns the determinism log.**

- **SEEDS ARE INERT UNTIL M4 — do not spend a goal on multi-seed sweeps.** Measured at
  G-014a across seeds 1/3/7/11/23/99: byte-identical need tables, because arrivals are
  scheduled by the harness rather than drawn from the PRNG until demand lands. Vary the
  **hotel shape** instead, which is what found G-014a's result. -> **M4 retires this.**

- **CRITERION 2'S FOURTH REASON HAS A MARGIN OF ONE (G-015).** The pinned invocation
  `--days 30 --seed 7 --rooms 6 --build 720 --demolish 2880` produces `satisfied 90 ·
  gaveUpWaiting 263 · evictedRoomGone 5 · evictedRoomUnusable 1`. **The fourth reason is a
  single episode**: one guest whose floor-1 room lost its support when the ground-floor room
  under it was demolished. Any change to the build cadence, the demolish cadence, `--rooms`,
  the plot walk, the arrival rate or the stay length can stop it happening, and criterion 2
  then goes red reading "three reasons, expected four" — which looks exactly like a broken
  eviction split and almost certainly is not. `outcome.report.test.ts` asserts the count is
  **1** in a test named to be read first, with the diagnostic order written out, so the
  margin is a fact in the file rather than a surprise. **The right repair is to retune the
  invocation until a guest is again evicted from a standing room, not to weaken the
  criterion to three.** Same shape as G-014a's `roomWentBad` survivor above, and note the
  deliberate difference: there the assertion is `> 0` because the event is incidental to
  what is being proved; here the count IS the criterion, so it is pinned and its narrowness
  is documented instead. -> **any goal that changes the CLI schedule or the plot layout.**

- **FOUR OF THE FIVE OUTCOME ROWS HAVE NO CROSS-SUBSYSTEM WITNESS (G-015).** L2
  (`countRoomRevenueTransactions === the satisfied row`) catches any misfiling that touches
  `satisfied`. A misfiling between `gaveUpWaiting` and `evictedRoomGone`, or between the two
  eviction reasons, moves nothing anywhere — an eviction writes no ledger entry, so there is
  no second input to compare against, and the conservation law is blind to all of them by
  construction. **This is a gap in evidence, not a defect**: the split is covered at run
  level by the bench goldens (19/0/0 on the churn arm) and the criterion-2 pin, and inventing
  a ledger entry for an eviction to make a law possible would be the tail wagging the dog.
  The honest second input, if one is ever wanted, is a **review** that records why the stay
  ended — G-019 builds the first thing that reads an outcome. -> **G-019, or M4's sweep.**

## Deferred during G-020b — the tick-cost tripwire (2026-08-09)

- **The running product of tick-cost ratios across a milestone, as a REPORTED number** —
  `sim-critic`'s shape at PLAN: a per-goal bound of 1.4557 passes seven goals at 1.45 each,
  which is 15× spent with the gate green every time. The cheap middle shipped instead: the
  gate prints one `TICKCOST` line carrying all FIVE of rule 4's slots — including the regime,
  which it reads off the machine rather than leaving to a human to append — and REFLECT already
  records readings in the goal block, so the product stays computable by hand.
  **FALSIFICATION TEST, attached per §4**: after three M3 goals, multiply the recorded
  per-goal ratios. *If the product materially exceeds the largest single reading, the
  per-goal gate has the compounding hole and the milestone-anchor version earns its cost;
  if the product tracks the largest single reading, the hole is theoretical and this stays
  parked.* Its honest cost is already known — an anchor drifts from the working tree's API,
  so the INCOMPARABLE rate worsens the longer a milestone runs.
- **The minimum mutation the tripwire can actually detect, as opposed to the bound it
  states.** G-020b's mutations were sized for a proof that does not flake (M1 quadratic
  ~2.1–2.5×, M2 constant ~1.76–2.11× at a 3-day probe arm, six runs), not for minimality.
  **FALSIFICATION TEST**: bisect `CONSTANT(k)` at the shipped 30-day arm until the verdict
  flips, n≥5 per k. *If the flip lands near 1.4557 the bound and the sensitivity agree; if it
  lands well above, the gate is less sensitive than its bound claims and the claim comes out.*
- **A tick-cost reading against a pre-G-013 revision for the whole guest loop**, not only for
  `needs.scaling.test.ts`'s arm — G-020c takes the arm; the loop-wide question is wider than
  that goal and needs the instrument's reachable history mapped first.
- **`--repeat` on the tripwire is forwarded but never used by the gate.** It buys evidence at
  linear cost and nothing currently calls for it. **FALSIFICATION TEST**: if `check:tickcost`
  ever produces a disputed reading, run `--repeat 5` and compare the median against the single
  reading; *if they differ by more than the 2.29% real-pair overshoot, the single reading was
  not enough and the gate's default should change.*

## Deferred during G-014b — the dwell term (2026-08-09)

- **A DWELL TERM: a minimum engaged duration, distinct from the abandon margin.** Ruled out
  of G-014b at PLAN after `ai-critic`'s §5.6 MAJOR 1 established that **no non-saturating
  margin can guarantee a guest completes an engagement it starts.** A margin governs the
  *gap* between two needs' pressure, and the gap keeps moving while a guest is served —
  patience regenerates on the served need (`needs.ts:401`) and burns on the waiting one, so
  the two rates combine. Against the shipped table (engagement patience 300/360/300,
  `satisfyTicks` 150/150/180): completing the longest engagement needs `M >= 12000`, which is
  **over the 10000 ceiling**; completing the shortest needs `M >= 10000`, which is the
  saturating margin that turns the feature off. Only the reverse-switch property is reachable,
  and that is what G-014b ships at `M >= 6000`.
  **FALSIFICATION TEST, attached per §4**: in a recording at the shipped margin, count guests
  that abandon an engagement carrying more than half its `satisfyTicks` of progress. *If that
  count is material, the margin alone is insufficient and a dwell term earns its own goal; if
  it is near zero, the reachable case is a corner and this stays parked.* The worked reachable
  case is already in hand — two needs at pressure 3333, a provider frees, and at `M = 6000` the
  guest abandons after 90 ticks with 90 of 180 progress. **-> M3, or the first goal that finds
  the count material.**

  **THE TEST WAS RUN, IN THE SAME GOAL THAT PARKED IT, AND IT CAME BACK POSITIVE (G-014b BUILD,
  2026-08-10).** It cost one pass over a recording this goal had already made for its WATCH,
  which is the §4 hypothesis-with-its-test rule doing exactly what it was written for.

  *What was measured*: abandonments in which the abandoned need already carried more than half
  its own `satisfyTicks` of progress · *over what workload*: `--days 3 --seed 7 --rooms 6
  --arrivals 60 --amenities 2`, the criterion configuration, recorded with `--record-every 5` ·
  *sample count*: **at the shipped margin, all 38 abandonments are individually observable and
  the arm is complete. At margin 0 they are NOT: 1,616 abandonments occur and only 1,334 are
  observable at `--record-every 5`**, because 280 sampled transitions carry two increments and
  one carries three. So the thrash row's statistics are taken over 1,334 and its denominator
  must be 1,334 · *aggregated how*: count and median of the progress share · *regime*:
  irrelevant by construction (a deterministic count, not a timing); quiet, `win32`/12 cores.

  | margin | abandonments | observable | carrying > half | median progress share | max |
  |---|---|---|---|---|---|
  | 6000 (shipped) | 38 | 38 (all) | **35 (92%)** | 0.650 | 0.956 |
  | 0 (thrash) | 1,616 | 1,334 | 326 (**24%**) | 0.300 | 0.987 |

  **THE 20% IN THE FIRST VERSION DIVIDED A COUNT TAKEN OVER 1,334 BY A DENOMINATOR OF 1,616**
  (`ai-critic`, verification pass; both counts re-derived by the orchestrator — summed
  increments 1,616, per-(guest,need) transitions 1,334, delta histogram 1,053×1 + 280×2 + 1×3).
  **It is the same class as the "engagement stints" defect fixed forty lines away in the same
  round** — a frame walk that cannot see everything, asserted as complete — which is exactly
  what §5.8 asks a fix on a known class to go looking for. The invisible increments are the
  rapid-succession ones, so the omission biases the thrash median UP and the conclusion is
  conservative either way: **92% against 24% survives, and the shipped row is unaffected.**

  **92% is material by any reading of the word**, and the shape is the opposite of the
  intuition: it is the SHIPPED margin, not the thrash arm, whose abandonments land late in an
  engagement. That follows from the mechanism rather than contradicting it — a wide margin
  takes a long time to be cleared, and the longer the incumbent has been served the more
  progress it has. So **the dwell term is no longer a hypothesis with a test attached; it is a
  result waiting for a goal**, and its own falsification test is discharged.

  **AND THE RETURN VISIT IS THE SYMPTOM, NOT THE MITIGATION** (`ai-critic`, sweep 1). This
  entry first offered *"the guest returns to the need later if it can"* as a reason the cost is
  unestablished. It is the opposite: the WATCH recording shows the four highest-progress
  abandonments in three simulated days are all the same shape — **a guest walks out of a
  provider it is a few ticks from finishing, spends time elsewhere, and comes back to finish
  it** — **four of four return and complete.** Guests 9, 17 and 57 leave an arm chair at 95.3%
  and return **to the same entity**. Guest 63 leaves a café at 95.6%, **the café then stands
  free for fifty ticks**, and 265 ticks later it finishes the last six ticks of that meal at a
  **vending machine — fit 2500 against the café's 7500.** Frame references and ticks are in
  `JOURNAL.md`. A round trip across the hotel to finish something one was already finishing —
  sometimes at a three-times-worse provider, while the thing abandoned sits empty — is exactly
  what §6.1 item 6 describes, and it is the strongest argument the dwell term has.

  What remains genuinely UNESTABLISHED is the price in outcomes: progress is retained
  (`abandonNeed`), and at this configuration the shipped margin still meets 1,604 engagement
  needs against total commitment's 1,423 — so the round trips are not, on these numbers,
  costing satisfaction. **The dwell term's case is perceptual before it is numerical, which is
  why the human's WATCH is the thing that decides it. -> M3, and it now arrives with its
  evidence rather than with its question.**
- **PROVIDER-UPGRADING WITHIN ONE NEED.** G-014b rules the within-need choice **totally
  committed** — a guest never leaves a half-eaten meal to eat the same meal at a nicer table.
  Fit is ordinal by ruling (`schema.ts:78-88`, and `utility.test.ts` proves an order-preserving
  relabel is byte-identical), so a margin denominated in fit would make inert magnitudes
  load-bearing and owe derivations under §2.1 that nobody can supply.
  **FALSIFICATION TEST**: count, in a recording, switches between two providers of the *same*
  need per simulated day. *If a future goal wants this, that count is the number it must move;
  if it is zero under contention, the commitment is already total in practice and the question
  is closed.* **-> M3, after travel time makes the trade real.**
- **A `bindContent` REFUSAL OF A TWITCHY MARGIN.** Rejected for G-014b because margin 0 must
  stay loadable — it is the thrash control arm criterion 3 depends on. Revisit only if a
  content-authoring path outside the test suite can set it. **-> M6.**

## Discovered during the G-014b BUILD (2026-08-10)

- **A PROVIDER THAT SERVES BOTH THE INCUMBENT NEED AND THE CHALLENGER NEED IS INVISIBLE TO THE
  SWITCH.** The price of MAJOR 4(a)'s ordering, stated rather than discovered later. The search
  that decides the switch runs while the guest still holds its provider, and `findFreeRoom`
  skips everything in `held` — which is exactly what stops a guest abandoning into nothing and
  stops it "switching" to the thing it is already at. The consequence is that a guest could walk
  from a provider that could have served its new need to a second one that also does.
  **NO SHIPPED CONTENT CAN REACH IT**: no room type or item in `packages/content/data` provides
  two needs, and `utility.hysteresis.test.ts` drives the case on constructed content and pins
  the current answer (no switch) so that changing it is a decision rather than a drift.
  **FALSIFICATION TEST, attached per §4**: in a recording, count switches whose ABANDONED
  provider also `provides` the challenger need. *If that count is zero — which it must be under
  any content where no provider serves two needs — the question is closed for that content; the
  first content table that gives one provider two needs is the goal that owes the answer.*
  Closing it properly means letting the search consider what the guest already holds as a
  candidate for another need, which is a different decision from this one. **-> M6, or the first
  content table with a dual-purpose provider.**

- **THE `--arrivals 1` / STARVED HOTEL MAKES THE MARGIN COST SATISFACTION, AND NOBODY HAS
  DECIDED WHETHER THAT IS RIGHT.** Measured over the amenity sweep in
  `hysteresis.report.test.ts`: at `--rooms 6 --arrivals 60 --amenities 1` the shipped margin
  meets 852 engagement needs where total commitment meets 952 — **11% WORSE**. At `--amenities 2`
  it is 13% BETTER (1,604 against 1,423) and at `--amenities 3` it is identical. So the margin
  helps a hotel with some slack, does nothing to a saturated one, and hurts a starved one.
  **FALSIFICATION TEST**: re-run that sweep after M3 puts travel time in the score. *If the
  starved arm is still worse, the margin wants a term that knows the hotel is full — and the
  honest form of that is queueing, which is M3's own subject; if travel time closes it, this was
  an artefact of every provider being equidistant.* **-> M3.**

---

## Discovered during the G-021 BUILD (2026-08-10)

- **THE ARITHMETIC-BETWEEN-RUNGS BAN IS ENFORCED IN THE FORMAT AND IN THE CONSUMERS, NOT IN
  `apps/game` — WHICH IS WHERE THE RULING'S OWN FAILURE LIVES.** The human's rule 2 names the
  failure as *"M5 hardcodes 1x/2x/3x against content that does not mean that"*. Three
  mechanisms carry it today: the closed key set (`strictObject`, so no `multiplier`/`base` can
  exist and every rung states its own speed), the label refusal (a rung may not be NAMED "2x"),
  and a consumer proved to reduce by `max` rather than by position. **None of them can see
  `ladder[i].ticksPerRealSecond / ladder[0].ticksPerRealSecond` in render code**, because that
  binds nothing and `apps/game` is shut until M5 (§9). `speed-ladder.scan.test.ts` already has
  `apps/game/src` in its root set, so the declaration half fires the day it appears.
  **FALSIFICATION TEST, attached per §4**: at M5, add a synthetic `apps/game` source computing a
  rung from another rung and assert the scan reports it. *If a syntactic pattern cannot separate
  that from legitimate arithmetic over speeds — a tick-accumulator dividing by ticksPerSecond is
  not a violation — then the ban is unenforceable in code and the honest response is to say so
  in the schema comment rather than to keep implying a check exists.* **-> M5.**

- **A RUNG SLOWER THAN ONE TICK PER REAL SECOND IS CURRENTLY UNEXPRESSIBLE.**
  `ticksPerRealSecond` is `z.int().min(1)`, for ADR-0002's reason one domain over: a fractional
  rate reaches a real-time scheduler at M5 and accumulates differently per platform. The ruled
  ladder does not need one (the careful rung is 5) and 1x was killed as dead, so nothing is
  blocked today. **FALSIFICATION TEST**: `parseSpeedLadder` on a rung of `0.5` throws, and
  `speed-ladder.budget.test.ts`'s battery pins that in both validators. *The day a designer
  wants a slower rung, that throw is the trigger; the fix is a rational rate — ticks per N real
  seconds as two integers — not a float.* **-> M5 or M6.**

- **THE VIEWER'S REVIEW CONTROL IS A FIXED STRIDE OF FOUR, AND NOBODY MEASURED FOUR.**
  `REVIEW_FRAME_STRIDE = 4` restores roughly what the deleted hardcoded 120 gave over the
  30-rung top speed, and it is a scrub over a recording rather than a play speed, so it is not a
  bound under §2.1 — no decision is compared against it. **FALSIFICATION TEST**: if G-019's
  watcher reports that reviewing a 30-day recording is still too slow, or that four skips too
  much to follow, the number is wrong and the honest fix is a second stride rather than a rung.
  *Nothing else in the repo should ever read it.* **-> G-019's WATCH, or delete with the viewer.**

- **`check-measure.mjs`'s AND `check-tripwire.mjs`'s `REPO_ROOT` REWRITES ARE SILENT IF THEY
  MATCH NOTHING**, unlike the `patches` loop three lines above them, which throws. G-021 added a
  third rewrite (`budget.mjs`) and gave that one an assertion, but left the two incumbent
  `.replace` chains on `measure.mjs` as they were — a repoint that quietly did nothing would
  leave those gates red for a reason nobody could read. Not repaired here because both files
  belong to G-020c's open instrument work and this goal had no business widening its diff into
  them. **FALSIFICATION TEST**: change `const REPO_ROOT = resolve(GATES, '../..');` in
  `measure.mjs` to any other spelling and run `pnpm check:measure`. *If it fails with a
  git/materialise error rather than "the probe could not repoint", the silent-replace hazard is
  real and the fix is two lines.* **-> G-020c.**

- **THE COMMENT-STRIPPER CANNOT SEE A REGEX LITERAL, AND THE COPY THAT MATTERS SITS BEHIND
  THREE INVARIANT GATES.** A quote inside a character class (`["']`) opens a string it never
  closes, so every comment for the next several dozen lines survives stripping. It cost this
  goal one debugging cycle: the new scan reported two violations inside its own explanatory
  comments. **THE FIRST VERSION OF THIS ENTRY NAMED ONLY THE TWO TEST FILES — the §5.8 sweep
  stopped at the tests, which is verbatim the shape `CLAUDE.md` records for G-016's
  retraction, and `sim-critic` found it.** The live locations:
  - **`tools/gates/lib/scan.mjs:41`** — the identical function with the identical omission,
    imported by **`check-purity.mjs:19` (I1)**, **`check-content.mjs:28` (I3)** and
    **`determinism.mjs:22` (I2)**. (`check-measure.mjs:75` and `check-tripwire.mjs:68` import
    only `finish` and do not carry it.)
  - `tools/headless/src/viewer.readonly.test.ts` — its own copy, same omission.
  - `speed-ladder.scan.test.ts` — fixed here, by building the pattern from a string.

  **NOT A BLOCKER, AND THE DIRECTION IS WHY**: an unterminated span is emitted VERBATIM rather
  than blanked, so comments SURVIVE and the gate false-positives. It fails loud, and nothing is
  silently removed from what I1, I2 and I3 inspect.
  **FALSIFICATION TEST**: add a regex literal containing a quote — `/['"]/` — to a file scanned
  by `check:purity`, put a banned identifier in a comment beneath it, and run the gate. *If the
  gate reports a violation in that comment, the three-gate copy is confirmed live and the fix is
  regex-literal handling in `lib/scan.mjs` alone, which all three inherit. If it does not, this
  entry is wrong about `scan.mjs` and only the two test copies carry it.* **-> whichever goal
  next touches a source scanner; it is one function.**

## Deferred during G-021 — the speed ladder as content (2026-08-10)

- **A TEST THAT RESOLVES `verify.mjs`'s IMPORT-AND-SPAWN GRAPH** and asserts which of the ten
  rows reach `tools/gates/budget.mjs`. Offered by `sim-engineer` and **declined by it in the
  same breath**, correctly: new checkable surface in the last hour of a goal is how the
  fat-goal defect starts (§5.5). **Why it is worth having**: the paragraph at `budget.mjs:27`
  documenting that blast radius **was wrong three times in three directions in one goal** —
  the orchestrator overstated it ("with no code edit"), the builder undercounted at three, the
  fix undercounted at four; it is five. It now states the RULE rather than a count, which
  ADR-0007's amendment requires of prose that cannot be verified — but the rule is still prose.
  **FALSIFICATION TEST, attached per §4**: build the graph resolver, run it against the shipped
  tree, and compare its row set to the rule's plain reading. *If they agree, the prose was
  adequate and this stays parked as a nicety; if they differ, the rule joined the count in
  being wrong and the mechanism has to be code.* **-> G-020c, or the first goal that touches
  `verify.mjs`'s row list.**
- **AN M5-ERA SCAN FORBIDDING COMPUTED MULTIPLIERS IN `apps/game`.** The honest limit of this
  goal's enforcement: nothing in `packages/content` can stop render code computing
  `ladder[i].ticksPerRealSecond / ladder[0].ticksPerRealSecond`, and that is the failure the
  ruling actually names. **FALSIFICATION TEST**: when `apps/game` exists, add it to
  `speed-ladder.scan.test.ts`'s roots; the test that the scan bites is a synthetic source
  computing that ratio, which must produce a violation. **-> M5.**

## Deferred during G-020c — the two unreliable-gate defects (2026-08-10)

- **A SHIPPED PROOF-OF-BITE GATE FOR `check:scaling`** (`check:scaling:proof`, a
  `check-tripwire.mjs` sibling). **The seam the orchestrator TOOK at PLAN** — a third ~600-line
  proof harness is what would have made this goal unsweepable, and G-020b's proof harness took a
  round to get right and shipped a hand-typed count in the file built to hunt hand-typed counts.
  What exists instead: `scaling.bound.test.ts` pins the arithmetic and nudges a reading to watch
  the bound move, and the bite was witnessed ONCE at VERIFY with the stash recipe.
  **FALSIFICATION TEST**: apply G-020b's M1 quadratic to `guests.ts` and run `pnpm check:scaling`
  at n>=3. *If it reddens every time, the witnessed run generalises and a shipped proof gate buys
  only regression protection for the probe itself; if it reddens intermittently, the gate's
  sensitivity is below its bound and that is a §2.0 finding about `check:scaling`.*
- **THE `needs` AXIS HAS THE THINNEST MARGIN IN THE REPO — 1.0472x over the worst reading
  observed in any regime**, against 1.25-1.35x for the other three. It is inside its two
  constraints and it is the axis most likely to produce the next false red.
  **FALSIFICATION TEST**: run `pnpm check:scaling` n>=20 quiet and count reds. *If the rate is
  zero, the 1.2018x QUIET margin is the one that governs and the pooled figure is conservative;
  if it is non-zero, the instrument needs more samples per reading and the campaign must be
  RE-TAKEN at the new sample count (never pooled — ADR-0015).*
- **THE THREE-ARM AND FOUR-ARM NEED ROTATIONS ARE DIFFERENT QUANTITIES, AND NOBODY HAS
  MEASURED THE GAP ON THIS INSTRUMENT.** `sim-critic` measured 10.5% between them at the median
  in one alternated sitting; this goal took the ruling and ran both revisions on the three-arm
  rotation rather than re-deriving the gap. **FALSIFICATION TEST**: alternate
  `--rotation needs` and `--rotation needs3` in one sitting, n>=9 each, and compare the `needs`
  ratio. *If the gap is under this instrument's ~12% resolution, the rotations are
  interchangeable for this axis and `check:scaling` could drop an arm; if it is above, every
  cross-rotation comparison in this repo needs the rotation named beside the number.*
- **`stripComments`'s REGEX-LITERAL BLIND SPOT, NOW OBSERVED TWICE.** A quote inside a regex
  literal opens a string span that never closes, and the shared copy at
  `tools/gates/lib/scan.mjs:41` sits behind I1, I2 and I3. G-021 parked it; G-020c hit it in a
  new file within one goal. Still parked, and the reason is unchanged and worth restating: the
  failure direction is a LOUD FALSE POSITIVE — comments survive stripping and a gate fires on
  its own prose — so nothing is silently omitted from what those gates inspect.
  **FALSIFICATION TEST**: add `const p = /'[^']+'/g;` to a file under `packages/sim/src` and run
  `pnpm check:purity`, `pnpm check:content` and `pnpm test:determinism`. *If any goes red on
  prose below that line, the blind spot reaches an invariant gate and it stops being cosmetic;
  if all three stay green, the span closes before it reaches anything they scan and this waits.*
- ~~**`tools/gates/arm/needs3-arm.ts` IS TYPECHECKED BY NOTHING**, and its only proof is that
  `pnpm sim:needs-history` runs — *"which is true today"*.~~ **DISCHARGED IN THE SAME GOAL, AND
  THE PARKED NOTE WAS ALREADY FALSE WHEN IT WAS WRITTEN.** It was not true today: the file had
  been corrupted into an unparseable state by a scripted edit, `pnpm sim:needs-history` could not
  run, and **`pnpm verify` was eleven rows green over it** — no tsconfig in this repository
  references `tools/gates`, and no test imported it. `sim-critic` found it by reading the file.
  **Parking a known gap as a hypothesis let it read as a future risk when it was a present
  defect**, which is the failure mode of parking anything you have not just executed. The file
  now lives at `tools/headless/src/needs3-arm.ts` — the location it is copied to, so its imports
  resolve identically in the arm and under `pnpm typecheck`, which then found a second real
  defect in its types — and `needs-history.spawn.test.ts` executes it, including the
  module-identity refusal that had never once fired.
- **DEFECT B'S ACTUAL REMEDY — three candidates, none of them a concurrency cap.** G-020c
  measured the cap out: under 12 busy processes on 12 cores, `pnpm test` produced signature B in
  **10 of 10 runs across BOTH arms** (uncapped and `--maxWorkers=2`), with all 1,426 tests
  passing every time; quiet, it produced **0 of 20**. The discriminator is LOAD. Candidates, in
  the order they should be tried: (1) `pool: 'forks'` instead of the default worker threads;
  (2) a worker-count POLICY derived from a stated requirement rather than a number
  (§2.1) — e.g. leave one core free; (3) handle the RPC timeout so a starved channel does not
  become an unhandled error that fails a run whose tests all passed.
  **FALSIFICATION TEST**: run each candidate against the shipped configuration under
  `tools/gates/arm/load.mjs --workers 12`, n>=5, alternated with a control arm in one sitting.
  *If a candidate produces zero signature B where the control produces five, it is the remedy and
  it earns a goal; if all three still produce B, the defect is in the runner rather than in its
  configuration and the honest answer is that `pnpm test` is not a reliable gate on an
  oversubscribed machine — which is a charter question about I4 and belongs to the human.*
  **-> a goal of its own, and it blocks nothing until CI exists.**
- **DID THE CAP EVER WORK? The historical claim is WITHDRAWN, and it is answerable.** G-020c
  measured today's 1,426-test suite: capped and uncapped both produce signature B in 10 of 10
  loaded runs. It is tempting to read that back onto the 1,235-test sitting the cap was ruled in
  on — and that sitting was never re-run and never recorded its load condition, so inferring the
  regime from the absence of a label is **rule 4 run backwards**. **FALSIFICATION TEST**:
  materialise `72ae268` (the tree as it was when the cap was ruled in) with
  `tools/gates/lib/git-tree.mjs`'s technique plus `pnpm install --offline`, and run
  `tools/gates/arm/suite-signature.mjs --runs 5` per arm, quiet and loaded, alternated. *If the
  capped arm is clean loaded on that tree where it is not on this one, the cap DID work and the
  suite outgrew it — which would make suite size the lever and is worth knowing before anyone
  reaches for a cap again; if it fails there too, the original observation was a quiet-regime
  reading and this goal's account generalises.* **-> the goal that fixes defect B.**
- **A REAL 11-25% DIFFERENCE IN THE NEED-VECTOR RATIO BETWEEN HEAD AND PRE-G-013, AND IT IS NOT
  A MULTIPLE.** G-020c's discriminating measurement was built to answer "is there a multiple"
  and answered NO on the quiet arm — but its interval also EXCLUDES 1.0 (1.1071 .. 1.2534 at
  95.7% coverage, n=25 per revision, `win32/12cpu`, quiet, three-arm rotation), so a real
  difference is evidence rather than an open question. **Out of scope by this goal's own
  boundary**: optimising anything the measurement finds is its own goal.
  **FALSIFICATION TEST**: `pnpm sim:needs-history --base aa30218 --repeat 60` — a
  distribution-free median interval narrows with n, so this localises the ratio further at a
  cost of readings alone. *If the interval stays clear of 1.0, the difference is real and worth a
  goal that bisects it across G-013..HEAD to find which commit carries it; if it comes to span
  1.0 at larger n, the n=25 reading was a corner of the coverage and there is nothing to chase.*
  **Do NOT reach for a different instrument first** — an earlier draft of the goal block claimed
  one was needed, which was wrong: this one narrows with readings.

  **THE INTERVAL IS A PRE-G-027a READING AND THE INVOCATION NO LONGER MEASURES THE QUANTITY
  BEHIND IT (ADR-0015 REPLACE, applied to a parked experiment).** `needs3-arm.ts` holds its own
  `ARRIVAL_EVERY_TICKS = 32` — legitimately, because `needs-history.mjs` copies it into an
  extracted revision where `workload.mjs` does not exist — and ADR-0017 tripled the stay length
  on ONE SIDE ONLY. So the head arm now runs at **45 concurrent guests** (1,440-tick stay) and
  `aa30218` at **15** (480-tick stay), where both were 15 when 1.1071 .. 1.2534 was recorded.
  It is the same asymmetry ADR-0021's closing paragraph names for the tripwire — *no single
  `--arrivals` puts both arms at fifteen* — arriving in a ratio-of-ratios whose recorded arm
  predates it.

  **SO RUN AS WRITTEN, NEITHER CONCLUSION ABOVE IS AVAILABLE**: an interval that still excludes
  1.0 does not license *"bisect it"*, and one that spans 1.0 does not license *"there is nothing
  to chase"*, because the two arms no longer differ only in their revision. **THE RE-TAKE MUST
  RE-ESTABLISH A BASELINE BEFORE NARROWING ANYTHING** — the n=25 interval is not poolable with
  anything measured after G-027a — and it belongs with the tickcost and scaling campaign
  re-takes, which are the same class of debt.

---

## From G-019 — reviews

- **THE TOP-BAND SHARE IS NON-MONOTONE IN ROOM COUNT AND PEAKS AT THE SHIPPED DEFAULT, WHILE
  THE MEAN IS MONOTONE. THIS DECIDES WHICH STATISTIC M4's REPUTATION TERM MAY READ.**
  `balance-critic`, **1000 days**, seed 7, `--amenities 1`:

  | rooms | five-star share | mean |
  |---|---|---|
  | 1 | 25.00% | 2.750 |
  | **3 — `HOTEL_ROOMS`, the default** | **41.66%** | 3.583 |
  | 6 | 0.01% | 4.000 |
  | 12 | 0.01% | 4.000 |

  **Building from 3 rooms to 6 destroys 41.65 points of five-star share while raising the
  mean.** The SHAPE reproduces at 30 days and is pinned there in `review.report.test.ts`
  — 24.86% / 41.57% / 0.28% / 0.28%, means 2.75 / 3.59 / 4.00 / 4.00 — but the two tables are
  **different run lengths and their figures are not interchangeable**: the `--rooms 6` share
  differs by a factor of 28 between them, because that column is two opening transients
  diluted over 356 departures or over ~12,000. The 30-day arm is the pinned one because it is
  the one a test can afford to run; the 1000-day arm is the one that says the effect is not a
  short-run artefact. The cause is not a defect in the review function: a queueing guest completes its
  engagement needs while it waits, and below 145 of 180 patience ticks the queue costs it
  nothing — so a small hotel manufactures perfect stays out of the guests it fails to house.
  Nothing reads a review today, so nothing is broken; **the constraint is on M4.** A
  reputation term over the MEAN is safe, because the mean is monotone and building rooms
  cannot lower it. **A term over share-of-top-reviews INVERTS THE BUILD LOOP at the
  configuration a player starts in** — the third loop in `HOTELSIM.md` §1 running backwards.
  **FALSIFICATION TEST**: when M4's demand responds to reputation, run
  `pnpm sim:run --days 1000 --seed 7 --amenities 1` at `--rooms 1/3/6/12` and read
  `reviews.distribution`. *If the mean is still monotone in rooms, a mean-based reputation
  term is safe and this entry closes; if demand feedback breaks even the mean's monotonicity,
  no summary statistic of this scale is safe and the wait term needs to bite below 145 ticks
  — which is M3's territory, where wait becomes a first-class satisfaction input.*
  **-> the first M4 goal that reads a review.**
- **DOES THE SCALE SATURATE AT A CONFIGURATION A PLAYER CAN AFFORD? — now with its cost side.**
  At `--rooms 6 --amenities 5` every guest meets every need with no wait and every review is
  maximal. That is a correct answer to an oversupplied hotel and inventing a term to make a
  perfect stay review imperfectly is manufactured difficulty (ruling 4), and `balance-critic`
  does **not** read it as a dominant strategy — it priced it: the top band costs **22,500,000p
  per 1000 days at `--rooms 6`, 22.1% of room revenue**, against **4,500,000p (4.4%)** for the
  two bands `--amenities 1` buys. **The last band costs 4x the first two, so the ladder
  already has diminishing returns priced in.** ~~"Demand is a fixed cadence until M4, so
  'affordable' is not decidable now."~~ **STRUCK AT G-051b: IT IS DECIDABLE NOW.** Arrivals follow
  the star rating, so a hotel's sustainable density is something the simulation reports rather than
  something a flag imposes. *(Trigger note, and it is the same class as the seed-honesty test: this
  item says "when arrivals respond to REPUTATION". What shipped is the STAR RATING, and ADR-0082
  rules those two distinct systems. The precondition this item actually needed — arrivals
  responding to what the player builds — has arrived; reputation has not.)*

  **FALSIFICATION TEST — RUN AT G-051b, AND IT RESOLVES.** *"Re-run the amenity ladder at the
  density the hotel's own revenue sustains. If the top score is still modal there, the scale needs
  a term oversupply cannot buy; if the affordable density lands below it, the ladder is doing its
  job and this closes."* `--days 30 --seed 42 --rooms 12 --facilities 1 --demand`, one run per
  amenity level, exact deterministic integers, no aggregation, win32/12cpu quiet:

  | amenities | revenue | upkeep | balance | review distribution |
  |---|---|---|---|---|
  | 1 | 2,006,000p | 1,230,000p | 1,276,000p | 3:93, 4:362, **5:14** |
  | **2** | 3,944,000p | 1,365,000p | **3,079,000p** | **5:464** |
  | 3 | 3,944,000p | 1,500,000p | 2,944,000p | 5:464 |

  **THE AFFORDABLE DENSITY IS TWO SETS — it maximises the balance — AND THE TOP SCORE IS MODAL
  THERE**, in fact unanimous. **So the item resolves in its first branch and does NOT close: the
  scale needs a term oversupply cannot buy.** It is now a sharper statement than the parked one,
  because oversupply is no longer what buys the top band — a RIGHT-SIZED hotel does, and the third
  set is strictly dominated (135,000p more upkeep, not one penny more revenue, not one review
  better). -> **E-014**, which freezes the review scale and is the open human call this result
  belongs to. Do not act on it inside a balance goal.
  **-> the first M4 goal that reads a review.**
- **PER-NEED WAIT IN THE REVIEW.** The review's wait term reads the LODGING wait only, and
  that is forced rather than chosen: patience regenerates while a need is served, so final
  need state carries no wait information at all, and a per-need `waitedTicks` field could not
  be defaulted honestly at v9 -> v10 (a v9 guest waited and nothing recorded it — the
  invention ADR-0008 forbids). Engagement waiting is visible only as met/unmet.
  **FALSIFICATION TEST**: add `waitedTicks` per need in a scratch branch and re-run
  `--days 30 --seed 7 --rooms 6 --arrivals 60`, comparing the review mean. *If it moves by
  less than one score point the field buys nothing and stays parked; if it moves more, wait is
  a first-class satisfaction input and belongs in M3's goal, where queueing gives it something
  to measure.* **-> M3.**
- **THE §5.8 SWEEP FOUND THE VACUOUS-CRITERION CLASS IN TWO SHIPPED TESTS AND NEITHER IS
  REPAIRED.** `needs.report.test.ts:108,116,335` asserts that **two** of four need rows
  straddle met-and-unmet, so a build with two inert needs passes — the human's G-019 finding,
  one goal earlier, in a closed goal's recorded criterion. `hysteresis.report.test.ts:133,344`
  sums `abandoned` across rows, so three of four rows at zero satisfies it. Both are mitigated
  by per-row laws elsewhere (`buildSummary`'s need loop, `hysteresis.report.test.ts:286`), and
  widening G-019 to repair two earlier goals' criteria is how a fat goal starts.
  **FALSIFICATION TEST**: make two need types inert in a scratch branch — drop their providers
  from `room-types.json` — and run both files. *If they stay green, the criteria certify a
  build with half its need vector dead and are worth a goal; if something else catches it
  first, name what and close this.* **-> a goal of its own, or M4's sweep.**
- **DEPENDENCY-CRUISER IS THE LARGEST UNBITTEN SCANNER LEFT, AND IT SITS INSIDE I1.**
  `pnpm check:purity` is two checks: `check-purity.mjs`, which G-022 gave a proof-of-bite, and
  `depcruise --config .dependency-cruiser.cjs`, which catches the TRANSITIVE reach-through no
  per-file scan can see. Its six forbidden rules — `sim-not-to-render`, `sim-not-to-tools`,
  `sim-not-to-core`, `sim-zero-runtime-deps`, `content-not-to-sim-or-render`, `no-circular` —
  **have never been observed red by any committed test.** Not derivable by
  `scanner.census.test.ts`'s predicate either: it is a third-party binary, so there is no
  `readdirSync(` of ours to match, and the census names it under `NOT_DERIVABLE` rather than
  letting the silence read as coverage.
  **FALSIFICATION TEST**: mirror `tsconfig.base.json` and `.dependency-cruiser.cjs` into a temp
  tree with a synthetic `packages/sim/src/probe.ts` importing `node:fs`, run the repo's
  `depcruise` binary with cwd set to that tree, and assert exit non-zero naming
  `sim-not-to-core`; then remove the import and assert exit 0. *If the path-anchored `from`
  patterns (`^packages/sim`) resolve against the temp cwd, all six rules are bitable this way
  and it is one test file; if they resolve against the real repo root instead, the temp-tree
  route is dead and the honest fallback is a `git stash push -u` probe witnessed once at
  VERIFY with its reading recorded — which leaves nothing standing and should be said so.*
  **-> the next goal that touches I1.**
- **`check-content.mjs`'s THREE DATA-SIDE PREDICATES ARE UNBITTEN.** `content-gate.test.ts`
  covers the two CODE-side arms (a content id literal in `packages/sim`, a content table
  declared there). The gate also refuses invalid JSON in `packages/content/data`, a
  non-snake_case id, and a duplicate id across two data files — **none of those three has ever
  been watched failing.** Registered in `scanner.census.test.ts` with the gap stated rather
  than counted as covered, because "the gate has a proof" and "every arm of the gate has a
  proof" are different claims and the census makes the weaker one.
  **FALSIFICATION TEST**: extend `content-gate.test.ts` with three probes writing a broken
  JSON file, a `notSnakeCase` id and a duplicated id into a mirrored `packages/content/data`.
  *If all three redden with the id or file named, the arms are live and the census entry gets
  upgraded; if any passes, that predicate is the one to repair and it is a finding rather than
  a chore.* **-> a goal of its own, or the next I3 change.**
- **TWO SCANNER OVER-REACHES, BOTH PINNED BY G-022's NEW BITE TESTS RATHER THAN LEFT AS
  FOLKLORE.** (1) `check-purity.mjs` rejects a DECLARATION named after a host global — an
  interface field `process: () => void` inside `packages/sim` is refused, because the
  lookbehind excludes a preceding dot and not a preceding space. (2) `determinism.mjs` fires on
  a clock named inside a STRING LITERAL, since `lib/scan.mjs` blanks comments and keeps string
  bodies. Both are conservative, neither has ever fired on the real tree, and both are now
  asserted in `purity-gate.test.ts` and `determinism-gate.test.ts` so a later narrowing has to
  say so out loud.
  **FALSIFICATION TEST**: narrow either predicate and run `pnpm exec vitest run purity-gate
  determinism-gate`. *If exactly the two pinned arms redden, the over-reach is understood and
  the narrowing is safe; if anything else moves, the predicate did more work than the comment
  claimed.* **-> parked, not scheduled: neither is reachable from any legal sim today.**
- **TWO SCANNERS INSIDE ONE SUITE CAN COLLIDE, AND NOTHING WARNS YOU.** `determinism-gate.
  test.ts` has to write fixtures containing `Date.now` and `process.hrtime` so the I2 gate has
  something to catch; `stopwatch.scan.test.ts` scans every file in `pnpm test` for exactly
  those spellings and reported eleven matches. The repair was the one that scanner's own author
  used for the same problem — assemble the token from pieces so the SOURCE carries no
  contiguous copy while the RUNTIME string still does — rather than widening its EXEMPT table
  by eleven lines. Recorded because the next gate-bite test written inside the suite will hit
  it, and because "make the other guard looser" was the available and wrong answer.
  **FALSIFICATION TEST**: spell one fixture out contiguously and run `pnpm exec vitest run
  stopwatch`. *If it reports the line, the collision is live and the convention is load-bearing;
  if it stays green, the scanner has changed and this note is stale.* **-> a convention, not a
  goal.**
- **`stamp.mjs` COUNTS LINES ONE WAY AND SPLICES THEM ANOTHER, AND ONLY THE PLACEMENT OF A
  NEWLINE KEEPS IT HARMLESS.** `findStamp` numbers lines by splitting on `\n` (stripping a
  trailing `\r`); `replaceStamp` splices by the file's DOMINANT newline. In a CRLF file that also
  contains a lone `LF` **above** the stamp, the two numberings drift apart and `--set` would
  splice at the wrong offset — in the gate whose whole job is keeping four files in agreement.
  Found by `sim-critic` at G-022 sweep 1, raised deliberately as latent rather than as a defect.
  **Measured on the four ledgers at `4e768c9`**: `JOURNAL.md` is the mixed file — 1,927 CRLF and
  71 lone LF — and it is safe **only because its first lone LF sits at byte 126,676 while the
  stamp sits at byte 95**. `GOALS.md` and `DECISIONS.md` are pure CRLF, `PARKING.md` is pure LF,
  and a uniform file cannot exhibit it at all.
  **FALSIFICATION TEST**: build a CRLF ledger carrying a single lone `LF` in the digest body ABOVE
  the `*As of …*` paragraph, run `pnpm stamp:set "*As of …*"` against a tree containing it, and
  diff. *If the stamp lands on the wrong line, or any other line is disturbed, the hazard is live
  and the repair is to make both functions agree on one splitting rule — split once, carry the
  offsets; if the file comes back correct, the two numberings coincide more often than this
  analysis suggests and the note should say why.* **-> the next goal that touches `stamp.mjs`;
  it blocks nothing today and no ledger currently triggers it.**
- **`hysteresis.report.test.ts:385` IS MARGINAL UNDER LOAD, AND IT IS THE NEXT TEST TO TIP.**
  G-022's first loaded campaign after sweep 1 produced `A_NAMED_FAILURE` in 1 of 5 runs — not the
  goal's own new test, but G-014b's shipped one: *"THE SHIPPED PIN (2 of each): all three arms
  differ"*, **timed out in 30000ms with `slowestTestMs` 35,025**. It spawns real `--import tsx`
  CLI runs and takes 8.78s for the whole file quiet, so at twelve-way oversubscription it sits
  just the wrong side of the 30s default. **It did not fail once the same goal cut its own new
  test's child spawns from fourteen to five** (second campaign: 5 of 5 PASS, 1,657 tests, and the
  loaded suite's wall clock fell from ~94-117s to ~70-73s), so it is marginal rather than broken —
  it tips when anything else makes the suite heavier.
  **FIVE SIBLING TESTS ALREADY CARRY THE CONVENTION IT LACKS**: `}, 60_000)` explicit per-test
  bounds in `needs.determinism`, `needs.report` (twice), `recovery.report` and `validity.report`,
  all spawn-heavy for the same reason. This one was never given one.
  **DISCHARGED IN G-022 BY ORCHESTRATOR RULING, AND THE MECHANISM ABOVE WAS WRONG.** This entry
  said the test "spawns real `--import tsx` CLI runs". It does not: `reportOf()` at `:137-139` is
  the spawn and it is MODULE-LEVEL, run once and shared by every test in the file. The failing
  test calls `at()` three times, and `at()` binds content and runs the simulation IN PROCESS —
  **CPU-bound, not spawn-bound**, which is why cutting another file's spawns relieved it and why
  no amount of spawn-trimming would have fixed it outright. Checked by reading `:331-343`.
  **The repair applied is the one-liner its five siblings already carry** — `}, 60_000)` on that
  test — on the ruling that an unqualified zero over a parked 1-in-5 is not honest, and that a
  per-test hang bound is an argued convention rather than the global `testTimeout` widening §9
  forbids. **Verified under the loaded arm, 5 of 5 PASS.** Kept here rather than deleted because
  the wrong mechanism was believed for two rounds and the correction is the useful part.

## Discovered during the G-030 BUILD — the render layer opens (2026-08-12)

Everything here was cut from G-030 deliberately, or found by it and not fixed by it.

- **CAMERA PAN AND ZOOM -> G-031.** The view auto-fits the built extent, clamped to the
  world's own plot, and re-fits on resize. There is no camera because a camera is INPUT and
  the goal's own out-of-scope line assigns input to G-031.
  **FALSIFICATION TEST**: open the shipped hotel at 1920x1080 and read a room's badge and a
  guest's need bars. *If the badge is illegible or the built extent does not fit, auto-fit is
  insufficient and pan/zoom is required in G-031; if both are readable at the shipped six
  rooms, this stays parked until the player can build a hotel bigger than the window.*
  **-> G-031, or the first goal where a hotel outgrows a screen.**

- **INTERPOLATED MOVEMENT BETWEEN TICK STATES -> the first goal after G-023b.** The renderer
  draws each tick's world with no tween. **Nothing moves yet**, so there is provably nothing
  to interpolate: a guest's cell changes only when it engages or is housed, and G-023a placed
  every guest where it already logically was.
  **FALSIFICATION TEST**: once travel lands, watch one journey at the CAREFUL rung (5
  ticks/s, the slowest and therefore the most exposed). *If the guest visibly jumps more than
  one cell between redraws, interpolation is needed and it is its own goal; if a journey at 5
  ticks/s reads as continuous, the tick rate is already finer than the eye and interpolation
  is decoration.*

- **CONTENT CANNOT EXPRESS A COLOUR, AND THE RENDERER DERIVES ONE. THIS TEST HAS NOW FIRED
  ONCE — IT IS NOT UNTESTED.** `tools/viewer` reported the gap and said "M5 has to decide
  where it belongs for real". G-030's first answer was FNV-1a over the content id into a
  twelve-hue wheel, forced by ADR-0003 (a `{ 'standard_room': '#3f6fb5' }` table is a content
  id in `apps/game`).
  **THE FALSIFICATION TEST RAN AND THE DERIVATION FAILED IT.** A human watched the build and
  reported *"lots of washout of bars … it's not easy"*; measured afterwards, **32 of the
  wheel's 66 pairs were under 1.3:1 contrast and its worst pair was 1.00:1** — identical
  luminance, different hue. Reproduced independently during the repair, same figures, same
  pair (`0x50907c` vs `0x6f7fd0`).
  **THE REPAIR IS IN, AND IT IS NOT A RE-PARK OF THE SAME NOTE.** The wheel is replaced by
  per-role luminance ladders, spread geometrically across the band where every colour clears
  3:1 against the page, assigned by RANK rather than by hash so a small ladder cannot
  collide. Achieved: rooms 1.811:1 against a ceiling of 1.826, items 2.452 against 2.468,
  needs 1.814 against 1.826, and **0 pairs under 1.3 in any role**. Pinned by
  `tools/headless/src/palette.contrast.test.ts` over the SHIPPED content.
  **WHAT REMAINS PARKED IS THE ORIGINAL GAP, NARROWED BY WHAT WAS LEARNED.** Content still
  cannot express a colour, and two costs are now being carried that a content field would
  remove: (1) assignment by rank means **adding a room type re-derives the ladder and every
  existing room changes colour**, which is the stability property the hash had and the repair
  gave up deliberately; (2) the ladder's minimum contrast **falls as content grows** — the
  ceiling is `span^(1/(N-1))`, so 4 room types get 1.83:1, six get 1.45:1 and **eight get
  1.30:1, at which point the floor is reached and the test goes red**.
  **UPDATED FALSIFICATION TEST**: add room types until `palette.contrast.test.ts` fails, or
  until a WATCH reports washout again. *If the test reddens first, the mechanism is working
  and the answer is a colour field in `packages/content` — a fingerprint move, so a sim-track
  goal. If a human reports washout while the test is still green, the FLOOR is wrong rather
  than the scheme, and the number to revisit is `MIN_CONTRAST_WITHIN_ROLE`, which traces to a
  measurement of the build that failed rather than to a standard.*
  **-> a sim-track goal once content breadth approaches eight room types; M6 at the latest.**

- **THE LADDER SCAN FOLLOWS ONE LEVEL OF ALIASING, AND TWO LEVELS ESCAPE.**
  `tools/gates/check-ladder.mjs` registers `const base = rungs[0].ticksPerRealSecond` as a
  second name for a speed, so the hoisted form of the ban is caught. `const b = base;` is not.
  Recorded rather than closed, on the `scanner.census.test.ts:264` precedent: widening a regex
  until it matches every conceivable spelling is how a predicate becomes unreadable, and an
  unreadable predicate is what this class of gate exists to guard against.
  **FALSIFICATION TEST**: add a synthetic `apps/game` source doing
  `const a = ladder[0].ticksPerRealSecond; const b = a; return rung.ticksPerRealSecond / b;`
  and run `pnpm check:ladder`. *If it stays green the escape is live, and the fix is to match
  the LADDER BINDING (an array of rungs) rather than the field read, which is a different and
  larger predicate; if it reddens, this note is stale and should be deleted.*
  **A SECOND, NARROWER ESCAPE, same test shape**: two rung speeds passed as separate ARGUMENTS
  to a helper that divides them (`ratio(a.ticksPerRealSecond, b.ticksPerRealSecond)`) reads as
  comma-separated and is allowed. *Contrived rather than natural, which is why it is recorded
  and not chased.*

  **A THIRD ESCAPE — AN INDEX COMPUTED WITH ARITHMETIC — AND IT IS THE MOST NATURAL OF THE
  THREE TO WRITE.** `const base = rungs[i - 1].ticksPerRealSecond` is not registered as an
  alias at all, because the `-` inside the brackets fails the no-arithmetic clause, so the
  later `other.ticksPerRealSecond / base` is **silent**. Measured, both arms: the `rungs[i]`
  spelling of the same code **bites**, the `rungs[i - 1]` spelling **does not**.
  **IT WAS CREATED BY THE FIX FOR THE PREVIOUS SWEEP'S FINDING** — the no-arithmetic clause
  that distinguishes a speed from a tick count — and it then went unrecorded for a sweep while
  the gate's own prose said all three escapes were parked. That is the same defect as the
  aliasing claim it was introduced to repair: **a statement slightly larger than its record,
  in the sentence declaring the instrument discharged.** Found by `render-critic`, sweep 2.
  **FALSIFICATION TEST**: `pnpm exec vitest run ladder-arithmetic` contains the pair as an arm
  asserting the escape is SILENT and its control BITES. *If the silent arm ever reddens,
  somebody has closed the escape and this bullet should be deleted; if the control arm
  reddens, the alias rule has broken and the escape is the least of it.* Kept as an executable
  arm rather than a note precisely because the previous two escapes were prose and one of them
  was still missing when the sweep looked.

  **AND THE PREDICATE HAS TWO KNOWN FALSE POSITIVES, WHICH ARE DELIBERATELY NOT FIXED.**
  `const shown = String(rung.ticksPerRealSecond)` and `const isTop = rung.ticksPerRealSecond > 0`
  both register a NON-speed as a speed alias, so combining either with another rung read
  reports as arithmetic between two rungs. Both are asserted as arms.
  **WHY THEY STAY**: every available tightening buys a silent miss with a loud report. Banning
  calls in an initialiser would also drop `(rung).ticksPerRealSecond`; banning comparisons
  would also drop `paused || rung === undefined ? null : rung.ticksPerRealSecond`, which is
  the spelling the shipped renderer contains and the one sweep 1 raised. **A false report
  costs a reader five minutes and arrives with a file and a line; a silent miss certifies a
  clean tree forever and nobody looks.** *If a real one ever fires on honest code, the fix is
  to rewrite that line or to record the exception — not to widen the predicate a third time.*

- **NOTHING PROVES POSITIVELY THAT THE SPEED CONTROL READS CONTENT — only that no speed is
  declared in code.** `check:ladder` and `speed-ladder.scan.test.ts` are both NEGATIVE: they
  prove the absence of a constant and of arithmetic. A renderer that read the ladder and then
  ignored it would pass both. The positive is discharged at WATCH by mutation
  (`git stash push -u`, rename a rung and change its rate, reload, observe, `git stash pop`),
  which is a human action and not a gate.
  **FALSIFICATION TEST for the automated version**: whichever mechanism arrives first — a pure
  ladder module reachable from a test, or `apps/game` entering vitest's include set — assert
  that a rung renamed in JSON renames the button. *If neither ever arrives, this criterion is
  permanently discharged by a human at WATCH and that should be stated in the goal rather than
  implied.* **-> G-031, which already owns the UI-versus-headless hash criterion.**

- **`apps/game/src/scenario.ts` IS A STAND-IN FOR DEMAND AND FOR THE BUILD LOOP.** Six lodging
  rooms, one of each amenity, an arrival every 120 ticks, seed 7, all fixed. Arrivals answer to
  nothing — not reputation, not price, not whether a bed is free — because none of that exists
  before M4.
  **FALSIFICATION TEST**: when arrivals respond to reputation, a played session's occupancy
  must vary with the review distribution. *If occupancy is invariant across sessions with very
  different reviews, the fixed cadence is still in the path and this file is still deciding
  something M4 owns.* **-> M4; the file shrinks to an opening position at G-031 and to nothing
  after M4.**

- **THE ACCUMULATOR RUNS EXACTLY ONE TICK BEHIND THE IDEAL AT SOME FRAME RATES, AND IT IS A
  BOUNDARY EFFECT RATHER THAN DRIFT — MEASURED, NOT ASSUMED.** Ticks spent against the ideal
  `seconds x rung`, synthetic uniform frame intervals, one sitting, win32/12cpu, at the
  CAREFUL rung (5/s, the most exposed): **10s, 60s, 600s and 3600s all read exactly -1 at
  30fps and 144fps, and 0 at 60fps and 240fps.** The deficit does not grow with the window, so
  the retained carry is doing its job and the missing tick is the one still in it.
  **AND THE WORLD ITSELF IS FRAME-RATE INDEPENDENT, WHICH IS THE STRONGER CLAIM**: three
  drivers at 30fps, 144fps and 61.7fps, each run to tick 1440 at the top rung, produce the
  state hash `3d137625a086e431` — identical, same sitting, same machine.
  **FALSIFICATION TEST**: re-run the same comparison after G-023b makes guests move. *If the
  three hashes still agree, the boundary holds through the first goal that adds per-tick
  motion; if they diverge, something in the render loop has begun feeding the simulation and
  I2's tripwire has a new customer.* **-> G-031, which formalises this as an exit criterion.**

- **I3's GATE DOES NOT SEE AN UNQUOTED OBJECT KEY, AND THAT IS THE SPELLING A CONTENT-KEYED
  LOOKUP TABLE ACTUALLY USES.** `check-content.mjs:77` walks `stringLiterals(source)`, so a
  content id reaches code unnoticed the moment it is written as a bare key:

  ```
  { 'standard_room': 0x3f6fb5 }   caught, both roots        <- the quoted spelling
  { standard_room: 0x3f6fb5 }     NOT caught, either root   <- the natural spelling
  ```

  **Probed during G-030's build** against a mirrored tree (`check-content.mjs` plus
  `lib/scan.mjs` copied to a temp root, one file per root, one spelling at a time), so both
  roots and both spellings were exercised separately rather than inferred. `packages/sim`
  is affected identically to `apps/game`.
  **IT IS ADR-0007's CLASS INSIDE AN INVARIANT GATE**: the check succeeds while inspecting
  nothing, and it does so most confidently about a palette or a stats table — the two things
  ADR-0003 was written for. G-030 did NOT rely on it: the derived-colour scheme in
  `apps/game/src/view/palette.ts` was chosen because it is better than a table, and the
  comment there now states what the gate does and does not see rather than implying cover.
  **FALSIFICATION TEST**: extend `content-gate.test.ts` with an arm writing
  `export const P = { standard_room: 1 };` into the scanned tree. *If it stays green the gap
  is live and the repair is to scan identifier-position tokens as well as string literals —
  and the cost of that is the question, because a bare `max_speed` local is snake_case and is
  not a content id, so the predicate has to be keyed to the ids the content actually declares
  rather than to the shape of the word. If it reddens, this entry is wrong and should be
  deleted.* **-> a sim-track goal; widening an invariant gate's predicate is not a render
  goal's to do, and it needs the id-set decision above made deliberately.**

## Discovered during the G-030 legibility repair — after the first WATCH (2026-08-12)

- **THREE ROLES' TOP RUNGS ARE ALL NEAR-WHITE, AND NOTHING CURRENTLY DISTINGUISHES THEM BY
  COLOUR.** Each role's ladder ends at the top of the luminance band, so `standard_room`
  (`#ebfdff`), `vending_machine` (`#eefcff`) and `night_rest` (`#f9f9ff`) are all but the same
  colour. It is judged harmless because the three are never the same SHAPE or the same SIZE: a
  room is a whole cell, an item is an 8px pip on a dark plate, and a need is a bar above a
  guest's head. Separation WITHIN a role is what the contrast test asserts, and across roles
  it is carried by geometry rather than by colour.
  **FALSIFICATION TEST**: at a WATCH, ask whether a white room, a white pip and a white bar
  are ever confused for one another. *If they are, the fix is to give each role its own
  sub-band of the luminance range — which costs every role some within-role contrast, and that
  trade should be made against a measured complaint rather than pre-emptively.*
  **-> the next WATCH that reports confusion; nothing until then.**

- **A GUEST'S FULL NEED VECTOR WAS REMOVED, AND WATCH #6 PUT IT BACK. THIS TEST HAS FIRED AND
  BEEN ACTED ON — IT IS NOT UNTESTED, AND IT IS NOT OPEN.**
  The bars were cut to the single most urgent unmet need after WATCH #5 reported "washout of
  bars". The parked test was: *at a WATCH, try to answer "which need is this hotel failing at"
  from the picture alone.* **It fired at the next WATCH**, from the human, unprompted: *"I note
  I can only see one need at a time, whereas before I could see all needs."* The vector is
  restored, larger, on a dark plate, with the urgent column outlined so the "who is in
  trouble" reading survives inside the full vector instead of replacing it.
  **WHAT THIS COST, AND IT IS THE REUSABLE PART: THE REDUCTION WAS ARGUED FROM A CONFOUND.**
  The justification was "four 3px segments above a 13px body is not four readings, it is one
  smudge" and — decisively — **"it was not readable from the smudge either"**, which was a
  claim about someone else's perception, made without asking them, and false. The mechanism is
  that **the palette and the vector were changed in the SAME pass, and the vector's removal
  was justified by the state of the palette BEFORE the same commit repaired it.** Measured
  both ways: the need role's ADJACENT columns — which is precisely what a smudge is made of —
  separated at **1.019:1** under the old wheel and at **1.840 / 1.823 / 1.814 to one** under
  the ladder that shipped alongside the removal. Nobody had ever seen the multi-segment bar
  against the repaired palette. **Two changes in one pass, and the second solved a problem the
  first had already solved.**
  **THE STANDING LESSON, WHICH OUTLIVES THIS ENTRY**: when one pass changes both a signal and
  the medium carrying it, the change to the signal cannot be justified by observations taken
  through the unrepaired medium. Repair the medium, re-observe, then decide.
  **RESIDUAL FALSIFICATION TEST, for the reading the vector still does not give**: at a WATCH,
  try to answer *"which need is this HOTEL failing at"* — the aggregate, across all guests
  rather than per guest. *If that needs the HUD every time, the answer is a hotel-level
  read-out and not more per-guest ink; if scanning the row of guests answers it, this closes
  for good.* **-> the first M4 goal that needs a demand read-out.**

## Discovered during G-023a (2026-08-12)

- **A `check:tickcost` reading of 0.7978 sits BELOW anything in `tripwire.mjs`'s recorded
  campaign**, whose lowest null is 0.9268 and whose worst loaded excursion is 1.0973. Seen in
  G-023a's arm C (longhand + constant message), n=5, on a machine where another agent was
  compiling `apps/game` throughout. Raised by `sim-critic` as an observation and **explicitly
  not a finding** — arm C's median was withdrawn on its own merits, and *"C is withdrawn"* and
  *"C's spread is unremarkable"* are different claims of which only the first was made.
  **Why it is worth keeping**: the bound rests on a characterisation of the instrument's noise,
  and a reading 14% below the campaign's floor suggests that characterisation may not cover
  heavy concurrent compilation — a regime that is now NORMAL, because ADR-0018 permits parallel
  tracks. **FALSIFICATION TEST**: take a `--repeat 7` null campaign (working tree against
  itself, no change) under `tools/gates/arm/load.mjs --workers 12` interleaved with a quiet
  campaign in one sitting. *If the loaded null's spread reaches below 0.9268 or above 1.0973,
  `tripwire.mjs`'s `BOUND_CAMPAIGN` and `LOADED_OBSERVATIONS` do not describe the regime the
  project now runs in and the bound is owed a re-derivation under ADR-0016's REPLACE half; if
  it stays inside, arm C was a single excursion and this note is closed.* -> **the goal that
  next touches the tripwire, or M3 exit.**

- **G-023a's residual tick-cost ratio is ~1.05x and is an INPUT TO M3's RUNNING-PRODUCT TEST,
  not a parked item.** Recorded here only as a pointer so the M3 exit block can find it:
  arms D and D' read 1.0488 and 1.0521, agreeing to 0.003, above the quiet ceiling (1.0238)
  and below the worst loaded ceiling (1.0973), regime contended. The per-goal gate passes at
  1.4557 by design; **seven goals of +5% is 1.41x, which no per-goal reading sees.** This is
  the first measured input the running-product test has ever had.

## Discovered during G-030 VERIFY, by the orchestrator (2026-08-12)

- **THE RESERVED-HUE GUARD IS BINDING ON THE SHIPPED CONTENT, AT A MARGIN OF 0.14%.**
  `games_room` receives `#be004f`, hue **335.05**, against a reserved arc of `300 +/- 35`.
  It clears by **0.05 degrees**. Measured by the orchestrator at VERIFY, calling the shipped
  `hueDistanceFromReserved` directly against the shipped `createPalette` output on real content.
  **Not a defect — it passes, and the guard is the thing that makes it pass.** But the guard was
  added because this exact ladder handed `hotel_cafe` the reserved magenta `#f100f1`, and a
  reader who sees "the magenta collision is fixed" will assume more headroom than 0.05 degrees.
  **Any of these flips it inside the arc**: a fifth room type, a change to `ROLE_HUE_PHASE.room`,
  or a change to `ALLOWED_HUE_SPAN`. **FALSIFICATION TEST**: add a fifth room type to a scratch
  copy of `room-types.json` and run the palette contrast/hue assertions. *If a room lands inside
  `300 +/- 35` the guard is binding rather than comfortable and the ladder needs the reserved arc
  removed from its domain rather than checked after the fact; if all five clear, the 0.05 was a
  four-entry coincidence and this note closes.* -> **the goal that next changes room content, or
  the eighth-room-type ceiling the palette already predicts.**

  *Recorded also because the orchestrator misread it first*: `hueDistanceFromReserved` takes a
  COLOUR, not a hue, and being fed a hue returned 60.8 — a number that would have made the margin
  look comfortable. The reading only became true when the function was called as designed.

## Deferred out of G-030's sweep 1 (2026-08-12)

- **THE ONE PERSON WHOSE EDIT SILENTLY RECOLOURS THE HOTEL IS THE ONE NOT TOLD.** Room
  colours are derived from a per-role luminance ladder whose length is the number of room
  types, and assignment is by rank — so **adding a room type re-derives the ladder and every
  existing room changes colour**. A designer opening `packages/content` to add one has no way
  to know that: the word "colour" does not appear anywhere in that package, which was checked
  rather than assumed (`grep -rn 'colour\|color' packages/content/src/schema.ts
  packages/content/data/room-types.json` returns nothing).
  **NOT FIXED IN G-030, AND THE REASON IS THE TRACK BOUNDARY RATHER THAN THE COST.** It is one
  comment line in `roomTypeSchema`, and `packages/content/src/schema.ts` was **open on track B
  at the moment this was raised** (ADR-0017's need-model work). A render goal editing a live
  sim-track file is exactly the collision ADR-0018 §4's disjointness rule exists to prevent,
  and a one-line comment is not worth breaking it for. The text to place, verbatim:
  *"Adding a room type re-derives the renderer's colour ladder, so every existing room
  changes colour (`apps/game/src/view/palette.ts`). That is a deliberate trade for
  legibility and it is asserted by `tools/headless/src/palette.contrast.test.ts`."*
  **FALSIFICATION TEST**: add a room type and diff a screenshot. *If the existing rooms keep
  their colours, the ladder no longer re-derives and this note is stale; if they change and
  nothing in `packages/content` warned, the note is still owed.*
  **-> the next sim-track goal that touches `packages/content/src/schema.ts`.**

- **A STRESSED OPENING, SO THE FAILURE MARKS ARE WATCHED RATHER THAN MERELY DRAWN.**
  `render-critic` drove the shipped scenario for 4,320 ticks at seed 7: **0 invalid rooms, 0
  roomless guest-ticks, never more than 2 guests on a cell.** Six rooms against one arrival
  per 120 ticks is permanently under-subscribed, so the room hatching, the invalidity word,
  the hollow-body mark and the `+N` crowd counter are **unreachable by construction** — the
  WATCH that passed could not have contained them, and none may be carried as verified.
  **DELIBERATELY NOT FIXED BY ADDING CODE** (orchestrator ruling): manufacturing a broken room
  in the opening scenario would fake the evidence rather than earn it. The honest route is
  G-031, which gives the player the ability to build a bad hotel.
  **FALSIFICATION TEST**: at G-031, build a room in mid-air and one sealed between neighbours,
  and oversubscribe the hotel. *If the hatching, the invalidity word, the hollow body and the
  `+N` all appear and read, these four marks are discharged; if any of them is illegible or
  absent, it is a render defect that has been hiding behind an easy scenario since G-030.*
  **-> G-031, as a criterion rather than a note.**

## Discovered during G-030 round 1 (2026-08-12)

- **A MUTATION PROBE MUST ASSERT THAT THE MUTATION LANDED.** `render-engineer`'s first two
  probes against the new dependency-cruiser rule **silently failed to mutate and reported
  green**, and it nearly concluded the rule was vacuous when it was the probe that was. The
  third asserted the mutation applied (`if (hit !== 1) exit 1`) and the rule bit immediately.
  **`CLAUDE.md`'s mutation recipe currently mandates `git stash push -u` over `git checkout --`
  — a rule about RECOVERY — and says nothing about verifying the mutation took effect.**
  A probe that did not mutate and a check that does not bite are indistinguishable from the
  outside, and the failure is in the reassuring direction: it reports a gate as broken when the
  gate is fine, so the "fix" is a change to a working check.
  **This belongs in `CLAUDE.md` beside the revert mechanism, not in `PARKING.md`** — parked
  here only until a goal owns the charter edit, because four independent agents reached for the
  wrong revert mechanism before that rule was written and this is the same shape one step later.
  **FALSIFICATION TEST**: none needed — it is a procedure, not a hypothesis. What would refute
  it is a probe design in which a failed mutation cannot report green; if someone produces one,
  this collapses to "use that design".

- ~~**`packages/content` never says the word "colour"…**~~ **DUPLICATE — MERGED UPWARD, and the
  duplication was the orchestrator's.** This is the same item as the colour-pointer entry above,
  which carries the **verbatim schema text**; I parked it a second time under a different heading
  with a different falsification test, and `render-critic` found both at sweep 2. The surviving
  entry is the earlier one. **The test recorded here was the better of the two and is merged into
  it**: add a fifth room type to a scratch copy of `room-types.json` and diff the colours the
  palette hands the original four — a screenshot diff cannot tell a recolour from a redraw.
  **Struck rather than deleted (ADR-0008): a reader should see that this file carried one item
  twice, because "the next goal discharges one and leaves the other standing" is exactly how a
  parked obligation survives being paid.**

- **THE IDLE GUEST — 61.9% OF OCCUPIED ROOM-TIME HAS NOTHING PENDING (G-027a WATCH).** A belief
  about how the sim behaves, so it is parked **with its falsification test** (human ruling,
  2026-08-09).

  **THE BELIEF.** G-027a landed ADR-0017 §4 (a stay is a duration) without §1/§2 (a need is a
  stock that decays and is drawn down by activity). So a guest works through its engagement
  needs, meets or fails all of them, and then **has nothing left to want for the rest of its
  stay** — it sits in its room as furniture. Before this diff that instant was the moment the
  guest LEFT; it is now roughly two thirds of the time it is in the building, during which the
  amenity half of the guest loop is disconnected from anything a player can affect. **This is
  the larger of the two limits G-027a ships and it is what a watcher sees first** — larger than
  the give-up limit that goal did record (arm 4's zero give-ups, ADR-0017 4(b)).

  **THE BASELINE, so re-measurement has something to compare against.** `watch-stay.ndjson`
  (`--days 4 --seed 7 --rooms 6 --amenities 2 --arrivals 60 --record-every 10`):

  - **2,083 of 3,366 room-holding guest-frames — 61.9% — have no pending need at all.**
  - **The longest idle RUN is 96 consecutive frames** (guest 1, ticks 490–1441 = 960 of its
    1,440), during which its serialised state is byte-identical frame to frame.
  - The most common hotel state is **`inHotel 9 / engaged 3 / IDLE 6`, 228 times**. *The first
    draft of this entry wrote `engaged 0` there and `ai-critic` corrected it: the three ARE
    engaged, and they are the roomless guests using the amenities while they queue. The
    difference matters in a baseline — "nobody is doing anything" overstates it, and what is
    true is "nobody who has a room is".* The 61.9% and the 228 were right.

  **THE FALSIFICATION TEST — TWO NUMBERS, BOTH DERIVED AT THE PLAN THAT SHIPS THE STOCK MODEL.**
  Re-record that exact invocation and recompute both statistics the same way (a room-holding
  guest-frame is idle when no need of that guest has `progressRemaining > 0 &&
  patienceRemaining > 0`). Refuted when **the longest idle run exceeds N frames, or the idle
  share is at or above X.**

  **N AND X ARE NOT CHOSEN HERE, AND THAT IS THE POINT.** The first version of this entry said
  the share must fall *"substantially"* — an adjective in a pass/fail slot, in a criterion
  binding a goal owned by a different pair, and one that **cannot fail where it matters**: a
  model that re-opens one need per stay moves 61.9% to about 55% and somebody calls that
  substantial. Both numbers are **derived at G-027b's PLAN from the decay rate that goal
  actually ships** — a need that decays back into wanting every `d` ticks bounds the longest
  idle run at roughly `d` and the share at roughly the fraction of a stay spent above threshold
  — **and stated before BUILD**. A number picked today would be an invention about a decay rate
  nobody has written yet.

  **THE LONGEST RUN IS THE SHARPER OF THE TWO AND IS THE PERCEPTUAL ONE.** A share can fall
  while every guest still freezes for four hundred ticks in the middle of its stay; a watcher
  sees the freeze, not the average. `ai-critic` proposed it and it is the better statistic.

## Discovered during G-031a (2026-08-12) — a balance finding from a RENDER goal

- **THE OPENING BALANCE REFUSES 10 OF 12 BUILDS IN A NAIVE EXPANSION.** Measured by
  `render-engineer` while probing whether the crowd badge was reachable — it issued 12
  `buildRoom` commands and **10 were refused for `insufficientFunds`**; at 20 commands, 18
  were refused. **Two bedrooms were added, not twelve.** `startingCapitalPence` 500,000 against
  `constructionCostPence` 250,000 is exactly two rooms, and the sim has no way to tell the
  player that in advance because **the UI deliberately never predicts a refusal** (G-031a's own
  ruling: a local affordability check would be a second implementation of a rule the sim owns).
  **Why it is parked rather than fixed**: this is the money loop, it is M4's, and G-031a's first
  criterion is *"every player action is an existing command; this goal adds no simulation
  behaviour"*. **Why it is worth keeping**: it is the first observation in the project of the
  build loop as a *player* experiences it rather than as a sweep measures it — eight refusals in
  a row, each one a click that does nothing but tick a counter.
    **UPGRADED FROM A NOTE TO A HYPOTHESIS WITH ITS TEST, on render-critic's ruling that a note is
  a reminder and a hypothesis is a result waiting for a goal that runs it (CLAUDE.md, Parking).**
  **THE CLAIM, stated so it can be false**: the opening balance affords exactly
  `floor(balanceOf(createWorld(7, content).ledger) / constructionCostOf(content, lodgingRoomType))`
  = **2 rooms**. **THE TEST**: build one room every 10 ticks from t=200 and read
  `buildOutcomes.built` against `refused.insufficientFunds`. Reproduced twice at G-031a —
  **built 2 / refused 10** on a twelve-command arm and **built 2 / refused 18** on a twenty.
  **ITS LIVE NEIGHBOUR**: G-027a moved the margin 10.2:1 -> 3.63:1 without touching a price, and
  this is **the same lever seen from the player's end** — the first time in this project anyone
  has looked at the opening balance from inside a session rather than from a report.
  **FALSIFICATION TEST**: at M4, once demand and pricing exist, run the same twelve-build
  expansion from the shipped opening balance and count refusals. *If the ratio is still ~5:1 the
  opening balance is not a starting position but a tutorial about scarcity, and M4 owes it a
  decision — a loan prompt, a cheaper first room, or a larger opening float. If revenue by then
  funds the expansion, this closes.* -> **M4**, and it should be read beside ADR-0011's
  absorbing-state ruling and `PARKING.md`'s construction-cost entry, both of which assume the
  player can act.

## Discovered during G-031a's verification (2026-08-12) — a charter amendment owed

- **THE REGEX TRAP'S ENFORCEMENT IS THE EMPTY-MATCH ASSERTION, NOT THE READ-THE-BYTES ADVICE.**
  Fourth instance in four goals by four authors — this one in a **verification probe**, where
  `` `^\s*const ${name} =` `` through two quoting layers collapsed `\s` to a bare `s` and matched
  nothing. **`CLAUDE.md`'s existing rule could not have caught it**: that rule says *check it
  against the bytes on disk, not against a retyped copy*, which catches **transcription** — and
  the author **was** reading the bytes. The fault was in the **matcher**. What caught it was
  **G-030 round 1's rule from an entirely different subject**: *assert the search found something
  before using its result.*
  **THE GENERALISATION, which is the reusable part**: the regex trap is a special case of the
  class this project keeps rediscovering **in scanners** — `check-content.mjs`'s JSON walk that
  inspected nothing, `speed-ladder.scan.test.ts`'s dead glob, `stopwatch.scan.test.ts`'s exclude
  clause that could not fail, `check-ladder.mjs`'s newline-as-statement-boundary. **Four authors
  have now demonstrated that "be careful when you write `\w`" does not scale, and one empty-match
  assertion catches all of them.**
  **AND IT HAPPENED INSIDE A VERIFICATION PROBE**, which has the same standing as
  *"an agent's report that tests pass is not evidence"*: **a probe that proceeds on an empty match
  is not evidence either.**
  **This is a `CLAUDE.md` amendment, parked here only until a goal owns the charter edit** — the
  same route the mutation-probe rule took. **FALSIFICATION TEST**: none needed, it is a procedure.
  What would refute it is a fifth instance caught by the read-the-bytes rule rather than by an
  empty-match assertion; if that happens, both rules earn their place separately.
  **Note for whoever writes it**: this is the FIRST time in this project that a written rule
  caught its own defect class without a person noticing first, and it was a rule written for a
  different subject. That is the argument for stating rules as properties rather than as warnings.

## Discovered during G-027b θ-a's fixture repair (2026-08-13)

- **G-014b's CENTRAL FINDING HAS REVERSED, AND ITS SIGNED-OFF CRITERION 2 IS NOW FALSE — recorded
  here because it lives ONLY inside a test file.** Found by `ai-critic` at θ-a sweep 2. Both
  readings are **executed and green** at `tools/headless/src/hysteresis.report.test.ts`:
  - `:187` — `expect(abandonmentsIn(shipped)).toBe(0)`. G-014b's criterion 2 was
    `abandoned(margin 0) > abandoned(shipped) > 0`, and **the right-hand term is the one that
    forbids shipping a saturating margin and calling the feature delivered.** At its own pinned
    invocation it now reads **zero**.
  - `:250` — `engagementMet(thrash) > engagementMet(shipped)`, **2,081 against 1,875.** That
    reverses *"triage beats thrash"*, which is the entire warrant for `abandonMarginBasisPoints`
    existing, for the 6,000 value, and for ADR-0021's frozen Era-A document. **A margin of ZERO
    now meets more engagement needs than the shipped one.**
  **Why it is parked and not acted on**: `met` is a **departure snapshot**, which is precisely the
  instrument G-028 is rewriting — so this is a reading taken on a gauge the ledger already flags.
  **An open contradiction to record, not a result to act on.**
  **Why it is parked and not left**: the test file argues both carefully and says *"whether
  contention-gated is the right design is not settled here"* — agreed, **which is exactly why it
  belongs in a ledger.** `JOURNAL.md` contained no occurrence of "margin", "thrash" or "triage";
  neither did `GOALS.md`, `DECISIONS.md` or this file. **Compare the review reversals found in the
  same pass**: same class, same goal, and those got a human ruling, a table in `GOALS.md` and
  G-028's first job. **One was routed and one was not, and the difference was that a person
  happened to read one of them.**
  **FALSIFICATION TEST**: after G-028 replaces the departure snapshot, re-run
  `pnpm exec vitest run hysteresis.report` and read `:187` and `:250` again. *If `shipped` still
  abandons zero and thrash still beats triage on the NEW metric, the margin's warrant is gone and
  `abandonMarginBasisPoints` is a parameter defending a result it no longer produces — that is a
  DECISIONS entry, not a tuning pass. If either flips, the reversal was the old gauge.*
  -> **G-028, as its second job, immediately after the AXIS 1 repair.**

- ~~**`bindContent` ACCEPTS CONTENT NO GUEST CAN ARRIVE UNDER.**~~ **CLOSED 2026-08-13, IN θ-a's
  OWN FIX PASS — AND CLOSED BY THE SECOND BRANCH OF ITS OWN FALSIFICATION TEST, NOT THE FIRST.**
  The prediction was a bind-time refusal. What shipped **splits the case**, and the split was
  *measured rather than judged*: refusing the absent line too turned **7 test files / 14 tests**
  red, and **every one of them omits the key** — under the shipped rates a lodging-only table can
  only bind by omitting it. A blanket refusal would therefore have made **ADR-0008's reading
  unrunnable rather than historical**, which is the one thing ADR-0008 exists to forbid. So:
  a **declared** want line that floors to zero is **refused at bind** (`assertEveryNeedIsWantedOn
  Arrival`, per row, per need type, both named in the message); an **absent** one is **accepted**,
  and `formNeedVector` forms at `Math.max(1, wantLineOf(...))` — a pre-G-027b guest arrives one
  tick below full, which is exactly what that era's `progressRemaining > 0` meant.
  **The parked clause that fired is the escape hatch nobody expected to use**: *"if some later
  change makes absence meaningful, this closes."* Absence became meaningful **in the same pass
  that would have refused it**. Both halves proved to bite by mutation; the new behaviour is
  pinned in `stock.content.test.ts` and `needs.stock.test.ts`, so the falsification test now runs
  the other way — **it binds and does not throw**, by design and under test.
  **The reason it is struck rather than deleted**: the cost claim below is still true and is the
  reusable part. *Original entry follows.*

  Content declaring a lodging need
  and **no `wantAtBasisPoints`** binds happily, then throws `assertNeedVector` **deep in the tick**
  on the first guest. `toleranceTicks` got a bind-time refusal in θ-a; the want line did not, and
  it has the **same "no historical value to fall back on" character** — there is no era in which
  content had a want line, so absence cannot be read as history.
  **Why it is worth a goal rather than a note**: `sim-engineer` reported it as **the single
  biggest cost multiplier** in repairing ~45 fixtures — the failure surfaces as a throw inside the
  tick rather than as a refusal at load, so every fixture that hit it cost a debugging cycle
  instead of a message. **A refusal that fires at load is worth more than one that fires at tick
  1**, which is the whole argument `assertNeedsAreSatisfiable` and `assertLodgingBecomesWanted`
  already rest on. **Correctly NOT fixed in θ-a**: adding a `bindContent` refusal is a model
  change, not fixture repair.
  **FALSIFICATION TEST**: bind content declaring a lodging need with `wantAtBasisPoints` omitted.
  *If it binds and then throws on the first stepped tick, the refusal is owed; if some later
  change makes absence meaningful, this closes.* -> **a one-line follow-up in G-027c or θ-b.**

- ~~**INTERRUPTED ENGAGEMENTS DROP BELOW THE WANT LINE AND ARE NOT RESUMED.**~~ **RE-FRAMED
  2026-08-13 BY THE HUMAN, WHO REJECTED THE PREMISE RATHER THAN ANSWERING THE QUESTION.** Asked
  whether the pause reads as sated or as giving up, the reply was ***"Why would the meal be
  interrupted?"*** — and the answer is that **there is no spontaneous interruption. Every path is a
  PLAYER ACTION**: demolish the amenity mid-engagement, demolish the room beneath it (the provider
  becomes unsupported and stops being valid), or demolish the room hosting an item. All three go
  through G-008's command with G-031a's button on it.
  **So the guest is not failing to resume an interrupted meal — it is PARTLY FULL.** It ate half a
  meal, its stock sits above the want line, and it does something else until it is hungry again.
  **That is the hysteresis working**, and the watcher always has a cause in mind because they have
  just knocked the restaurant down. **The original title read as a defect in the pursuit logic and
  was the wrong question**: it was framed around a mechanism that smuggled in a premise the model
  does not contain. **Struck rather than deleted (ADR-0008) — the re-framing is the useful part.**
  **WHAT SURVIVES AS A WATCH QUESTION, narrower and worth asking**: does a guest walking away from
  a half-eaten meal *the player just demolished* read as sated, or as sulking? -> **the first goal
  that watches a demolition.**

- **INTERRUPTED ENGAGEMENTS DROP BELOW THE WANT LINE AND ARE NOT RESUMED.** A guest whose café is
  demolished mid-meal **keeps its progress** (correct) but is then **below its want line and served
  by nothing**, so `isNeedWanted` is false and it stops pursuing food until the stock decays back —
  **exactly as many ticks as it had eaten.** Pinned as *behaviour* in `needs.reservations.test.ts`
  rather than reported as a defect, correctly: it follows directly from expressing hysteresis
  without a stored flag, which is the design ADR-0017 implies.
  **It is a WATCH question, not a finding**: this is precisely the shape §6.1 calls **dithering**
  when a human sees it — a guest that stops wanting the thing it was halfway through.
  **FALSIFICATION TEST**: in a WATCH recording, demolish an amenity mid-engagement and count the
  ticks before the guest pursues that need again. *If a watcher reads the pause as the guest
  giving up rather than as being sated, hysteresis needs a served-recently flag and that is a
  model change worth its own goal; if it reads as a guest who has just eaten, this closes.*
  -> **θ-b's WATCH, or the first goal that watches a demolition.**

## Discovered at G-027b θ-b1's plan revision (2026-08-13)

- **AXIS 1'S INVERSION IS AMENITY STARVATION, NOT ROOM COUNT — and this may be the whole repair
  G-028 is looking for.** Measured on materialised arms, `--days 30 --seed 7`, closed loop:

  **RE-TAKEN 2026-08-13 at sweep 2, because ADR-0026's amendment moved the model underneath the
  first reading and this entry went on asserting it.** The pre-amendment column (`--rooms 12` at
  3.37) is **withdrawn, not restated**. Current readings, `pnpm --silent sim:run --days 30
  --seed 7 <arm> --json`, one deterministic reading per arm, quiet 12-core Win11 box:

  | configuration | mean review (basis points) |
  |---|---|
  | `--rooms 1` | **391** |
  | `--rooms 12 --amenities 1` | **378** |
  | **`--rooms 12 --amenities 2`** | **420** |
  | `--rooms 6 --amenities 1` | 354 |

  **The finding is UNCHANGED and slightly strengthened**: twelve rooms with two amenities (420)
  beats one room (391), and twelve rooms with *one* amenity (378) does not. **What moved is that
  the twelve-room rung no longer sits at the bottom** — 378 is above the six-room rung's 354, so
  the ladder is not even monotonically inverted; it is *provision-shaped*.

  **The inversion vanishes when the amenities scale with the rooms.** Twelve rooms with *two* of
  each amenity beats one room — 4.20 against 3.91 — on both arms. The "more rooms scores worse"
  reading that has been treated as a defect in the *review function* since G-027a is, at least in
  part, a defect in **how the test ladder provisions its hotels**: it adds rooms and holds
  amenities at one, and one provider serves ~8 concurrent guests (`guests.ts:679`, one guest at a
  time, queues are G-024's). **A twelve-room hotel with one café is not a bigger hotel; it is a
  worse one, and the score is right to say so.**
  **Why this is a gift rather than a finding**: G-028's first job is "repair AXIS 1's reversal".
  If the ladder is the fault, the review function may need no repair at all — and G-028 would
  otherwise have spent its budget rewriting a scorer that was telling the truth.
  **FALSIFICATION TEST**: build the ladder with amenities proportional to rooms (one of each per
  ~8 concurrent guests, derived rather than chosen) and re-read AXIS 1 across the full ladder.
  *If it still reads inverted, the fault is in the scorer and G-028's original framing stands. If
  it reads monotone, the scorer is exonerated and the defect is the instrument.*
  -> **G-028, BEFORE any change to the review function.**

- **THE HOTEL SELF-LIMITS AT ITS AMENITY THROUGHPUT once guests can walk out.** Occupancy grows
  **sub-linearly** in the arrival rate under the stock and linearly without it. Measured,
  `--rooms 60 --amenities 1 --seed 7 --days 30`, arrivals 96 / 72 / 48 / 32:
  base **14.77 / 19.68 / 29.52 / 44.27** against stock **6.40 / 9.20 / 11.41 / 17.13**.
  **THE STOCK COLUMN IS PRE-AMENDMENT AND IS WITHDRAWN.** At arrivals 96 the post-amendment
  reading is **8.72**, which `workload.concurrency.test.ts:52` carries as its own re-take of the
  640 — the amendment gave back occupancy by removing a fill the hotel was never responsible for.
  **The other three rungs have not been re-taken, so the sub-linearity claim is currently
  supported by one point and is not established.**
  **FALSIFICATION TEST**: re-take all four rungs post-amendment, paired against the base arm in
  one sitting; refuted if the base÷stock ratio stops rising as arrivals fall.

- **OCCUPANCY IS NOT MONOTONE IN THE ARRIVAL CADENCE**, which is why no new literal can repair
  `workload.concurrency.test.ts`. **THE HYPOTHESIS SURVIVES; THE PAIR THAT MOTIVATED IT DOES NOT.**
  The original citation — `--arrivals 132` → 8.04 against `--arrivals 120` → 5.13 — was taken
  before ADR-0026's amendment and is **withdrawn, not restated**.

  **`ai-critic` RAN THIS ITEM'S OWN FALSIFICATION TEST AT SWEEP 2** — the finer sweep it asks for,
  30 days, rooms 60, seeds 42 and 7 (identical), `schedule(...)` in-process, one deterministic
  reading each, quiet 12-core Win11 box:

  | arrivals | 132 | 128 | 126 | 124 | **122** | 120 | 96 |
  |---|---|---|---|---|---|---|---|
  | concurrent | 7.85 | 7.94 | 8.07 | 7.99 | **6.43** | 7.87 | 8.72 |

  **The non-monotonicity is real and the dip is at 122**, not at 120 — and the originally cited
  pair (7.85 → 7.87) is *monotone in the claimed direction*. **The parked hypothesis was right for
  a reason that was wrong**, which is the outcome a falsification test exists to produce and the
  reason this entry is re-taken rather than deleted.
  **Owed to the instrument re-take goal**: it decides whether that campaign can be calibrated by
  choosing a cadence at all — and if it cannot, the campaign needs a different axis, not a
  different number. **Cite the 122/124 pair or nothing.**

- **THE DISSATISFACTION CEILING IS NON-MONOTONE IN THE DEEPLY-SATURATED BAND.** `--arrivals 168`:
  C = 300 / **547** / 900 / 1200 gives **46.0 / 36.1 / 30.8 / 55.6 %** walkouts.
  **WITHDRAWN 2026-08-13 AT SWEEP 3, NOT RESTATED — and it is the last `547` anywhere, which is
  the tell.** 547 was θ-b1's ceiling *before* ADR-0026's amendment moved the cliff from 208 to
  129; the shipped ceiling is **431**, and a sweep whose middle column is a retired value is a
  sweep of a model that no longer exists. **Its three sibling entries in this same block were
  each re-taken or withdrawn for exactly this reason and this one was not** — and the entry's own
  text flags it as *"stated by the builder rather than found by a critic"*, which is precisely
  the entry a reader trusts least and a sweep checks last.
  **It also named ONE slot.** `--arrivals 168` is a cadence; there was no rooms, no amenities, no
  days, no seed, and no statement of whether the reading was pre- or post-amendment — which is
  what made it impossible to re-take rather than merely wrong. More patient guests stay
  longer, which raises contention, which raises the fill rate. **Stated by the builder rather than
  found by a critic**, and not diagnosed. **FALSIFICATION TEST**: repeat at C = 700 and 1050; if it
  fills in monotonically the 1200 reading is noise, and if it does not, the feedback is real and the
  dial has a usable range rather than a usable direction.

## Discovered during G-027b θ-b2 (2026-08-13) — optional lodging

- **A MIXED HOTEL — SOME GUESTS LODGE, SOME VISIT — IS M6's, AND θ-b2 SHIPS ONLY THE ADMISSION.**
  The human's design intent is *"some guests might not want to stay at the hotel"*, which needs
  guest archetypes. What landed is the structural half (ADR-0017 §5): the terminator is keyed on
  each guest's OWN vector via `lodgingNeedStateOf`, never on the content, so a hotel serving both
  populations is an archetype table away rather than a rewrite. **FALSIFICATION TEST**: give one
  guest-rules row a need subset and arrive two guests under one content set. If each reaches its
  own clock with no change to `stepGuests`, the admission held; if `stepGuests` needs a branch,
  the keying was per-content after all and the M6 estimate is wrong.

- **A VISITOR PAYS NOTHING.** The money loop's half of the human's intent: a food court currently
  gives lunch away. `hotel_cafe.nightlyRatePence` is 0 and `payForStay` charges for a ROOM, so
  `visitEnded` writes no transaction at all. Per-provider pricing is M4's. **FALSIFICATION TEST**:
  run the food-court fixture and fold `roomRevenue` — it is 0 today and 0 after this goal, so the
  money loop is not yet fed by a visitor. When per-provider pricing lands this reads non-zero, and
  `countRoomRevenueTransactions === checkedOut` will need a second witness for the visit row.

- **HYPOTHESIS: A VISITOR IS ~1.0 CONCURRENT GUESTS PER PROVIDER WHERE A LODGER IS ~0.125.**
  ADR-0026 measured one provider sustaining ~8 concurrent lodgers, because a lodger sleeps most of
  its day. A visitor occupies a provider for **208 of its 208 ticks** — its visit IS its service —
  so the provisioning rule for a food court is roughly **eight times tighter**, and the build loop
  reads completely differently there. **FALSIFICATION TEST**: seed `k` of each amenity and arrive
  every `A` ticks; `leftDissatisfied` should stay 0 while `208/A <= k` and rise sharply above it.
  Consistent so far at k=3,A=30 (0 walkouts) and k=1,A=30 (non-zero), and at k=1,A=120 (0). **If
  the knee is not at `208/A = k` the arithmetic is wrong, not the dial.**

- **THE VISIT CLOCK IS QUANTISED BY THE DEFERRAL, SO SMALL CHANGES TO IT ARE INERT.** Measured on
  the shipped fixture: `visitDurationTicks` of 191, 207 and 208 all produce a **byte-identical**
  world, because the guest is at a provider from age 129 to 208 and the terminator waits for it to
  be at liberty. That is correct behaviour, and it means the field's usable resolution is the
  engagement boundary rather than the tick. **FALSIFICATION TEST**: sweep it across an engagement
  boundary (208 → 400 moves the hash; 208 → 300 does not, at `arrivalEveryTicks` 120). If a
  sub-boundary change ever moves a run, the deferral has stopped applying somewhere.

- **`apps/game` HAS NO CONTENT-SELECTION PATH, AND `scenario.ts:78` CARRIES A SECOND THROWING
  `lodgingRoomTypeOf`.** ADR-0019 keeps it out of θ-b2's file set and ADR-0028 §4 routes the WATCH
  around it, but the debt is real: the renderer of record cannot draw a hotel this simulation can
  now run. **FALSIFICATION TEST**: point `apps/game` at a lodging-free content directory — it
  throws *"there is no hotel to open"*. The repair is the same nullable-accessor split
  `report.ts` took (`lodgingRoomTypeIn` beside a still-throwing `lodgingRoomTypeOf`), and it
  belongs to whichever goal ships a second content set for real.

- **ONE HOST DECISION, THREE IMPLEMENTATIONS.** `report.ts:443`, `apps/game/src/scenario.ts:78`
  and `determinism-log.ts:112` each answer *"which room type do guests sleep in"*, and two of them
  throw the same sentence in different words. θ-b2 fixed only the one it owns. **FALSIFICATION
  TEST**: grep for `firstRoomTypeProviding` behind a `lodgingNeedOf` — three hits today. A change
  to the rule has to be made three times, which is the duplicated-constant class G-018 paid for.

- **`idleShareBasisPoints` RISES WHEN THE LODGING TERM DROPS OUT**, and G-028's falsification
  threshold X is written against it. A food court's need table has no lodging term, so the ceiling
  it computes is strictly higher than a hotel's. **FALSIFICATION TEST**: compute it under both
  content sets; if the food court's is not strictly higher, `needShareBasisPoints` is not reading
  the lodging term the way its docstring says it does.

- **THE WATCH INSTRUMENT DRAWS EVERY RECORDING AGAINST THE SHIPPED CONTENT TABLES.**
  `tools/viewer/serve.mjs:19` serves `packages/content/data` from a **hard-coded path**, so a
  recording made with `--content <dir>` is rendered using labels, colours and need names from the
  *shipped* tables rather than the ones the run actually used. **ADR-0028 §4 routes θ-b2's WATCH
  through this instrument**, which makes the caveat load-bearing rather than tidy.
  **Benign this time, and not always**: the food-court fixture is shipped-content-minus-two-rows,
  so every need it uses has a shipped entry. **A genuinely different content set would render
  magenta bars with nothing on screen saying why** — a WATCH that looks like a finding and is an
  instrument fault.
  **ADR-0028 §4 is hereby narrowed**: the viewer is a sound WATCH surface for content that is a
  **subset of the shipped tables**, and unsound otherwise.
  **FALSIFICATION TEST**: record a run under content declaring a need id absent from
  `packages/content/data/need-types.json`, then open it. *If the viewer renders it with a fallback
  colour and no warning, the caveat is real and the fix is to serve the recording's own content
  directory. If it refuses or labels the gap, this closes.*
  -> **owed by whichever goal ships a second content set for real, beside the `apps/game` entry
  above.**

  *(Filed 2026-08-13. **The orchestrator appended a SECOND θ-b2 block here and it duplicated three
  of the entries above with DIVERGENT readings** — the concurrency hypothesis cited `k=3,A=30 /
  k=1,A=30 / k=1,A=120` in one and `k=3,A=60 / k=1,A=30 (143 of ~473)` in the other. Found by
  `ai-critic` at sweep 2. **A parked hypothesis whose falsification test cites two different arms
  is precisely what the parking rule exists to prevent** — a reader cannot tell which is current,
  so neither is a result waiting for a goal. Duplicate removed; only this entry was new. **The
  lesson is not "check before appending" but that a ledger section keyed on a goal name needs its
  goal name to be unique**, and two blocks headed `G-027b θ-b2` on the same date were both
  correct-looking.)*

- ~~**A DEPARTING GUEST LOOKS THE SAME WHATEVER MADE IT LEAVE**~~ **NARROWED 2026-08-14 BY WATCH
  #11, AND THE REVERSAL IS THE FINDING.** Asked the same question a second time, the human answered
  **"yes, very easy to see with the bar underneath now."** WATCH #10 answered **no**.

  **Nothing about the departure rows changed between the two answers. The SURFACE changed** — #10
  was taken through the viewer, #11 through `apps/game`, where `drawLobbyFuse` draws a shrinking bar
  under a guest whose patience is running out. **The distinction was always in the data and was
  never on the screen the human was shown**, so the first answer was recorded as a property of the
  game and was a property of the instrument.

  > **A perceptual finding is about a surface, not about a build.** Same question, same tick, two
  > surfaces, opposite answers.

  **WHAT REMAINS, stated precisely rather than closed outright**: the fuse marks the **lobby wait**,
  so it separates `gaveUp` from `checkedOut`. **`leftDissatisfied` — a resident who walks out
  mid-stay — and `visitEnded` carry no mark of their own**, and the human was not asked about them.
  **FALSIFICATION TEST**: show a watcher a hotel producing all three of `checkedOut`,
  `leftDissatisfied` and `visitEnded`, and ask which guests left for which. *If they can sort them
  without reading the outcome table, this closes entirely. If they can only sort the roomless ones,
  the fuse is doing the whole job and the two resident rows still owe a mark.*

- ~~**A 2-PIXEL MARK IS NOT A MARK**~~ **WITHDRAWN THE SAME HOUR — THE MARK WORKS.** The human
  reported not seeing the lobby fuse; the orchestrator filed it as a perceptual defect and as
  G-030's palette failure repeating. **The human was looking at the VIEWER. In `apps/game` they can
  see it.** *("FYI — I can see the new mark in the HotelSim 5180.")*
  **The orchestrator handed over two surfaces in one message and then wrote down the answer as
  though there were one.** A perceptual finding carries the surface it was seen on, or it is not a
  finding — CLAUDE.md rule 4 slot one, applied to an observation instead of a number.
  **Kept struck rather than deleted, because the confident wrong diagnosis is the reusable part**:
  it accused a comment of asserting what a person would perceive without checking, which is
  precisely what the accusation itself did.

- **THE VIEWER PARSES THE NEW SCHEMA AND DRAWS THE OLD PICTURE** (human, WATCH #10, 2026-08-13).
  *"The viewer has not been visually updated with the new schema or anything."* Its version
  constant was two releases stale and is now pinned to `SAVE_SCHEMA_VERSION` by a test — **but the
  drawing was never updated for what v14 and v15 added**, so it renders a v15 recording without the
  patience fuse and without distinguishing the departure rows.
  **This is `frameAt`'s own failure mode one layer up.** That guard exists so a mismatched frame is
  refused rather than *"drawn as a plausible hotel that is not the hotel that ran"* — and a viewer
  that accepts the frame and omits what is new does the same thing with the version check green.
  **ADR-0028 §4 routes θ-b2's WATCH through this instrument**, so this is load-bearing, not tidy.
  **FALSIFICATION TEST**: open a v15 recording containing a queueing guest and a `visitEnded`
  departure. *If the fuse and the row are absent, the drawing is behind the schema and the WATCH
  routing needs re-deciding. If they render, only the constant was stale and this closes.*
  **Decide alongside the keep-or-delete question**: the viewer's one unique capability is
  scrub-and-replay, which  cannot do — but it is now behind on drawing, cannot load
  alternative content, and each repair is a step toward the second renderer §9 forbids.

- **THE WATCH INSTRUMENT DRAWS EVERY RECORDING AGAINST THE SHIPPED CONTENT TABLES.**
  `tools/viewer/serve.mjs:19` serves `packages/content/data` from a **hard-coded path**, so a
  recording made with `--content <dir>` is rendered using labels, colours and need names from the
  *shipped* tables rather than the ones the run actually used. **ADR-0028 §4 routes θ-b2's WATCH
  through this instrument**, which makes the caveat load-bearing rather than tidy.
  **Benign this time, and not always**: the food-court fixture is shipped-content-minus-two-rows,
  so every need it uses has a shipped entry. **A genuinely different content set would render
  magenta bars with nothing on screen saying why** — a WATCH that looks like a finding and is an
  instrument fault.
  **ADR-0028 §4 is hereby narrowed**: the viewer is a sound WATCH surface for content that is a
  **subset of the shipped tables**, and unsound otherwise.
  **FALSIFICATION TEST**: record a run under content declaring a need id absent from
  `packages/content/data/need-types.json`, then open it. *If the viewer renders it with a fallback
  colour and no warning, the caveat is real and the fix is to serve the recording's own content
  directory. If it refuses or labels the gap, this closes.*
  -> **owed by whichever goal ships a second content set for real, beside the `apps/game` entry
  above.**

  *(Filed 2026-08-13. **The orchestrator appended a SECOND θ-b2 block here and it duplicated three
  of the entries above with DIVERGENT readings** — the concurrency hypothesis cited `k=3,A=30 /
  k=1,A=30 / k=1,A=120` in one and `k=3,A=60 / k=1,A=30 (143 of ~473)` in the other. Found by
  `ai-critic` at sweep 2. **A parked hypothesis whose falsification test cites two different arms
  is precisely what the parking rule exists to prevent** — a reader cannot tell which is current,
  so neither is a result waiting for a goal. Duplicate removed; only this entry was new. **The
  lesson is not "check before appending" but that a ledger section keyed on a goal name needs its
  goal name to be unique**, and two blocks headed `G-027b θ-b2` on the same date were both
  correct-looking.)*

- **A DEPARTING GUEST LOOKS THE SAME WHATEVER MADE IT LEAVE** (human, WATCH #10, 2026-08-13).
  Seven departure rows, one appearance. **ADR-0025 §2 spent a schema row keeping "nobody would give
  me a room" distinct from "I had a bed and nothing to do", because they are opposite instructions
  to a player — build rooms, or build amenities. That distinction is live in the data and absent
  from the screen**, so the build loop's steering signal reaches the report and not the person.
  **The human routed it themselves**: *"this will be easier to show when we get to visualising the
  game."* Render track, not the sim.
  **FALSIFICATION TEST**: show a watcher a recording containing at least three departure reasons
  and ask which guests left for which. *If they can sort them without reading the outcome table,
  this closes. If they cannot, the row split is doing its job in the ledger and not in the game,
  and the render goal owes a mark per reason.*



## Discovered at G-028a (2026-08-14)

- **THE SECOND WALK OVER THE NEED VECTOR COSTS ~1.15× OF TICK TIME, AND THE PARK HAS FIRED WITH
  NUMBERS RATHER THAN A GUESS.** `accumulateUnservedTicks` walks the vector separately from
  `advanceNeeds`. **Two independent paired measurements, each with HEAD materialised as a
  worktree, both arms in one sitting, warm-up discarded:**

  | who | HEAD | this build | ratio |
  |---|---|---|---|
  | `economy-engineer`, medians of 5, 6 alternating rounds | 6,560 ms | 7,443 ms | **1.135×** |
  | `balance-critic`, medians of 9, 9 alternating rounds | 6,415 ms (6,358–6,791) | 7,427 ms (7,279–8,045) | **1.158×** |

  *What: whole-process wall time. Workload: the I5 workload, `--days 365 --seed 42 --rooms 60
  --arrivals 96`, shipped content. Regime: one quiet 12-core Windows 11 developer box, both arms
  interleaved.* **Distributions do not overlap in either campaign** — HEAD's worst is faster than
  this build's best. **The regression is real and the two ratios agree within noise, which is the
  finding; neither absolute transfers.**
  **Why the merge was declined here and is right to decline**: it touches the decay path, and the
  write-only fence is the property G-028a's seam is judged on. The identity it would rest on is
  **already swept** at `needs.unserved.test.ts:176`, so this is a result waiting for a goal rather
  than a note. **At ~1.9 % of I5's derived 389,333 ms budget there is ~52× headroom**, so nothing
  is at risk today.
  **AND THE GATE THAT WOULD HAVE CAUGHT IT IS DEAD FOR AN UNRELATED REASON.** `check:tickcost` is
  one of the three ruled-red ADR-0015 configuration refusals (`arrivalEveryTicks: campaign 32,
  shipped workload 96`) — **so the goal that ships a tick-cost regression is the goal whose
  tick-cost gate declines to compare.** Both critics measured it by hand instead. That is the
  strongest argument yet for the re-take goal's priority.
  **FALSIFICATION TEST**: merge the two walks into `advanceNeeds` and re-measure paired. *If the
  ratio does not return to ~1.00, the second walk was not the cost and the cause is elsewhere —
  most likely the per-tick allocation the counter forces on a need that would otherwise identity-
  return.* -> **the M3 instrument-debt goal, alongside the three campaigns it already carries.**

  > **RUN AT G-032b (2026-08-14). THE TEST CAME BACK NEGATIVE, AND THE NOTE'S OWN ALTERNATIVE IS
  > WHAT IS LEFT.** The merge landed and **the ratio did not return to ~1.00**. Six campaigns in
  > one sitting, arms interleaved, 6 samples each, medians, quiet `win32/12cpu`: merged over
  > two-walks **0.9425 · 0.9472 · 0.9674**; no-counter-at-all over two-walks **0.8516 · 0.8528 ·
  > 0.8778**. Composing the medians — same base arm, same sitting — **the counter costs 1.173× and
  > after the merge it costs 1.111×, so the merge removed about a THIRD of it.** The redundant
  > walk was never the bulk; **the per-need object allocated on a need that would otherwise
  > identity-return is**, exactly as parked.
  >
  > **This is the case for parking a hypothesis WITH its test.** The note named the alternative
  > cause a goal in advance, so a negative result arrived as a finding rather than as confusion —
  > and it fired the pre-registered escalation on the same day. **The remaining 1.111× is not
  > chased here**: removing it is a design change to the need vector, and doing it inside the goal
  > that discovered it is how one goal becomes two. Parked again, with `ESCALATIONS.md`
  > (2026-08-14, the tripwire bound) as its live entry.

- **`git worktree remove --force` RECURSES THROUGH A WINDOWS JUNCTION AND DELETES FROM THE SHARED
  pnpm STORE.** Found by `balance-critic` doing exactly what the tick-cost measurement above
  requires: materialise HEAD as a worktree, junction `node_modules` into it so the arm can run.
  **It removed 11 entries from `node_modules/.pnpm` twice**, each time repaired with
  `pnpm install --frozen-lockfile`.
  **This is the mutation recipe's blast-radius problem in a new costume**: the recipe says never
  `git checkout --` because it is unrecoverable, and this is a delete that reaches **outside the
  thing being deleted** — into a store every worktree in the repo shares.
  **THE SAFE ORDER**: unlink every junction with `rm <link>` (**never** `rm -rf`, **never**
  `git worktree remove`), verify zero symlinks remain, **then** delete the plain directory.
  **FALSIFICATION TEST**: create a worktree, junction `node_modules`, run
  `git worktree remove --force`, then count `node_modules/.pnpm` entries. *If the count is
  unchanged, the hazard is version- or filesystem-specific and this closes.*
  -> **belongs beside the mutation recipe in `CLAUDE.md`; three agents will hit it next time a
  paired campaign is owed.**

## From G-028b (the scorer)

- **THE BUILD LOOP SATURATES TWO PURCHASES IN, AND THE MONEY HALF IS WORSE THAN THE REVIEW HALF.**
  The review half was parked first: at `--rooms 12 --amenities 2` and above every guest leaves the
  top score, because content has no quality axis — nothing to buy once every need is met.
  **THE LEDGER SAYS SOMETHING SHARPER AND IT WAS NOT PARKED.** Measured at
  `--days 1000 --seed 42`, one run per cell, shipped content, quiet 12-core Windows 11 box:

  | build | revenue | upkeep | balance | review distribution |
  |---|---|---|---|---|
  | 12 rooms, 2 amenities | 101,898,000p | −39,000,000p | **+63,398,000p** | every guest at the ceiling |
  | 12 rooms, 3 amenities | identical | −43,500,000p | +58,898,000p | identical |
  | 12 rooms, 5 amenities | identical | −52,500,000p | +49,898,000p | identical |
  | 24 rooms, 2 amenities | identical | −69,000,000p | +33,398,000p | identical |

  **So twelve rooms and two amenities is the single correct build, and every purchase after it has
  negative expected value with no compensating signal at all** — same revenue, same departures, same
  reviews, more upkeep. The response of the whole build loop is **one room step and two amenity
  steps wide**. That is a CONTENT gap rather than a scorer defect, and it bears directly on
  *"the review responds to what a player builds"*: the review is not wrong, it has run out of things
  to report on.

  **FALSIFICATION TEST — AND IT MUST READ THE LEDGER, NOT ONLY THE DISTRIBUTION.** Add a second-tier
  provider to a scratch content dir (an item or room type with a higher `refillPerTick`, or a lower
  `wantAtBasisPoints`), then re-run BOTH
  `--days 30 --seed 7 --arrivals 120 --rooms 12 --amenities 3` and
  `--days 1000 --seed 42 --rooms 12 --amenities 3`, and read the review distribution AND
  `money.balancePennies` against the two-amenity cell. *If the distribution stops being a point mass
  AND the balance stops falling monotonically, it is a content gap and M6 owns it. If the
  distribution spreads while the balance still falls, the score has something to say and the money
  loop does not, which is M4's. If neither moves, it is the aggregation and the scorer owns it.*
  **The distribution alone cannot tell those three apart, which is why the first version of this item
  — reading only the distribution — would have returned "content gap" for all three.**
  `scorer.report.test.ts` asserts the point mass today, so the day content grows a quality axis that
  arm goes red and this comes due on its own. -> **M4 for the ledger half, M6 for the content half.**

- **THE VISITOR POPULATION MAY BE STRUCTURALLY INCAPABLE OF A GOOD REVIEW**, and no aggregation
  measured at G-028b fixes it. A visit is short and service is serial, so a perfectly served
  visitor still spends a large fraction of it wanting something — the same arithmetic ADR-0028's
  amendment used for the dissatisfaction floor, now setting a CEILING on the review. Every
  candidate the plan measured has this floor, because subtracting it needs the fold ADR-0031
  refused to grow. **FALSIFICATION TEST**: run the food-court fixture at several provisioning
  levels and read the visitor score distribution. *If the best reachable score at zero contention
  is below the top band, the review scale or the visit duration is mis-sized for lodging-free
  content.* -> **whichever goal ships a second content set for real.**

- **A ONE-TICK CADENCE ARTEFACT IN THE DEPARTURE MIX, NOT A PROPERTY OF THE SCORER. The falsification
  test below was RUN and it returned "the population".** At `--arrivals 60 --rooms 6` the mean review
  dips going from one amenity to two. G-028b's build first pinned that as a limit of the aggregation
  with a denominator mechanism attached — *"the richer hotel grades its guests over four times as
  long"* — and **that attribution is withdrawn rather than restated** (`CLAUDE.md` rule 5).
  Measured at the cadence's own neighbours, `--days 30 --seed 7 --rooms 6`, one run per cell:

  | arrivals | 1 amenity | 2 amenities | lean arm's departures |
  |---|---|---|---|
  | 59 | 285 | 331 | 5 / 360 / 359 |
  | **60** | **348** | **345** | **0 / 10 / 702** |
  | 61 | 283 | 346 | 2 / 371 / 328 |

  **The score RISES at 59 and at 61 and dips only at 60. The rich arm is stable at all three; the
  anomaly is entirely in the LEAN arm** — and a denominator effect present either side with the
  opposite sign cannot be what produces it. What is different at 60 is the departure mix, violently:
  the lean arm checks out nobody and walks almost everybody out dissatisfied. **This item's own
  discriminator therefore returns "the population and not the scorer."**

  **RE-PARKED, WITH WHAT WOULD STILL BE WORTH KNOWING**: sweep `--arrivals` from 30 to 240 at six
  rooms and record the departure mix beside the mean at every step. *If the phase-locked mix has
  other knife-edges like the one at 60, the cadence is a confound in every balance reading this
  project takes at six rooms, which is a bigger finding than the dip. If 60 is the only one, it is a
  curiosity and closes.* **The artefact is pre-existing and is not G-028b's**; what that goal added
  and then removed was the causal claim. -> **M4, with the reputation term that would read it.**

- **`met` NOW DEPENDS ON THE REVIEW SCALE**, because the band count is `max - min + 1`. Two content
  documents differing only in `reviewScoreMin` produce different `met` columns and different state
  hashes. The behavioural fence is unaffected — no decision reads a review, and the departures, the
  ledger and the build counters are identical — but the need TALLY's unit is now a review parameter.
  Both `review.boundary.test.ts` and `stock.content.test.ts` state the narrowing and assert the tick
  columns as the control. **FALSIFICATION TEST**: if a future goal wants the tally scale-independent,
  the move is a separate content field for the band count. *Adding one is only justified if some
  consumer needs `met` to be comparable across content sets — nothing does today.* -> **M4.**

## The cadence question, RUN and returned positive (G-028b sweep 2, 2026-08-14)

- **THE ARRIVAL CADENCE IS A CONFOUND IN EVERY SIX-ROOM BALANCE READING THIS PROJECT TAKES.**
  Parked at sweep 1 with the discriminator *"if the phase-locked mix has other knife-edges like the
  one at 60, the cadence is a confound"*. **It was run — every integer cadence from 30 to 240,
  `--days 30 --seed 7 --rooms 6`, one amenity against two, 422 runs — and the answer is "other
  knife-edges".**

  | | |
  |---|---|
  | cadences where the amenity axis FALLS | **two: 35 (2.48 → 2.44) and 60 (3.48 → 3.45)** |
  | adjacent-cadence lean-arm jumps ≥ 0.25 band | **30→31 (2.67 → 1.61 — LARGER than the 60 spike)**, 34→35, 59→60→61, 210→211 |

  **The 60 spike was not special. It was the one somebody happened to measure.**

  **Why this reaches past G-028b**: six rooms is this project's default balance workload, and a
  reading taken at one cadence can differ from its neighbour by more than a quarter of a band
  because the *departure mix* moves discontinuously — at 60 the lean arm reads `0 / 10 / 702`
  against `5 / 360 / 359` one tick away. **Any balance claim taken at a single cadence is a claim
  about that cadence.**

  **FALSIFICATION TEST**: for any balance reading this project relies on, re-take it at ±1 arrival
  tick. *If the reading moves by less than the effect it is being used to demonstrate, the cadence
  is not a confound for that claim and it closes for that claim only. If it moves by more, the
  claim needs a cadence sweep rather than a cadence.*
  -> **the M3 instrument-debt goal, alongside the three campaigns and the tick-cost re-take. This
  is now the largest of the four, because it does not question one instrument — it questions the
  workload every instrument is read on.**

- **AND THE PARKED ITEM WORKED EXACTLY AS THE RULE INTENDS.** A hypothesis was parked *with its
  discriminator*; the next round ran the discriminator; the answer came back positive and the item
  **came due rather than closing.** That is the fourth time a parked experiment has produced a
  result nobody planned — and the first where the result was *"the thing you have been measuring
  on is unstable"* rather than a fact about the feature.

## From G-028b sweep 3 (both critics)

- **A PRE-G-028a SAVE RESUMES WITH AN INVENTED SPOTLESS HISTORY, AND ITS GUESTS DEPART WITH
  PERFECT REVIEWS.** `migrateV15ToV16` zero-fills `unservedTicks`, and G-028a justified the
  flattering direction on the warrant *"nothing in `packages/sim` reads any of these three
  fields."* **G-028b voids that warrant**: `needBandOf` reads it, and **0 is the value that scores
  the ceiling** — top band on every need, `met` true on every row, the maximum review, whatever
  the hotel then does. **This is not the mixed schema-3/schema-4 tally column `report.ts`
  concedes; that is a column part-computed under two rules, this is a history that never
  happened.** Latent: `deserialise` has no production caller, and the runner creates every world
  it reports on. The default does not move — every candidate invents something and 0 is already
  in the shipped fixture and every v16 save written — so what is parked is the exposure, not the
  choice. **A FOURTH candidate invents nothing and is the one to reach for**: record the tick the
  counter becomes valid from (`world.tick` is in the bytes at migrate time) and grade a migrated
  guest over that window alone, declining to grade the unrecorded middle. It loses on blast
  radius today — a new field on every need moves the save schema, the state hash, the measure
  golden and the permanent fixture's chain — and it is named so the goal that needs it does not
  re-derive the list. **FALSIFICATION TEST**: serialise a world mid-run, migrate it v15→v16, resume it to
  the next departure and compare that guest's review against the same guest in an unbroken run.
  *If the resumed guest scores higher, the hazard is live the moment anything resumes a save; if
  it scores the same, the zero-fill is harmless and this closes.* -> **whichever goal gives
  `deserialise` a caller — M5's load path.**

- **THE SCORE'S NON-DECREASING PROPERTY IS TRUE AT THE DERIVED CADENCE AND FALSE OVER A BAND
  AROUND 70 ARRIVALS.** G-028b's headline arm swept 40 grid cells and 9 cadences and asserted
  *"it never falls on either single axis"* — **at `--arrivals 120` only**, which is the cadence
  the provisioning rule is derived at. Re-measured at 200 days, two amenities, the ROOM axis:

  | arrivals | 3 rooms | 6 rooms | 12 rooms |
  |---|---|---|---|
  | 69 | 332 | 363 | **349** |
  | 70 | 332 | 363 | **336** |
  | 71 | 333 | 367 | **342** |
  | 120 | 354 | 409 | 500 |

  **It falls at all three of 69/70/71, so the ±1-tick discriminator returns "not a confound"** —
  this is a contiguous band, not the phase knife-edge this goal withdrew a different arm for.
  The arm's title now carries the scope; ADR-0037 amendment 2 records the withdrawal.
  **FALSIFICATION TEST**: sweep `--arrivals` 60..90 at 3/6/12 rooms and two amenities, at 200 and
  1000 days, and record the departure mix beside each mean. *If the fall coincides with a change
  in which departure row dominates, it is the population — the same answer the cadence artefact
  got, and the two are then one finding. If the mix is stable across the band and the score still
  falls, the score has a genuine non-monotone region and M4's reputation term must not read it
  there.* -> **the instrument-debt goal, beside the arrival-cadence confound it now joins.**

- **`apps/game/src/hud.ts:98`'s MOTIVATING MEASUREMENT WAS TAKEN UNDER THE RETIRED DEFINITION.**
  The HUD's need cell is justified by a reading of `guest_comfort` as *"15 met / 17 unmet"* — a
  departure-instant count that no longer exists. The cell itself draws `met / (met + unmet)`, so
  the drawing is correct and the figure explaining why it is drawn that way is not.
  **`apps/game` is shut for this milestone and was not touched**, which is why this is parked
  rather than fixed. It is the FOURTH surface the three-package census does not reach — the
  others being `packages/content`, `tools/viewer` and the ledgers. **FALSIFICATION TEST**: re-run
  the invocation that comment names and read the comfort row. *If the ratio it describes has
  moved, the sentence is stale and the cell's justification needs re-taking; if the drawing is
  what a watcher finds confusing rather than the comment, that is the WATCH's answer, not this
  item's.* -> **the goal that opens `apps/game`, with the human WATCH it already owes.**

## From G-032a — the instrument re-take (2026-08-14)

- **DIVISOR CADENCES PHASE-LOCK, AND THIS PROJECT HAS CHOSEN ONE EVERY TIME.** Measured, exact
  integers (occupancy = guest-frames ÷ ticks, so n=1 is the whole distribution and there is no
  regime): the shipped `ARRIVAL_EVERY_TICKS = 96` is a **local minimum** of occupancy against both
  neighbours, and so are three of the four `rooms`-rotation arms — 20, 60 and 15. **96, 20, 60 and
  15 all divide 1,440.** The fourth, `saturated-100` at 5, sits on a monotone stretch where the
  test cannot resolve it.
  **BUT THE RULE IS NOT UNIVERSAL AND THAT IS WHY THIS IS PARKED RATHER THAN ASSERTED**: 120
  divides 1,440 and is **not** a local minimum (`--rooms 60 --seed 42`: 118→805, 120→787,
  121→715, 122→643, 123→812).
  **FALSIFICATION TEST**: sweep `--arrivals` 60..240 at 60 rooms, label each cadence by whether it
  divides 1,440, and compare the two populations' mean occupancy. *If divisors are systematically
  lower, every benchmark constant in this repository has been chosen at the pessimal point of the
  axis it measures, and the next workload constant should be chosen OFF a divisor. If the two
  populations are indistinguishable, 120 is the rule and the four are coincidence.*
  -> **the goal that next chooses a workload constant** (G-024's queue arms are the first).

- **AN LF-ONLY PATTERN MATCHED AGAINST WORKING-TREE BYTES IS INERT ON WINDOWS, AND THE RULED-RED
  ROW HID ONE FOR THE WHOLE SESSION.** `check-tripwire.mjs`'s `GUEST_LOOP` spanned two lines with
  `\n`. `materialise` reads a git revision from the BLOB (LF) and the working tree from DISK
  (CRLF), and `--null` measures head against head — so on a **dirty** tree, which is every moment
  an agent is mid-goal, the mutation matched nothing and every mutation probe reported the gate
  failing to bite. **Nobody could see it: the row was already red for the unrelated ADR-0015
  configuration refusal.** Fixed here (`\r?\n`, built from a normal string, compiled out of the
  shipped bytes and checked against both conventions). **What is parked is the CLASS**: `stamp.mjs`
  learned *"a gate must compare text, not line endings"* at G-022 and nothing generalised it.
  **FALSIFICATION TEST**: scan `tools/` for multi-line string literals used as match patterns
  (`includes(`, `.replace(`, `indexOf(`) whose subject can be working-tree bytes, and check each
  against a CRLF fixture. *If others exist, this is a class and wants a scanner in the census; if
  this was the only one, it closes and the fix stands alone.*
  -> **G-032c, which is already opening a scanner gate.**

- **`density` IS NOW THE THIN AXIS AND IS THE ONE TO WATCH.** Its pooled floor (loaded max
  **2.0415**) sits **1.07×** under its ceiling (**2.1856**), where the other three sit at 1.34×,
  1.28× and 1.30×. Nothing refuses — `bound > floor` holds — but this is the closest this project
  has come to ADR-0016's crossing, and the pre-registered response is already written in
  `scaling-bound.mjs`: **more samples per reading and a re-taken campaign, never a wider number.**
  **FALSIFICATION TEST**: re-take the density axis alone at `--samples 9` and recompute both
  constraints. *If the loaded max falls and the margin opens, the instrument was under-sampled and
  the axis is healthy; if it stays, the axis is approaching ungateable and that is a §2.0 finding
  with its readings rather than a bound to widen.*
  -> **the next goal that reddens `check:scaling`, or M3 exit, whichever comes first.**

- **THE TICK-COST CAMPAIGN LIVES INSIDE AN EXECUTABLE GATE; THE SCALING CAMPAIGN IS A DATA MODULE.**
  `scaling-bound.mjs` can be imported and its derivation exercised without a stopwatch, which is
  why `scaling.bound.test.ts` can recompute every bound. `tripwire.mjs` holds its campaign inline
  and calls `process.exit` at module scope, so anything wanting to read those readings must PARSE
  the file — `check-tripwire.mjs` does, and G-032a's census briefly did too before the assertion
  that needed it was withdrawn. **Two readers of one value is not the duplicated-constant defect,
  but a third would be a smell.**
  **FALSIFICATION TEST**: extract `BOUND_CAMPAIGN`, `LOADED_OBSERVATIONS` and
  `CADENCE_OBSERVATIONS` into `tripwire-campaign.mjs` and have `tripwire.mjs` import them. *If
  `check-tripwire.mjs`'s parsing assertions can then be replaced by imports with no loss of bite,
  the asymmetry was accidental and should go; if the parsing is load-bearing — it exists partly to
  prove the ceiling is not a literal — the split buys nothing and this closes.*
  -> **G-032b, which is already in `tripwire.mjs` for the merge measurement.**

- **G-020b's SCORED PREDICTION HAS NOW FAILED ON TWO INDEPENDENT CAMPAIGNS.** `sim-critic`
  predicted at PLAN that a REAL PAIR would set the noise ceiling, because `--null`'s two arms are
  one comment apart. It failed on G-020b's shipped campaign and it failed again on G-032a's
  re-take: the null's **+3.55%** beats pair-A's **+2.52%** and pair-B's **+1.75%**. **The
  structural half still stands and needs no reading** — a null's spread is a LOWER BOUND on
  real-pair noise, never an estimate of it — so the real pairs stay in the campaign.
  **FALSIFICATION TEST**: on the next re-take, record which arm sets the ceiling before looking.
  *Three failures makes the prediction dead and the real pairs become a structural argument only;
  a success would mean the first two campaigns were unlucky rather than the prediction wrong.*
  -> **whichever goal re-takes the campaign next.**

- **FIVE PROPERTIES REVERSE ONE ARRIVAL TICK AWAY, AND THREE OF THEM CARRY RULINGS.** G-032a's
  census perturbs `report.ts`'s arrival loop by ±1 and runs the suite. **The counts, the permitted
  set and the five findings live in `tools/headless/src/cadence.census.test.ts`**, regenerated by
  `node tools/gates/cadence-census.mjs --delta +1` — deliberately NOT restated here, because a
  count copied into a ledger is a third place for it to go stale and this one already went stale
  once. They are not numbers that moved — they are
  **inequalities and boolean predicates that flip**:
  ADR-0034's amendment (*"the WORST engagement need rises when an amenity is added"* — `12 rooms:
  expected 909 to be greater than 1193`, and at six rooms `1513` against `1606`), G-028b's
  provisioning monotonicity (`strictlyIncreasing` → **false**), `outcome.report.test.ts`'s `met <
  departures / 2`, and `hysteresis.report.test.ts`'s `--arrivals 59` neighbour arm (`expected 0 to
  be greater than 0`).
  **ADR-0037 amendment 2 already ruled the general form** — *a property quantified over one
  dimension is a claim about the dimension you swept and a guess about the one you did not* —
  **these are the survivors it did not reach, found mechanically rather than by reading.**
  **G-032a DOES NOT REPAIR THEM AND THAT IS ADR-0024's ORDER**: enumerate the class and publish
  its size; fixing starts after the count exists. They are balance claims.
  **FALSIFICATION TEST**: for each, re-take the reading across a BAND of cadences rather than a
  pair — `--arrivals` 90..102 — and record the departure mix beside it. *If the inequality holds
  everywhere except an isolated tick, it is the phase knife-edge and the arm needs its cadence
  scoped in its title (ADR-0037 amendment 2's remedy). If it reverses across a contiguous band,
  the property is not true of the sim and the ruling that rests on it is wrong — which for
  ADR-0034's amendment would mean the build-loop guidance points the wrong way.*
  -> **`ai-engineer` / `balance-critic`, before M4's reputation term reads any of them.**

- **THE `needs` AXIS'S CAMPAIGN UNDER-SAMPLES ITS LOW TAIL, AND THE DIRECTION ASSERTION IS WHAT
  FOUND IT.** G-032a's re-take recorded a quiet spread of **1.0357 .. 1.2446** at n=12. The
  shipped gate then produced **0.9732** on an ordinary `pnpm verify` — the same instrument, the
  same configuration, the same 5-sample protocol, and **below every reading in the campaign**.
  The bound is unaffected (it is built from the median and the MAX, and a low tail moves
  neither), and the direction assertion came off because of it, with the reading recorded at
  `scaling-bound.mjs`'s `needs` axis. **But a 21st reading outside the range of the first twenty
  says the arm's spread is wider than n=12 resolved**, and the collapsed 4-against-3 lever is why:
  the true ratio now sits close enough to 1 that the instrument's own noise crosses it.
  **FALSIFICATION TEST**: re-take the `needs` axis alone at `--samples 9` and n=25, quiet, and
  compare the observed range against 1.0357 .. 1.2446. *If the wider campaign still excludes
  0.9732, that reading was an excursion the protocol does not normally produce and the campaign is
  sound; if the range now spans it, n=12 at 5 samples is too thin for this lever and every
  `needs`-axis figure in the file wants re-taking at the larger n — including the median the bound
  is pinned to.*
  -> **the next goal that reddens `check:scaling`, beside the `density` margin item above it.**

- **THE LOADED REGIME IS UNOBSERVED FOR THIS TREE, AND THAT IS STATED RATHER THAN COVERED.**
  G-032a reported *"14 tests time out across 10 files under 12-worker load, pre-existing"*.
  **Both halves are withdrawn** (`CLAUDE.md` rule 5): the figure carried no invocation, so it
  cannot be compared — a re-run at the stated load produced a different count — and
  *"pre-existing"* rested on **no paired HEAD arm**, which nobody took. What is true is narrower:
  `hysteresis.report.test.ts`'s four-run arm passed alone and timed out inside one whole-suite
  run, and its budget was raised to the 60s two siblings already use. **No causal claim survives.**
  ADR-0015's move when a regime cannot be measured before shipping is to ship, state the regime as
  unobserved, and owe the observation — this is that.
  **FALSIFICATION TEST**: `node tools/gates/arm/load.mjs --workers 12 -- pnpm test`, paired
  against a materialised HEAD, arms alternated, n≥3 each, one sitting, recorded with the machine.
  *If the timeout count is the same on both arms, the fragility is the suite's and predates
  G-032a — which is what "pre-existing" claimed without evidence. If this tree times out more,
  the census's three 30-day simulations are a real cost and belong on a shorter arm.*
  -> **the goal that next adds simulation work to `pnpm test`, or M3 exit.**

## Deferred out of G-034b (2026-08-20)

Raised by `sim-engineer` at PLAN and BUILD, and deliberately kept out of the diff. Corridors are
now a stored plan, a validity rule and a save version; everything below is the surface that plan
implies and this goal did not build.

- **`clearCorridor` — a plan that can only GROW.** `layCorridor` is the whole verb: a cell can be
  declared and never undeclared. Nothing in this goal needs removal — the rule only ever READS
  the plan — but a player redrawing a floor obviously does, and B4 (ADR-0047: rooms are editable)
  makes it a certainty rather than an edge case. It is one function beside `withCorridor` and one
  command case; what it needs from a goal is the DECISION about what happens to the rooms that
  were reaching circulation through it, which is a design question and not a plumbing one.
  **FALSIFICATION TEST**: attempt to express "the player rubs out a corridor and the two rooms
  beside it go dark" as a command log against this build. *If it can be done with `layCorridor`
  alone it was never needed; if the only route is editing `World.corridors` from outside the
  command log, then the plan is write-only state and I2's "anything that cannot be expressed as a
  command cannot exist" is being bent.* -> **G-036**, with the drawing verbs.

- **A PLAYER-FACING corridor verb, with its refusals RECORDED.** `layCorridor` is the PRIMITIVE:
  a cell off the plot THROWS, exactly as `spawnEntity` does, because the caller is holding the
  world whose plot it ignored. The player's version — the one a UI dispatches, which records
  `outOfBounds` in `World.buildOutcomes` instead of throwing — is the same split `buildRoom` has
  over `spawnEntity`, and it belongs with the goal that gives the player a drawing tool.
  **FALSIFICATION TEST**: point a UI at `layCorridor` and drag off the edge of the plot. *If the
  run survives, the primitive was enough; if it throws, the player-facing verb is owed and this
  entry was right.* -> **G-036**.

- **WHAT A CORRIDOR COSTS.** Nothing, today. The scarcity this mechanic creates is SPACE, which
  is ADR-0047 B2's whole argument (*"without scarce space, bigger is better has no
  counterweight"*), and a price is a designer's number and therefore content (I3). Adding one is
  a field on the economy table plus a transaction, not a shape change.
  **FALSIFICATION TEST**: play a build loop with free corridors. *If the optimal move is to
  declare every cell on the floor a corridor and then build into it, space is not scarce enough
  on its own and the price is doing work the geometry cannot.* -> **G-037**, with per-instance
  pricing, or M4 with the economy.

- **CIRCULATION IS NOT REACHABILITY, AND THIS GOAL DOES NOT PRETEND OTHERWISE.** A room must open
  onto a cell the plan calls a walkway. Whether that walkway CONNECTS to the entrance — through
  other corridors, stairs and lifts — is a flood fill, and `PARKING.md` named it *"a THIRD thing
  and not this one"* at G-009 before either existed. Two corridor cells at opposite ends of a
  floor with rooms on both are all valid here and one of them is unreachable.
  **FALSIFICATION TEST**: build a hotel whose only corridor is a single cell in the middle of a
  sealed block of rooms, and watch a guest walk to it. *If travel gets there, reachability is
  already trivially true and the flood fill buys nothing; if the guest teleports through rooms,
  that is `stepTowards` and not this rule.* -> **G-038**, with pathfinding.

- **A CORRIDOR IN MID-AIR IS LEGAL.** Nothing requires a declared cell to be supported, so a plan
  may name a walkway on floor 12 above nothing at all — and a room beside it counts as connected.
  Rooms are governed (`unsupported` is checked first, so such a room is invalid anyway *if it is
  the room* that floats), but the corridor itself is not.
  **FALSIFICATION TEST**: declare a corridor at (floor 12, column 40) on an empty plot and put a
  supported room beside it. *If the room reports valid, corridors need their own support rule and
  it is a real gap; if no reachable layout can produce a supported room beside an unsupported
  corridor, the case is unreachable and the rule would inspect nothing.* -> **G-038**, where
  circulation stops being a per-cell fact and becomes a graph.

- **THE HISTORICAL ARMS ARE ALL INCOMPARABLE NOW, and that is stated rather than discovered.** An
  arm materialises `packages/sim/src` from a revision and drives it with HEAD's workload
  (`ARM_PATHS`), and HEAD's workload lays corridors — so every pre-G-034b revision stops at
  `applyCommand: unhandled command layCorridor` and `sim:measure` reports INCOMPARABLE. The
  instrument is working (that verdict is what it is for), and the two proof-of-bite probes in
  `check-measure.mjs` / `check-tripwire.mjs` were re-pointed at the new name in this commit.
  **FALSIFICATION TEST**: `node tools/gates/measure.mjs --head <any pre-G-034b revision>`. *If it
  reports a RATIO, the workload did not really change and the re-point was wrong; if it reports
  INCOMPARABLE naming what stopped it, the campaigns cannot be compared across this change and
  are re-taken rather than continued* — ADR-0015's REPLACE-on-configuration-change case.
  -> **G-039**, which already owns every campaign re-take.

  **AMENDED AT G-036a, AND THE AMENDMENT IS THE POINT OF WRITING THE TEST DOWN.** This test named
  `layCorridor` as the expected cause. **It has already moved**: HEAD's harness now reads
  `bounds.maxRow` when it sizes the seeded plate, so a pre-G-034a `GridBounds` gives `NaN` and the
  arm stops at `draftSpawn: floor must be a safe integer` — EARLIER than any command. The
  property was never the symbol; it is *"a revision the harness cannot drive says so and names
  what stopped it"*, which is how both gate probes are now written (structural clause plus
  today's cause). **A parked test pinned to a symbol expires the next time the harness grows.**

- **THE WATCH SURFACE SHOWS THREE OF THE PLOT'S EIGHT ROWS, AND NOBODY HAS SEEN EIGHT.** G-036a
  widened the plot to eight rows and spread every layout into it, but `apps/game/src/scenario.ts`
  seeds **three** — argued in place as the smallest depth with a MIDDLE row, which is what the
  wall-height question needs. So the recording answers *"does it read as a building"* at depth 3
  and says nothing about depth 8, where a room has up to seven walls stacked behind it.
  **FALSIFICATION TEST**: raise `LODGING_ROWS` to 8, record, and look. *If the back rows are
  legible, the wall height is fine at the plot's full depth and this note closes; if the front
  rows' walls bury them, then either `WALL_HEIGHT` is too tall for a deep plate or the camera
  owes a cutaway — and the 64px reading taken at depth 3 was taken at the wrong depth.*
  -> **G-036b**, which puts a player-drawn room on that surface and has to look at it anyway.

## From G-036b — the player draws a room (2026-08-20)

- **THE DEPTH-8 HYPOTHESIS IS DISCHARGED, POSITIVE, BY THE GOAL IT WAS POINTED AT.** G-036a
  parked *"the WATCH surface shows three of the plot's eight rows, and nobody has seen eight"*
  with its test — *raise `LODGING_ROWS` to 8, record, and look* — and predicted two ways it could
  fail: *"either `WALL_HEIGHT` is too tall for a deep plate or the camera owes a cutaway"*.
  **RUN.** `LODGING_ROWS = 8` gives a 3-wide by 8-deep plate, 24 rooms on floor 1, 88 corridors
  declared, and **every one of the 24 beds is visible with the back rows legible.** The camera
  owes no cutaway and the wall height is fine at the plot's full depth. *(The scenario itself
  stays at 3: the depth of the SHIPPED layout is a separate question from whether the projection
  survives depth, and this test only ever asked the second.)* **Sixth parked hypothesis settled by
  a goal running someone else's experiment.** Closed.

- **AN ITEM COSTS NOTHING, AND `placeItem` IS NOW THE PRIMARY PLAYER VERB.** `applyPlaceItem`
  books no transaction: an item price is a designer's number and `ItemTypeData` has no such
  field, so inventing one here would ship a price nobody balanced — and booking it as
  `construction` would break `countConstructionTransactions(ledger) === built`, the
  cross-subsystem law G-008's evidence rests on. **FALSIFICATION TEST**: *if a run can raise a
  hotel's satisfaction by placing items and never move the balance, the item price is
  load-bearing and belongs in content.* That run becomes possible the moment a room is scored on
  what is in it. -> **G-037**, which builds the scorer, or M4 with the rest of the prices.

- **A FOOTPRINT IS A SINGLE RECTANGLE, WHICH IS NARROWER THAN ADR-0047 B1 ASKED FOR.** B1 wanted
  *"a polygon-capable representation holding a rectangle, so arbitrary shapes are a later goal
  rather than a later migration"*; what shipped is an origin plus an extent, which is B1's "two
  corners in the save" and not its polygon clause. The reason is the standard this project
  already applies to a content field with no consumer: nothing can produce a two-part footprint,
  no rule reads a second part, and no test could falsify the code that walks one.
  **FALSIFICATION TEST**: *when an L-shaped room is actually wanted, count what the migration
  costs — one field's shape, on a chain that runs eighteen steps and is exercised on every load
  — against what a year of carrying an unexercised `parts` array cost.* If the migration is the
  cheaper number, this call was right. -> whichever goal wants a non-rectangular room.

- **`layCorridor` STAYS ONE CELL, AND THE DAY THAT STOPS BEING RIGHT HAS A NAME.** Asked the same
  question `buildRoom` was asked and answered differently: a corridor is a DECLARATION about a
  cell — idempotent, free, entity-less — so drawing a rectangle of corridor is N idempotent
  no-ops, which N commands already are. A rectangle form would buy bytes in a log and cost a
  second entry point in the one command whose design note is *"it does not ask what is standing
  there"*. **FALSIFICATION TEST**: *the day a corridor gains a COST, ask whether that cost is per
  CELL or per DRAW. If it is per draw, a rectangle is a thing the log has to be able to express
  and the cell form cannot express it.* -> the goal that prices circulation, M4 or later.

- **THE THIRD ITEM ON A TILE HAS A CORNER CLIPPED, AND IT IS THE ITEM LAYOUT RATHER THAN THE
  WALL.** `drawItems` marches items RIGHTWARD from the tile centre, so item index 2 sits where
  the front-right neighbour's wall foot is already high: measured at the shipped wall height, one
  of its five probes is covered (`wall-height.occlusion.test.ts` asserts exactly that, so it is a
  recorded fact rather than a silence). Indices 0 and 1 are entirely clear, and **no shipped room
  type requires more than one item** — so this is a state only `placeItem` produces, and it is a
  clipped corner on a dark plate rather than a hidden item. **FALSIFICATION TEST**: *if
  `drawItems` ever lays items out within the tile's own diamond instead of marching them off its
  right edge, that expectation drops to 0 and the general arm above covers it.* No wall height
  inside the useful range fixes it. -> a render-layout goal, with G-037's decor items.

- **AN ITEM'S CELL IS THE PLAYER'S CHOICE AND NOTHING READS IT.** `placeItem` takes a cell, and
  WHERE in a room an item stands is now a decision a player makes — but `hostRoomOf` only asks
  which room covers it, so every cell of a room is the same cell to every rule. **FALSIFICATION
  TEST**: *if G-037's scorer or G-038's pathing ever reads an item's position relative to the
  room's — a bed against a wall, a queue point by the door — then position is state that matters
  and the editing verbs owe it a move command.* Until then a player who cares where the bed is,
  is expressing a preference the simulation cannot see. -> **G-036c**, which owns the moving.

## From the DECISION REGISTER — ADR-0047's parked items, written down at last (G-039a, 2026-08-21)

**THE GAP, STATED FIRST, BECAUSE IT IS THE REASON THIS SECTION EXISTS.** ADR-0047 ruled a
twenty-two-entry register and **parked everything outside its blocking set with a falsification
test — inside `DECISIONS.md`.** None of it was ever written here. ADR-0049 found the first
instance (*"I wrote 'this did go to `PARKING.md`, as C5' and then looked — there is no C5 entry
there"*) and named the consequence: **§9's stop condition *"`PARKING.md` has stopped growing,
meaning scope is leaking into goals"* has been reading clean while an entire register
accumulated somewhere §9 does not look.** A deferral recorded in a decision register defers just
as effectively; what it does not do is show up in the one place a person checks whether
deferral is still happening.

**THE SWEEP (§5.8 — a fix on a known class must state where else that class lives).** Every
`DECISIONS.md` entry marked parked, deferred, reserved or named-not-built was checked against
this file. The register is the bulk of it and is below. **Three items outside the register were
found and are at the end.** **Two register items were already here** and are cross-referenced
rather than duplicated: B1's polygon clause (*From G-036b*) and B2's corridor pricing (*Deferred
out of G-034b*). **B6, the access rule, is NOT parked — it shipped at G-036c**, and appears
nowhere below for that reason.

### A — the graphics pipeline

- **A1 — THE REAL ART TRACK: 3D-RENDERED SPRITES.** Accepted as the authoring route because it
  makes camera rotation and walk cycles *additive rather than multiplicative*; what ships today
  is the placeholder track, which needs no assets at all (procedural coloured prisms, ADR-0014).
  **Nothing is owed until the first asset exists.** **FALSIFICATION TEST**: *when the first real
  sprite is authored, count what a rotation and a walk cycle cost on top of it. If they are
  independent renders of one model, A1 was right; if either forces a redraw of the other, the
  route was multiplicative after all and the placeholder track should have kept running.*
  -> **M5 or later**, with the art track ADR-0014 already says M5 does not wait on.

- **A5 — CAMERA ROTATION, BUILT-FOR AND NOT BUILT.** `iso.ts` takes an `Orientation` everywhere
  and `farSidesOf` derives the far walls from the projection, so all four orientations are
  already exercised by `iso-depth.test.ts` — but **no control changes it and no code path reads
  a saved one.** **FALSIFICATION TEST**: *add a key that cycles `SHIPPED_ORIENTATION` and record
  one frame per orientation. If every room, wall, item and guest lands correctly, rotation is a
  control and not a rewrite, which is what A5 bought; if anything is a half-tile out, the `-1`s
  in `toView` are wrong in a way only rotation reveals — which is the exact bug A5 was ruled to
  prevent.* -> **whichever goal wants the second orientation.** Nobody has asked for one.

- **A6 — EIGHT FACINGS, AND WALK CYCLES.** Four facings ship. The ruling: *"eight is a render
  setting, not a redraw"*, and *"walk cycles land with movement, not before"* — and movement is
  M3's travel, which is itself blocked. **FALSIFICATION TEST**: *when travel is on, watch a
  recording at four facings. If a guest crossing a corridor reads as sliding rather than
  walking, the walk cycle is owed; if the four facings make the direction legible on their own,
  eight is a preference and can wait for the real art.* -> **M5**, with the art track.

- **A7 — ZOOM AND RESOLUTION LEVELS.** Parked by the register with its own reason: decide it
  when the renderer is rebuilt. **FALSIFICATION TEST** (ADR-0047's own): *if the atlas ever has
  to be RE-PACKED to add a zoom level, it should have been decided at A2 and this park cost
  something.* Note the near-miss: this file already carries a *camera pan and zoom* item from
  G-031, which is a CONTROL over the existing single-resolution camera — a different question
  from how many resolutions the atlas holds. -> **the renderer rebuild, M5.**

- **A3 — MULTI-TILE ITEMS ARE STILL FORBIDDEN, AND THE PROHIBITION IS A CHECK.**
  `assertSingleTile` moved into `drawItems` at G-036b; the ROOM half was handled there (a room
  is now per-tile drawables with their own depths) and **the ITEM half was not** — an item
  spanning two tiles has two depths and no correct place in the draw order. `placeItem` cannot
  create one, so what reaches the check is a hand-built save. **FALSIFICATION TEST**: *hand-build
  a save with a two-tile item and load it. If the renderer throws, the prohibition is live and
  the debt is real; if it draws something plausible, the sort order has been made total by some
  later goal and A3 can be closed.* -> **the goal that gives an item a footprint** (M6's
  `placeItem` work).

### B — the world model

- **B5 — CONDITION / CLEANLINESS: THE FIELD WAS NEVER RESERVED, AND THAT IS A LIVE
  CONTRADICTION.** The ruling reads *"reserve the field now, build at M4"* and calls reserving
  free. **At save v20 there is no such field** — `packages/sim/src/save.ts` has no `condition`,
  and neither `room-types.json` nor the room entity carries one. So the half that was supposed
  to be free was not done, and it stopped being free the moment the next migration shipped
  without it. Housekeeping itself is correctly M4. **FALSIFICATION TEST**: *when condition is
  built, count the migration. If adding the field then costs one more step on an eighteen-step
  chain and nothing else, the reservation was worth nothing and skipping it was right; if any
  rule has to be re-derived because old saves cannot say what condition a room was in, the
  register was right and this is what the miss cost.* -> **M4**, with housekeeping.

- **B3 — BUYING LAND.** The plot's bounds are STORED rather than constant (`grid.ts`), which is
  the whole of what B3 decided; expanding them is an economy feature nobody has built.
  **FALSIFICATION TEST**: *widen `GridBounds` in a save by hand and load it. If rooms, corridors,
  pathing and the camera all cope, buying land is a transaction plus a command and B3's storage
  call has paid off; if anything assumed the opening bounds, that assumption is the real debt.*
  -> **M4**, with the economy.

### C — gameplay

- **C1 — SANDBOX OR SCENARIOS: RULED (scenarios). THE CAPITAL HALF LANDED AT G-057; THE SYSTEM
  IS STILL M6.** Starting capital and starting provisioning become scenario FIELDS, which are
  content (I3), so the harness stops injecting world shape through a CLI flag.
  **HALF DISCHARGED 2026-08-26 (G-057, ADR-0093).** This item's own discharge condition had two
  clauses — *"a scenario type exists in the schema AND `--rooms N` stops seeding capital"* — and
  **the first is now true**: `scenarioSchema` ships, `packages/content/data/scenarios.json`
  declares `openingCapitalPence`, and `startingCapitalPence` is gone from `economy.json`.
  **The second is ARMED and not fired**: `seededStock` admits `drawnFromCapital`, that branch is
  built and tested, and the shipped value is `supplementsCapital`.
  **AND THIS FILE'S OWN "~75%" WAS WRONG, RE-MEASURED**: the default invocation is **150%**,
  because `--amenities` defaults to 1 and seeds one of EACH of three amenity types, so the seeded
  stock is `(rooms + 3 x amenities) x 125,000p`. The `--rooms 60` bench arm is **1,575%**.
  **WHAT REMAINS HERE, and it is why the SYSTEM is still M6**: a single global declared capital
  cannot serve both a bare-plot scenario and a 60-room bench arm — flipping the policy globally
  was MEASURED to move 35 tests in 9 files and to make four pinned exit criteria vacuous, because
  a 60-room seeded hotel opens 7,375,000p in the red and can then build nothing. Serving both
  needs a scenario the HARNESS SELECTS, plus starting provisioning as a scenario field.
  **FALSIFICATION TEST (unchanged in shape, now runnable)**: *express the bench workload as a
  scenario file, set `seededStock` to `drawnFromCapital`, and run `sim:bench` from it. If every
  balance figure moves, `--rooms N` was seeding capital the numbers rested on and the re-take is
  owed; if nothing moves, the flag was harmless and only the tidiness argument remains.*
  **The one-field probe is already runnable today** — copy `packages/content/data` to a directory,
  set the field, and pass `--content <dir>`; that is exactly how G-057 took its reading.
  -> **the SYSTEM at M6; the FLIP and the re-take at M4's FIRST goal.**

- **C2 — EVERY SCORING NUMBER.** The SHAPE is pinned — function (a binary gate on required
  items), size (diminishing returns with an upkeep cost), decor, condition (B5), adjacency — and
  **every weight, threshold and band boundary is content and is unset.** **FALSIFICATION TEST**:
  *when the fold lands, try to express "a bigger room is better up to a point" purely in
  content. If a weight has to be a code constant, the shape was pinned wrongly and C2 was not
  the deferrable half; ADR-0045's per-need banding is the precedent for how such a fold is
  written and falsified.* -> **M4**, or the quality-fold goal that consumes it.

- **C4 — STAFF ROLES: NAMED, NOT BUILT.** Housekeeping (B5), reception (C5), maintenance,
  porters. Named because **each is a room requirement and a pathing consumer**, so M3's
  circulation has to be able to carry them. **FALSIFICATION TEST**: *try to express a
  housekeeper as an entity that walks a route and occupies a queue point, using M3's circulation
  and nothing new. If it fits, C4 was cheap to defer; if the pathing only knows how to move
  GUESTS, then "staff are a pathing consumer" was an assumption and the circulation goal owes a
  generalisation.* -> **M4**, with wages.

- **C5 — RECEPTION AS A QUEUE POINT. PARKED BY ADR-0047, TAKEN BACK BY ADR-0049, AND STILL NOT
  BUILT.** The human brought it forward into G-038 after looking at WATCH #12 and finding the
  hotel had no lobby; G-038 is blocked on the tripwire decision, so **the deferral is live again
  through no decision of its own.** Recorded here so that fact is visible somewhere §9 looks.
  **FALSIFICATION TEST — REWRITTEN EXECUTABLE 2026-08-26 (G-053b, ADR-0089 §4).** What stood here
  was ADR-0047's own wording — *"if M3's queue machinery cannot express a check-in desk without
  changing shape"* — which is **a design judgement with no command, no reading and no comparison**,
  so it could never come back negative. **Two greps replace it, and both are two-sided.**

  ```
  git grep -in "reception" -- packages tools apps
  git grep -n "serviceTicks\|servedUntil\|serviceUntil" -- packages/sim/src
  ```

  **READING at `26f9f88`: 1 and 0.** The single `reception` hit is a COMMENT
  (`packages/sim/src/save.ts:815`) — no content id, no room type, no need, no command — which
  re-verifies ADR-0075's *"`reception` appears in the whole tree exactly once, in a comment"*
  against today's bytes rather than quoting it (ADR-0084). The second returns **nothing**: the
  shipped queue is `{ guestId, since }` against `{ capacity, waitToleranceTicks }`
  (`world.ts:200`, `guests.ts:311`, `lift.ts`), and **it carries no service DURATION anywhere.**

  **COMPARISON.** ADR-0075's structural claim is that a lift is **TRANSPORT** (the server moves to
  you, N board at once, the wait ends when the car arrives) and a desk is **SERVICE** (the server is
  fixed, one at a time, a duration, the guest leaves on its own feet). **CONFIRMS while both
  readings hold — the abstraction cannot express a desk, so C5 is a NEW mechanic plus a new content
  type plus a new need or arrival phase, and is priced as one. REFUTES the moment either moves**:
  a shipped `reception` id means it stopped being new, and a service duration landing on the queue
  for some other reason means C5 became cheap **without anyone deciding it did** — which is the
  case worth catching, because nobody would re-price it on their own.
  -> **G-038**, when it unblocks.

- **C6 — GUEST ARCHETYPES.** Parked twice over: by the register, and by this file's existing
  bootstrap line naming archetypes for M6. What the register adds is the structural half already
  shipped at ADR-0017 §5 — the visit terminator is keyed on the need vector, so a second
  population is a table away rather than a rewrite. **FALSIFICATION TEST**: *give one archetype
  a need vector with a hole in it and run a season. If the existing terminator, review fold and
  scorer all read it without a code change, C6 really is content; if any of them assumes every
  guest wants every need, that assumption is the debt and not the table.* -> **M6**.

- **C7 — BOOKINGS, DAY/NIGHT AND SEASONS.** All three are balance-shaped and none has a
  consumer. **FALSIFICATION TEST**: *the day a review depends on WHEN a guest arrived rather
  than on what happened while they were here, one of the three has become load-bearing and the
  park expires. Until then `ARRIVAL_EVERY_TICKS` is a flat rate, and every campaign in this
  repository is measured against a hotel with no night.* -> **M4 or later**.

### Outside the register — the three the sweep found

- **A CACHED PER-INSTANCE CAPACITY IS A SEPARATE DECISION WITH A SEPARATE MIGRATION** (ADR-0051,
  as corrected by ADR-0053). Capacity is to be DERIVED from a room's footprint and contents at
  read time, exactly as the quality score is — *"two folds over one input list, not two
  mechanisms"* — so it needs no save field. The parenthetical parks the other direction: *"if a
  later goal wants capacity cached in state for tick cost, that is a separate decision with a
  separate migration — parked, not assumed."* **FALSIFICATION TEST**: *measure the fold in the
  tick loop with `sim:measure` once it exists. If deriving capacity per read is inside the
  noise, the cache is never owed; if it is not, the cache is a migration and this line is the
  decision that has to be taken first.* -> **whichever goal measures the fold.**

- **A UNIFORMLY STALE SET OF LEDGER STAMPS IS UNDETECTABLE, AND THE PARK HAS NO TEST.**
  `stamp.mjs`'s own header states it: four IDENTICAL but stale stamps pass every predicate the
  gate has — it detects disagreement and malformedness, not age — and it says *"parked with its
  falsification test rather than half-built."* **THERE IS NO FALSIFICATION TEST IN THAT COMMENT,
  and this entry does not invent one**, because the reason given is real: making "old" mechanical
  means ordering goal IDs across G-020a/b/c and reconciling them with `JOURNAL.md`'s headings,
  which is a bigger check than the defect it catches. **What CAN be said, and is the nearest
  thing to a test**: *G-039a's `check-status.mjs` now compares goal blocks against git, so the
  cheapest ordering-free version of "the stamp is old" — the stamp names a goal, and git has
  since seen commits for goals whose blocks are not pending — is one join away from machinery
  that now exists.* -> **unclaimed**, and honestly so.

- **THE `pnpm verify` ROW LOG KEEPS THE LAST 4 MB OF A RED ROW, NOT THE WHOLE OF IT** (G-039a).
  `rowlog.mjs` streams everything to the terminal and keeps the tail, because a runner prints
  its banner first and its failures last. **FALSIFICATION TEST**: *if a red row is ever truncated
  in a way that loses the diagnosis — the kept text carries a marker saying how many bytes were
  dropped, so this is observable rather than inferred — the cap is wrong and the fix is to spool
  to the file as the chunks arrive rather than at the end.* -> **the goal that hits it.** Nothing
  has come close: the largest row in this project's history is `test`, and its full output is
  well inside the cap.

## G-023b-ii — four hypotheses, each with the test that would settle it

**Parked with their falsification tests** (human ruling 2026-08-09). Every one of these is a
belief about how the sim behaves that this goal MEASURED the surface of and did not explain.

### 1. TRAVEL PERMUTES WHICH NEED A SMALL HOTEL SERVES, RATHER THAN HOW MUCH IT SERVES

`hysteresis.report.test.ts`'s era table: at `--rooms 6 --arrivals 60 --amenities 2`, comfort and
entertainment SWAP — `[711, 0, 0] / [192, 519, 0]` becomes `[195, 516, 0] / [708, 3, 0]` —
while **total engagement `met` is 1,095 on both sides, to the unit**, and identical at seeds 7,
8 and 9. So it is structural, not phase.

**THE TEST**: the two needs have identical rows in `need-types.json` and differ only in how they
are provided — comfort by an ITEM in the lounge, entertainment by the games ROOM. Give
`hotel_lounge` a `provides: ["guest_comfort"]` entry so both are room-provided, re-run the arm,
and see whether the swap follows the PROVISION KIND (it disappears) or stays with the NEED (it
does not). One content edit, one arm, no new instrument.

### 2. THE CADENCE CENSUS IS A CLAIM ABOUT A TREE WHERE TRAVEL WAS OFF

`cadence.census.test.ts` publishes a ±1-tick union taken at G-032a. Two of its five property
findings were INVERTED at the shipped cadence by this goal, and their recorded `assertion`
readings are pre-travel. **The census has not been re-taken.**

**THE TEST**: `node tools/gates/cadence-census.mjs --delta +1` against a travel-on tree, compared
arm for arm against the published union. Three outcomes worth telling apart: the same five
properties still reverse; the two inverted ones now reverse the other way; or they have stopped
reversing, which would mean travel made the axis less phase-sensitive and is a result in its own
right. Costs two full suite runs.

### 3. THE WATCH SCENARIO'S INVISIBLE WALKING IS GEOMETRY, NOT THE DIAL

WATCH #16 measured 149 basis points of moving guest-frames, 101 of 193 journeys finishing in one
tick, and a longest journey of 8 cells. The claim is that no admissible speed changes this
because the window [2, 108] puts every journey inside four ticks.

**THE TEST**: move `scenario.ts`'s amenities two floors from the lodging plate instead of one and
re-run the census. If moving-frames rise materially at the SAME speed, geometry is confirmed and
the repair belongs to the scenario (or to G-038's circulation). If they do not, the dial is the
cause after all and the WATCH finding is wrong about its own subject.

### 4. A GUEST BEHIND A ROOM'S FAR WALL IS MISLOCATED, AND THERE ARE TWO CANDIDATE REPAIRS

WATCH #16's one visual finding: at `WALL_HEIGHT` 24, a guest standing on a corridor tile behind a
room is drawn above that room's wall lip and reads as standing ON the wall. It has never been
visible before because guests were never behind walls before.

**THE TEST**, and it is the WATCH #14 shape: build the guest polygon and the far-wall polygon from
`iso.ts`'s own constants and walk every integer height, counting guests whose body overlaps a wall
they are BEHIND. Then compare two candidate repairs on the same frame — anchoring a guest on a
non-room tile at the tile's FRONT edge, against giving a walking guest a ground shadow on the tile
it occupies. **WATCH #14 falsified one of its own two candidates that way**; do not choose in
prose.

---

## G-023b-ii — one thing NOT parked, recorded so nobody parks it

**M4's reputation term.** `review.report.test.ts` now records the review mean falling by one
hundredth between 3 and 6 rooms, so *"a term over the MEAN is safe — building rooms cannot hurt"*
is false as written. **That is not a hypothesis and it does not want a test — it wants a
decision**, and the decision belongs to whoever writes the reputation term. It is asserted as a
census of inversions in that file so it cannot be lost.

---

## From G-038a-ii-β — a room is reached, or it is not a room (2026-08-21)

- **THE STAIRWELL ROLLOUT IS A BEHAVIOUR GOAL AND IT IS NOT THIS ONE.** No harness declares a
  stairwell, so `stairLeg` leaves the floor axis free from every cell and guests reach the
  basement through the ceiling. Turning stairs on re-routes every cross-floor journey through
  one shaft: it moves occupancy, every golden, I5 and the I2 hash.
  **FALSIFICATION TEST**: lay `layStair` on `(column 1, row 0)` for floors −1..0 in
  `report.ts`'s seeded walk and re-read `--rooms 60 --amenities 5` and the criterion
  invocation. *Measured in this goal, before deciding not to do it: `unreachable` reads
  **0 / 0 / 0** on the CLI default, the bench and the criterion with no stairwell; **0 / 0 / 5**
  with one confined to floors −1..0; **0 / 0 / 2** with a full-height one. If a stairwell ever
  changes the CLI default or the bench away from zero, this note is wrong and the rollout is
  cheaper than it looks; if it only ever moves the criterion, the rollout is buying journey
  realism and not reachability, and it should be scheduled as such.*
  → **its own goal**, alongside whatever re-takes `TARGET_CONCURRENT_HUNDREDTHS`.

- **A ROOM DRAWN OVER THE STAIRWELL NOW SEVERS THE BUILDING, AND NOBODY HAS DECIDED WHETHER THE
  PLAYER SHOULD BE STOPPED.** G-038a-ii-α ruled "accepted and named" because a refusal *"would
  need a rule to derive itself from, and that rule is REACHABILITY"*. That rule now exists:
  `travel.stairs.test.ts` drives a world where one room on the shaft's ground-floor cell makes
  every room above it `unreachable`, while `stepTowards` still walks through it and arrives.
  **FALSIFICATION TEST**: put a player-facing stair tool in front of somebody and watch them
  build over their own shaft. *If they notice — the rooms above go hatched and alarm-outlined
  with the reason on them — the verdict IS the feedback and no refusal is owed. If they do not,
  `buildRoom` owes a sixth `BuildRefusalReason` and it is a migration of everybody's counters.*
  → **M5**, or whichever goal first gives the player a stair.

- **THE FILL'S EMPTY-FLOOR COLLAPSE BUYS NOTHING ON A HOTEL BUILT ON EVERY FLOOR.** The
  reachability fill folds a floor with no room and no corridor into one node, which is 90% of
  the work on every shipped layout (rooms sit on two of twenty-three floors). The I2 determinism
  log is the counter-example: its diagonal spawn walk puts rooms on twenty-one floors, so it
  pays the whole plot on every context rebuild — measured, `validity.determinism.test.ts` needed
  one `ValidityCache` across its horizon to stay inside its timeout at all.
  **FALSIFICATION TEST**: benchmark `countInvalidRooms` on the 100,000-tick determinism world
  and on the 60-room bench, in one sitting, and compare the pair against the same benchmark with
  the collapse deleted. *If the log's two readings are within noise of each other, the collapse
  is doing nothing anywhere and the honest fix is a cheaper per-cell probe (an occupancy bitmap
  read off `placementIndex`) rather than a floor-level special case. If the bench is an order of
  magnitude apart and the log is not, the collapse is exactly right and the log is simply a
  workload no player can build.* → **whichever goal next profiles the tick.**

- **THE DOOR'S OWN CELL IS SEEDED WHATEVER STANDS ON IT, AND THAT CHARITY HAS NEVER BEEN
  EXERCISED BY A SHIPPED WORLD.** Without it, a player who builds a room over `entranceCell`
  gets an EMPTY component and every room in the hotel reads `unreachable` — one bedroom
  destroying a hotel. With it, such a hotel reads exactly as it did provided the door's
  neighbours are circulation.
  **FALSIFICATION TEST**: `buildRoom` on `entranceCell` in a world whose plate leaves the door's
  neighbours declared, and read the tally. *If it reads zero unreachable, the charity is load-
  bearing and the seed stays. If every room still goes unreachable, the charity is not enough on
  its own and the rule owes the door's walkable NEIGHBOURS as roots too — which is the
  "charitable rooting" `layout.reach.report.test.ts` already defines for its per-floor walk.*
  → **M5**, where a player can first draw a room on the door.

### A methodological ruling invalidates the numbers that motivated it — sweep `DECISIONS.md` for the general case
**Parked 2026-08-21 (G-038a-ii-β, ADR-0060).** ADR-0059 §1 constrained the method; §§2–4 were
computed by the old method. **Falsification test, and it is mechanical:** for each ADR that
contains both a ruling about HOW to measure and a table of readings, check whether the readings
are dated after the ruling or before it. `grep -n "^## ADR-" DECISIONS.md`, then for each, whether
a re-take is cited. **Confirms if any ADR other than 0059 has a table taken under a method its own
text later forbids; refutes if 0059 is the only one.**

### A room drawn over a stairwell severs the building for VALIDITY while the mover walks through it
**Parked 2026-08-21 (G-038a-ii-β).** The reachability fill and `stairLeg` agree on `climbsFrom`
but not on obstruction: the fill asks `isWalkableFor` at the stairwell cell, `stairLeg` does not.
**Test:** declare a stairwell, draw a room over it, assert (a) every room above reports
`unreachable` and (b) a guest with a cross-floor destination still arrives. **Confirms if both
hold** — the divergence is real and needs a `BuildRefusalReason` or a named acceptance. Belongs to
the stairwell rollout, which is the goal that makes any of this live.

### `pnpm verify` IS NOT RE-ENTRANT, and the I3 proof-of-bite is why — with a live reproduction
**Parked 2026-08-22 (found by the orchestrator running two verifies at once, by mistake).**

`content-gate.test.ts` writes `packages/sim/src/leaked-content.gate-probe.ts` into the **REAL
SOURCE TREE**, runs `check:content`, and deletes it in a `finally`. That is correct as a
proof-of-bite and it is **ADR-0022's forbidden shape**: mutate the repo rather than a scratch copy.

**It bit, observed rather than reasoned.** With a second `verify` running, the `typecheck` row
failed `TS6053: File '…/leaked-content.gate-probe.ts' not found — matched by include pattern
'src/**/*.ts'`. **tsc globbed the probe into its program and the other run's `finally` deleted it
before tsc read it.** The row is red, the file it names does not exist, and nothing in the message
points at the cause. `verify.mjs` runs rows sequentially (`for … await runRow`), **so this needs
two verifies — but two verifies is exactly what an agent does when it backgrounds one and forgets.**

**Falsification test:** `pnpm verify` in two shells, offset by ~60s. **Confirms if either run's
`typecheck` or `check:content` row goes red naming a `.gate-probe.ts` that does not exist.**
**Refutes if both runs come back green** across three attempts.

**The fix, if confirmed, is one of two and both are cheap:** write the probe to a scratch directory
and point `check-content.mjs` at it by argument, **or** give the probe a unique per-process name so
two runs cannot collide. **Prefer the scratch directory** — ADR-0022 says so, and it makes the
gate's subject explicit rather than implicit in a glob.

### THE INTERMITTENT ROWS MAY SIMPLY BE CONTENTION, AND THIS IS THE FIRST DELIBERATE LOAD READING
**Parked 2026-08-22.** G-039a's row-log established that both intermittent failures are
**`Test timed out`, not assertion failures**. Under two concurrent verifies, **two MORE files
failed the same way** — `needs.determinism.test.ts` (35,529 ms on one test) and
`provider.determinism.test.ts` (33,805 ms) — **neither of which is one of the two known rows.**

> **That widens the population from 2 to 4 and points away from any per-file cause.** Four
> `*.determinism.test.ts` files, all timing out, all under load, none failing an assertion.

**This is G-039b-β's derivation arriving as a gift**, because its exit criterion is *pair both
files loaded against quiet, interleaved, in one sitting* — **and "loaded" now has a recipe: run a
second `verify` alongside.** **Confirms if the quiet arm shows no timeout across ≥5 runs while the
loaded arm times out in ≥1**, with the per-test durations as the paired reading. **Refutes if the
quiet arm also times out**, which would mean the cause is not contention and the timeout literal is
still undderived.

*(Both readings above are single observations under an accidental regime — `win32/12cpu`, two
concurrent `pnpm verify` invocations. **Not a measurement; a reproduction recipe.** CLAUDE.md
rule 5: nothing here may be quoted as a number until it is re-taken paired.)*

### CORRECTIONS 2026-08-22 to the two entries above, all found by `sim-critic` at plan review
**Both entries were written by the orchestrator the same day and both mis-stated their evidence.**

1. **"Four `*.determinism.test.ts` files, all timing out" — FALSE.** Only two are determinism files.
   The other two are **`hysteresis.report.test.ts > STARVED (1 amenity of each)`** and
   **`scorer.report.test.ts > and it moves at EVERY room count`** — report tests, and **they are the
   two rows the goal was created for.** The inference ("points away from any per-file cause")
   survives; **the pattern offered as evidence does not exist**, and a builder would have hunted a
   shared property of four determinism files that is not there.

2. **The re-entrancy falsification test does not discriminate.** It names only `.gate-probe.ts`, so
   it cannot detect the second instance (`needs3-arm.identity-probe.ts`), and **"refutes if both
   runs come back green across three attempts" cannot refute a race** — three clean attempts is the
   *expected* outcome of a narrow window. **The mechanism is provable by inspection** (fixed path,
   tsc glob, delete in `finally`), so the honest form is **a mechanism statement plus a population
   census**, not a coin-flip. Superseded by G-039b-β2's exit criteria.

3. **The contention falsification test confirms what nobody doubts.** Quiet-vs-loaded separates
   contention from per-file cost — **which G-039a's row log already settled.** It does not separate
   the two live remedies (timeout literal vs concurrency policy), which is what the goal needs. And
   **"loaded" carried no intensity**: the answer changes sign between `--workers 12` (no timeout) and
   `--workers 24` (timeout, 2 of 2). Superseded by G-039b-β2.

4. **"THE `needs` AXIS HAS THE THINNEST MARGIN IN THE REPO — 1.0472x" is STALE**, and G-039b-β1's
   builder will read it while re-taking the campaign. From the shipped file: **`needs` is
   1.7181 / 1.2793 = 1.3430**, and **`density` is 2.1856 / 2.0415 = 1.0706** — *density is now the
   thin one*, which `scaling-bound.mjs` already says. The parked entry still describes the cadence-32
   campaign.

> **Fifth goal running in which the agent acting on my brief corrected a load-bearing claim in it.**
> Here it was five, two of them BLOCKERs that ordered the goal. **The pattern is structural, not
> bad luck: the brief is written by the agent with the least access to the tree**, and the fix is
> the plan review itself — which has now found BLOCKERs eight times out of eight.

### A THIRD Windows I4 failure signature: `3221225794` (`0xC0000142`), with ZERO timeouts
**Parked 2026-08-22 (G-039b-β2).** Not signature B (exit 1, 0 tests failed, RPC starvation) and not
a timeout. **~32 tests failed with child `status` 3221225794 = `STATUS_DLL_INIT_FAILED`** — process
creation failing wholesale — **and not one `Test timed out` in the whole run.**

**The builder caused it with its own harness** and says so: it appeared late in a session that had
created an enormous number of processes, and **vanished after killing every stray node process**;
the clean re-run was green on both halves. **It says nothing about the tree.**

**Why it is parked rather than dropped: it will be misread as a code defect by whoever meets it
next.** A red I4 whose message is `expected 3221225794 to be +0` looks like a broken child, not an
exhausted machine.

**Falsification test:** run a full suite after roughly 10^5 process creations in one session and
look for `3221225794` — **not** for a timeout. **Confirms if the signature appears with zero
`Test timed out` and clears after killing stray node processes without any tree change. Refutes if
it reproduces on a freshly booted machine**, which would make it a real defect.

### The per-process CPU census undercounts by ~3.7x — use the system counter
**Parked 2026-08-22 (G-039b-β2), withdrawn by its own author under rule 5.** Sampling per-process
`TotalProcessorTime` deltas **silently loses every process that exits between samples**. On this
suite it read **2.12 cores against 7.70 measured system-wide.**

**Anyone re-taking any CPU-utilisation reading in this repo must use
`\Processor(_Total)\% Processor Time`**, not a per-process sum. **Confirms trivially:** take both
simultaneously over the same window and compare. *(Recorded because the wrong method is the obvious
one, and the number it produces is plausible rather than absurd — which is what let it stand long
enough to reach a report.)*

### The four expensive tests spawn a full `tsx` CLI child per arm — they could get cheaper
**Parked 2026-08-22 (G-039b-β2). Named in E-010 option (c) and deliberately NOT scheduled there.**
`scorer.report.test.ts` and `hysteresis.report.test.ts` spawn a full CLI child per arm from inside
vitest's pool. Quiet headroom is 3.8–5.8x, which is comfortable; **under a 24-worker stress arm the
contention factor is 10–14x and nothing survives.**

**Falsification test:** replace one arm's child spawn with an in-process call and re-measure the
named `it` paired, quiet and at `--workers 12`. **Confirms if the quiet duration drops materially
AND the contention factor falls; refutes if the factor is unchanged**, which would mean the cost is
the work itself rather than process creation — and would close option (c) for good.

### A goal that enters the tree only through a MERGE is invisible to `check:status`
**Parked 2026-08-22 (ADR-0071, found by the builder doing the G-041 merge).** `check-status.mjs`
scans `git log --no-merges` **subjects** for goal ids. A goal built on a branch whose commit subject
names no id, landed by a merge commit that is then **excluded as a merge**, is never checked against
a block. G-042 reached `main` exactly that way and `CLAUDE.md` says *"a goal with no block is not
counted."*

**Falsification test:** create a branch, commit with a subject naming no goal id, merge it with
`--no-ff`, and run `node tools/gates/check-status.mjs`. **Confirms if it exits 0** while the goal has
no block. **Refutes if it exits 1.** *(The block for G-042 has since been written, so re-test with a
fresh invented id rather than with G-042.)*

**Candidate fix, if confirmed**: scan merge commits' **first-parent range** rather than excluding
them, or scan the ADR ids in `DECISIONS.md` for goal references with no matching block — the second
catches the class rather than this instance.

### `determinism-log.ts` counts PARTIES where its bound counts GUESTS — the fifth site, unrepaired
**Parked 2026-08-23 (G-043, §5.8 census).** `copiesFor` divides
`concurrentGuests = stayDurationTicks / ARRIVALS_EVERY_TICKS` — arrival COMMANDS — by
`1 + serviceFloorRefill(needType)`, which counts guests. On shipped content the two readings are
`ceil((1440/97)/8) = 2` and `ceil((1440/97) * 4/3 / 8) = 3`, so the I2 determinism log's first two
amenity waves are provisioned for two thirds of the guests they actually get. **Not repaired at
G-043**: it moves the log's entity ids and therefore the I2 hash, and it trades against a coverage
balance that file set deliberately — its own note records a wave with more amenities making the
hotel *"WORK too well"*, stopping `leftDissatisfied` at tick 60,046 and costing the gate the row the
wave was added for.

**Falsification test:** multiply that binding by the realised guests per command (call
`guestsPerArrivalCommand` from `tools/headless/src/provisioning.ts`), then run
`pnpm test:determinism` and `pnpm exec vitest run determinism`, and read `leftDissatisfied` and the
`roomInvalidity` / provider-release reason coverage out of the log. **Confirms the repair is free if
`leftDissatisfied` survives to the horizon and no reason drops out** — then it is a one-line goal
plus a hash re-stamp. **Refutes it if either falls**, in which case the WAVE COUNTS are the goal and
the units are only its cause.

### What one provider "sustains" is a CEILING, and nobody has derived the realised figure
**Parked 2026-08-23 (G-043).** `guestsPerProvider` is flow conservation — decay equals refill, so
one provider serves `refillPerTick + 1` guests. It charges nothing for the walk to the provider and
nothing for the deeper deficit a guest that queued arrives with, so it over-states service; how much
by has never been measured. **The gap is visible and large**: at six rooms the rule puts the
concurrent population comfortably under the bound and provisions one amenity of each kind, and a
second amenity still takes the mean over engagement needs from 949 to 541 basis points with the same
guests giving up either way.

**Falsification test (already in the tree, as an arm):** `provisioning.report.test.ts` >
*"a hotel the rule provisions with one amenity is still relieved by a second"*. **A re-derivation
that charges for travel and for the queued deficit confirms itself when that pair reads as a small
improvement rather than a halving**; the arm goes red and says by how much. **It must not be tuned
until the ladder in `unserved.report.test.ts` is monotone** — that is the §9 stop condition and
G-039b-alpha refused the shape by name. It is a rates goal in G-041's shape or it is nothing.

### The provisioning ladder has a `ceil` SAWTOOTH, and rung 3 is the tooth
**Parked 2026-08-23 (G-043) — this is the narrowed remainder of the OPEN FINDING.** After the units
repair both engagement-only folds still rise from rung 2 to rung 3 of the diagonal ladder and
nowhere else: mean 866 -> 949, worst 1,124 -> 1,304. The rule provisions three rooms (four
concurrent guests) and six rooms (eight) with the SAME single provider because both round up to one,
so rung 3 carries twice rung 2's load on the same hardware, while rung 4 clears a whole provider,
gets two, and pools them. **The ladder is therefore not a constant-provisioning diagonal**, which is
a property of `ceil` rather than of the simulation.

**Falsification test, run once and POSITIVE:** six rooms with a second amenity of each kind reads
engagement mean 541 and worst 905, both below rung 2's 866 and 1,124 — strictly decreasing. **So the
rise is granularity.** The two candidate repairs are a rule that provisions to LOAD rather than to a
whole provider, and the rate re-derivation parked above. **Confirms whichever is taken if the
engagement folds go strictly decreasing across all four rungs WITHOUT any content edit; refutes it
if they do not**, which would mean the residue is layout (`amenityCell` spreads providers further
out as the count grows) and belongs to whoever owns that.

### Below the bottleneck the review scale is CLAMPED, so buying an amenity cannot move the score
**Parked 2026-08-23 (G-043, WATCH #23) — measured, not suspected.** At three rooms and an arrival
every 120 ticks the review mean reads the same number at one, two and three amenities of each kind,
and it is not a defect in the scorer: the departures are IDENTICAL at all three levels (what turns
guests away is beds), every housed guest is already in the TOP band, and every unhoused one is in
the band a guest with no room gets. **There is no guest whose band an amenity could move.** WATCH
#23's frame shows the cost in the picture — nine amenity rooms with one guest in them.

**Falsification test (already in the tree, as an arm):** `provisioning.report.test.ts` > *"AND THE
FLAT AXIS BELOW THE BOUND IS THE REVIEW SCALE CLAMPED"*. **Any change that makes a housed guest at
that rung score below the top band confirms the diagnosis** — the arm goes red at the occupied-band
literal and the axis starts moving. **A change that moves the mean while the bands stay at
`3:346,5:128` refutes it** and means something else was flat. *(Related but distinct from the
`ceil` sawtooth above: that one is about which rung of the ladder is worst-provisioned; this one is
about a scale that cannot express an improvement at all.)*

### The provider tie-break does NOT route to the worst room on `main` — and what it does do is live
**Parked 2026-08-23 (G-043), after checking the parked `g037a-quality-fold` claim against `main`.**
That branch records *"the provider tie-break routed guests to the WORST room"*, named as a candidate
cause of the ladder inversion. **It cannot be that on `main`, because `main` has no per-room
quality**: `compareProviderPreference` in `packages/sim/src/utility.ts` ranks by
`fitBasisPoints` — a per-ROOM-TYPE designer ranking — and then by LOWER entity id. There is no
instance-level term for a room to be worst at. **So the branch's finding is a finding about the
branch and contributed nothing to the inversion measured here**, which had a units cause.

**What the same comparator DOES do on `main` is stated in its own docblock and is live**:
*"it does not spread guests across equally-ranked providers: with four concurrent guests and five
cafés, the lowest-id café still takes most of the traffic."* That is a strong candidate mechanism
for the flat axis below the bottleneck parked above, and for WATCH #23's frame of nine amenity rooms
with one guest in them — an extra provider is only ever reached once the lowest-id one is contended.
**The docblock also names the cure and its owner**: a term that varies between two identical rooms,
and *"the only honest one is distance, which is M3's."*

**Falsification test:** at three rooms and an arrival every 120 ticks, count engagement instances per
provider ENTITY across the amenity levels — one, two and three of each kind. **Confirms if the
lowest-id provider of each kind keeps essentially all of them while the added rooms sit at or near
zero; refutes if the load splits**, in which case the flat axis is about service capacity rather
than about selection and the parked rate re-derivation is the whole of it.

### A LIFT QUEUE HAS NOTHING TO QUEUE FOR — re-open when a derived capacity binds
**Parked 2026-08-23 (G-038b DEFERRED, ADR-0075).** Max guests on the aligned stairwell cell is
**3 or 4 at every workload this project can produce**, and `floorChangeTicks` is approximately
`shaftEntries` — a guest reaches the shaft and crosses in one tick.

**FALSIFICATION TEST — REWRITTEN EXECUTABLE 2026-08-26 (G-053b, ADR-0089 §4).** What stood here
named a TABLE — *"re-run the five-setting table in ADR-0075"* — and ADR-0075's table publishes
`rooms / arrivals / seed` and a statistic **no shipped command prints**. **That is ADR-0034
AMENDMENT 2's own rule going unapplied on the same page it was written for**: *a number parked as an
obligation carries its INVOCATION, not just its slots.* Rewritten so it can come back negative.

**INVOCATION** — every flag below is shipped; nothing new is built to run it.

```
# 1. the CONTROL, at the setting ADR-0075 measured
pnpm --silent sim:run --days 3 --seed 42 --rooms 60 --arrivals 96 --record shaft-a.ndjson --record-every 1

# 2. the LEVER, which is CONTENT: copy packages/content/data to ./tall-content and raise
#    guest-rules.json's "maxLodgingFloorsFromEntrance" from 2 to 12
pnpm --silent sim:run --days 3 --seed 42 --rooms 60 --arrivals 96 --content ./tall-content \
  --record shaft-b.ndjson --record-every 1
```

**READING.** Each recorded line is one `serialise(world)`, so every guest's `at` is in the frame.
Derive the shaft column once with `shaftCell(bounds)` (`tools/headless/src/report.ts:904`), then
per line count guests standing on it, and take **the MAX over ticks** — which is exactly the
statistic ADR-0075's *"max on ONE cell"* column reports.

**COMPARISON.** ADR-0075 published **3 or 4 across all five settings**, so a lift capacity of 4+
can never bind. **REFUTES if arm 2's max reaches 5 or more and holds there** — a capacity §2.1 can
source would then sit below it and the dial has something to dial. **CONFIRMS if both arms stay at
3–4**, in which case the deferral survives its own lever being pulled, which is a stronger result
than the original reading.

**AND THE WINDOW IS A STATED LIMIT, NOT AN OVERSIGHT.** `--days 3` is 4,320 frames; the CLI's own
header warns that `--days 30 --record-every 10` is already 55.7 MB, so a 30-day per-tick recording
is not runnable. **A REFUTATION IS CONCLUSIVE AT ANY WINDOW; A CONFIRMATION IS BOUNDED BY THIS ONE**
— say which you got.

**THE STATED REASON FOR EXPIRY IS WITHDRAWN AND NOT REPLACED BY A DATE (ADR-0083, re-verified at
G-053b).** *"Parties landed after it, density was re-derived"* is **false**: all three are ANCESTORS
of the deferral commit, so ADR-0075's measurement was taken on a tree that already had them. **The
measurement has NOT expired.** What expires it is the arm above coming back refuted — **or demand,
which is M4.**

### BOTH DRAWING PATHS CAP AT THREE FIGURES ON A TILE — §6.1 on the evidence instruments
**Parked 2026-08-23 (ADR-0075).** The iso scene computes `room = floor(width / pitch)`, which
evaluates to **2 at scale 0.5 and 3 from 0.75 to the clamp**; a fourth guest becomes a `+N` label.
`tools/viewer` compresses pitch to `width / guests.length` — *"one unreadable stripe of colour"* by
its own comment.

**This is "UI that cannot express a state the sim can reach", on the two instruments whose output
becomes JOURNAL evidence.** **Falsification test:** build a world with five guests on one cell and
render it through both paths. **Confirms if one shows a `+N` label and the other an unreadable
stripe; refutes if either draws five distinguishable figures.** **No frame reference is needed** —
it is arithmetic on the shipped drawing code.

### `tripwire.mjs`'s printed causal list is stale, in the sentence that exists to stop that
**Parked 2026-08-23.** It prints the occupancy causes as *"G-023b-ii travel, G-039b-alpha's spine,
then G-038a-iii-b's stairwell"* and its comment reads *"(850 -> 827)"*. **Parties moved it
1203 -> 1275 at G-040b-ii and are not in the list; 827 is two goals gone.** The comment four lines
above says the list *"is kept current, because a stale attribution is the ADR-0007 class inside the
sentence that exists to prevent it."*

**Falsification test:** `pnpm check:tickcost` and read the CAMPAIGN OCCUPANCY block. **Confirms if
the printed list omits parties.** Pre-existing; **the next goal that moves occupancy must touch that
line.**

## From G-038b-i — the queue mechanism, and the two questions it did not answer (2026-08-23)

### THE CAR SPENDS ONE TICK UNLOADING, AND NOBODY KNOWS WHETHER THAT MATTERS
**Parked 2026-08-23 (G-038b-i).** A place in the lift is released at the END of the tick on which
its holder stopped needing the shaft, because `settleLiftQueue` is what discovers it — a
destination is derived per guest deep inside `reserve`, so it cannot be known earlier. The obvious
repair is refused on purpose: promoting somebody during the pass hands the freed place to the
lowest guest ID still in the line rather than to the guest nearest the FRONT, because the pass runs
in id order and not in queue order, **which breaks the one property the stored order exists to
provide.** The cost is one tick per TRIP, not per waiter.

**The belief:** at any capacity a real workload would use, the unload is invisible against the
queueing it is embedded in. **Falsification test:** in G-038b-ii's arm, install a lift at the
derived capacity in `report.ts` and record `gaveUpWaitingForLift` and the mean queue length; then
apply the ADR-0022 mutation recipe to release a place during the pass instead (a second pass over
the guests, in queue order) and re-run the same arm. The sim is deterministic, so there is no
spread to hide in. **Confirms if both readings are identical; refutes if the departure count moves
at all** — and if it moves, G-038b-ii has to decide whether the second pass is worth its tick cost
or whether the fair-but-slower car is the mechanic.

### A LIFT REPLACES THE STAIR IN ITS SHAFT, AND NOTHING LETS A WORLD HAVE BOTH
**Parked 2026-08-23 (G-038b-i).** `world.lift` is read as *"the shaft is a lift shaft"*, on
ADR-0075's first ruling: **a thing with unbounded capacity never queues**, so a staircase beside a
lift would make the queue unjoinable and the mechanism inert by construction. There is therefore no
way to express *"a tower with a lift AND a fire escape"*, and no way for a player to trade a slow
free stair against a fast bounded lift — which is the decision a build-loop mechanic would be made
of.

**The belief:** one connector per world is enough until a player can draw more than one shaft.
**Falsification test:** the day `withStair`'s alignment invariant is relaxed to more than one
stairwell column — which `stairs.ts` says would cost the derived speed window and the O(1) leg —
this reading stops being free, because a two-shaft world could sensibly have a lift in one and
steps in the other. **Confirms while `stairwellOf` is still an array index; refutes the moment a
second stairwell is legal.**

### THE TIMEOUT MARGIN IS NARROWING AS THE SUITE GROWS — 3.84x to 3.36x in one session
**Parked 2026-08-23.** `needs.determinism.test.ts > runs guests that carry EVERY need` timed out in a
**QUIET** `pnpm verify` (not the two-verify regime E-010 ruled on), then passed the re-run and passed
alone at **8,938 ms against its 30,000 ms limit**.

**The trend is the finding, not the flake.** The same test measured **7,804 ms / 3.84x headroom** at
the start of this session; it is now **8,938 ms / 3.36x**, and the suite grew from **151 files /
2,636 tests** to **161 / 2,806** over the same period. **Nothing regressed — the sim got bigger.**

**Falsification test:** re-take the isolation reading whenever the suite crosses another ~10 files.
**Confirms if headroom keeps falling with file count; refutes if it stabilises.** **The remedy when it
is needed is the HOUSE PATTERN** — a declared per-test budget with its measurement at the docblock,
as seven files already carry — **and NOT raising a shared literal**, which is what G-039b-beta2
refused. *(Five census tests already took a 120,000 ms budget at G-040b-ii; this test was not among
them and now has less headroom than they did.)*

### TWO MORE FILES JOIN THE TIMEOUT POPULATION, and both spawn CLI subprocesses
**Parked 2026-08-23 (G-048).** A verify went red with **two 30s timeouts, not assertions** —
`cli.stdout.test.ts` ("byte-identical stdout") and `scorer.report.test.ts` ("adding one amenity of
each kind MOVES the score"). **Both spawn CLI subprocesses.** Re-run alone: **44/44 passed, 29.9s
wall**; full verify re-run: exit 0. No stray processes during either run.

**It cannot be the diff**: vitest does not include `apps/game`, and the change was an HTML file
nothing in `tools/headless` imports.

**The population keeps growing and the shared property is now visible**: the affected files are the
ones that **spawn child processes inside a 30s per-test budget under full vitest parallelism.**
Earlier members were `needs.determinism` and `provider.determinism`; G-040b-ii gave five census tests
a declared budget; these two were not among them.

**Falsification test:** classify every timeout by whether its `it` spawns a child process.
**Confirms if the affected set is exactly the child-spawning tests; refutes if a pure in-process test
times out.** **The remedy when it is needed is the house pattern — a declared per-test budget with
its measurement at the docblock — and NOT raising a shared literal.**

> ### REFUTED 2026-08-28 (G-059), ON ITS OWN STATED TERMS, BY THE TEST IT NAMED
>
> **A pure in-process test timed out.** `demand.report.test.ts`'s *"AND ONE BUILD ON THE SHIPPED
> LADDER RAISES THE RATING AND STRICTLY LOSES MONEY"* went over the shared 30,000ms during a
> `pnpm verify`, and it uses `inProcess` — it spawns nothing. **So the shared property is NOT
> "spawns a child process".**
>
> **WHAT IT IS INSTEAD, MEASURED**: run-to-run noise on an identical tree is **1.41x** (27,761ms,
> 19,661ms, 18,722ms in-suite, worst/best) while that case had **1.08x** of headroom against the
> shared budget. **The budget was smaller than the contention.** Spawning a child is one way to
> get close to the ceiling; it is not the only one, and the population is *every test whose
> loaded-regime worst is within noise of 30,000ms*, spawning or not.
>
> **THE REMEDY THIS ITEM ALREADY NAMED IS THE RIGHT ONE AND WAS APPLIED**: a declared per-test
> budget with its measurement at the docblock, `90_000` at 3x the worst in-suite reading. The
> shared literal was NOT raised (§9).
>
> **AND THE RULE THE REFUTATION BUYS, WHICH IS BIGGER THAN THE ITEM**: *a derived budget is
> defined against the quantity that VARIES; cheapness is defined against the one that does not.*
> G-051b left this case unbudgeted **because it had made the case fast** — 6,725ms isolated,
> faster than when it was written. Cheapness of the case is the wrong denominator: what varies is
> the machine.
>
> *Kept rather than deleted, because a hypothesis that was refuted by the experiment it specified
> is the best thing in this file.*

### THE REVIEW CHANNEL IS ONE BIT, so the per-need asymmetry is invisible to the player
**Parked 2026-08-24 (ADR-0078).** Mean review is **387 below the provider bottleneck and a flat 500
at and above it** — 12 rooms / arrivals 120 / 1,000 days, amenities 1 through 8, exact deterministic
counts. **`met = 15984, unmet = 0, reviews = [0,0,0,0,15984]` in every well-provisioned cell.**

> **So a hotel scores PERFECT while one need is chronically 3.3x worse served than another.** The
> unserved basis-point statistic moves freely over 126–655 and **nothing the player sees reflects
> it.**

**EVERY FIGURE ABOVE IS FALSIFIED BY G-059 AND THE HEADLINE SURVIVES ON THE AMENITY AXIS.** Re-measured
2026-08-28 **on this item's own CLAMPED arm shape, so the comparison is like for like**
(`--days 30 --seed 42 --rooms 12 --amenities N --facilities F --arrivals 120`, one run per cell,
exact integers, no aggregation, win32/12cpu quiet): the well-provisioned cell is no longer `[0,0,0,0,15984]` and a
flat 500 — it reads **mean 400 with `[0,0,0,464,0]`** at three stars and **500 with `[0,0,0,0,464]`**
at four. So *"a flat 500 at and above the bottleneck"* is dead, and the review DOES now reflect
something the player builds.

**WHAT SURVIVES, NARROWED TO WHAT IS STILL TRUE**: the thing the review reflects is the STAR RATING,
not the per-need asymmetry this item is about. Holding the rating fixed and moving amenity density
from 2 sets to 3 moves the distribution by **zero guests** at BOTH facility levels — `[0,0,0,464,0]`
and `[0,0,0,0,464]` respectively, unchanged — while the unserved basis points move underneath it
(comfort/entertainment/nourishment 493/470/369 -> 428/401/393). **So the asymmetry is still invisible to the player, and the channel that went
from carrying nothing to carrying something did not start carrying THIS.** The item stands, with its
evidence replaced rather than its claim rescued.

**Falsification test, restated so it can fire against the current scorer:** at fixed rooms, fixed
facilities and fixed stars, vary amenity density and read `reviews.distribution` alongside each need
row's `bp unserved`. **Confirms while the distribution is byte-identical across densities that move
the basis points; refutes the day it moves** — which is the day the review reads service quality
rather than service PRESENCE, and that is G-050a/b's subject.

**Falsification test:** take mean review across the amenity ladder and across a need-id renaming.
**Confirms if review is flat at 500 while unserved bp spans 3.3x; refutes if review tracks the
spread.** **This is what a watching player CANNOT find** — the human spotted the below-bottleneck
version at day 839 because reviews were still moving there.

### ABOVE THE BOTTLENECK THE BUILD LOOP HAS ONE ANSWER AND NO MONEY SINK
**Parked 2026-08-24 (ADR-0078).** 12 rooms / arrivals 120 / 1,000 days: **amenities 2 is optimal at
97,364,000p; every step above costs exactly 4,500,000p and buys nothing** — identical departures,
identical reviews, and the unserved figures do not improve monotonically (655, 607, 592, 597, 613,
616). **Cash reaches 97M with nothing to spend it on**: `--build` only builds bedrooms, and past
saturation bedrooms do nothing either — **24 rooms / 2 amenities gives byte-identical guest outcomes
to 12 rooms / 2 amenities for 30,000,000p more upkeep.**

**Falsification test:** walk the amenity ladder past the bottleneck and compare departures, reviews
and balance. **Confirms if every rung above the optimum is strictly dominated; refutes if any rung
buys a measurable outcome.** **This is the build loop — one of the three the charter says every
decision must serve.**

### ENTERTAINMENT IS ROOM-ONLY, and that is a granularity asymmetry the supply table misses
**Parked 2026-08-24 (ADR-0078).** `comfort` is **item-only** (`arm_chair`), `night_rest` is room-only,
`nourishment` is **both**, and **`entertainment` is ROOM-ONLY — there is no entertainment item.**
`placeItem` exists and a machine in a bedroom is blessed by name in `guests.ts`, **so comfort and
nourishment can be bought as FURNITURE while entertainment can only be bought as a whole 250,000p
room.**

**Falsification test:** needs a `--placeItem` flag on the headless runner, which does not exist —
**so this is UNMEASURED and the measurement is the first cost of investigating it.** **Confirms if a
loose `arm_chair` in a bedroom moves the comfort row; refutes if item placement changes nothing
outside a room's own footprint.**

### THE THROUGH-WALL RESIDUAL IS ONLY IMPROVED, NOT UNDERSTOOD — **DISCHARGED AT G-058. ONE CAUSE.**

> **DISCHARGED 2026-08-26 (G-058). THE FALSIFICATION TEST BELOW WAS RUN AND THE HYPOTHESIS IS
> REFUTED: every through-wall landing this project produces is a FALLBACK landing. There is no
> second cause.**
>
> **Exact deterministic integers, n = 1 is the whole distribution, so there is no aggregation and
> no regime to state.** Each arm's through-wall count, split into the branch of `stepTowards` that
> produced it, asserted in `tools/headless/src/travel.walls.report.test.ts`:
>
> | arm | through-wall | CHOSEN | FALLBACK | unreproduced |
> |---|---|---|---|---|
> | 60 rooms / 5 amenities | 52 | **0** | 52 | 0 |
> | ... its before arm | 291 | **0** | 291 | 0 |
> | 6 rooms / 5 amenities | 32 | **0** | 32 | 0 |
> | ... its before arm | 147 | **0** | 147 | 0 |
> | G-009's criterion | 0 | 0 | 0 | 0 |
> | ... its before arm | 194 | **0** | 194 | 0 |
> | CLI default, 2 days | 0 | 0 | 0 | 0 |
> | ... its before arm | 25 | **0** | 25 | 0 |
> | CLI default, 4 days | 0 | 0 | 0 | 0 |
> | ... its before arm | 47 | **0** | 47 | 0 |
>
> **THE BEFORE ARMS ARE WHAT MAKE IT A FINDING RATHER THAN A COINCIDENCE.** This entry's own
> argument was that *"a 92% reduction leaving a STABLE remainder usually means a SECOND CAUSE"* — a
> remainder of a different KIND. It is not of a different kind: the 291 the shaft removed and the
> 52 it left are **the same branch, 100% fallback, on both arms and at both sizes**. What the shaft
> removed is OPPORTUNITIES to fall through, which is what `travel.walls.report`'s comment claimed in
> prose at G-038a-iii-b and what nothing had measured until now.
>
> **AND THE MECHANISM THIS ENTRY CALLED "documented and UNTESTED" IS CONFIRMED AS THE ONLY ONE.**
> `stepTowards` takes candidate zero when every candidate landing is a wall; that is every one of
> them.
>
> **THE DISCRIMINATOR, so it can be re-run**: `stepTowards` returns the FIRST candidate satisfying
> `isWalkableFor(walls, candidate, destinationRoom)` and otherwise returns `fallback`, which is
> candidate zero, which was tested and refused — **so the landing is walkable for that guest iff the
> loop returned.** One boolean, no copy of the loop, and no change to any landing, route or hash
> (I2 `07d81ab917935a25`, unmoved). Pinned on both branches in
> `packages/sim/src/travel.walls.test.ts` under *"the landing says which branch produced it"*,
> including a built case that reads CHOSEN while standing in a room the guest is not going to —
> a room drawn over the stairwell — so **the zeros above read as "this cause does not occur on
> these layouts" rather than as "the instrument cannot see it".**
>
> **WHAT IS NOT CLAIMED, AND IT IS THE QUESTION THAT REPLACES THIS ONE.** "One cause" is a
> statement about the BRANCH, not about the geometry: **which layouts leave a guest with no
> admissible landing at all is still unattributed**, and it is now the only remaining question
> behind this count. It is NOT re-parked, because it has no falsification test that does not
> amount to building the instrument for it (§4) — **park it when a goal needs it.**

**Parked 2026-08-24 (ADR-0081), on the human's question.** Landings went **291 -> 52** on the bench *(CORRECTED 2026-08-26: this entry read "236 -> 29", which was ADR-0065's reading quoted as a live one — ADR-0084's class. Re-measured: bench 52, six-room 32, criterion and CLI 0, and the figure moved 29 -> 33 -> 52 across three goals)*
and **116 -> 23** on the six-room arm; **criterion and CLI default went to ZERO.** **Nothing
attributes the remainder.**

**A plausible mechanism is documented and UNTESTED**: `stepTowards` takes candidate zero when every
candidate landing is a wall, so a guest converges on a blocked stairwell and stands inside a
stranger's bedroom for a tick. **Nobody has shown the 29 ARE those landings.** And
`travel.walls.report`'s own comment warns *"THE MECHANISM IS NOT THE WALL RULE AND IT IS IMPORTANT
NOT TO CLAIM IT IS."*

> **A 92% reduction leaving a STABLE remainder usually means a SECOND CAUSE sharing the first one's
> symptom.** Two of four arms are non-zero, **so it is not bench-specific** — which makes a
> workload-shaped explanation less likely, not more.

**Falsification test:** instrument each through-wall landing with whether `stepTowards` reached its
fallback (every candidate a wall) or chose a wall-crossing landing on merit. **Confirms if the 29 and
the 23 are all fallback landings — one cause, understood; refutes if any is a chosen landing, which
means a second cause and a second goal.** **Run it before M4 tunes anything that moves journeys.**

---

## Is `capacity` a vacuous field on every NON-lodging room type? (G-053a)

**Parked 2026-08-25, from the marking of §1's build loop.** `capacity` turned out to be **live** —
that correction is in `GOALS.md` and `HOTELSIM.md` §1.1. But every reader found is **filtered to
lodging types**: `assertPartiesCanBeHoused` folds `roomTypes.filter(provides lodging)` before it
takes the roomiest, and `findFreeRoom` reads `capacity` only under `if (forLodging)`.

**Shipped content declares `capacity: 8` on all three amenity types**, and the hypothesis is that
**no code path reads any of the three.** If so it is ADR-0007's class in content rather than code: a
number sitting in a data file that looks like a constraint, that a designer would reasonably tune,
and that nothing consumes. **A provider serving one guest at a time is a separate, real rule; this
is about the FIELD, not the behaviour.**

**Falsification test**, and it is the ADR-0053 mutation one axis over: set `capacity` to **1** on all
three non-lodging types in `packages/content/data/room-types.json`, restore `sha256`-identical
afterwards per ADR-0022's stash recipe, and run `pnpm sim:run --days 30 --seed 7 --rooms 6
--amenities 3`. **CONFIRMS if the report is byte-identical apart from the `contentHash` line** — the
field is inert on non-lodging types and either gets a reader or gets a docblock saying it is
lodging-only. **REFUTES if any behavioural row moves**, in which case there is a fourth reader
nobody has found and the marking's evidence list is short.

**Cheap, and it has a natural home**: the goal that re-scopes or closes **G-037b**, which is already
holding the stale half of this same field.

### EVERY SCANNER THIS WEEK WAS NARROWER THAN ITS NAME — three instances, one class
**Parked 2026-08-26 (ADR-0085).** Asked whether G-039's status scanner catches the stale-status
class. **It shipped, and it structurally cannot.** Its stated rule is exactly one thing — *"a commit
referencing a goal ID implies that goal's block is not `pending`"* — and **`grep -c Milestone` over
`check-status.mjs` AND `lib/goal-blocks.mjs` returns 0 and 0.** `G-037a` reads `Milestone: M3` after
M3 signed off **and the gate is green.**

**Three instances in one week, each correct for its scope and each READING as covering the class:**

1. **the status gate cannot see a stale `Milestone:` line** (this one);
2. **`check:status` cannot see a goal that entered the tree through a MERGE** — it scans
   `git log --no-merges` subjects;
3. **ADR-0043 §3's amendment census could not see the inline spelling**, and so missed ADR-0007 —
   **the most-amended ADR in the project, at seven.**

**Falsification test:** for each shipped scanner, write down the class its NAME implies and the
predicate it actually runs, then find one member of the first that is not a member of the second.
**Confirms if any scanner admits such a member; refutes if name and predicate coincide for all of
them.** *(Three of three so far, so the refutation would be the surprise.)*

**The remedy is NOT a fourth scanner.** It is the naming: **a scanner should be named for its
predicate, not for the class somebody hoped it covered** — `check:status` that checks one clause
about `pending` is not a status check. *Cheap, and it is the only fix that does not add surface.*

## From G-055 — three things the timeout repair measured and did NOT fix (2026-08-26)

**`check:scaling` IS STILL UNRELIABLE AND WAS NOT RE-MEASURED IN THE REGIME THAT BREAKS IT.** It
passed on four of four full `pnpm verify` runs at G-055 (7,573ms / 8,684ms and two more), and **that
is worth nothing on its own**: its one captured red (`ESCALATIONS.md`, 2026-08-21 — density 2.6497
against the 2.1856 bound, then 1.5515 standalone minutes later, **1.71x on the same axis of the same
tree**) came from a regime G-055 deliberately avoided, an agent working on the same box while verify
ran. G-055 ran every campaign serial and unattended precisely so its readings would be clean, which
means **it cannot say anything about the loaded case.**

**Falsification test:** run `pnpm verify` under `node tools/gates/arm/load.mjs --workers 12`, n>=5,
alternated with an unloaded control in one sitting, and read `check:scaling`'s density ratio out of
each. **Confirms the classification if the loaded arm produces a ratio at or above the bound in any
cell while the control does not; refutes it if both arms stay inside the bound**, which would make
the 2026-08-21 sighting a one-off with a cause nobody has named. *The `.verify-lock` does not cover
this: it excludes a second VERIFY, not a busy machine.*

---

**THE PER-CASE BUDGET IS DECLARED ON THE CASE THAT MEASURES THE COST, AND WHICH CASE THAT IS DEPENDS
ON DECLARATION ORDER.** Both determinism files memoise a 100,000-tick replay at file scope, so the
FIRST case pays it and the rest measure milliseconds. `sequence.shuffle` is unset, so `BaseSequencer`
runs a file's cases in declaration order and the payer is stable — **but insert a new case above the
current first one and the 45s moves to it, and it will inherit 30,000ms and go red.** G-055 declined
to put 150,000ms on eight cases of which six cost two milliseconds, on the grounds that six numbers
describing nothing is its own defect; **the exposure is real and is written down rather than
covered.**

**Falsification test:** add a trivial `it` above `runs guests that carry EVERY need the content
defines` in `needs.determinism.test.ts`, run a full `pnpm test`, and read
`pnpm test:durations`. **Confirms the exposure if the new case carries the ~30-45s reading and goes
red; refutes it if vitest attributes the memo elsewhere.** *(Revert with `git stash pop`, ADR-0022 —
never `git checkout --`.)*

---

**THE CONTENTION FACTOR IS A FACT ABOUT A 12-CORE DESK AND CI IS A 2-4 vCPU RUNNER.** G-055's whole
derivation rests on one ratio — 7,816ms isolated against 33,570ms in-suite, **4.29x** — measured on
win32/12cpu with vitest sizing its pool at `availableParallelism() - 1`. On a 2-vCPU runner the pool
is one worker, so files run nearly serially and the per-case contention should be LOWER while the
absolute cost is higher on a slower core. **Nobody has measured which dominates**, and
`tools/gates/scaling.mjs` already records that there is no git remote, so `verify.yml` has never run
at all.

**Falsification test:** run `pnpm test` with `--maxWorkers=1` and again with the default on the same
box, n>=3 alternated, and read the two cases' durations out of `pnpm test:durations`. **Confirms the
"fewer workers, lower per-case cost" reading if the single-worker arm's per-case durations fall
toward the ~7.8s isolated figure; refutes it if they do not**, which would mean the contention is not
sibling-worker CPU and the 4.29x needs a different explanation before it is quoted about any other
machine. *This is a proxy for the CI regime, not the CI regime.*

### `check-status.mjs` PASSES an id that resolves to NO BLOCK — and that subsumes the merge hole
**Parked 2026-08-26 (ADR-0088, found by G-056).** A goal ID referenced by a commit that resolves to
**no block at all** is printed *"not judged"* and **passes**. The whole-check anti-vacuity floor only
fires if **not one** ID resolves.

> **So G-042 would have passed EVEN IF MERGES WERE SCANNED.** The merge exclusion and the
> absent-block pass are **two independent causes of one symptom**, and the parked merge item was an
> **incomplete diagnosis of its own finding.**

**Falsification test:** commit with a subject naming an invented goal id that has no block, on a
non-merge commit, and run `node tools/gates/check-status.mjs`. **Confirms if it exits 0 while
printing "not judged"; refutes if it exits 1.** **Fixing only the merge scan would leave the escape
open** — that is the whole value of this entry.

### THE GREP THAT PROVED A GATE'S BLINDNESS IS NOW SELF-INVALIDATING
**Parked 2026-08-26 (ADR-0088).** `grep -c Milestone tools/gates/check-status.mjs` returned **0**
before G-056 and returns **2** after, **because the predicate line names the omission in prose.**

> **The act of documenting the blindness destroyed the invocation that demonstrated it.**

**Re-runnable replacement**: strip comments first, or simply read `goalBlocks()` — it captures
`{id, status, line, headingLine}` and **no reader below it looks at anything but the status line**.
**Falsification test:** run the comment-stripped grep; **confirms if it returns 0, refutes if any
executable line names `Milestone`.**

**The general shape, which is ADR-0085 from the other direction**: not a stale quotation, but **a
quotation the tree grew out from under.** *A citation a later commit can silently falsify needs its
invocation chosen so that documenting the finding cannot break it.*

## From G-053b — five things the orphan sweep found and is NOT allowed to fix (2026-08-26)

*Every one carries an invocation, a reading and a comparison (§4), because this is the goal that
found two parked items whose tests had none.*

### THE SENTENCE ADR-0046 REVERSED IS STILL LIVE IN AN AGENT'S OWN STANDING INSTRUCTIONS
**Parked 2026-08-26 (G-053b, ADR-0089 §7(a)). BLOCKING ON M5.** `.claude/agents/render-engineer.md`
reads, at **line 43**, in its **Your domain** section: *"the Pixi.js **side-on cross-section view
(SimTower / Project Highrise, not isometric)**"* — **the reversed sentence verbatim, parenthetical
and all** — with two more copies at **line 3** (the `description:` field, which is what selects the
agent) and **line 37**. `apps/game/src/scenario.ts:36-37` carries the same premise in the present
tense.

**Not fixed here on purpose**: the first is **agent configuration** and the second is
`render-engineer`'s domain, and a sim goal rewriting either on its own initiative is a worse
precedent than a stale line with a due date. **`HOTELSIM.md:611` — the fourth copy, in the source of
truth — WAS fixed**, because that one is nobody's domain but the charter's.

**Falsification test:** `git grep -in "cross-section\|SimTower\|Project Highrise\|side-on"`.
**41 hits at `26f9f88`; 55 after this commit — and THE RISE IS THIS ENTRY AND ITS SIBLINGS QUOTING
THE DEAD SENTENCE IN ORDER TO RECORD IT.** That is ADR-0088's self-invalidating-citation class,
disclosed at the site rather than discovered by the next person. **So the RAW COUNT IS NOT THE
READING** — the reading is the discriminator below. **Confirms while three hits sit in `.claude/agents/render-engineer.md` and
`apps/game/src/scenario.ts` stating the projection as a live specification; discharged when the grep
returns only history, and `tools/viewer/viewer.js:306`, which is TRUE** because the replay viewer
really does draw side-on (`ESCALATIONS.md:1304`). **The discriminator is whether a hit DESCRIBES the
tree or SPECIFIES it** — ADR-0081's distinction, and it is what stops this grep being a false alarm
generator. -> **M5, before `render-engineer` is spawned.**

### M4's HARD PREREQUISITE IS UNBUILT AND TWO FILES DISAGREE ABOUT WHEN IT LANDS
**Parked 2026-08-26 (G-053b, ADR-0089 §7(b)). OPEN CONTRADICTION, and M4 is the next milestone.**
`HOTELSIM.md:609` — *"the scenario-capital mechanism lands **before the first M4 goal starts**"*.
This file's **C1** — *"-> **M6**, and M4 consumes it"*. **A prerequisite of M4 cannot land at M6, and
the contradiction is inside one sentence of C1.**

**Falsification test:** `grep -n startingCapitalPence packages/content/data/economy.json` and
`git grep -n "scenario" -- packages/content/src/schema.ts`. **Reading at `26f9f88`: one global
constant of 500,000p, and two comments with no type.** **Confirms the mechanism is unbuilt while
those readings hold; discharged when a scenario type exists in the schema and `--rooms N` stops
seeding capital.** **The ORDERING is a planning ruling and this goal did not make it** — but every
balance figure in this project was taken with `--rooms N` seeding ~75% extra opening capital, and
**M4 is where the economy gets tuned.** -> **the human, at M4 PLAN.**

### A COUNT TAKEN OVER ONE OF TWO POPULATIONS IS THIS PROJECT'S MOST REPEATED DEFECT
**Parked 2026-08-26 (G-057, ADR-0093 §2).** Three instances in four days by three authors, and
every one was a correct arithmetic over an incomplete subject: G-053b's amendment census counted
16 `## ADR-XXXX AMENDMENT` headings and not the 8 inline `**Amendment (…)` blocks; its
stale-`Milestone:` counter anchored `/^Milestone:/` and returned 7 where both spellings give 14;
and the charter's `--rooms 3` capital example counted 3 bedrooms where the default invocation
seeds 9 rooms. **THE HYPOTHESIS**: the discriminator is not carelessness but that each subject has
**two spellings or two populations and the counter knew only one**, so the fix is a habit — *before
quoting a count, name the population and ask what ELSE is in it* — rather than a fifteenth gate.

**FALSIFICATION TEST:** *at the next three counts quoted in a REFLECT, write the population down
beside the number. If none of the three turns out to have a second spelling, the pattern was three
coincidences and this note is withdrawn; if any does, the habit paid for itself in one goal.*
-> **the next three REFLECTs.**

### FOURTEEN GOAL BLOCKS STILL READ `Milestone: M3` AFTER M3 SIGNED OFF
**Parked 2026-08-26 (G-053b, ADR-0089 §7(d)).** Twelve are genuinely stale; two (`G-053b`, `G-056`)
are correctly labelled `M3 exit`. **Not silently re-milestoned** — assigning twelve goals to M4, M5
or M6 is a planning decision and G-053b's bound 7 forbids growing one.

**Falsification test:** the awk in `ADR-0089 §7(d)`, which must match **BOTH SPELLINGS** — the tree
writes `Milestone:` on its own line **and** inline on the `Status:` line. **A line-anchored counter
returns 7 and the both-spellings counter returns 14, and the first number is wrong.** **Confirms
while any non-done block names a signed-off milestone; discharged when each is re-milestoned or
closed.** *`check:stamp`'s status half cannot see this and says so in its own predicate line
(ADR-0088) — the gate is green over all fourteen and always would be.* -> **M4 PLAN.**

### §2.4's "ALL FOUR WATCHING-FINDINGS" NAMES A SET THAT IS IN NO FILE
**Parked 2026-08-26 (G-053b, ADR-0089 §5).** The roster lived in a brief and in a report and **was
never written to a ledger**, so ADR-0089's table is a RECONSTRUCTION and says so. **A closed class
whose membership is unrecorded cannot be re-audited.**

**Falsification test:** `git grep -n "§2.4" -- *.md` and `grep -n "WATCH #" JOURNAL.md`. **Confirms
while the first returns no roster and the second is the only enumeration there is; discharged when a
ledger names the four.** *The cheapest discharge is one line in `JOURNAL.md` at the next WATCH.*
-> **the next goal that records a WATCH.**

### ADR-0028's RESTATEMENT TRIPWIRE IS ARMED AND NOTHING IS WATCHING IT
**Parked 2026-08-26 (G-053b, ADR-0091 §5).** ADR-0043 §3 deferred ADR-0025 and ADR-0028 with a
CONDITION — *"strike-and-restate only if a goal needs to cite them again"* — and **nobody ever
checked it.** ADR-0025's fired twice (2026-08-22, 2026-08-23) and sat fired for four days;
**ADR-0028's has not fired**, its newest citation-adding commit being `e1623b4` at 2026-08-14 11:26
against ADR-0043's own `c4067e5` at 18:51 the same day.

**Falsification test:**
`git log -S "ADR-0028" --format="%h %ad %s" --date=iso -- packages tools apps | head -1`. **Confirms
the deferral while that commit is older than `c4067e5`; refutes — and the restatement is owed — the
moment a newer one appears.** **Deliberately a written invocation and NOT a fifteenth gate**
(ADR-0086: a scanner that checks the scanners has the same problem one level up). -> **whichever goal
cites ADR-0028 next.**


## From G-054 — three things the tie-break repair MEASURED and is NOT allowed to fix (2026-08-26)

### THE REVIEW MEAN REWARDS CONCENTRATION OF SATISFACTION, and G-054 is what made that visible
**Parked 2026-08-26 (G-054).** Paired, one sitting, the two arms one character apart in `reserve`
(`pressure <` against `pressure <=`), at **12 rooms / 1 amenity of each kind / one arrival per 120
ticks**, exact deterministic counts over 471 and 469 departures:

|  | comfort | entertainment | nourishment | night_rest | reviews | mean |
|---|---|---|---|---|---|---|
| **before** | 98/373 | 109/362 | 471/0 | 471/0 | 3:80 4:361 **5:30** | 389 |
| **after**  | 109/360 | 90/379 | 469/0 | 469/0 | 3:93 4:362 **5:14** | 383 |

**The top band HALVES while every need row moves by single figures.** Nourishment is met for
everybody in both arms; the two single-provider needs share about two hundred `met` either way.
**What changed is WHO gets the whole vector** — under an id-ordered tie-break the guests that
arrived when the fixed order was clear took everything, and spreading the tie per guest spreads
those helpings out.

> **So the review mean prefers ONE guest with three needs met and nine with none to TEN guests with
> two of three.** That is a property of `reviewOf`, not of the tie-break, and it is the mechanism
> behind the only fall on the room ladder (`scorer.report.test.ts`, `review.report.test.ts` — both
> re-pinned from -11 to -15 hundredths at the same cell).

**Falsification test:** forge two departure populations with the SAME total met-need count — one
concentrated, one spread — and fold both through `reviewOf`. **Confirms if the concentrated
population scores higher; refutes if the mean is indifferent to how the same total is distributed.**
`review.scorer.test.ts` already builds forged guests, so this is one arm rather than a harness.
-> **G-050 (fit scales satisfaction), which is the next goal to touch what a review can express.**

### THE `stepTowards` FALLBACK FIRES TWICE AS OFTEN ON AMENITY-RICH HOTELS SINCE G-054
**Parked 2026-08-26 (G-054).** G-058 attributed the whole through-wall residual to one cause —
`stepTowards` takes candidate zero when every admissible landing is a wall. **G-054 gives that cause
more occasions and the branch split proves the population is the same kind** (every landing is
`fallback`, in both arms, on every workload):

|  | 60 rooms / 5 amenities | 6 rooms / 5 amenities | CLI default | 20 rooms, build+demolish |
|---|---|---|---|---|
| **before** | 52 of 2,387 (2.18%) | 32 of 1,388 (2.31%) | 0 | 0 |
| **after** | 96 of 2,244 (4.28%) | 56 of 1,239 (4.52%) | 0 | 0 |

**The two workloads that move are the two with somewhere to spread TO**, and the two that do not
move are the two with no amenity contention. **A defect getting twice as visible is a finding even
when the mechanism is somebody else's**, and this one is now the largest remaining "reads as stupid"
population in the sim: a guest standing inside a stranger's bedroom for a tick.

**Falsification test:** make `stepTowards` REFUSE rather than take candidate zero when every landing
is a wall, and re-run `travel.walls.report.test.ts`'s four workloads. **Confirms if all four go to
zero through-wall landings with no guest stranded; refutes if any guest stalls, which would say the
fallback is load-bearing and the repair is a route, not a refusal.** -> **the goal that closes
G-058's residual.**

### A WORKING FOOD COURT NOW LOSES ONE VISITOR IN 473, WHERE IT LOST NONE
**Parked 2026-08-26 (G-054).** Paired, one sitting, exact deterministic counts on the `FOOD_COURT`
fixture at three amenities against one, `--arrivals 30`:

    working   0 walkouts / 474 visits   ->   1 walkout  / 472 visits
    starved 148 walkouts / 324 visits   ->  138 walkouts / 336 visits

**The starved arm got better by ten visitors and the working arm lost one.** Across the whole
admissible let-down window the working arm reads 3 / 1 / 0 walkouts at ceilings 181 / 190 / 207 —
monotone in the ceiling, which a flat zero could never have shown. **It is contention rather than a
need nothing can satisfy**, and it is parked rather than fixed because the obvious repair — raising
`dissatisfactionCapacityTicks` — is tuning content to flatter code (§9), refused by name at
G-039b-alpha.

**Falsification test:** identify the walking-out visitor in the recording and read its need vector
at the tick it leaves. **Confirms contention if every need it wanted was held by another guest at
that moment; refutes — and it IS a defect — if any provider of any wanted need was free.**
-> **whichever goal next touches visit-duration or the let-down ceiling.**

## G-052a — three items, each with its falsification test

**1. THE SHIPPED ROSTER IS EMPTY AND THE FLIP IS ONE JSON FIELD (owned by G-052b).**
Add `openingStaff: [{ roleId: "night_porter", count: 1 }]` to `packages/content/data/scenarios.json`.
*Falsification test:* re-run `--days 1000 --seed 7 --rooms 0 --amenities 0 --build 1440 --demolish
1440 --loan 1440` with a hire and a fire command available and a player that uses them. **If the
run still ends with zero builds in the last ten days, the problem is the wage and not the roster and
ADR-0101 §2 is wrong.** If the player fires the porter when the till empties and criterion B's three
claims come back, the flip is safe and the ruling was right. `wages.report.test.ts` already carries
both arms of the measurement, so this is a re-run rather than a new instrument.

**2. THE `--rooms 60 --arrivals 96` BENCH ARM IS INSOLVENT AT HEAD, BEFORE ANY WAGE EXISTS.**
Closing balance **-37,949,000p** over 365 days: 154,500p a night of upkeep against 17,943,500p of
revenue for the year, because sixty bedrooms sit behind one amenity and the arrival cadence cannot
fill them. Nothing gates on a negative balance (`settlement.ts`), the arm passes no `--build`, and
`sim:bench` measures TIME, so nothing is red — **but every balance figure taken on the bench arm is
taken on a bankrupt hotel.** *Falsification test:* raise `--amenities` on the bench workload until
`checkedOut` stops being arrival-limited and re-take the closing balance. **If it goes positive, the
arm is starved rather than the economy being wrong**; if it stays negative at full occupancy,
`nightlyUpkeepPence` and `nightlyRatePence` are mispriced against each other and that is a balance
goal. Do not change the bench workload to find out — G-020a's workload is pinned and the reading
belongs beside it, not in it.

**3. THE MONEY LOOP HAS NO PERCEPTUAL CHANNEL.** The wage, the upkeep and the balance are legible
only in the CLI report; two 26-frame recordings, one employing a porter and one employing nobody,
are **identical byte for byte**. *Falsification test:* record the same pair after G-052b places a
staff member in a room. **If the frames still match, the payroll is still invisible and the term is
being taken on trust** — which is ADR-0013's condition, one loop over from the one it was written
for.


## G-051a — five items, each with its falsification test

**1. THE PALETTE CAPS THE SHIPPED ROOM TABLE AT SEVEN, AND THE EIGHTH ROOM TYPE HAS NOWHERE TO GO.**
`MIN_CONTRAST_WITHIN_ROLE` is 1.3 and the arithmetic ceiling is `span^(1/(N-1))` — **1.3515 at seven
and 1.2945 at eight** (ADR-0102 §6). M6 is *"room and item variety"*, which is a milestone that
cannot be delivered under this bound. *Falsification test:* add an eighth room type to
`room-types.json` and run `pnpm exec vitest run palette.contrast`. **If it passes, this bound is
wrong and the arithmetic above is wrong with it**; if it fails, the milestone needs a colour field in
content or a wider luminance band, and **the band is a human's eye rather than a gate** (ADR-0013).
*Do not raise `MIN_CONTRAST_WITHIN_ROLE` to make room — it is derived from a measured failure and
that is §9's gate-editing stop condition.*

**2. A COLOUR FIELD IN CONTENT, AND IT NOW HAS A CASE RATHER THAN A PREDICTION.** `palette.ts`'s
header parked this at G-030 with the cost it would buy back; **G-051a charged that cost in full and
the collision was exact — `conference_hall` took `#be004f`, the colour `games_room` had** (WATCH
#25). *Falsification test:* grep `JOURNAL.md` for colour words in WATCH entries against `apps/game`
recordings. **If none of them names a colour, the vocabulary was never load-bearing and this item is
dead**; if any does, that note is now false and the field is worth its fingerprint move. **It is
`packages/content` work and it moves every content hash in the tree, so it is a goal and not a
paragraph.**

**3. THE STAR RATING HAS NO PERCEPTUAL CHANNEL, AND THE RECORDER CANNOT EVEN DRAW A FACILITY.**
Nothing on screen says what a hotel scores; and `apps/game/src/scenario.ts` selects amenities by what
they SERVE, so a facility — which serves nothing — never appears in a recording (WATCH #25). *This
is the money loop's item 3 one loop over, and it is sharper: there the mechanism was invisible, here
the OBJECT is.* *Falsification test:* record frames after G-051b, with the scenario seeding one
facility. **If the frames still contain no facility, the scenario's selector is the blocker and not
the renderer**, which is a one-line change in a file this goal may not touch.

**4. THE RATING SATURATES AT BOTH ENDS AND G-051b INHERITS BOTH.** Capped at 3 below the facility
gate however many bedrooms are built; flat at 5 above the top tier. **Demand would stop responding in
exactly those two regions.** Two candidate answers and neither is chosen: more tiers, or a clause
shape whose minimum SCALES with hotel size (*one facility per N bedrooms*), which the current
`{roomTypeIds, counting, minimum}` shape cannot express. *Falsification test:* once demand reads the
rating, sweep `--rooms` at `--facilities 0` and again at `--facilities 1` and plot arrivals. **If
arrivals are flat across the 12/24/60 rung at either setting, the clamp has reached the loop** and
the ladder needs the scaling clause; if they are not, the rating's flat region is being masked by
something else and that something is the finding. **Do not add tiers until a histogram looks nice —
§2.1, and the reason G-059 was refused.**

**5. A FACILITY REQUIRES NO EQUIPMENT, AND THE OBVIOUS FIX WOULD RECLASSIFY IT.** A Spa with no
fittings is a box. The cheap route — `requires: ['arm_chair']` — is **refused**: `roomTypeServes`
counts what a required item provides, so the room would become an AMENITY, get seeded by
`--amenities`, and move every arm in the project (ADR-0102 §4). The honest route is a new item type
that provides nothing, which is M6's variety work and collides with item 1's ladder in the item role.
*Falsification test:* add such an item, give a facility a `requires` on it, and check
`amenityRoomTypesOf(loadContent())` still returns three. **If it returns more, the item provides
something and the reclassification has happened anyway.**

## G-051a sweep 1 — three more, each with its falsification test

**6. THE VIEWER PALETTE HAS NO GATE, AND THE CASE FOR ONE IS NOW A MEASUREMENT.**
`palette.contrast.test.ts` builds `apps/game`'s COMPUTED ladder; `tools/viewer/viewer.js` is
hand-keyed by content id and **nothing checks it**. Three colours added by hand at G-051a landed a
**new worst pair at 1.021:1** and nothing went red. Its standing worst pair — `games_room` against
`hotel_cafe`, **1.024:1** — has been there since G-012 and is far under the 1.3 floor that whole
ladder is derived from. *Falsification test:* extend `palette.contrast.test.ts` with a second arm
over the viewer's literal table and run it. **If every pair clears 1.3, this item is wrong and the
table is fine**; if it does not, the fix is a colour field in content (item 2), because
**re-deriving the viewer's colours would break the id-stability every older WATCH note rests on** —
which is the whole reason that table is hand-keyed. *Do not simply lower the floor: it is derived
from a build a human could not read.*

**7. WITHDRAWN AND REPLACED AT SWEEP 2 — THE ITEM'S OWN FALSIFICATION TEST RETURNED ITS
"MISFILED" BRANCH ON THE DAY IT WAS WRITTEN.** It claimed five stars was unreachable *because*
`--build`'s rooms land `unsupported`, and offered: *"if the unsupported count is zero … this item
is misfiled."* **Run verbatim, `unsupported` is ZERO** (`noCorridor` is 7), and
`builtRoomStartFloor(0)` returns `GROUND_FLOOR`, so the function it named is not in that path at
all. *Kept in place rather than deleted, because **a parked hypothesis whose test comes back
negative on the day it is written is worse than no hypothesis** — §4's whole argument for the form
is that a LATER goal runs it, and this one would have handed G-051b a refuted premise carrying the
authority of a parked experiment. **The cheap general fix: RUN the falsification test before
parking it.** §4 asks for the invocation, the reading and the comparison; it should also ask for
the answer.* Replaced by items 9, 10 and 11.

**9. THE SCALE CLAUSE AND THE FACILITY CLAUSE CANNOT BE SATISFIED AT THE SAME TIME.** This is the
real content of the old item 7 and it is a BALANCE finding about the shipped tier table, not a
runner defect. Small enough to afford facilities and you have too few bedrooms; large enough for
the bedrooms and their upkeep eats the cash the facilities need — **tier 5 asks for both.** At
`--rooms 24 --amenities 1 --buy-facility 2000` the scale clause is met at tick 0 and the hotel buys
**exactly one facility at 60, 300 and 1,000 days**. *Falsification test, and it has been RUN once
so this is a result rather than a guess:* the reading is **cadence-independent** — 4,800 arrivals
and 6 arrivals give the same stars and the same single purchase while cash moves two orders of
magnitude. **So if a later goal makes the second facility affordable at 24 bedrooms WITHOUT
changing a price or a tier, the wall was income and this item is wrong**; if it takes a price cut,
a tier edit or demand, the two clauses really are mutually exclusive on the shipped table.
**G-051b is the goal that will find out, because a rating feeding demand moves the income side of
exactly this arithmetic.**

**10. THE PLAYER WALK STRANDS WHAT IT BUILDS, TWO WAYS, AND BOTH PREDATE G-051a.** With
`--rooms > 0` it is `unsupported` — `builtRoomStartFloor` puts the walk a floor above the seeded
plate. From nothing it is `noCorridor`. **Two different defects, previously written as one.**
*Falsification test:* run `--rooms 12 --build 1440 --days 365` and `--rooms 0 --build 720
--days 365` and read `rooms.invalid` on each. **If either tally is all-zero, that family is healthy
and this item halves**; if both are non-zero at different reasons, then **every build-campaign
measurement in this project has been taking stranded rooms on trust**, which is the part worth a
goal. *Do not fix it inside a balance goal: it changes what `--build` means on every arm.*

**11. THE VIEWER PALETTE STILL HAS NO GATE** — carried forward from item 6, which stands. See item
6 for the test.

**8. A TEST THAT RECOMPUTES ITS CLAIM'S DEFINITION IS THE PROJECT'S MOST EXPENSIVE RECURRING
DEFECT, AND IT NOW HAS TWO INSTANCES ONE GOAL APART.** G-052a: the wage bound re-derived from the
same two fields, so a wrong unit passed green. G-051a: cost of ownership re-derived without the
residual, so a dominated row passed green. **Both were written by someone who had just read the
other one.** *Falsification test — and it is a cheap scanner:* list every test that asserts a
property of shipped CONTENT and check whether it calls a shipped function or recomputes the
quantity inline. **If fewer than two recompute, this is two incidents rather than a class and the
item dies**; if more do, the rule is *a content property is asserted through the function the game
uses to read it*, and it is worth a gate. *Note the cheap fix that is NOT available: asserting the
literal values instead. That pins the arithmetic even harder.*
**12. STOCHASTIC DEMAND — DOES THIS GAME NEED WEATHER? (G-051b.)** `demand.ts` draws NOTHING, so a
hotel of a given rating receives exactly the same parties at exactly the same ticks every run. That
is a decision made for an EVIDENCE reason, not a design one: a per-tick PRNG draw would make the seed
an economic axis for the first time and demote every economic figure in this project from a READING
to one draw of a distribution. *Falsification test — and it is a measurement rather than a belief:*
the claim to check is not "would randomness be fun" but **"how much would it cost to find out"**. Run
`--days 365 --rooms 12 --amenities 2 --facilities 1 --demand` at seeds 42, 7 and 99 and read
`guests.arrived`, `money.revenuePennies` and `money.balancePennies`. **RUN AT G-051b, POSITIVE:
5,840 / 49,504,000p / 33,396,500p, identical at all three, with only `world.stateHash` moving.** So
the cost of adding a draw is exactly this: **every figure in every ledger in this repository becomes
a sample and needs a distribution across seeds instead of an integer**, including the ones
`balance-critic`'s standing mandate already asks for. *That is the price. Whether it buys enough is a
human call, and the goal that takes it owes a re-pin of every economic figure it invalidates.*

**13. `metByNothing` — THE THIRD ATTRIBUTION COUNTER, AND THE LAW IT WOULD RESTORE (G-051b).**
`report.ts`'s *"no room type provides it => met - metByItem MUST be 0"* was struck because it is
false: `met` is the top per-need BAND over a stay (ADR-0037), so a guest whose stay ends before
anything serves a need counts into `met` with `metBy` still `null`, and the derived by-room column
counts SERVED-BY-A-ROOM plus NEVER-SERVED-AT-ALL. **What is lost is the direction that catches a
build attributing an item-served need to a ROOM.** The repair is a third counter on `NeedOutcomeRow`,
which is a `World` field and therefore a save bump, a migration, a `without-*` stripper and a
v1-fixture round trip. *Falsification test:* run `--days 5 --seed 42 --rooms 24 --amenities 1
--demolish 2880 --demand` and read `needs[guest_comfort].met` and `.metByItem`. **RUN AT G-051b,
POSITIVE: 32 and 31, with 4 `evictedRoomGone` departures — a legitimate run in which the by-room
column is non-zero under content where no room provides comfort.** If a future tree returns
`met === metByItem` on that arm, the gap has closed by some other route and this item dies. *Note
what is NOT a fix: asserting a bound on the difference. No sound, non-vacuous, content-only bound
exists — the maximum number of never-served instances is every departed guest.*

**14. THE FIRST RUNG OF THE STAR LADDER DESCRIBES A HOTEL THAT CANNOT TRADE (G-051b).** Tier 1 asks
for ONE BEDROOM and nothing else, and a bedroom-only hotel earns ZERO: a guest whose engagement needs
cannot be met walks out before checkout. *Falsification test:* run `--days 30 --seed 42 --rooms 1
--amenities 0 --demand` and read `money.revenuePennies` and the departure table. **RUN AT G-051b,
POSITIVE: 40 arrived, 0 checked out, 40 `leftDissatisfied`, revenue 0p.** **It is NOT made worse by
G-051b and that is measured too, on TWO arms that are two arms** (365 days, seed 42, one run each;
the disappointed column counts every departure that paid nothing, `gaveUp` + `leftDissatisfied`):
`--rooms 1 --amenities 0` ends at **-412,500p under BOTH regimes**, 486 disappointed under demand
against 5,837 under the clamp; `--rooms 0 --amenities 0 --build 1440` ends at **-662,500p under BOTH
regimes**, 485 against 5,837. **The balance is identical under both regimes on both arms** — demand
changes who is disappointed and never the loss. What changed is that the ladder is now the demand driver, so its first
rung is the first thing a player is told to build. **G-060 owns it**; it is parked here rather than
only in that block because it is a fact about the CONTENT and will outlive the goal.

**15. AMENITY BUILDING IS STILL NOT A THING THE RUNNER CAN DO (G-051b, carried from G-008).**
`--build` issues `buildRoom` with the LODGING room type and nothing else, and `--buy-facility` cycles
the FACILITIES. **There is no invocation of this runner in which a player pays for a café** — every
amenity in every arm is seeded free by `--amenities N`. That was harmless while amenity count bought
nothing; it stopped being harmless at G-051b, because the amenity bottleneck (item 14's neighbour,
and G-060's) is now the largest un-bought improvement in the economy. *Falsification test:* run
`--days 365 --rooms 0 --amenities 0 --build 1440 --demand` and read `money.revenuePennies`. **RUN AT
G-051b, POSITIVE: 0p — a from-nothing campaign under this runner can never build the thing that would
make it earn.** If a future runner returns non-zero on that arm, an amenity has become buyable and
this item dies. *It is a HARNESS gap, not a game one: `drawRoom` takes any room type, so a player in
`apps/game` has the move this runner does not.*


---

## THE MIDDLE OF THE REVIEW SCALE IS UNREACHABLE, AND THE HYPOTHESIS IS THAT THE MOOD CEILING TRUNCATES IT (G-059)

**Parked with its falsification test, and the test has already been RUN once in the direction that
motivates it.**

**THE OBSERVATION.** After G-059 every arm this project measures produces reviews at `{1, 4, 5}` and
never at 2 or 3. `review.report.test.ts` asserts G-019's criterion 2 as FAILING at its named
invocation (`--rooms 6 --arrivals 60`, two bands clearing the per-day floor where three are asked
for), and `scorer.report.test.ts` says the same of the STARTING hotel.

**THE HYPOTHESIS, STATED SO IT CAN BE WRONG.** A score of 2 or 3 requires a stay that RAN ITS COURSE
and was badly served — all five terms of the mean summing to between 5 and 14. Shipped content makes
that guest nearly impossible: `dissatisfactionCapacityTicks` is 301 against a `stayDurationTicks` of
1,440, so a guest failed for much more than a fifth of its stay walks out, and a stay that did not
run its course reviews at the floor. **So the mood ceiling truncates exactly the population that
would occupy the middle bands, and the scale's middle is empty for a CONTENT reason rather than a
scorer one.**

**THE FALSIFICATION TEST — THE INVOCATION, THE READING, THE COMPARISON.**

    node --import tsx tools/headless/src/cli.ts --days 30 --seed 7 --rooms 6 --amenities 1 --json

read `reviews.distribution`, against a content tree whose `guest-rules.json` carries a LARGER
`dissatisfactionCapacityTicks` (say 900) with `toleranceTicks` unchanged. **CONFIRMED** if bands 2
and/or 3 become occupied by more than one guest per simulated day while the departure table shows
`leftDissatisfied` falling — i.e. the guests that used to walk out now complete badly-served stays
and land in the middle. **REFUTED** if the distribution stays at two bands: then the middle is
unreachable for some other reason (most likely that need bands saturate at the top for anyone the
hotel houses at all), and the repair is not the mood ceiling.

**WHY IT IS PARKED RATHER THAN DONE.** Choosing `dissatisfactionCapacityTicks` by which review
distribution looks better is precisely the §2.1 order G-059 was refused for the first time round.
The number is currently DERIVED at its point of use (`dissatisfactionCapacityTicksSchema` carries
the derivation and `assertDissatisfactionOutlastsTheLobby` bounds it), so moving it needs a stated
requirement, not a nicer histogram. **That is a goal.**

**WHAT ELSE THE SAME GOAL WOULD OWN**, so it is not re-discovered: `review.report.test.ts`'s
top-band-SHARE ladder is identically zero at every rung, because no rung of that ladder reaches four
stars and a top review now needs the hotel's own standing band at the top. M2's exit finding — a
reputation term over the SHARE can invert the build loop where one over the MEAN cannot — is not
measurable on that ladder any more. Re-siting it needs a `--facilities` ladder, which changes what
the ladder holds fixed, so it is the same kind of decision.

**AND A NEW CAPABILITY ABOVE SATURATION, WHICH IS THE THING TO HAND TO G-060 — NAMED BECAUSE IT IS
NEW AND BECAUSE IT POINTS AWAY FROM THE MONEY.** Two five-star hotels, `--days 1000 --seed 42
--demand`, one run each, exact integers, zero dissatisfied and zero give-ups in both, win32/12cpu
quiet:

    --rooms 24 --amenities 3 --facilities 1    balance 192,228,000p    reviews 4:164  5:31,804
    --rooms 60 --amenities 5 --facilities 1    balance  93,228,000p    reviews        5:31,968

**BEFORE G-059 BOTH READ `5:all` AND THE CHANNEL SAID NOTHING ABOUT THE PAIR. It now separates
them, and the direction is worth being exact about rather than alarmed about.** What the review says
is TRUE — the 60-room hotel really does serve its guests better, and the 164 guests at band 4 in the
smaller one are guests its three amenity sets left short. **What is wrong is the PRICE: 99,000,000p
of forgone balance to move 164 of 31,968 guests up one band, a half of one per cent of the
distribution.** So above the top tier the review is the ONLY channel still moving, it moves in the
opposite direction to the balance sheet, and nothing in the game states the exchange rate.

*This is the first configuration in the project where the review and the money disagree about a
build.* **It matters for whoever wires reputation to demand**: a reputation term reading this
channel would pay 99M for half a per cent, and the tier table is what has run out of things to ask
for. *Falsification test:* re-run the pair and read `reviews.distribution` and `money.balancePennies`.
**Refuted if the two distributions are equal again** — which is what a G-060 that gives the top tier
a LOAD clause rather than a VARIETY clause would produce, because then the 24-room hotel would not
be short in the first place.


---

## `check:stamp` READS THE STAMP AS THE BODY, AND THE I2 FACT IS CHECKED BY NOTHING (found at G-059, INHERITED)

**Parked with the invocation that demonstrates it, and it is not G-059's to fix: the same probe against
HEAD reproduces it.** The gate is not edited by that goal (§2, "never edit a gate").

**WHAT `stamp.mjs` CLAIMS**, at `:56-57`: *"Every number a reader actually uses — the save schema, the
summary schema, the I2 hash, the measure golden — lives in the BODY of the digest beneath it"*, and at
`:345-346` its own violation message says *"THE DIGEST BODY IS STALE … it is why the gate now reads the
body."* The ok-line at `:468` prints those readings under the heading `digest body:`.

**WHAT IT DOES.** `digestOf` (`:208-215`) slices from `## DIGEST` to the first `---` — **which includes
the as-of stamp line** — and `factViolations` takes the FIRST regex match in that blob. So three of the
four facts resolve inside the STAMP, not the body.

**THE INVOCATION, WHICH IS THE WHOLE POINT OF PARKING THIS RATHER THAN ASSERTING IT.** Re-run the gate's
own four `inDigest` patterns against the same slice and report which region each match falls in:

    node -e '
      const {readFileSync}=require("fs");
      const F={save:/\bsave\s+\*{0,2}v(\d+)/i, summary:/\bsummary\s+\*{0,2}v?(\d+)/i,
               golden:/measure golden\s+`?([0-9a-f]{16})`?/i, i2:/\bI2\b[\s\S]{0,24}?`([0-9a-f]{16})`/};
      for (const f of ["GOALS.md","DECISIONS.md","JOURNAL.md","PARKING.md"]) {
        const L=readFileSync(f,"utf8").split(/\r?\n/);
        const a=L.findIndex(l=>/^##\s+DIGEST\b/.test(l)); let b=a+1;
        while (b<L.length && L[b].trim()!=="---") b+=1;
        const d=L.slice(a,b).join("\n");
        const st=d.split("\n").find(l=>l.startsWith("*As of ")); const end=d.indexOf(st)+st.length;
        console.log(f, Object.entries(F).map(([n,r])=>{const m=r.exec(d);
          return m===null?n+"=NONE":n+"="+m[1]+"("+(m.index<end?"STAMP":"BODY")+")";}).join("  "));
      }'

**MEASURED, 2026-08-28, on this tree:** `save=24(STAMP)`, `summary=4(STAMP)`, `i2=…(STAMP)` in all four;
`golden=…(BODY)` in GOALS.md and JOURNAL.md and **`golden=NONE` in DECISIONS.md and PARKING.md**, which
carry no golden line at all. **Against `git show HEAD:` the same probe reads `i2=c967bdb98dac9b0d(STAMP)`
— so the behaviour is inherited and G-059 did not introduce it.**

**AND THE I2 FACT IS CHECKED BY NOTHING.** It declares `shipped: null` and `factViolations` does
`if (fact.shipped === null) continue;` before the tree comparison (`:337`). Its own comment says so
honestly — the value is derived, not stored — but combined with the first-match behaviour the
consequence is stronger than that comment states: **the four copies are compared only against each
other, and they are four copies of one sentence that a single edit keeps in agreement while making all
four wrong.** That is exactly what happened at G-059.

**FALSIFICATION / DISCHARGE TEST.** The item dies when the probe above reports `(BODY)` for `save`,
`summary` and `i2` in all four ledgers. **REFUTED** — i.e. this is not the defect it looks like — if a
reader can show the stamp is the intended source, in which case the three prose claims at `:56-57`,
`:345-346` and `:468` are what needs correcting instead. Either way one artefact is wrong and the goal
that takes this decides which.

**WHY IT MATTERS BEYOND TIDINESS.** `golden=NONE` in two of four ledgers means the ONE fact that really
is read from a body is read from half the ledgers, so a stale golden in DECISIONS.md or PARKING.md would
be invisible; and the gate prints all four readings under the label `digest body:`, so its own output
tells a reader the opposite of what it did.


## G-061 — five items, each with its falsification test

*The goal that stopped being about a selector clause the moment it was measured. Four of these are
findings the diff does not contain; the fifth is the instruction that produced two of them.*

### 1. THE RUNG AT WHICH THE STAR LADDER TURNS NEGATIVE IS A FUNCTION OF AMENITY DENSITY

**This generalises G-060's finding and demotes it to a special case.** G-060 is pinned as *"taking
the FIFTH star loses money"*, measured at `--amenities 2`. It is not a fact about the fifth star.
**Measured on the shipped game scenario at one-of-each density, the FOURTH star loses money by the
same mechanism**: seeding the facilities takes the rating 3 -> 4, `runDemand` doubles arrivals
exactly as the curve promises, and at seed 7 over 30 days revenue falls 1,972,000p -> 1,887,000p
and balance 987,000p -> 707,000p with **245 `leftDissatisfied` against 0**. The orchestrator
reproduced the sign on the CLI analogue — `--days 30 --seed 7 --rooms 18 --amenities 1 --demand`,
`--facilities` 0 -> 1: 3 stars/240/1,972,000p/987,000p against 4 stars/480/**2,006,000p**/826,000p.
**Different host, different layout, same sign, same mechanism.**

**Why it happens, and it is the amenity clause rather than the bedroom clause**: every tier's
amenity requirement counts `distinctTypes` and never LOAD, so a hotel can satisfy the clause that
DOUBLES its arrivals without adding one seat. The negative rung is therefore wherever the hotel's
serving capacity stops covering the arrivals the next tier buys — which moves with density, not
with the tier number.

**FALSIFICATION TEST.** `--days 30 --seed 7 --rooms 18 --demand`, sweeping `--amenities` 1, 2, 3
against `--facilities` 0, 1. The claim is REFUTED if the sign of the balance delta across the
`--facilities` step is the same at every amenity level — i.e. if the rung does not move. It is
CONFIRMED if the fourth star is negative at `--amenities 1` and non-negative at some higher level,
which is what one arm of it already shows: on the game scenario at two copies each, the same step is
987,000p -> **2,629,000p** with zero dissatisfied. **Owner: G-060**, whose brief should be widened
from "the fifth star" to "the rung, as a function of density", because a fix aimed only at tier 5
leaves the defect alive one rung down.

### 2. A DECLARED `kind: "facility"` IN `room-types.json` — THE POSITIVE FIELD THAT WOULD RETIRE THE UNION

**Addressed to `packages/content` (schema) and `packages/sim` (structural type). Not the render
layer's to give, and not taken at G-061.**

`apps/game/src/scenario.ts` now selects the basement band by a UNION of two positive tests — serves
a need, OR a star tier counts it. That union exists because **there is no way to ask content "is
this a facility?"**, and both single-clause alternatives were rejected with reasons: the negation
(`!servesSomething`, which `report.ts` uses) is the ABSENCE of properties and cannot tell a facility
from a mis-authored room type; the tier clause alone silently DROPS any serving room type no tier
happens to name, which is this file's own historical defect class.

**A declared field makes the question answerable and retires both proxies at once.** It would also
let `report.ts`'s `facilityRoomTypesOf` stop being a negation.

**FALSIFICATION TEST.** The item dies when a room type can be classified without inference. It is
REFUTED — i.e. the union is right and should stay — if somebody shows the classification is
genuinely derivable from what a room DOES, in which case the union is the derivation and the field
would be a second source of truth. **The cheap probe**: add a room type to `room-types.json` with
empty `provides`, empty `requires` and no tier naming it, and run the game recorder. Under the
union it does not appear (correct). Under the negation it stands in the basement charging upkeep.
Restore with the ADR-0022 recipe.

### 3. THE THREE FACILITIES ARE VISIBLY EMPTY IN EVERY RECORDED FRAME — G-062's FRAME TO POINT AT

**`ADR-0102 §3`'s "a facility is a pure cost" is now VISIBLE rather than merely true**, and that is
a consequence of G-061 shipping rather than a defect it introduced.
`shipB-long/t005760-fm1-reduced.svg` — nine basement rooms, and `CH47`, `S48` and `T49` contain no
guest in **any** frame of **any** of the four recordings taken for this goal (26 + 26 + 18 + 18
frames). A watching stranger sees three large bright halls that nothing ever uses, with nothing on
screen saying they bought the fourth star.

**Owner: G-062** (*the rating is on screen*). `starRatingOf` already returns `nextStars` and
`shortfall`; the frame above is what those two values explain.

**FALSIFICATION TEST.** Re-record after G-062 and read the frame with a stranger: the item dies when
a viewer of `t005760-fm1` can say WHY the empty rooms are there. It is REFUTED if a guest is ever
observed inside a facility, which would mean a facility serves something after all and the whole
`facilityRoomTypesOf` argument needs re-reading.

### 4. SIX DISTINCT BASEMENT FILLS TODAY — THE RE-CHECK EVENT IS A SEVENTH ROOM TYPE, NOT A DATE

The basement band draws **six distinct hues across nine rooms** (`GR37 GR39` orange, `C41 C42`
olive, `L43 L45` green, `CH47` magenta, `S48` emerald, `T49` cyan). Two copies of a type sharing a
colour reads WELL — "two Cafes" is legible at a glance — so the count that matters is TYPES and not
rooms. `L43` (green) beside `S48` (spring green) is the closest adjacent pair and it separates
today.

**THE TRIGGER IS AN EVENT THE ARTEFACT CAN OBSERVE, not a milestone** (G-051b's rule): **a SEVENTH
non-lodging room type entering `room-types.json`.** That is the first moment the palette has to
separate more hues in one frame than it has ever been asked to.

**FALSIFICATION TEST.** `palette.contrast.test.ts` already pins contrast WITHIN a role; this is
contrast BETWEEN adjacent room fills, which nothing checks. Add the seventh type, record floor -1,
and ask whether two adjacent rooms read as one. REFUTED if the palette generator is shown to
guarantee separation for N types by construction, in which case there is no event to wait for.

### 5. TWO INSTRUCTIONS THAT WERE WRONG, AND ONE OF THEM SHIPPED IN A COMMIT MESSAGE

*Parked here rather than in `DECISIONS.md` because settled calls are the orchestrator's to write.
Both were found by reading the instruction against the tree instead of obeying it.*

**(a) `VERIFY_EXIT` IS NOT A TOKEN THIS REPOSITORY EMITS.** Every brief this session instructed the
builder to *"read `VERIFY_EXIT` out of the log"*. `tools/gates/verify.mjs` never writes it: the
green terminal marker is `All six invariant gates green.` and the red one is `N gate(s) red: ...`
followed by `process.exit(1)`. **The instruction is worse than useless because it SUCCEEDS**:
`grep VERIFY_EXIT` on any verify log matches the `GOALS.md` digest quoted inside `check:stamp`'s
own ok-line, so an agent that followed it literally would find a hit and could report a pass it
never observed. **The correct instruction is: capture the wrapper's exit status yourself, or read
the tool's own terminal marker.**

**FALSIFICATION TEST.** `grep -c VERIFY_EXIT tools/gates/verify.mjs` returns 0. The item dies when
the briefs stop asking for it, or when `verify.mjs` is given such a marker deliberately.

**(b) "check:purity's subject is packages/sim/src and nothing else" IS HALF WRONG, AND THE WRONG
HALF IS IN COMMIT `2eb2cfb`'s MESSAGE.** The npm script is
`node tools/gates/check-purity.mjs && depcruise --config .dependency-cruiser.cjs packages apps tools`
— the depcruise arm **takes `apps` as an argument** and applies `no-circular` and
`tools-may-reach-only-pure-view-modules` there. So the **scanner** says nothing about `apps/game`;
the **row** covers it narrowly. This is ADR-0086's own class — a gate name read as a description of
the class rather than as a specification of one clause — appearing inside a correction written to
enforce ADR-0086.

**FALSIFICATION TEST.** Read `scripts['check:purity']` out of `package.json`. REFUTED if the
`depcruise` arm is later split into its own row, at which point the original claim becomes true and
this item is discharged rather than fixed.

## G-064 — four items the drag tool surfaced and is NOT allowed to fix, each with its falsification test

*The goal is "the player drags a rectangle and gets a room that size". Everything below is
something that became visible BECAUSE a room can now be a rectangle, and none of it is that.*

**1. A ROOM CAN BE DRAWN AT THE WRONG SIZE AND THE ONLY FIX IS DEMOLISH-AND-REDRAW.** `resizeRoom`
and `moveItem` have existed since G-036c — the sim's own editing verbs, with `breaksAnotherRoom`,
`noSuchRoom`, `noSuchItem` and a `displaced` counter already built for them — and **no click in the
game can reach either**. Until this goal that cost nothing, because every room was one cell and
demolishing one was a whole-room decision. Now a player who draws 4x2 and wanted 3x2 pays the
demolition refund gap to correct a drag. **It is the same shape as G-063's finding and the same
shape as this goal's**: a verb the simulation has had for goals, with no UI.

**FALSIFICATION TEST.** `grep -c "resizeRoom\|moveItem" apps/game/src/*.ts` returns 0 today. The
item dies when a click can reach either, and it is REFUTED if a playtest finds that redrawing is
cheap enough that nobody misses the handle — the reading is the `demolished` count against `built`
in a session where the player is drawing rectangles rather than placing cells.

**2. `describeFootprint`'s DOCBLOCK SAYS "FOR ERROR MESSAGES ONLY" AND IT NOW HAS A HUD CALLER.**
`grid.ts`: *"Human-readable, for error messages only. Never parsed, never hashed, never an id."*
`input.ts`'s `buildLabel` calls it to put `3x2` in front of the player. **The three prohibitions
are all respected** — the HUD parses nothing, hashes nothing and treats it as no id — so what is
stale is the SCOPE clause and not the constraint. **Not fixed here because it is `packages/sim`
and this goal may not touch it**; it is ADR-0084's class (a claim true when written, falsified by a
later commit) in the smallest possible form.

**FALSIFICATION TEST.** `grep -rn "describeFootprint" apps/ packages/` — the item dies when the
docblock names its two classes of caller, and is REFUTED if the render layer's call is removed in
favour of a local spelling, which would be the drift the import exists to prevent.

**3. THE DRAG IS NOT DISCOVERABLE FROM THE PICTURE.** A build button's tooltip says "click a cell,
or drag a rectangle"; nothing else on screen does, and a tooltip is found after you already suspect.
`HOTELSIM.md` §1's headline is that rooms are DESIGNED by the player, and the affordance for the
one gesture that makes that true is a `title` attribute. **This is a design question and §5.4 routes
fun-critical-and-not-resolvable-by-test to the human.**

**FALSIFICATION TEST.** The one from §9's milestone question, asked of a stranger rather than of a
frame: hand somebody `pnpm dev` with no instructions and see whether they ever build a room larger
than one cell. **A still frame cannot answer it and WATCH #32 says so.**

**4. THE CORRIDOR TOOL STILL DOES NOT DRAG, AND THE PARKED QUESTION IS NOW ASYMMETRIC.**
`commands.ts` parks a rectangle form of `layCorridor` with an exact trigger — *"it becomes a real
question the day a corridor gains a COST, because a cost is either per cell or per draw and those
differ"* — and that reasoning is untouched. What changed is the GESTURE: a player who has just
dragged a 3x2 room and then clicks a corridor cell at a time is being taught two grammars for one
grid. **The command-design argument and the input-consistency argument now point opposite ways**,
which they did not before this goal.

**FALSIFICATION TEST.** Count clicks in a session log: `session.log` entries of kind `layCorridor`
against `drawRoom`. The item dies if corridor laying is a small enough share of moves that the
grammar split is invisible; it is CONFIRMED if a playtester lays corridors in runs and says so.
