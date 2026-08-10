# PARKING

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-10, G-019 done. M2: 13 of 13 goals — COMPLETE, pending sign-off. Unreliable: 1 gate, 1 defect (I4).*

- **143 items across 19 goals.** G-020b added four, G-014b five, **each with its falsification
  test attached** (§4). **G-020a's zero is discharged**; the §9 warning stands for next time.
- **THE DWELL TERM IS NO LONGER A HYPOTHESIS.** Parked at G-014b PLAN with its test; the same
  goal's WATCH *was* that test and returned **positive** — 35 of 38 abandonments leave a need
  past half its `satisfyTicks`. **Fourth parked hypothesis settled by a goal that did not plan
  to run it; first time the goal that parked it also answered it.** A margin cannot guarantee
  completion — that needs `M >= 12000`, over the 10000 ceiling.
- **PROMOTED OUT**: scenario capital is a **hard prerequisite of M4**. Every balance figure
  to date was taken with `--rooms N` seeding ~75% extra opening capital.
- **The costed lever, pinned and unpulled**: sampling the guest-store scan recovers
  **18.4%** of I5. Gating on change detection is **dead and measured** — do not re-argue it.
- **Heaviest clusters**: M3 owes movement, queues, distance-as-a-score-term (**and the
  spread that scoring cannot fix**). M6 owes `placeItem`, item cost, archetypes.
- **Watch for**: privacy as a room-type property — content can put a provider in a bedroom
  today and a stranger walks in. **No linter is still configured.**

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
- **The seed-honesty test is designed to go red at M4.** `cli.stdout.test.ts` asserts
  seeds 42 and 43 differ only in the seed and state-hash lines. When the demand model
  makes arrivals seed-dependent, that test fails BY DESIGN and is retired deliberately —
  it is the parked seed caveat written as an assertion. -> M4, as a planned retirement.

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
  `nightlyRatePence` per-stay and documents the coupling. When M4 bills pro-rata, the
  margin falls to 5,957.5p/room-day and 250,000p becomes a **42-day payback instead of
  11** — which is the number that makes construction a real decision. **Do not also raise
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
  already has diminishing returns priced in.** Demand is a fixed cadence until M4, so
  "affordable" is not decidable now — and it is not decidable without those pennies either,
  which is why they are here rather than in a comment. **FALSIFICATION TEST**: when arrivals
  respond to reputation, re-run the amenity ladder at the density the hotel's own revenue
  sustains. *If the top score is still modal there, the scale needs a term oversupply cannot
  buy; if the affordable density lands below it, the ladder is doing its job and this closes.*
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
