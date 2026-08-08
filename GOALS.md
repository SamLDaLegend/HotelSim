# GOALS

The goal ledger. One block per goal, worked one at a time, top unblocked goal first.
Exit criteria are commands, not adjectives. Rules in `HOTELSIM.md` §4 and §5.

**Exactly one goal is `in-progress` at a time.** Anything discovered mid-goal that is
not in the goal goes to `PARKING.md`.

**Write test criteria as `pnpm exec vitest run <filter>`, never `pnpm test -- <filter>`.**
The latter is not one command: PowerShell binds the filter, Git Bash forwards a literal
`--` and vitest discards all positional filters, so `pnpm test -- zzznotafile` runs the
whole suite green. A criterion that passes on a filter matching nothing is not a
measurement. Found during G-001; applied to every goal below.

---

## M0 — Walking skeleton

> One room type, one guest, one need, one day cycle, money in and money out. Headless
> only, no renderer at all. All six invariant gates green and wired into CI.
> — `HOTELSIM.md` §8

M0 is the most important milestone and the one most likely to be rushed. It should be
playable-but-boring, and finished before anything is drawn on screen.

Bootstrap (`HOTELSIM.md` §10) is complete: the workspace, the six gates, `pnpm verify`,
CI and the agent roster exist, and the gates pass against an empty simulation. The
sim itself is a deliberate stub — `packages/sim/src/*.ts` files marked
`// SCAFFOLD` are placeholders that the goals below replace.

---

## G-001 — Tick scheduler and world entity model
Status: done
Milestone: M0
Owner pair: sim-engineer / sim-critic
Statement: The world holds entities in a deterministic, stable store; the tick runs in
  named phases with a documented order; commands are applied at one defined point in
  the tick rather than wherever they arrive.
Exit criteria:
  - pnpm exec vitest run world  (all green)
  - pnpm test:determinism  (green — 100k ticks, 3 processes, seed-sensitive)
  - pnpm sim:run --ticks 100000 --seed 42 --quiet  produces the same hash on two runs
  - reordering the tick phases must fail a test  (see ADR-0005)
  - all §2 invariant gates green (pnpm verify)
Out of scope: multi-floor grid, build/demolish commands, room validity rules (M1);
  pathfinding (M2); spawnedAt on Entity (G-004)  (-> PARKING.md)
Critique rounds used: 2/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  59 tests green across 3 world files · I2 hash 66a57bf64021275a · sim:run twice
  02fa94c1f4eb7095 · all three non-canonical phase orders fail both the suite and the
  I2 gate · all six gates green · no gate, CI or config file modified.

  Criterion amended mid-goal (2026-08-07, round 1): was `pnpm test -- world`, which
  is NOT a single command — in PowerShell pnpm binds the filter (3 files), in Git Bash
  it forwards a literal `--` and vitest discards all positional filters, so
  `pnpm test -- zzznotafile` runs the whole suite GREEN. A criterion that passes on a
  filter matching nothing is not a measurement. `pnpm exec vitest run world` behaves
  identically in both shells and fails on a bad filter. Both forms were already green;
  this removes ambiguity rather than lowering a bar. Found by sim-critic.

  Criterion added mid-goal (2026-08-07, round 1): the phase-order pin. The goal's
  headline claim was unfalsifiable — see ADR-0005.

## G-002 — Content pipeline and one room type
Status: done
Milestone: M0
Owner pair: sim-engineer / sim-critic
Statement: packages/content defines exactly one room type as JSON validated by a Zod
  schema; the host loads and validates it and injects it into the sim; packages/sim
  contains no content literal.
Exit criteria:
  - pnpm exec vitest run content  (all green, including a test that invalid JSON is rejected)
  - pnpm check:content  (green)
  - pnpm sim:run --days 1 --seed 1  loads content and exits 0
  - all §2 invariant gates green (pnpm verify)
Out of scope: room variety, items, staff roles, guest archetypes (M6); construction
  cost (M1); rooms as spatial entities (M1)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  64 content tests green across 4 files · check:content green · sim:run --days 1 --seed 1
  exits 0 reporting one room type · I2 hash 71cc87bd9d1c8089 · shipped fingerprint
  ac496e19b27da075, +1 penny ebc34728f1f77984, day-1 hashes 1396cf4968cf7095 vs
  5d37178b1f347bcf · a world made under shipped content refuses to tick under edited
  content · all four content-mutation attempts throw TypeError and the host's own object
  is neither frozen nor connected · all six gates green · no gate, CI or config file
  modified; no probe residue.

