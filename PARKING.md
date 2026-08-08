# PARKING

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
- **A room -> occupant index. MEASURED THRESHOLD: I5 FAILS ABOVE ~50 ROOMS. -> M1, not
  M2/M3.** Finding a free room is O(rooms) per waiting guest per tick, so the guest loop
  is O(waiting x rooms). `ai-critic` measured it at G-004, balanced hotel, 365 days
  against the 10s budget:

  | rooms | guests | µs/tick | 365-day projection |
  |---|---|---|---|
  | 3 | 3 | 1.01 | 0.5s — what ships today |
  | 25 | 34 | 8.10 | 4.3s |
  | 50 | 48 | 10.15 | 5.3s |
  | 75 | 105 | 52.67 | **27.7s — I5 fails** |

  Isolated: 1000 rooms with 0 guests costs 0.58 µs, 1 room with 5 guests costs 1.45 µs —
  neither term alone matters, the product does. **M1 is the milestone that hands room
  count to the player**, so it meets this as a known cost, the way ADR-0006 made G-004
  meet the save fixture. Deliberately NOT optimised at G-004: I5 is green at 10.5% and
  stays green through M0, because the bench runs 3 rooms and neither G-005 nor G-006 adds
  any. Optimising against a gate that is not failing is speculative work.

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
  365 days with arrivals held constant: `--rooms 20` 6,643ms · `--rooms 60` 6,653ms ·
  `--rooms 120` 6,877ms. So the bench's `--rooms 60` meets G-010's criterion by its
  letter while measuring roughly what a 20-room hotel would. The honest axis is
  **concurrent guests** (`--arrivals`). Recorded in `bench.mjs` itself so the next
  person sizing that gate meets it. -> whichever milestone next touches I5's shape.
- **A busy 60-room hotel does not fit in the 10s budget**, and that is about the guest
  path and the ledger rather than the gate: `--arrivals 16` (~30 concurrent) takes
  10,849ms, 108%. The gate ships at `--arrivals 32` (~15 concurrent, 45%) for headroom,
  not realism. -> M3/M4, when circulation and wages make the guest path heavier anyway.
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
  bench exercising nothing. I5 moved 8.8% -> ~16% of budget for that reason. What is
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
- **I5 IS AT 28% OF BUDGET, UP FROM ~14.7%. MEASURED, PAIRED, NOT ESTIMATED.**
  `pnpm sim:bench`, median of 5, same machine, `git stash` between: **1,474ms -> 2,579ms**,
  a +75% regression on a gate that stays green; **2,773ms after transitive support**, which
  adds one bounded pass per tick and does not change the shape of the cost. Decomposed by
  running the same 365 days
  under a content set whose room type requires nothing (3 entities instead of 6), direct
  spawn, median of 5: **~503ms of it is the FURNITURE** — the bench's entity count doubled,
  and `findFreeRoom` scans every entity per waiting guest per tick — and **~600ms is the
  VALIDITY machinery** itself (one sorted index per tick that has guests, plus a memoised
  check per candidate room). Deliberately not optimised here: it is under the 40% the plan
  set as the escalation line, and optimising it is G-010's goal, not this one. **What G-010
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
  its bound. Also worth knowing before designing the bench: **`--rooms 100 --arrivals 5`
  takes 109s for 365 days — 10.9x the entire I5 budget.**

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
  the player's and both go. -> **M5**.