## G-003 — Save and load the real world model
Status: done
Milestone: M0
Owner pair: sim-engineer / sim-critic
Statement: The world produced by G-001 and G-002 serialises, deserialises and
  re-hashes identically, carries a schema version, and has a gapless migration path.
Exit criteria:
  - pnpm test:save  (all green, including field coverage over every World key)
  - a save taken mid-run, reloaded, and advanced 1,000 ticks matches the unsaved run's hash
  - all §2 invariant gates green (pnpm verify)
Out of scope: save file UI, autosave, multiple save slots (M5); loadWorld; nested
  unknown-key rejection; --save/--load on the CLI  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  test:save 64 tests green across 3 files · all six gates green · I2 hash unchanged at
  71cc87bd9d1c8089 · a gapped chain [1->2, 3->4] now throws instead of feeding v2 data
  through a v3 step, and an out-of-order chain throws · the step-count assertion fires
  in BOTH directions (0 steps over a 1-version span and 2 steps over a 1-version span)
  while the shipped v1->v1 chain passes · truncated, non-JSON, empty and whitespace
  input all report "Save is corrupt: not valid JSON" rather than a raw SyntaxError ·
  the v1 fixture's literal bytes deserialise to its literal hash 7880a56adc457726 and
  re-serialise byte-identically · an unknown top-level key and a __proto__ own-key are
  both rejected by name · no gate, CI or config file modified.

  Fixed a live bootstrap defect: the migration runner used `migration.from >= current`,
  so a gapped chain applied a later step to earlier data and deserialise returned it as
  valid. assertMigrationPathComplete — the one check that would catch it — was never
  called by deserialise. Both halves fixed. See ADR-0007.

## G-004 — One guest, one need
Status: done
Milestone: M0
Owner pair: ai-engineer / ai-critic
Statement: A guest arrives, occupies the one room type, forms one need, has it met or
  not before patience runs out, pays, and leaves with a recorded outcome.
Exit criteria:
  - pnpm exec vitest run guest  (all green)
  - pnpm sim:run --days 30 --seed 7  reports at least one guest arrived, at least one
    satisfied, and zero guests stuck in a non-terminal state at end of run
  - pnpm sim:run --days 30 --seed 7  reports zero guests holding a reservation after despawn
  - all §2 invariant gates green (pnpm verify)
Out of scope: full need vector, utility scoring across many providers, reviews (M2);
  staff (M4); lifts and stairs (M3)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  69 guest tests green across 3 files · sim:run --days 30 --seed 7 exits 0 with arrived
  360, satisfied 267, unsatisfied 89, evicted 0, in hotel 4, stuck 0, orphan res 0, and
  is byte-identical across runs · conservation closes exactly (267+89+0+4=360) and the
  balance is exactly 267 x 8500p · all six gates green, I2 hash d279428ff74b8373 ·
  fixtures/save-v1.ts has a zero-line diff and the 1->2 migration is what carries it ·
  all five mutations of TICK_PHASES (runGuests dropped, duplicated, moved before
  applyCommands, moved after commitEntities, advanceTime first) fail both the suite and
  the I2 gate · an exhaustive search over all 1,365 phase sequences of length 0-5 WITH
  repetition leaves exactly one survivor, on a busy tick and on a quiet one · no gate,
  CI or config file modified.

  OBLIGATION DISCHARGED (ADR-0006): SAVE_SCHEMA_VERSION is 2 with a real 1 -> 2
  migration. The fixture was migrated, never regenerated.

  KNOWN OBLIGATION (ADR-0006): this goal adds fields to `World`, which will be rejected
  by the permanent v1 save fixture committed in G-003. That is deliberate. The correct
  response is to bump SAVE_SCHEMA_VERSION to 2 and write a real 1 -> 2 migration — not to
  regenerate the fixture, which would destroy the only thing it is for. Budget for it in
  PLAN. G-003's synthetic-chain tests already prove the runner handles gaps, duplicates,
  out-of-order steps and mid-chain throws, so the migration inherits a tested mechanism.

## G-005 — Append-only ledger and nightly settlement
Status: done
Milestone: M0
Owner pair: economy-engineer / balance-critic
Statement: Room revenue is recorded when a guest pays, upkeep is charged at nightly
  settlement, and the cash balance is derived by folding the transaction log.
Exit criteria:
  - pnpm exec vitest run ledger  and  pnpm exec vitest run settlement  (all green)
  - pnpm sim:run --days 30 --seed 3  reports a balance equal to the fold of its own
    transaction log, and one settlement transaction per simulated night
  - every transaction in a 30-day run carries a non-empty reason
  - all §2 invariant gates green (pnpm verify)
Out of scope: pricing controls, demand curves, reputation, wages, decay (M4)
  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  ledger 13 and settlement 18 tests green · sim:run --days 30 --seed 3 exits 0 with
  revenue 2269500p, upkeep -225000p, balance 2044500p, settlements 30 — all checked by
  hand against the closed form (267x8500, 30x3x2500, 297 = 267+30) · all six gates
  green, I2 hash be508c487d49fd6c · the appendTransaction choke point rejects an unknown
  reason, legacy free text, a float amount and negative zero, and accepts a valid
  transaction · balance-critic returned NO FINDINGS at any severity and re-ran the
  exhaustive phase search independently (19,530 sequences, one survivor).

  Balance-critic's standing-mandate report: 12 seeds x 1000 days produce byte-identical
  economies (balance 68,974,500p exact to the closed form at every sampled day), which
  is correct — the guest loop draws no randomness until M4 demand — and means the
  distribution mandate is VACUOUS until then. Recorded honestly rather than dressed up.
  Overflow headroom ~3.2x10^8 simulated years. The one testable exploit
  (demolish-before-midnight upkeep dodge) is unprofitable: -1,774,500p net over 100 days.

## G-006 — Day cycle and headless reporting
Status: done
Milestone: M0
Owner pair: sim-engineer / sim-critic
Statement: The CLI runs whole days end to end and reports the M0 loop — guests in,
  needs met and missed, money in and out — as a stable, machine-readable summary.
Exit criteria:
  - pnpm sim:run --days 365 --seed 42  completes in under 10s (pnpm sim:bench green)
  - pnpm sim:run --days 30 --seed 42  prints arrivals, satisfied, unsatisfied, revenue,
    upkeep and closing balance
  - two runs of the same command produce byte-identical stdout
  - all §2 invariant gates green (pnpm verify)
Out of scope: any renderer, any UI, speed controls (M5)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  the documented invocation `pnpm --silent sim:run --json` produces valid JSON (schema 1,
  parsed and field-checked) with 0 stderr bytes · --quiet through pnpm prints exactly the
  hash · two runs byte-identical in BOTH modes (cmp on raw bytes, 329-byte text report) ·
  the 30-day seed-42 report prints arrivals/satisfied/unsatisfied/revenue/upkeep/balance,
  state hash 69304c0f3a4fda83 · full suite 361/361 across 18 files · all six gates green,
  I2 unchanged at be508c487d49fd6c, I5 at 12.5% · packages/sim and tools/gates untouched
  by the entire goal.

  Round 1 findings (2 MAJOR, 1 MINOR, all fixed): the documented pnpm invocation
  prepended the pnpm banner to the JSON document — docs now carry --silent and a test
  spawns through pnpm itself, so the documented and tested paths are one circuit; the
  violations output path had never executed — now driven by five forged-world tests plus
  an injected-write ordering hook proving report-then-throw in all three modes; an error
  message read the flag name instead of its value.

---

## M0 exit — SIGNED OFF 2026-08-07

All six goals done. 9 commits, 12 critique rounds of 18 budgeted, 6 MAJOR + 3 MINOR
findings, zero BLOCKERs, zero budgets exceeded. All six gates green: I2
`be508c487d49fd6c`, I5 12.5%, 361 tests across 18 files.

Signed off with the explicit understanding that **M0 is not playable and cannot be as
scoped** — build and demolish are M1, pricing is M4, so no player decision exists yet.
§8's "playable-but-boring" arrives at M1. See `ESCALATIONS.md` for the reasoning.

---

# M1 — Structure

> Multi-floor grid, build and demolish commands, room validity rules (enclosed, has a
> door, has required items), construction cost. — `HOTELSIM.md` §8

**This is the milestone that makes the game playable.** M0 proved the loops run; M1
gives the player something to decide. The build loop is already visible in M0's numbers
— demand saturates near 6 rooms and overbuilding costs upkeep — but nothing can act on
it until build commands exist.

`apps/game` stays shut. The renderer is M5, four milestones away (§9).

## G-007 — Multi-floor grid and coordinates
Status: done
Milestone: M1
Owner pair: sim-engineer / sim-critic
Statement: The world has a multi-floor grid of cells; an entity occupies a known cell;
  positions are part of hashed, saved state and survive a round trip.
Exit criteria:
  - pnpm exec vitest run grid  (all green)
  - a save taken mid-run, reloaded, and advanced 1,000 ticks matches the unsaved run's hash
  - pnpm exec vitest run save  (green — the migration chain below)
  - all §2 invariant gates green (pnpm verify)
Out of scope: build/demolish commands (G-008); validity rules (G-009); pathfinding and
  vertical circulation (M3); anything drawn (M5)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  grid 57 tests / save 116 tests green · all six gates green, I2 964a195df576d979,
  I5 16.0% · SAVE_V1_CONTENT fingerprint unmoved at 8e09fe4f0fa162a3, so the plot did
  not leak into content · the fixture has a zero-line diff and walks 1->2->3 to
  ba7441406ce995bc, chain now 2 steps · one column moves the state hash · an idle tick
  still returns the same EntityStore AND grid by reference after two signature changes ·
  no gate, CI or config file modified.

  OBLIGATION DISCHARGED (ADR-0006): SAVE_SCHEMA_VERSION is 3 with a real 2 -> 3
  migration, and the permanent v1 fixture now exercises the first MULTI-STEP chain. Both
  links are pinned independently — a truncated [1->2] schema still reproduces G-004's
  hash f250ba1dc0a8c3e1 unmoved, so that pin stayed alive rather than being retired when
  the chain grew past it.

  I reproduced the round-1 MINOR's central claim myself by performing the actual
  deduplication refactor: 411 tests stayed GREEN and only the new source scan went red
  (3 tests). Because the scan runs inside `pnpm test`, `pnpm verify` catches it too — so
  the guard sits on the gate path, not merely in the suite.

  KNOWN OBLIGATION (ADR-0006): `World` gains the grid, so the permanent v1 fixture is
  rejected again. Bump SAVE_SCHEMA_VERSION to 3 and write a real 2 -> 3 migration; the
  fixture then exercises the **first multi-step chain, 1 -> 2 -> 3**. Do not regenerate
  it. G-003's runner already handles gaps, duplicates, out-of-order steps and mid-chain
  throws, and G-004 discharged the single-step case, so this is the first goal where the
  chain walk itself is load-bearing.

## G-008 — Build and demolish commands with construction cost
Status: done
Milestone: M1
Owner pair: sim-engineer / sim-critic
Statement: A host command places a room on the grid and charges its construction cost to
  the ledger; another removes it. Illegal placements are refused deterministically.
Exit criteria:
  - pnpm exec vitest run build  (all green)
  - pnpm sim:run --days 30 --seed 7 with a build schedule reports construction
    transactions and a balance equal to the fold of its own log
  - a build on an occupied cell, an out-of-bounds cell, or with insufficient cash is
    refused, and refusal is a recorded outcome rather than a throw
  - all §2 invariant gates green (pnpm verify)
Out of scope: any UI (M5); demand responding to capacity (M4); room variety (M6)
  (-> PARKING.md)
Critique rounds used: 3/3

  Verified by the orchestrator on 2026-08-07, every command run rather than reported:
  88 build tests and 519 total green across 24 files · all six gates green, I2
  4c90a16dd5203969 · SAVE_V1_CONTENT unmoved at 8e09fe4f0fa162a3 and the fixture ticks
  20,000 further ticks · the free-room content is rejected at load, exit 1, stdout 0
  bytes, both missing keys named · the build sweep reports 0 off-plot refusals at every
  cadence (1440/60/5) with construction transactions non-zero · fixture zero-line diff ·
  no gate, CI or config file in this commit.

  ROUND 1 (sim-critic), 1 MAJOR + 1 MINOR: the CLI build schedule reached only 420 of
  1,840 cells and advanced its index on refused commands, so past 417 commands every
  refusal was blamed on geometry when the constraint was cash. It would have lied to the
  very next reviewer. Fixed by walking the full plot and stopping at its edge via the
  sim's own isWithinBounds on the world's own grid; the claim is now a test.

  ROUND 2 (balance-critic), 5 MAJOR + 2 MINOR — the first non-vacuous sweep in the
  project, 107M penny spread across build strategies. Fixed here: required prices on
  disk (optional upkeep + construction made a free room strictly dominant with every
  gate green), and a false schema comment. Deferred with reasons: ADR-0009 (the refusal
  predicate tests affordability, not wisdom — the missing terminator is M4's), ADR-0010
  (nightlyRatePence is per completed stay; documented, not renamed), and PARKING.md for
  the rest.

  FOR THE HUMAN AT M1 SIGN-OFF: a zero-rooms / zero-balance world is an absorbing state
  with no exit and no notification, reachable in three legal commands from the shipped
  default. Closing it is a design call — starting capital, a demolition refund, or a
  loan — and all three are M4 territory.

  Construction cost is content (I3/ADR-0003), integer pence (ADR-0002), and lands in the
  ledger through a new `TransactionReason` member — the union and its choke point already
  make that structural.

  INHERITED OBLIGATION from G-007: **two entities may currently share a cell.** G-007
  placed positions on entities but wrote no occupancy rule, and pinned the overlap with a
  test so that changing it is a visible decision rather than a silent gap. Occupancy and
  overlap are this goal's to define. G-007 also draws the line you inherit: it made
  placement *structural* (required cell, throw on out-of-bounds — a caller bug); this
  goal makes placement a *player action* (cost, occupied-cell refusal, insufficient-cash
  refusal, and refusal as a recorded outcome rather than a throw).

## G-009 — Room validity rules
Status: done
Milestone: M1
Owner pair: sim-engineer / sim-critic
Statement: A room is valid only if it is enclosed, has a door, and holds its required
  items. An invalid room is not a provider, and the reason it is invalid is legible.
Exit criteria:
  - pnpm exec vitest run validity  (all green)
  - pnpm sim:run --days 30 --seed 7 --build <n> --demolish <m>  reports zero guests
    served by an invalid room, IN A RUN THAT PROVABLY CONTAINS INVALID ROOMS OF AT
    LEAST TWO REASONS  (flags fixed at BUILD; the same invocation is pinned in
    validity.report.test.ts so it runs under pnpm test whatever anyone types)
  - every invalidity reason is reachable by a test that constructs it
  - all §2 invariant gates green (pnpm verify)
Out of scope: item variety and item content beyond what a room requires (M6); staff (M4);
  multi-cell footprints (re-parked to M6 — the enclosure rule is per-cell, so extent
  refines a rule that already bites rather than supplying its substance)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-08, every command run rather than reported:
  validity 124 tests across 7 files green, 645 total · all six gates green, I2
  1b5fcd4cca759510, I5 27.4% · the sharpened criterion exits 0 with 22 unsupported and
  7 no-door rooms against 12 working ones, and `in bad room 0` · the sky tower is
  rejected transitively — 5 rooms built over nothing report 5 unsupported, where the
  local rule would have reported 1 · fixture zero-line diff, SAVE_V1_CONTENT unmoved,
  SAVE_SCHEMA_VERSION still 4, no migration owed.

  ROUND 1 (sim-critic), 2 MAJOR + 3 MINOR. The first MAJOR was mine as much as the
  builder's: the enclosure rule I approved at PLAN asked only whether A ROOM stood in
  the cell below, never whether that room was itself supported — so one sacrificial
  invalid room bought an arbitrarily tall tower of VALID providers floating in mid-air.
  Reproduced from the CLI: 95 rooms reported ok, 55 of which never reached the earth.
  Fixed as transitive support in one ascending-floor pass. The second MAJOR was a
  measurement, corrected in PARKING.md, not code.

  Criterion sharpened at PLAN (2026-08-07), on sim-engineer's own flag: the bare
  `--days 30 --seed 7` hotel is entirely valid, so "zero guests served by an invalid
  room" would have measured NOTHING — it is arithmetically true in a world containing no
  invalid rooms. The run must now contain them. This is the third criterion in the
  project to need sharpening for the same reason (`pnpm test -- world` at G-001, "balance
  equals the fold" at G-005); each was caught earlier than the last, and this one was
  caught by the builder before a line was written.

## G-010 — The bench simulates a real hotel, and tick cost stays linear
Status: done
Milestone: M1
Owner pair: sim-engineer / sim-critic
Statement: `sim:bench` measures a hotel of realistic size rather than a three-room toy,
  and tick cost grows linearly in room count rather than quadratically.
Exit criteria:
  - pnpm sim:bench green with the bench workload at 60 rooms or more
  - pnpm exec vitest run scaling  asserts tick cost at 100 rooms is under 6x tick cost
    at 25 rooms (4x rooms: linear is ~4x, quadratic would be ~16x)
  - all §2 invariant gates green (pnpm verify)
Out of scope: threading; spatial partitioning beyond what the measurement requires
  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-08, every command run rather than reported:
  all six gates green · I5 at the new 60-room workload 36.6-41.9% of budget (was 28.1%
  at three rooms BEFORE the optimisation) · scaling test green · 671 tests across 35
  files · I2 f8e9e51864851494 · SAVE_V1_CONTENT unmoved, fixture zero-line diff, no
  World field, no migration.

  The optimisation alone did NOT move the I2 hash (1b5fcd4cca759510 before and after) —
  the builder's own acceptance bar, and the strongest available proof that a performance
  change is behaviour-preserving. The hash moved only afterwards, deliberately, when the
  determinism log was strengthened to witness a cache-invalidation clause.

  Profile: validity was 58.9% of tick self-time and is now ABSENT from the profile;
  60 rooms x 120 days fell 6.39s -> 1.65s (3.9x). Scaling ratio 25->100 rooms: 5.49x
  pre-fix, 5.36x after the cache alone, 4.20x after the candidate-list work.

  CRITERION 1 IS MET BY ITS LETTER AND MEASURES LESS THAN IT APPEARS TO. The builder
  flagged this itself, before shipping: its own PLAN derivation of --arrivals 24 was
  arithmetically wrong (a 480-tick stay is a THIRD of a day, so one guest per room per
  day is 33% occupancy, not 100%), and I had accepted that derivation. It then ran the
  falsification test I had not asked for and found room count does not drive the bench's
  cost AT ALL — 20/60/120 rooms all cost the same — because the goal's own success made
  tick cost O(guests) rather than O(rooms). A busy 60-room hotel does not fit in 10s at
  any occupancy. Recorded in bench.mjs and PARKING.md rather than hidden; the
  room-scaling property the bench cannot see is measured by `vitest run scaling`, which
  ties arrivals to rooms so occupancy is constant.

  This is the parked I5 debt coming due, and it is scheduled inside M1 deliberately:
  M1 is the milestone that hands room count to the player, and `ai-critic` measured I5
  failing between 50 and 75 rooms (27.7s projected at 75). The bench being a three-room
  toy is why the gate is green while the game would be unplayable — fixing the workload
  is half the goal. Any room -> occupant index built here is DERIVED state: rebuilt on
  load, never saved, never authoritative (see PARKING.md for why).

---

## M1 exit — ESCALATED 2026-08-08, awaiting human sign-off

All four goals done. G-007 grid · G-008 build/demolish with construction cost ·
G-009 validity rules · G-010 the bench measures a real hotel. Loop stopped per §5.4;
M2 not started; `apps/game` untouched.

**The game is playable.** A player command places a room and charges for it, another
removes it, illegal placements are refused deterministically, invalid rooms serve nobody,
and the whole thing runs 60 rooms for a simulated year in under 4 seconds.

**SIGNED OFF by the human, 2026-08-08.** The dead-state design call was ruled at the same
time: all three closures approved (ADR-0011), scheduled as G-011 below.

---

# G-011 — The hotel can always recover

> Pulled forward from M4 by human ruling at M1 sign-off (ADR-0011). It sits ahead of M2
> because a reachable unrecoverable state is not something to build two milestones on top
> of. Economy work, so the economy pair owns it.

## G-011 — Starting capital, a loan, and a balanced demolition refund
Status: in-progress
Milestone: M1.5 (bridge)
Owner pair: economy-engineer / balance-critic
Statement: A hotel with no rooms and no cash can always return to play. The hotel opens
  with capital; demolishing a room returns a balanced fraction of its construction cost;
  and a loan is available when neither capital nor stock remains.
Exit criteria:
  - pnpm exec vitest run recovery  (all green)
  - pnpm sim:run --days 1000 --seed 7 --rooms 3 --demolish 1  ends with at least one
    room standing and at least one guest satisfied — i.e. the state ADR-0011 names as
    unrecoverable is provably no longer absorbing
  - the demolish-before-midnight upkeep dodge is PRICED and still unprofitable, by a
    test that computes it rather than asserts it (refund must sit meaningfully below the
    247,500p threshold that reopens it)
  - all §2 invariant gates green (pnpm verify)
Out of scope: bankruptcy / game-over as a state (M4); interest-rate tuning as a balance
  exercise (M4); demand response (M4); reviews (M2)  (-> PARKING.md)
Critique rounds used: 0/3

  Every monetary value here is content (I3/ADR-0003) and integer pence (ADR-0002). Each
  new money movement needs its own `TransactionReason` member — the closed union and its
  choke point make that structural. If `World` gains a field (a loan balance almost
  certainly is one), ADR-0006 applies: SAVE_SCHEMA_VERSION 5 and the permanent v1 fixture
  walking 1->2->3->4->5, never regenerated.

---

# M2 — Needs

> Full need vector, item-based provider registry, utility scoring, satisfaction over
> ticks, patience drain, reviews. Guests visibly succeed and fail. — `HOTELSIM.md` §8

Breakdown proposed by `ai-engineer` and adjudicated by the orchestrator, 2026-08-08.
Order: G-012 → G-013 → G-014 → G-015, with G-016 contingent on a number.
`apps/game` stays shut until M5 (§9).

**The single biggest vacuity risk in M2**: G-012 must ship a **second need type with a
second room-type provider**, or the "vector" has length one and every criterion
downstream inspects nothing. That is why the vector goal carries the second need rather
than the registry goal.

## G-012 — The need vector and its decay
Status: pending
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: A guest forms one instance of every need type the content defines, each with
  its own integer urgency that rises every tick and falls only while a provider serves
  it. A need that runs out of patience fails on its own and is recorded; it does not end
  the stay. A guest holds its lodging room for the whole stay and engages one provider
  at a time.
Exit criteria:
  - pnpm exec vitest run needs  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  prints a per-need-type table in which at
    least TWO DIFFERENT need types have a non-zero met count AND a non-zero unmet count
  - a case stepping one guest 100,000 ticks asserts its urgency equals a stated closed
    form EXACTLY (integer arithmetic — a float or a repeated non-integer add fails it)
  - the run reports zero stuck guests and zero orphaned reservations, where
    countOrphanedReservations inspects BOTH reservation fields and a test constructs a
    leak of each shape and watches it return 1
  - pnpm sim:bench green, reading recorded in this block
  - all §2 invariant gates green (pnpm verify)
Out of scope: utility scoring and hysteresis (G-014); items as providers (G-013);
  reviews and the outcome table (G-015); archetypes choosing WHICH needs (M6); party
  size (M6); movement between providers (M3)  (-> PARKING.md)
Critique rounds used: 0/3

  RULED AT SEEDING — the lodging/engagement split is APPROVED, with a condition.
  Without it a guest that leaves its room to satisfy a second need loses the room to the
  next arrival and can never finish its stay: a starvation bug introduced BY the vector,
  so it belongs to the vector's goal. It re-opens the reservation-leak class G-004 closed
  by construction, which is the price.
  **CONDITION: both reservations stay FIELDS OF THE GUEST. No back-pointer from a room
  or an item to a guest, ever.** That is what preserves "a despawned guest cannot hold
  anything because it no longer exists", and it is the property, not the field count,
  that closed the class. Criterion 4 makes the re-opening loud.
  Payment stays at payForStay on the lodging room (ADR-0010); M2 does not touch money.
  Progress is retained, not reset, when a guest stops being served.

  THIS IS THE FATTEST GOAL YET — vector, decay, per-need patience, per-need outcome, and
  the split. Accepted on the argument that splitting it ships "a vector of length one
  wearing a longer type". If PLAN comes back oversized, I will split it then.

  MIGRATION OWED (ADR-0006). Defaults are argued, not chosen: a v-previous world is not
  one whose extra needs were omitted, it is one in which those needs did not exist.

## G-013 — The item-based provider registry
Status: pending
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: A need is satisfied by a provider, and a provider is a room type or an item
  type. An item provides only while it stands inside a valid room. Content declares
  which provider satisfies which need; the simulation refuses to load content in which a
  need has no provider a player can actually reach.
Exit criteria:
  - pnpm exec vitest run provider  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  reports, per need type, satisfactions
    delivered BY AN ITEM and BY A ROOM, and both are non-zero
  - content declaring a need whose only provider is an item that NO room type requires
    is REFUSED at bindContent, naming the need — because until placeItem exists (M6) no
    player command can put that item in the world
  - demolishing the room an engaged item stands in releases the engagement, proven by a
    test that constructs that world and watches the count go to zero
  - all §2 invariant gates green (pnpm verify)
Out of scope: placeItem / removeItem (M6); item cost, quality, decay (M6); a provider
  serving more than one guest at once (M3 — that is a queue with capacity 2, and M3's
  statement is literally queued shared resources); travel to a provider (M3)
Critique rounds used: 0/3

  Criterion 3 is the most valuable line in the M2 proposal. bindContent today asks "does
  some room type's provides name this need". Extended naively to items it would accept a
  need whose only provider is an item nothing puts in the world — a check succeeding
  while inspecting nothing a player can reach, with pnpm verify green. It must be
  strengthened from DECLARED to REACHABLE.

  No migration owed — the engagement field arrives with G-012, an item is already an
  Entity, and the registry is content plus lookup. The content fingerprint moves, which
  invalidates saves; that price was accepted at G-002.

## G-014 — Utility scoring, and a guest that commits
Status: pending
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: A guest chooses which need to pursue and which provider to use by a score
  over urgency and provider fit, tie-broken by lowest entity id. A guest that has
  committed does not abandon unless an alternative beats it by a content-defined margin,
  and abandonments are a reported outcome.
Exit criteria:
  - pnpm exec vitest run utility  (all green)
  - pnpm sim:run --days 30 --seed 7 <flags fixed at BUILD>  reports abandonments per
    guest below <n>, IN A RUN THAT PROVABLY CONTAINS AT LEAST TWO PROVIDERS OF THE SAME
    NEED SCORING WITHIN THE MARGIN OF EACH OTHER (same invocation pinned in a test)
  - setting the hysteresis margin to zero turns a named test RED, and that test is the
    ONLY one that goes red (verified by mutation — the G-010 bar)
  - two providers scoring EXACTLY equal choose the lower entity id, asserted on TWO
    different insertion orders (one order cannot distinguish "lowest id" from "first found")
  - the same run reports zero stuck guests
  - all §2 invariant gates green (pnpm verify)
Out of scope: distance or travel time as a score term (M3 — there is no movement yet);
  reputation or price as terms (M4); archetype-varying weights (M6)
Critique rounds used: 0/3

  I2 CANNOT WITNESS THRASHING. The gate holds no reference hash (G-010's finding), and a
  scorer that thrashes identically every run passes it. The counter is the witness, not
  the gate.
  Migration owed only if the abandonment counter cannot be derived. If the builder finds
  a way to derive it, the migration is dropped and that is a win worth recording.

## G-015 — Reviews and the outcome table
Status: pending
Milestone: M2
Owner pair: ai-engineer / ai-critic (round 1) · ai-engineer / balance-critic (round 2)
Statement: A departing guest leaves an integer review derived from its own recorded
  experience: which needs were met, how long it waited against its patience, and whether
  its stay was cut short. The four outcome counters become a table by reason. The review
  is recorded and reported; nothing reads it.
Exit criteria:
  - pnpm exec vitest run review  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  prints a review distribution with at
    least THREE distinct scores non-zero, and an outcome table with at least FOUR
    distinct reasons non-zero
  - --rooms 1 and --rooms 12 produce review distributions whose means differ by more
    than <n>, COMPUTED BY THE TEST rather than asserted — a hotel that serves nobody
    must not review the same as one that serves everybody
  - the outcome table's total still equals arrived - live, and a test deletes one row
    and watches the conservation law throw
  - no sim module reads the review store — the boundary made mechanical, not documented
  - all §2 invariant gates green (pnpm verify)
Out of scope: reputation as a stateful aggregate; reviews feeding demand, pricing or
  arrival rate (ALL M4); review text (M5/M6)
Critique rounds used: 0/3

  RULED AT SEEDING — balance-critic takes round 2. §6 pairs one critic per builder, but
  G-008 ran sim-critic then balance-critic and that second round was the best critique in
  the project. A review scale that saturates for any hotel that opens the door is a
  dominant-strategy failure wearing a guest-loop costume, and ai-critic's catalogue does
  not hunt it. The differential criterion (1 room vs 12) is the one that cannot be faked
  and is the answer to "guests visibly succeed and fail" not being a command.
  Migration owed; SUMMARY_SCHEMA_VERSION bumps to 2 — the outcome table REPLACES four
  counters, which is the breaking kind of change, not the additive kind report.ts permits.

## G-016 — Guest-loop cost under a need vector
Status: parked — CONTINGENT, triggered by a number
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: The guest loop's per-tick cost stays inside the I5 budget when every guest
  carries the full need vector and every need has competing providers.
Exit criteria:
  - pnpm sim:bench green with the shipped M2 content
  - pnpm exec vitest run scaling  asserts cost at N needs per guest is under <k>x cost
    at 1 need, AT FIXED CONCURRENT GUEST COUNT (the honest axis — G-010 made tick cost
    O(guests), and --rooms 20/60/120 all cost the same)
  - the optimisation does not move the I2 state hash (the G-010 acceptance bar)
  - all §2 invariant gates green (pnpm verify)

  TRIGGER: promote to pending if, after G-014, pnpm sim:bench exceeds 70% of the I5
  budget or the needs-scaling ratio exceeds its bound. Otherwise it stays parked and the
  readings go in PARKING.md. Per G-004: optimising against a gate that is not failing is
  speculative work.

---

## M2 exit — human sign-off required

When G-012 to G-015 are `done` (and G-016 if triggered), that is a §5.4 escalation.
Write it to `ESCALATIONS.md` and stop.
