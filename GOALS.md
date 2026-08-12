# GOALS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-10, G-019 done. M2: 13 of 13 goals — COMPLETE, pending sign-off. Unreliable: 1 gate, 1 defect (I4).*

- **Schemas**: save **v9** · summary **v2** · I2 `10926cc3b569c887`. **`verify` runs ELEVEN
  rows**: six invariants, `typecheck`, and four `—` rows (`check:measure`, **`check:tickcost`**,
  `check:tickcost:proof`, **`check:scaling`**) that are **not** invariants — a seventh is a human
  call. **I4 UNRELIABLE (§2.0), now 1 defect**: A repaired, **B diagnosed and unrepaired**.
  Eleven green ×2 at G-020c VERIFY. **The ladder is CONTENT**; `budget.mjs` derives I5 from it.
- **Tripwire** `BOUND 1.4557`, ADR-0015. **`maxWorkers: 2` REMOVED as measured-ineffective** —
  the discriminator is load, not worker count. **Order**: **G-019 LAST, two critics** → M2 exit.
- **Owed by the human**: M2 exit sign-off — the digest experiment scored **both ways** (four
  failures), the unreliable count **with its noun**, the bimodal recording **watched**, **I4's
  defect B accepted-or-held**, and **a git remote: CI has NEVER run.**
- **Owed by goals**: G-019 the second axis (amenity density at fixed rooms), without which its
  headline criterion misses three-quarters of the need vector · **M4 blocked on scenario
  capital.**
- **Open contradictions**: G-012's criterion pins a content property any provider can flip ·
  `--rooms N` contaminates every balance sweep · seeds inert until M4. **Not the ladder — settled.**

---

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
Critique rounds used: 3/3 (sweeps) + 3 verifications, none of which converted

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
  - pnpm sim:run --days 365 --seed 42  completes ~~in under 10s~~ inside the budget
    (pnpm sim:bench green; the 10s was invented and was re-derived at G-018)
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
  I2 unchanged at be508c487d49fd6c, I5 at ~~12.5%~~ (withdrawn G-018) · packages/sim and tools/gates untouched
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
`be508c487d49fd6c`, I5 ~~12.5%~~ (withdrawn G-018), 361 tests across 18 files.

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
  I5 ~~16.0%~~ (withdrawn G-018) · SAVE_V1_CONTENT fingerprint unmoved at 8e09fe4f0fa162a3, so the plot did
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
  1b5fcd4cca759510, I5 ~~27.4%~~ (withdrawn G-018) · the sharpened criterion exits 0 with 22 unsupported and
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
  all six gates green · I5 at the new 60-room workload ~~36.6-41.9% of budget (was 28.1%
  at three rooms BEFORE the optimisation)~~ (withdrawn G-018) · scaling test green · 671 tests across 35
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
  tick cost O(guests) rather than O(rooms). ~~A busy 60-room hotel does not fit in 10s at
  any occupancy.~~ (G-018: true of the invented budget, false of the derived one — a busy
  60-room hotel fits it several times over.) Recorded in bench.mjs and PARKING.md rather than hidden; the
  room-scaling property the bench cannot see is measured by `vitest run scaling`, which
  ties arrivals to rooms so occupancy is constant.

  This is the parked I5 debt coming due, and it is scheduled inside M1 deliberately:
  M1 is the milestone that hands room count to the player, and `ai-critic` measured I5
  ~~failing between 50 and 75 rooms (27.7s projected at 75)~~ (withdrawn G-018 — that
  projection failed the invented budget and is ~7% of the derived one). The bench being a
  three-room toy is why the gate is green ~~while the game would be unplayable~~ — and
  **G-018 refutes that second clause outright**: 27.7s per 365 SIMULATED days is 52.7us per
  tick, which at 30 ticks/s is 1.58ms of work per real second — **0.158% of one core** at
  the fastest play speed, so the game was never unplayable there.
  The gate and the game had come apart in the opposite direction from the one this block
  assumed, which is the whole reason the budget was re-derived. Fixing the workload
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
Status: done
Milestone: M1.5 (bridge)
Owner pair: economy-engineer / balance-critic
Statement: A hotel with no rooms and no cash can always return to play. The hotel opens
  with capital; demolishing a room returns a balanced fraction of its construction cost;
  and a loan is available when neither capital nor stock remains.
Exit criteria:
  - pnpm exec vitest run recovery  (all green)
  - A, recovery is real:  pnpm sim:run --days 1000 --seed 7 --rooms 0 --build 1440
    --loan 1440  ends with rooms.valid >= 1 AND guests.satisfied >= 1 AND revenue > 0
  - B, the state is not absorbing:  the same plus --demolish 1440  ends with built > 0,
    demolitionRefund > 0, loans.drawn > 0, AND builds still succeeding IN THE FINAL TEN
    DAYS — the player can still act at tick 1,440,000 having repeatedly returned to zero
    rooms and zero cash
    (exact cadences fixed at BUILD by measurement; both pinned in recovery.report.test.ts)
  - the demolish-before-midnight upkeep dodge is PRICED and still unprofitable, by a
    test that computes it rather than asserts it (refund must sit meaningfully below the
    247,500p threshold that reopens it)
  - all §2 invariant gates green (pnpm verify)
Out of scope: bankruptcy / game-over as a state (M4); interest-rate tuning as a balance
  exercise (M4); demand response (M4); reviews (M2)  (-> PARKING.md)
Critique rounds used: 1/3

  Verified by the orchestrator on 2026-08-08, both 1,000-day criteria run at full length
  rather than replayed short: A -> 23 valid rooms, 11,831 satisfied, 100,563,500p revenue.
  B -> 1,000 built, 1,000 demolished, 499 loans drawn, 125,000,000p refunded, and ZERO
  insufficientFunds refusals across the entire run, so builds still succeed at the end.
  All six gates green, I2 331604a67c725a7a, I5 ~~35.1%~~ (withdrawn G-018). The refund-0 credit line is refused
  at load, exit 1, stdout empty. Fixture zero-line diff, SAVE_V1_CONTENT unmoved.

  ROUND 1 (balance-critic): 3 MAJOR, 3 MINOR, all fixed.
  - THE DODGE GUARD WAS ONE-SIDED. I asked whether content could dodge and still load,
    and approved a guard bounding the refund from ABOVE. Nobody asked the mirror
    question — and the refund is the loan's ONLY brake, because eligibility rests on
    liquidation value. At a refund of 0 (a documented legal designer choice) drawLoan
    became an unbounded credit line: 1,602 loans and 480,600,000p in FIVE simulated days
    from one changed content field. Now bounded both ways by assertStockIsAReserve
    against a new `liquidationRoomsMax`, stated in the units a designer thinks in.
  - A QUADRATIC FOLD, of the class G-010 spent a goal removing and this goal's own I5 fix
    removed from settlement earlier in the same build. --loan 1 at 365 days cost 23,534ms, ~~235%
    of budget~~ — 6.6x the same build's own paired 3,552ms, which is the ratio that
    carried the finding and the form G-018 leaves standing. Worse than diagnosed: removing the ledger re-fold only halved it, and
    the residue was G-008's once-per-tick balance fold, accepted on "builds are rare by
    construction" — TRUE UNTIL A LOAN, which has no position and so nothing to run out of.
    Fixed by memoising the fold outside state (the one concession I4 names), verified
    against G-010's bar: memo off and memo on hash identically.
  - THE MONEY-MINTING CONTAINMENT ARGUMENT WAS A COMMENT, NOT A MECHANISM. No player path
    exists today, so it holds — but it is not free. See the note below.

  ADR-0011'S ORIGINAL REPRODUCTION NO LONGER REPRODUCES, FOR TWO REASONS, AND BOTH ARE
  RECORDED HERE BECAUSE A DEAD STATE WE CANNOT DEMONSTRATE IS ONE WE CANNOT PROVE WE
  CLOSED. First, `--rooms 3 --demolish 1` issues no build command, so no room could ever
  be placed under it — the criterion was unreachable by ANY implementation, and I wrote it
  while explicitly warning about that shape three goals running. Second, the goal itself
  invalidated it: seeded rooms are spawned free but refunded at 50%, so that invocation now
  ends at 875,000p rather than 0p. The three measured HEAD baselines stand in its place.

  MY RULING ON THE MINTING FIX WAS WRONG AND THE BUILDER MEASURED IT RATHER THAN FORCING
  IT. Seeding `--rooms` through buildRoom needs capital to cover it, but capital is one
  content constant while --rooms is per-invocation: at 500,000p every N collapses to 2
  rooms, which would undo G-010's entire goal at the 60-room bench. Shipped instead: the
  hidden capital is now visible as `scrap value` beside `capital` in the report, and it is
  exactly the term canDrawLoan adds. Closing it properly needs a scenario-capital
  mechanism -> PARKING.md.

  Every monetary value here is content (I3/ADR-0003) and integer pence (ADR-0002). Each
  new money movement needs its own `TransactionReason` member — the closed union and its
  choke point make that structural. If `World` gains a field (a loan balance almost
  certainly is one), ADR-0006 applies: SAVE_SCHEMA_VERSION 5 and the permanent v1 fixture
  walking 1->2->3->4->5, never regenerated.

  ### ADR-0011's ORIGINAL REPRODUCTION NO LONGER REPRODUCES, FOR TWO REASONS

  Recorded because a dead state we can no longer demonstrate is a dead state we cannot
  prove we closed. `--days 1000 --seed 7 --rooms 3 --demolish 1` was the three legal
  commands from the shipped default that reached the absorbing state — 12,000 guests
  arrived, 11,999 unsatisfied, every player action refused, balance 0p. It fails as a
  repro today for two INDEPENDENT reasons, and only the first was in the criterion rewrite:

  1. **It contains no `--build`.** `schedule()` emits build commands only under
     `buildEveryTicks > BUILD_OFF`, so no command in that run can ever place a room. It
     was unmeetable by a correct implementation, a broken one, and any other — which is
     why criteria A and B replaced it. Found by `economy-engineer` at PLAN.

  2. **THE GOAL INVALIDATED IT.** The same invocation now ends with **875,000p** in the
     bank: 500,000p of opening capital plus 375,000p of refunds for the three inherited
     rooms it scraps. There is no longer a zero-cash zero-room state at the end of it to
     be absorbed by. Found by `balance-critic` at critique round 1; it is the goal working,
     but it means the original evidence cannot be re-run to show the contrast.

  **What stands in its place.** Three HEAD baselines, measured on the build immediately
  before this goal and pinned as literals in `recovery.report.test.ts`: `--rooms 3
  --demolish 1`, `--rooms 3 --demolish 1 --build 1440`, and `--rooms 0 --build 1440`, all
  four fields zero — 0 built, 0 satisfied, 0 valid rooms, 0 entities — with a player
  trying to build every day for a thousand simulated days and being refused every time.
  Those are the absorbing state, and criteria A and B are what they discriminate against.

  **The second reason also carries a live cost, and it is not fixed.** `--rooms N` seeds
  its hotel through `spawnEntity`, which is free, so seeded stock is seeded CASH at the
  refund rate. `--rooms 3` carries 375,000p of it against a `startingCapitalPence` of
  500,000p. Seeding through `buildRoom` instead was measured and does not work: capital is
  one content constant while `--rooms` is a per-invocation variable, so `--rooms 60` (the
  I5 bench) would need 15,000,000p and collapses to 2 rooms at the shipped figure —
  undoing G-010. The report now PRINTS the scrap value beside the capital
  (`money.liquidationValuePennies`) so nobody sizes one without seeing the other.
  Closing it properly needs a scenario-capital mechanism. -> `PARKING.md`.

---

# M2 — Needs

> Full need vector, item-based provider registry, utility scoring, satisfaction over
> ticks, patience drain, reviews. Guests visibly succeed and fail. — `HOTELSIM.md` §8

Breakdown proposed by `ai-engineer` and adjudicated by the orchestrator, 2026-08-08.
Order: G-012 → G-013 → G-014 → G-015, with G-016 contingent on a number.
`apps/game` stays shut until M5 (§9).

**RE-PLANNED 2026-08-08 after the human's observability ruling (ADR-0013).** G-016 fired
and is done. Two goals are inserted ahead of G-014:

> **G-012 ✓ → G-016 ✓ → G-013 → G-018 → G-017 → G-014 → G-015 → G-019 → M2 exit**

**RE-PLANNED AGAIN 2026-08-08 after G-013's escalation.** The old G-015 is split in two
(G-015 outcome table + schema 2, `sim-critic`; G-019 reviews + differential criterion,
`balance-critic`) along the seam its own block had drawn without noticing. **G-014 gets
the §5.5 seam question at PLAN before G-015's does, because it arrives first** — utility
scoring, a mutation-verified hysteresis margin, id tie-breaking across two insertion
orders, an abandonment counter and a conditional migration is not obviously thin.

- **G-018 first, and this is my call rather than the human's** — the ruling says the
  viewer goes "before G-014" and does not order these two against each other. G-018
  changes no simulation code, so it cannot destabilise anything, and every goal after it
  quotes an I5 percentage. Putting it last means three more goals record readings against
  a number we have already agreed is invented. It also gives G-017's "`sim:bench`
  unchanged" criterion a stable budget to be measured against rather than one that moves
  underneath it. Reversible if the human would rather see the viewer sooner.
- **G-017 after G-013, which the ruling already implies** ("stop at the end of the current
  goal") and which is independently right: the viewer reads recorded frames through the
  save serialiser, and G-013 takes that serialiser to v7. Built before G-013 it would be
  built against v6 and immediately need rewriting.
- M2's statement contains the word **"visibly"**. It is no longer discharged by the review
  distribution alone — M2 exit now requires WATCH observations in `JOURNAL.md`.

**The single biggest vacuity risk in M2**: G-012 must ship a **second need type with a
second room-type provider**, or the "vector" has length one and every criterion
downstream inspects nothing. That is why the vector goal carries the second need rather
than the registry goal.

## G-012 — The need vector and its decay
Status: done — unblocked by G-016. 1 critique round (2 MAJOR + 5 MINOR, all resolved).
  Verified by the orchestrator: all six gates green, I5 ~~61-63%~~ (withdrawn G-018), I2 6c3e1baa8b87d2f6,
  SAVE_V1_CONTENT unmoved, fixture zero-line diff, 1,000 tests across 51 files.

  HUMAN RULING, ADR-0012: the vector is **at least Comfort, Entertainment and
  Nourishment**. That settles M2's biggest vacuity risk by decision rather than by a
  builder choosing how hard its own criteria are — and it FORCES provider content in this
  goal, because bindContent refuses a need with no provider and items do not become
  providers until G-013.
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
Status: **done** — 3 critique rounds (3 MAJOR + 5 MINOR across sweeps, 2 MAJOR on the
  unbudgeted verification) + 1 verification pass. **ESCALATED at 3/3 and resolved by the
  human: land it, do not split.** Verified by the orchestrator: all six gates green, I5
  ~~78.4%~~ (withdrawn G-018), I2 `4b8db9b1ac36cb35`, `SAVE_V1_CONTENT` unmoved at `8e09fe4f0fa162a3`, fixture
  zero-line diff, 1,095 tests across 58 files, no gate/CI/config file touched.
  Save schema **v7**. `SUMMARY_SCHEMA_VERSION` stays 1.

  **WATCH DEBT OUTSTANDING — discharged at G-017, not here.** This goal changes guest
  behaviour and the viewer does not exist yet (`HOTELSIM.md` §5, ADR-0013). It is G-017's
  first subject.

  **NINE INSTANCES OF ONE DEFECT CLASS, AND THE COUNT NEEDS ITS CONFOUND STATED**
  (ADR-0007 as amended): three were self-caught by the builder before any critique, which
  is discipline that did not exist for most of the first thirteen goals. Detection
  sensitivity has risen, so this is not like-for-like against the project's earlier seven.
  **And the sweep reached exhaustion only at round 3** — read 3/3 as a near miss, not as
  comfort.

  **THE SEAM WAS OFFERED AT PLAN AND I DECLINED IT IN ONE LINE WITH NO COST RECORDED.**
  That is the case that produced §5.5 and §5.6. Written as a prediction it would have read
  "expected cost: more checkable surface than one critic pass can vet", and would have been
  legibly wrong. G-014 runs the seam question first.

  INHERITED FROM G-016's critique: `needs.scaling.test.ts` holds need count and
  concurrent guests still but NOT provider density — the shipped hotel is starved (one
  of each amenity against ~15 guests) so most per-need work short-circuits through
  `exhausted` without walking a candidate list. **This goal multiplies provider density
  without touching need count, so both existing arms move together and the ratio can sit
  still while absolute cost climbs.** Do not read 1.74x against the 2.5x bound as
  headroom. A third arm varying density at fixed need count is owed here.
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: A need is satisfied by a provider, and a provider is a room type or an item
  type. An item provides only while it stands inside a valid room. Content declares
  which provider satisfies which need; the simulation refuses to load content in which a
  need has no provider a player can actually reach.
Exit criteria:
  - pnpm exec vitest run provider  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  reports satisfactions delivered BY AN ITEM
    and BY A ROOM: the by-item TOTAL is non-zero, the by-room TOTAL is non-zero, and AT
    LEAST ONE need type has both non-zero — with a NEGATIVE CONTROL (the same invocation
    against content in which no item provides anything reports by-item zero), so the
    positive number is a measurement and not a constant.  [REWRITTEN AT PLAN — see below]
  - pnpm exec vitest run scaling  green, with a PROVIDER-DENSITY arm at fixed need count
    and fixed concurrent guests, its bound fixed at BUILD by paired interleaved
    measurement (`CLAUDE.md` §measuring; the bound must be sourced — `HOTELSIM.md` §2.1)
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

  ~~No migration owed~~ — **WRONG, corrected at PLAN. A v7 migration IS owed.** The
  seeding note reasoned about the *registry* (content plus lookup, an item is already an
  Entity) and never looked at **criterion 2**, which cannot be derived from final state:
  the engagement is released the moment a need resolves, so by departure nothing remembers
  who served it. `NeedState` gains `metBy: 'room' | 'item' | null` and the outcome row
  gains `metByItem` (by-room stays DERIVED as `met - metByItem`, so it cannot drift).
  `SAVE_SCHEMA_VERSION` 6 → 7; the fixture walks 1→2→3→4→5→6→7 with a zero-line diff.
  The migration's defaults are ARGUED FROM THE ERA, not chosen (ADR-0008): in the v6 era
  items were not providers, so every recorded satisfaction *was* a room's — `metBy` is
  `'room'` for a met need and `metByItem` is 0. Exactly true, not a guess.
  **And it must not be tested by the fixture alone** — the v1 fixture has zero guests and
  no tally rows, so v6→v7 would run over nothing (ADR-0007's exact shape). A synthetic v6
  world with a met need and a populated tally is watched through the step.
  The rejected alternative is recorded so it is not re-proposed: counting deliveries at
  the moment of satisfaction needs no per-tick field, but its migration cannot be made
  exactly true — a v6 world's past deliveries are unrecoverable from its bytes, so a
  migrated save would report a violated law.
  The content fingerprint moves, which invalidates saves; that price was accepted at G-002.
  `SUMMARY_SCHEMA_VERSION` stays 1 — the need rows gain fields and none is renamed or
  removed. G-015 owns the bump.

  ---
  RULED AT PLAN, 2026-08-08 — three questions `ai-engineer` raised before writing a line.

  1. **Criterion 2 was unmeetable as written, and is rewritten above.** "Per need type,
     both non-zero" cannot hold: the lodging need is room-served by construction (nothing
     can sleep in a vending machine), so no correct implementation could ever satisfy it.
     **Fifth criterion in this project of the class ADR-0007 names** — after `pnpm test --
     world` (G-001), "balance equals the fold" (G-005), "zero guests served by an invalid
     room" (G-009), and `--rooms 3 --demolish 1` with no `--build` (G-011). This one was
     caught BEFORE the build rather than after, by the builder, which is the first time
     that has happened. The replacement is strictly harder than a total-only form because
     of the negative control.
  2. **The scaling arm now has an exit criterion** (added above). The debt was inherited
     from G-016's critique and no criterion named it, so it could have been skipped with
     every gate green — the same class again, one level up.
  3. **The migration is owed** — see the correction above.

  ALSO RULED: this goal stays WHOLE despite being fat. The clean seam is criterion 2's
  reporting, but splitting it puts a v7 migration in a goal with no behaviour to migrate,
  and the bulk here is test surface rather than mechanism.

  **WATCH DEBT (`HOTELSIM.md` §5, ADR-0013).** This goal changes guest behaviour and the
  viewer does not exist yet. It commits with the debt recorded and is the FIRST subject of
  G-017's viewer — which is a better first subject than an old goal, because the behaviour
  will be fresh. The debt is discharged by a WATCH entry in `JOURNAL.md` at G-017, not by
  a green tick here.
  ADR-0013's "no new `World` field, no migration, no fingerprint movement" binds **G-017**,
  not this goal. The viewer must not CAUSE one; it does not forbid one that already exists.

## G-018 — I5's budget, derived from a requirement instead of invented
Status: **done** — 3 sweeps + 2 verification passes, one of which converted and escalated;
  resolved by the human ("go for it"). 2 MAJOR + 3 MINOR, then 2 MAJOR + 4 MINOR + 1 NIT,
  then 2 MAJOR + 4 MINOR, then 1 MAJOR + 2 MINOR. Zero BLOCKERs.
  Verified by the orchestrator: six gates green; I2 `4b8db9b1ac36cb35`; 1,109 tests / 59
  files; `git diff HEAD --name-only` touches **0 files under `packages/`**; the derivation
  recomputed independently — `525,600 x 0.10 / (30 x 4.5) = 389.33s`, and `budget.mjs`
  exports `389333.33`; the gate prints `2.0% of the derived 389333ms budget`.

  **EVERY ONE OF THE FOUR ROUNDS FOUND A DEFECT IN THE EVIDENCE RATHER THAN THE CODE, AND
  THREE WERE INSIDE THE FIX FOR THE PREVIOUS ONE.** That is the honest headline of this
  goal, more than the number is.
Milestone: M2 (charter maintenance — inserted by ADR-0013 §4)
Owner pair: sim-engineer / sim-critic
Statement: The I5 budget is derived from what the game needs — a 60-room hotel at the
  fastest intended play speed sustaining real-time on a mid-range laptop, times a stated
  headroom multiple for the systems M3, M4 and M6 will add. The derivation is written
  down, the resulting budget replaces the invented ten seconds, and every recorded I5
  figure in the ledgers is re-baselined against it.
Exit criteria:
  - the derivation is written into `HOTELSIM.md` §2.1 as arithmetic a reader can check:
    ticks per simulated day × days × the play-speed multiple → a tick budget in
    nanoseconds → a 365-day wall-clock budget, with the headroom multiple STATED AND
    JUSTIFIED rather than rounded to a nice number
  - `tools/gates/bench.mjs` reads the budget from ONE named constant with the derivation
    cited beside it; `pnpm sim:bench` green
  - every I5 figure recorded in `GOALS.md`, `JOURNAL.md` and `PARKING.md` is restated as a
    percentage of the NEW budget, or struck through where it cannot be re-measured
    (`CLAUDE.md`: withdraw rather than restate — the G-016 lesson)
  - **`git diff --stat` touches no file under `packages/`** — this commit changes no
    simulation code, and that is mechanically checkable, not a promise
  - the I2 state hash is unmoved
  - all §2 invariant gates green (pnpm verify)
Out of scope: any optimisation (the sampling lever stays pinned and unpulled — G-016);
  changing any other gate's threshold in the same commit; a per-platform budget
Critique rounds used: 3/3

  THE HUMAN'S OWN WORDS: *"Ten seconds for 365 simulated days was invented at bootstrap
  with no basis, and it is now promoting goals."* G-016 exists solely because of it.

  **THE ANSWER: 389,333ms, AND THE TEN SECONDS WAS ~39x TIGHTER THAN ANYTHING THE GAME
  NEEDS.** Derivation in `HOTELSIM.md` §2.1.2, executed rather than quoted by
  `tools/gates/budget.mjs` (which `bench.mjs` imports) and pinned by
  `pnpm exec vitest run bench.budget`. The bench
  measures **7,697ms — 1.98% of the derived budget** (median of 5 after a discarded
  warm-up, one sitting, `--rooms 60 --arrivals 32 --amenities 1`, this machine).

  **THE ORDER OF OPERATIONS WAS THE POINT, AND IT IS AUDITABLE.** §2.1.2 and the constant
  were written and committed to before `pnpm sim:bench` was run once in this goal; the
  derivation's inputs are 1440, 365, 30 ticks/s, a CPU share and a headroom multiple, and
  not one of them is a measurement of this build. The builder's expectation was recorded
  in the plan BEFORE the arithmetic — "~2% of the derived budget, the ten seconds ~39x
  tighter than any requirement" — and both held.

  **THE PLAY-SPEED LADDER IS PROVISIONAL, NOT MINTED, AND M5 DOES NOT INHERIT IT AS
  SETTLED** (§2.1.1): 30x is 30 ticks per real second, a simulated day in 48 real seconds.
  Nothing in the repo had fixed it and this goal proposed fixing it; **the human declined
  to ratify.** The reasoning is better than the builder's and is recorded in §2.1.1: the
  tell is the BOTTOM rung, not the top — 24 real minutes per simulated day at 1x means
  nobody will ever play at 1x, and a ladder whose lowest rung is dead is one speed with
  decoration below it. "One tick is one in-game minute" is sound and is the charter's;
  mapping that minute onto a real SECOND is a separate choice that inherited its
  justification by adjacency, which is aesthetic tidiness rather than a design finding.
  The ladder's home is **content** (I3) and it is **G-021's**, before M5; **G-017's viewer
  is where 48s is confirmed or moved**, being the first question a watching human can
  actually answer. **The budget is not provisional because the ladder is** — though it IS
  inversely proportional to it, so G-021 re-derives the constant: 389.3 / 12 = 32.4s, so a
  ladder change within ~12x keeps the budget at least 2.5x the ten seconds. That is a
  division, not a reading off the sensitivity table, which varies S and H rather than the
  ladder and reaches only 5x from the shipped cell. **The rejected
  alternative is recorded beside it**
  because it is the one that would have validated the incumbent: "30x = 30 ticks per
  rendered FRAME" yields 1800 ticks/s and a budget of ~13.5s, within a rounding error of
  the ten seconds. It is refused because a per-frame speed is the defect §6.1 already
  names ("runs faster on a 144Hz monitor"), and because 0.8 seconds per simulated day is
  a fast-forward button rather than a speed at which a hotel can be watched.

  **WHAT THIS MAKES I5** (§2.1.3): the load-bearing word is HEADLESS, and the time bound
  is a **sanity ceiling, not a regression tripwire**. The tripwire this project has
  actually used for eighteen goals is a paired ratio against a same-sitting baseline;
  **no gate was added here**, and the human's consequence of widening the ceiling is that
  the practice becomes a gate at **G-020**, a hard prerequisite of M3.
  **THE BUDGET IS INVERSELY PROPORTIONAL TO THE LADDER** — 525,600 x S / (speed x H) — so
  G-021 re-derives it rather than leaving it alone; what survives a ladder change within
  ~12x is the conclusion, not the constant, and it survives by division (389.3 / 12 =
  32.4s = 3.24x the ten seconds) rather than by the sensitivity table. Two drafts got this
  wrong in opposite ways and both are recorded in §2.1.2.

  **THE PROMOTION MECHANISM IS DEAD, DELIBERATELY, WITH NO REPLACEMENT INVENTED.**
  **Exactly ONE** parked trigger reads "`sim:bench` exceeds 70% of the I5 budget" — in the
  parked successor recorded inside G-016's block — and it can never fire
  again. That is the human's complaint discharged rather than a gap: a sourced ceiling
  promotes nothing. Inventing a substitute threshold inside this goal would have minted
  the second superstition in the goal that exists to delete the first. The replacement is
  **G-020**, seeded by the orchestrator with a bound that owes a derivation of its own.
  (Round 1: an earlier draft said TWO triggers and named G-019 as owning one. G-019 has no
  trigger and never did. `grep -rn "70%" --include=*.md --exclude-dir=node_modules .`
  returns TEN lines (thirteen without the exclusion — three are dependency readmes): one live
  trigger, FOUR historical mentions of G-016's own discharged trigger (`DECISIONS.md`,
  `GOALS.md`, `JOURNAL.md`, `PARKING.md`), and five lines of this goal's own commentary on
  them. The subordinate count read "three" until round 2 — a miscount inside the sentence
  claiming to report a grep, which is the defect it corrects, in miniature.)

  **REPORTED, NOT FIXED — three things this goal deliberately did not touch:**
  1. **The workload does not match the requirement's.** The requirement says a 60-room
     HOTEL; the bench runs a 60-room SHELL at ~25% occupancy with `--amenities 1`, four
     providers, where `vitest run scaling` uses twenty. No workload constant was changed.
     It does not affect the budget, which is a property of the play speed. -> `PARKING.md`.
  2. **`packages/sim/src/loan.ts:279` and `tick.ts:686` cite ratios against the moved
     constant** and are now false. Exit criterion 4 forbids touching `packages/`, so they
     are parked to be **deleted, not restated** — both are instances of ADR-0007's
     amendment, a comment offered as evidence carrying a figure no test pins.
  3. ~~**`CLAUDE.md`'s I5 row still says "under 10s".**~~ **DISCHARGED IN THIS TREE** —
     out of a builder's reach, handed to the orchestrator, and corrected by it during
     round 1. `bench.budget.test.ts` now asserts that row carries the derived figure, so
     the copy meant to survive compaction is pinned rather than trusted.

  **NAMED OBLIGATION INHERITED FROM G-013 ROUND 2 — `bench.mjs`'s COMMENT TABLE IS STALE
  AND IS LOAD-BEARING FOR ITS OWN ARGUMENT.** It states `--arrivals 32 (~15 concurrent)
  4580ms 45% <- what ships`, and the file's own text uses that 45% to justify `--arrivals
  32` "for headroom, not for realism ... a gate that flakes red teaches people to re-run
  it". `ai-critic` measured 8246/8187/8191/7906 ms in one sitting — **79–82%**. At 80% the
  headroom argument no longer holds, and this goal is deriving a budget partly from it.
  **Strike the stale figure rather than replace it** (`CLAUDE.md`: withdraw what cannot be
  re-measured paired). No regression is claimed and none should be inferred: the paired
  content-half measurement puts the whole item registry at **~4–8%** of the bench
  (1.043/1.038/1.075, interleaved, medians of 5), so G-013 is not what moved it.
  `tools/gates/` is orchestrator-owned (ADR-0004) — this is not the builder's to fix.

  **THE HONEST OUTCOME MAY BE "NO CHANGE", AND THAT IS A PASS.** If the derivation lands
  near ten seconds, say so and move on — the value of this goal is the derivation, not a
  different number. If it says the budget was always too tight or too loose, that is worth
  knowing BEFORE M3 adds pathfinding and M4 adds staff.
  **A DIRECTION THE BUILDER MUST NOT TAKE:** deriving a budget that happens to make the
  current reading comfortable. The derivation is written from the requirement first and
  the current reading is compared to it afterwards. If those two steps happen in the other
  order this goal has produced a second superstition with better paperwork.
  No WATCH owed — this goal changes no behaviour, which is also criterion 4.

## G-017 — The replay viewer: a run that can be watched
Status: **done, WITH CRITERION 1 OWED** — 2 sweeps + 1 verification that converted.
  3 MAJOR + 5 MINOR, then 2 MINOR + 1 NIT. Zero BLOCKERs.
  Verified by the orchestrator: six gates green; I2 `4b8db9b1ac36cb35`; **the last frame of
  a 4,321-frame / 55.74 MB recording independently re-hashes to `b9f6cfb9ef6fd685`, the
  run's own hash**; stdout byte-identical with and without `--record`; 24 tests across the
  two new files; `packages/sim` and `packages/content` untouched.

  **CRITERION 1 IS OWED, NOT MET, AND THIS IS DELIBERATE.** *"A recorded 30-day run can be
  scrubbed frame by frame in a browser"* is evidenced by nothing in the diff. The builder's
  harness drove the shipped `viewer.js` through a recording 2D context and rendered to SVG
  — a sound smoke test of the draw path, and **not** a perceptual check: it never touches
  the file picker, the scrubber, the play loop, the speed buttons, or Canvas2D text metrics
  and contrast at real size, which is exactly what ADR-0014 asks. Signing it off would be
  §9's *"a criterion is being verified by an agent's judgement of something nobody can
  observe"* — **the stop condition ADR-0013 exists to close, discharged by the same
  substitution it forbids.** **Dischargeable only by a human running `pnpm viewer`, picking
  a recording and scrubbing it.** Criteria 2-7 are met.

  **THE GOAL DELIVERED WHAT IT PROMISED TO DELIVER** — see `JOURNAL.md`'s WATCH #1, the
  first in the project. The pre-registered café prediction confirmed exactly; the lowest-id
  concentration found to be worse than predicted (**11 of 15 amenity rooms inert**); and a
  parked hypothesis from G-013 tested and returned positive without either goal planning it.

  **TWO DEFECTS THE TESTS COULD NOT SEE, BOTH FOUND HERE.** A roomless guest was drawn
  pixel-identical to a housed one — 19,619 roomless guest-ticks all rendering as content
  eaters while 89 of 120 guests left unsatisfied, §6.1's "UI that cannot express a state the
  sim can reach", on the instrument whose output is ledger evidence. And `--record-every 1`
  alone was silently accepted, because the guard tested the resulting **value** against the
  default rather than whether the flag was seen — **a guard whose condition was unreachable
  for the one input that could trigger it**, and the existing test passed only because it
  used a non-default value.
Milestone: M2 (inserted by human ruling ADR-0013 §1)
Owner pair: **render-engineer / render-critic** — idle for the whole project, which the
  human named as its own small warning
Statement: A run can be recorded and watched. A human can scrub a simulated month of
  hotel and see rooms, guests, and what each guest is doing.
Exit criteria:
  - a recorded 30-day run at `--rooms 6` can be scrubbed FRAME BY FRAME in a browser,
    showing rooms, guests, and what each guest is doing
  - `pnpm sim:run --days 30 --seed 7 --rooms 6 --record <path>` writes a frame stream, and
    **replaying that stream reproduces the run's final state hash** — a frame stream that
    has silently diverged from the simulation is loud rather than decorative
  - a test asserts `tools/viewer` imports nothing from `packages/sim` at runtime AND
    contains no command construction — "it cannot act" made mechanical, not promised
  - `pnpm sim:bench` with recording disabled is UNCHANGED from its current figure, paired
    and interleaved in one sitting (`CLAUDE.md` §measuring)
  - recording is off by default: the byte-for-byte stdout of every existing pinned
    invocation is unchanged, and the I2 state hash is unmoved
  - a WATCH entry in `JOURNAL.md` for G-013, discharging its debt, saying what looked
    wrong or that nothing did
  - all §2 invariant gates green (pnpm verify)
Out of scope: anything in `apps/game` (M5, still shut); dispatching commands; a live
  connection to a running sim; sprites, art, animation, tweening; a UI framework; sound;
  editing or authoring; making it reusable  (-> PARKING.md)
Critique rounds used: 0/3

  **THE CONSTRAINTS ARE WHAT MAKE THIS SAFE AND THEY ARE NOT NEGOTIABLE** (ADR-0013 §1):
  - It lives in `tools/viewer`. `apps/game` stays shut. **This is not the renderer.**
  - It is a REPLAY viewer. It consumes recorded frames from a COMPLETED run and has no
    live connection to a simulation. **That makes read-only STRUCTURAL rather than
    promised — it cannot send a command because there is nothing to send one to.**
  - Frames go through the **existing** save serialiser. **If the serialiser cannot express
    something the viewer needs, that is a FINDING TO REPORT, not a licence to add a field.**
  - No new `World` field, no migration, no content-fingerprint movement caused by this
    goal. If the viewer wants state that does not exist, it goes to `PARKING.md`.
  - Recording off by default; `sim:bench` runs without it; **I5 must not move.**
  - **It is explicitly disposable.** M5 may throw all of it away. Do not build for reuse,
    do not make it pretty, do not let it grow features. Coloured rectangles, labels, a
    scrubber, a speed control. That is the whole scope. §9 now lists "the viewer is
    acquiring features or defenders" as a stop condition — delete it rather than defend it.

  **WHAT IT IS EXPECTED TO FIND, STATED UP FRONT SO THE GOAL IS FALSIFIABLE** — the
  human's own framing: *"I expect watching a month to surface at least one behaviour that
  every current test calls correct and a human calls wrong. If it finds nothing, record
  that honestly — that is a real result and it retires my concern."*
  Two candidates already on record and neither observable today: G-016's one-tick
  double-booking (two guests in one bed for a minute), which is the class sampling would
  surrender and on which an 18.4% lever currently rests untestable; and whether guests
  thrash between providers, which G-014 is about to make possible.

  **A THIRD, PRE-REGISTERED AT G-013 ROUND 2 — POINT THE VIEWER HERE FIRST.** `ai-critic`
  wrote down the frame it would have watched but could not, which is the first time this
  project has produced a *prediction* instead of a shrug:

  > At `--amenities 5`, all **716 nourishment satisfactions come from the five vending
  > machines, and the five cafés serve nobody for sixty days.**

  It is `providersFor`'s documented lowest-id rule meeting seeding order — games rooms and
  their machines take lower ids than cafés — so it is **correct, tested, and not a defect
  today**, and M3's nearest-by-path is what changes it. It is exactly the shape ADR-0013
  was written about: a hotel where a whole room type is furniture, passing every gate.
  **Watch it and record whether it reads as wrong to a human.** Either answer is a result:
  if it looks fine, the concern about lowest-id selection shrinks; if it looks stupid,
  G-014's scorer has a named target on day one rather than a guess.
  Precedent that this is cheap signal rather than a luxury: **55 rooms floating in mid-air
  (G-009) and a hotel that would have been made entirely of cafés with every gate green
  (G-012)** would both have been obvious on sight.

  **IT ALSO ANSWERS A DESIGN QUESTION (ADR-0014).** This is the cheapest possible test of
  whether a side-on cross-section reads clearly AT ALL, and of the placeholder vocabulary
  M5 will ship — shape and colour alone, no art. If a room type or a guest state cannot be
  told apart that way, that is a finding about the whole visual direction, and it is worth
  having before M5 is built on the assumption that it does.

## G-014a — Provider fit, and no room type is furniture
Status: **done** — 2 sweeps (3 MAJOR + 4 MINOR, then 1 MAJOR + 2 MINOR), zero BLOCKERs.
  **SEAM TAKEN** at PLAN, offered by the builder and adopted (§5.5). Verified by the
  orchestrator: six gates green; I2 `1400fc79f08b7e55`; 1,162 tests / 64 files;
  `--days 30 --seed 7 --rooms 6 --amenities 5` hashes `72c20adba35c0817` with **all four
  needs 356 met / 0 unmet, and nourishment 356 BY ROOM where HEAD served 0**.

  **THE WATCH CAUGHT A DEFECT IN THIS GOAL'S OWN FIRST BUILD, WITH SIX GATES GREEN AND
  1,133 TESTS PASSING.** The need table read `guest_comfort 0 met, 356 unmet` — one of the
  three things a guest comes for had stopped happening, for every guest, in every run.
  Cause: scoring `pressure * FIT_SCALE + fit` as one number is sound for *unequal* pressure
  and silent about *equal* pressure — **the normal case**, since every need of a new guest
  starts at zero and comfort and nourishment share `patienceTicks` 300. **Fit was choosing
  the NEED.** Fixed structurally (fit ranks providers *within* one need, `FIT_SCALE` and
  `scoreOf` deleted), not by retuning a value.

  **THE JUSTIFICATION FOR THAT FIX WAS ITSELF FALSE, IN FOUR FILES INCLUDING A SCHEMA DOC.**
  "Exactly one order of pursuit works" ignores that **patience regenerates while a need is
  served**. Two of six orders complete; the real invariant is **entertainment must be last**,
  because its 360 patience is the only one surviving a 330-tick wait. The enumeration is now
  **executed** by `utility.starvation.test.ts` rather than described — it permutes the needs
  through `advanceNeeds` itself and reads "longest patience" off content.

  **PRE-REGISTERED PREDICTIONS, BOTH SCORED**: cafés fill — CONFIRMED (nourishment 0 → 356
  by room; amenity rooms involved 4 of 15 → 6 of 15). Concentration is NOT fixed — CONFIRMED,
  9 of 15 still inert, stated in advance; scoring re-ranks and cannot spread, which needs
  distance (M3). The orchestrator's regret prediction was **half wrong usefully**: absent at
  oversupply (0 of 721 frames, against 718 of 721 at HEAD), present under contention at
  **180 episodes per simulated day, stationary across three days**.
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

  **AND NEITHER THE GATE NOR THE COUNTER CAN SEE WHAT THRASHING LOOKS LIKE.** By the time
  this goal runs, G-017 exists, so this is the first goal to owe a LIVE WATCH rather than
  a retroactive one (`HOTELSIM.md` §5): record a run, watch a guest choose, and say in
  `JOURNAL.md` whether the hysteresis margin looks like commitment or like dithering. A
  margin tuned to a counter alone is tuned to the only thing that can be measured, which
  is exactly the trap ADR-0013 was written about. `ai-critic` may now raise "reads as
  stupid" here, WITH a frame reference (§6.1 as amended) — this is the goal that mandate
  was written for.
  Migration owed only if the abandonment counter cannot be derived. If the builder finds
  a way to derive it, the migration is dropped and that is a win worth recording.

  **RUN THE §5.5 SEAM QUESTION AT THIS GOAL'S PLAN, BEFORE G-015's — it arrives first.**
  Utility scoring, a hysteresis margin with a mutation-verified check, id tie-breaking
  across two insertion orders, an abandonment counter and a conditional migration is **not
  obviously thin**, and G-013 is the cautionary case: its builder named the seam, the
  orchestrator declined it in one line with no cost recorded, and it cost nine instances of
  one defect class and three full sweeps that reached exhaustion only at the last round the
  budget allowed. Either take a seam here, or **write down what declining it is expected to
  cost — and score that prediction at REFLECT** (§5.5). `ai-critic` also sees this plan
  before BUILD and may object to its size (§5.6).

## G-015 — The outcome table, and summary schema 2
Status: **done** — 1 sweep (1 MAJOR + 4 MINOR + 1 NIT), zero BLOCKERs. `sim-critic`
  predicted two sweeps conditional on the criteria being repaired at PLAN; they were, and
  it took one. **The seam was offered and declined with a scored prediction; the prediction
  held.**
  Verified by the orchestrator: six gates green; I2 `ca54cbb7ae2dc693`; **67 files / 1,235
  tests, counted independently**; fixture zero-line diff; `SAVE_V1_CONTENT`
  `8e09fe4f0fa162a3` intact in the frozen literals; criterion 2's corrected invocation
  measured at `90 / 263 / 5 / 1`.

  **TWO CRITERIA WERE BROKEN AND BOTH WERE CAUGHT BEFORE A LINE WAS WRITTEN.** Criterion 2
  named an invocation that **cannot** meet it — `evictedRoomUnusable` is structurally
  unreachable at `--rooms 6` because all seeded rooms sit on the ground floor. Criterion 5
  asked a **v1 consumer** to refuse v2, and **no consumer of `RunSummary` exists** — an
  invented consumer refusing an invented version is ADR-0007's vacuous shape in a schema
  costume. Replaced with real subjects: a frozen v1 document captured at `a011f38`, and the
  assertion that the retired keys are **absent rather than zero**.

  **THE BUILDER DELETED A CHECK OF ITS OWN THAT COULD NOT FIRE.** It wrote L1 into
  `buildSummary` as a violation, then found `assertGuestOutcomes` throws on that exact
  condition at the top of the same function. Found by driving it, not by reasoning. The
  replacement test asserts `buildSummary` **throws**.

  **L2 IS THE GOAL'S CENTRE AND ITS SCOPE IS NOW WRITTEN DOWN HONESTLY.** It compares the
  `satisfied` row against the **ledger** — a different subsystem — so it catches a
  *conserving* misattribution that L1 cannot see. `sim-critic` drove all four adjacent
  misattributions: **two caught, three not.** Four of five rows have no cross-subsystem
  witness, because no ledger entry exists for an eviction. Not fixable, not a defect, and
  now stated in the source as a matrix rather than implied away.
Milestone: M2
Owner pair: ai-engineer / **sim-critic**
Statement: The four outcome counters become a table by reason. `SUMMARY_SCHEMA_VERSION`
  bumps to 2 and the conservation law holds against it.
Exit criteria:
  - pnpm exec vitest run outcome  (all green)
  - `pnpm sim:run --days 30 --seed 7 --rooms 6 --build 720 --demolish 2880` prints an
    outcome table with at least FOUR distinct reasons non-zero.
    **CORRECTED AT PLAN, 2026-08-09, and the original invocation is kept here as the
    lesson:** it read `--days 30 --seed 7 --rooms 6`, which **this goal proved cannot meet
    it** — that run has exactly ONE non-zero reason (356 satisfied, nothing else), and
    `evictedRoomUnusable` is *structurally* unreachable there because `roomsPerFloor` is 40,
    so all six seeded rooms sit on the ground floor where nothing can lose its support.
    Adding rows to a table cannot produce departures that did not happen. Measured
    replacement: `satisfied 90 · gaveUpWaiting 263 · evictedRoomGone 5 ·
    evictedRoomUnusable 1`. **A criterion whose invocation is discovered during BUILD is one
    the builder tunes until it passes** (ADR-0007's G-016 amendment), so it was settled by
    measurement before a line was written. `outcome.report.test.ts` pins BOTH — the working
    invocation, and the old one producing exactly one reason.
  - the outcome table's total still equals arrived - live, and a test deletes one row
    and watches the conservation law throw
  - the conservation law is NOT an identity over its own inputs — the total is
    accumulated independently of the rows, or the check compares against a separate
    input (ADR-0007 as amended at G-013; this diff's law is the same SHAPE as the one
    G-013 shipped vacuously and had to delete)
  - `SUMMARY_SCHEMA_VERSION` 2, with a consumer of v1 refusing v2 loudly rather than
    reading four missing counters as zero
  - all §2 invariant gates green (pnpm verify)
Out of scope: reviews and the review distribution (G-019); reputation (M4)
Critique rounds used: 0/3

  **SPLIT FROM THE OLD G-015 BY HUMAN RULING, 2026-08-08**, along the seam the old block
  had already drawn without noticing: it named `sim-critic` then `balance-critic` because
  a saturating review scale is a dominant-strategy failure wearing a guest-loop costume.
  **That is not one goal with two critics — it is two goals.** This half is structural,
  schema-breaking and carries a conservation law, which is `sim-critic`'s catalogue exactly.
  Splitting makes the two-critic arrangement NATIVE rather than bolted onto a fat goal.
  Migration owed: `SUMMARY_SCHEMA_VERSION` 2 — the table REPLACES four counters, which is
  the breaking kind of change, not the additive kind `report.ts` permits.

## G-014b — A guest that commits
Status: **done, DRY at 1/3** — 1 sweep (3 MAJOR + 3 MINOR) plus 3 verification passes, **none
  of which converted**: both new findings they produced were PROSE, and §7.1's subject split
  routed them to the unpinned-claim arm. **The guard held the budget at 1/3 twice in one goal.**
  Zero BLOCKERs. **No production code changed after sweep 1** — every finding was evidence.
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: A guest that has committed does not abandon unless an alternative beats it by a
  content-defined margin, and abandonments are a reported outcome.
Exit criteria:
  - `pnpm exec vitest run hysteresis`  (all green)
  - **CRITERION 2, REPAIRED TWICE — THREE TERMS, NOT TWO.**
    `abandoned(margin 0) > abandoned(shipped) > 0` at the criterion invocation.
    **The two-term version I called "repaired" was still satisfiable by not shipping the
    feature**: ship a saturating margin and abandonments are 0, margin-0 abandonments are
    many, `many > 0` passes, and shipped behaviour is byte-identical to G-014a. The
    mechanism would exist and be off in the game. `ai-engineer` found this at PLAN (F2).
  - **CRITERION 3, REPAIRED AGAIN — AND MY OWN REPAIR WAS SELF-CONTRADICTORY (F1).**
    Three arms, not two. **The era that reproduces the pre-margin literals exactly is the
    SATURATING margin, not margin 0** — margin 0 is *maximum* thrash, the opposite end.
    - `margin 10000` reproduces every Era-A counter **identically**, `abandoned` is 0 on
      every row, **and `stateHash`/`contentFingerprint` DIFFER** — both halves asserted:
      same behaviour, different content document.
    - `margin 0` is the thrash control.
    - the shipped margin sits between, and all three numbers are pinned as literals.
    **Why saturation is unreachable, and pin it AT THE DEFINITION rather than by a grid of
    constructed pairs** (orchestrator, checked in the code): `isPending` is *defined* as
    `progressRemaining > 0 && patienceRemaining > 0` (`needs.ts:251`), so a pending need has
    `patienceRemaining >= 1`, so `urgency < patienceTicks`, so `pressureBasisPoints`'
    saturating branch (`utility.ts:118`) is **structurally unreachable** and pressure is at
    most 9999. A grid over `(patienceRemaining, patienceTicks)` would sample that; tying the
    test to `isPending`'s definition proves it.
  - **CRITERION 4, REPLACED — THE OLD ONE WAS ALREADY TRUE BEFORE THIS GOAL STARTED (F5).**
    "Two providers scoring exactly equal choose the lower entity id, on two insertion
    orders" is discharged verbatim by G-014a's `utility.tiebreak.test.ts`. Nth instance of
    the ADR-0007 class, in a criterion list I had already repaired twice. Replaced with the
    tie rule of **this goal's** decision: equal-pressure challengers by lower need id, equal
    -fit providers of the challenger by lower entity id, on TWO insertion orders, **with the
    exact boundary driven both ways — `diff = margin - 1` stays, `diff = margin` switches.**
    **The equal-fit-provider half is ALSO already discharged** (`utility.tiebreak.test.ts`
    :109 and :141, through the same `findFreeRoom` path) — keep it only as labelled path
    coverage, never as evidence. *Fourth time this list has needed the same repair.*
  - **CRITERION 5, NEW — THE MARGIN IS BOUNDED FROM BELOW, BY A TEST THAT COMPUTES THE
    BOUND FROM CONTENT** (`ai-critic`, §5.6 MAJOR 2). Criterion 2's three terms bound the
    margin from ABOVE and not from below: **`M = 1` basis point satisfies all three** —
    abandonments many, fewer than at margin 0, and greater than zero — **while shipping pure
    thrash.** The only thing forbidding it was the `M >= 6000` derivation, which lived in
    prose and in nothing that executed. *That is verbatim the defect `abcb497` fixed in
    G-019 two commits ago and the one G-020b spent three rounds on.* The test reads
    `min patienceTicks` over **engagement** need types and `max satisfyTicks` off
    `needTypesInOrder` — **not literals** — and asserts the shipped margin clears the bound.
    **The same computed bound is a FOURTH condition on the conditional seam trigger**, whose
    other three are all *more* easily satisfied as M falls toward 0 — so without it a builder
    tuning M downward discharges the trigger by doing the thing the trigger exists to stop.
  - **CRITERION 6, NEW — THE WATCH OBLIGATION, WHICH THE G-014 SPLIT LOST** (`ai-critic`,
    §5.6 MAJOR 3; §5.7 — an orchestrator-side omission). G-014's block carried it verbatim:
    *"record a run, watch a guest choose, and say in `JOURNAL.md` whether the hysteresis
    margin looks like commitment or like dithering… a margin tuned to a counter alone is
    tuned to the only thing that can be measured, which is exactly the trap ADR-0013 was
    written about."* **When G-014 split, that sentence stayed with G-014a — the half that
    does not ship a margin — and G-014b's criteria never carried it.** The goal where the
    counter and the eye can disagree is this one. Recorded at the contended configuration
    where the margin actually bites, and **a human looks**: the agent may not claim the
    perceptual half (WATCH #2).
  - the same run reports zero stuck guests
  - all §2 invariant gates green (pnpm verify)
Out of scope: distance or travel time as a score term (M3); reputation or price (M4);
  archetype-varying weights (M6); the departure table (G-015 — see below)
Critique rounds used: 0/3

  **BOTH ORIGINAL CRITERIA WERE BROKEN AND THE REPAIRS ARE RULED, NOT LEFT TO BUILD.**

  **Criterion 2** was the familiar shape — *"reports abandonments per guest below `<n>`"* is
  satisfied by **not implementing the feature**, because total commitment reports 0 and 0 is
  below every n. Nth instance of the ADR-0007 class. Repaired above as a differential.

  **Criterion 3 is a different animal and this project has not seen it before: GOLDENS THAT
  GO RED BECAUSE THE FEATURE WORKS.** *"Setting the margin to zero turns a named test red,
  and that test is the ONLY one that goes red"* is satisfiable **only by a broken build** —
  the goldens run under shipped content, the margin *is* content, so they move precisely
  when the margin does its job.

  **THE OBVIOUS REPAIR IS FORBIDDEN.** Regenerating the goldens against the new behaviour is
  **ADR-0006's forbidden move in mirror image**: *a fixture regenerated by the build that
  changed it agrees with whatever the writer now does, which is the property it exists to
  deny.*

  **THE REPAIR THAT KEEPS THE EVIDENCE — pin both eras and assert the delta:**
  - **Keep the pre-margin goldens as frozen literals describing an era that is over**
    (ADR-0008 applies directly — a thing describing the past must not track the present).
  - **Add the post-margin goldens.**
  - **Make the criterion the measured difference between them**: abandonments down by at
    least `<n>`, **with the margin at zero reproducing the old literals exactly.**

  That gives a test which **fails if the margin stops working AND fails if someone quietly
  reverts it.** Regenerating gives neither.

  **~~IT OPENS WITH A FRAME REFERENCE RATHER THAN A HYPOTHESIS: 180 regret episodes per
  simulated day under contention, absent at oversupply. Its margin therefore has nothing to
  bite on when supply is plentiful, and the criterion invocation must be a contended
  one.~~ WITHDRAWN 2026-08-09, ORCHESTRATOR — AND IT WAS BACKWARDS.**

  **F4 — the 180 figure is unpinned.** It appears in `GOALS.md` and `JOURNAL.md` and nowhere
  else: no definition, no invocation, no method exists in the repo. `CLAUDE.md` rule 5 says a
  number you cannot re-measure is **withdrawn, not restated**, so it is struck rather than
  requoted. On the only reconstruction consistent with its own control (0 of 721 frames at
  `--amenities 5` against 718 of 721 pre-G-014a), it measured **provider-level regret within
  ONE need** — which is exactly what G-014a's fit fix removed, and **is not the quantity this
  goal's margin governs.** `ai-engineer` found this and correctly declined to restate it.

  **F3 — and the instruction I derived from it points the wrong way.** Abandonment
  structurally requires a **FREE provider** for the challenger need (`guests.ts:1442-1443` —
  `findFreeRoom` returns null and the need is skipped). **Scarcity SUPPRESSES abandonment; it
  does not create it.** Measured at PLAN — *abandonment-opportunity guest-ticks per simulated
  day at margin 0 · `--days 10 --seed 7 --rooms 6`, amenities and arrival gap varied · n=1 per
  configuration, which is complete rather than thin because this is a DETERMINISTIC count
  under I2, not a timing · total ÷ 10 simulated days · regime irrelevant by construction,
  taken quiet on `win32`/12 cores*:

  | invocation | opportunity guest-ticks/day at M=0 |
  |---|---|
  | `--arrivals 60 --amenities 1` | **128.4** |
  | `--arrivals 60 --amenities 3` | **6001.0** |

  **A factor of 47, in the direction opposite to my instruction.** So the criterion invocation
  is **CHOSEN BY MEASUREMENT over an amenity sweep, not asserted**. The candidate —
  `--days 30 --seed 7 --rooms 6 --arrivals 60 --amenities 3` — is 24 arrivals/day at 6 rooms,
  which **is the middle-band configuration G-019 and M2 exit separately owe.** That
  convergence is convenient rather than load-bearing, and neither goal may lean on the other's
  run: **G-019's WATCH obligation is a recording a human looked at**, not a criterion
  invocation that happened to share its flags.

  **`abandoned` IS A ROW ON `NeedOutcome`, NOT IN G-015's DEPARTURE TABLE.** A guest departs
  exactly once but abandons zero or many times, so a row in that table would force the
  conservation law to sum a *subset* of rows — and a law that skips rows is the vacuity shape
  G-015 exists to prevent. Save **v9** is owed either way; G-015 could not pay it forward
  without shipping a counter nothing increments.

  **RUN THE §5.5 SEAM QUESTION AT PLAN.** Taking the seam at G-014a does not bank the
  obligation. §5.6 and §5.7 both apply — the critic sees the plan, and the criteria above are
  the orchestrator's claims and are in scope.

  ---

  **THE MARGIN'S DERIVATION — RULED 2026-08-09 AFTER `ai-critic`'s §5.6 MAJOR 1, AND THE
  RULING CONTAINS A DESIGN FINDING BIGGER THAN THE GOAL.**

  The plan derived `M >= 6000` from a dwell formula and attached it to the requirement *"a
  guest can complete its longest engagement."* **The formula computes a REVERSE switch and
  the requirement is about ANY engagement, and they are not the same quantity.** A served
  need regenerates patience (`needs.ts:401`) while a waiting one burns it, so the gap swings
  at the two rates combined; a *first* switch needs the gap to travel only `M`, a *reverse*
  switch `2M`. Half the dwell.

  **Checked against the shipped table** (`need-types.json`: engagement patience 300/360/300,
  `satisfyTicks` 150/150/180; `night_rest` is excluded from the scoring loop at
  `guests.ts:1428`, so `min patienceTicks` means **min over ENGAGEMENT need types = 300**,
  not 180 — the two readings differ by the whole feature):

  | requirement | required M | verdict |
  |---|---|---|
  | complete the LONGEST engagement (180 ticks) | **12000** | **impossible — over the 10000 ceiling** |
  | complete the SHORTEST engagement (150 ticks) | **10000** | **the saturating margin criterion 2 forbids** |
  | do not switch BACK within the longest engagement (180) | **6000** | sound, and shipped |

  **SO NO NON-SATURATING MARGIN CAN GUARANTEE A GUEST COMPLETES AN ENGAGEMENT IT STARTS.
  That is structural, not a tuning failure** — a margin governs the *gap*, and the gap keeps
  moving while a guest is served. Guaranteeing completion needs a **dwell term** (a minimum
  engaged duration), which is a different mechanism.

  **RULING.** The requirement is restated to the quantity the formula actually computes —
  **"a guest that has just switched does not switch back within the longest engagement"** —
  under which `M >= 6000` is derived rather than chosen, and §2.1 is satisfied. **The
  stronger property is NOT quietly dropped**: it goes to `PARKING.md` as a dwell term, with
  its falsification test attached — *count, in a recording at the shipped margin, guests that
  abandon an engagement with more than half its `satisfyTicks` of progress; if that count is
  material, the margin alone is insufficient and a dwell term earns its goal.* The worked
  reachable case is already in hand: two needs at pressure 3333, a provider frees, and at
  `M = 6000` the guest abandons after 90 ticks carrying 90 of 180 progress.

## G-019 — Reviews, and a hotel that reviews differently from a bad one
Status: **done, DRY at 3/3 FROM BOTH CRITICS.** 3 sweeps (1 BLOCKER + 8 MAJOR + 9 MINOR
  across two pairs) plus a plan pass that returned **1 BLOCKER + 5 MAJOR before a line was
  written**, and five verification passes, two of which converted. **THE SECOND CRITIC EARNED
  ITS RULE**: `ai-critic`, from a different pair, found the viewer blind to the field this
  goal adds, so criterion 6's own question could not be answered in the instrument the WATCH
  entry sends the human to. `balance-critic` found the headline criterion discharged by two
  guests. **LAST GOAL IN M2.**
Milestone: M2 — **LAST GOAL IN THE MILESTONE**
Owner pair: ai-engineer / **balance-critic** · second critic `ai-critic` (§7.1)
Statement: A departing guest leaves an integer review derived from its own recorded
  experience: which needs were met, how long it waited against its patience, and whether
  its stay was cut short. The review is recorded and reported; nothing reads it.
Exit criteria:
  - pnpm exec vitest run review  (all green)
  - **CRITERION 2, REPLACED — THE ORIGINAL WAS DISCHARGED BY TWO GUESTS (BLOCKER, §5.6).**
    `balance-critic` measured `--rooms 6 --amenities 1 --seed 7` at 10/30/100/365/1000 days:
    the distribution is `3:1, 4:N, 5:1` at **every** run length. **The only 5 is guest #2 and
    the only 3 is guest #9 — both opening transients — and every guest from #10 to #12,000
    scores exactly 4.** So "three distinct scores non-zero" **cannot distinguish this goal's
    review function from one that returns a constant after the first simulated day**, and the
    negative control I added does not rescue it: it shows only that 1 ≠ 3, where the 3 is
    1 + 11,994 + 1. **Replaced by the configuration the WATCH criterion already mandates**:
    `--days 30 --seed 7 --rooms 6 --arrivals 60`, measured at **`1:126, 2:316, 3:265, 4:4`
    over 711 departures** — a real spread at no extra cost. **State a minimum SHARE per named
    score, not "non-zero"**, so a distribution of point masses cannot satisfy it.
  - **AXIS 1 — LODGING.** --rooms 1 and --rooms 12 produce review distributions whose means
    differ by more than <n>, COMPUTED BY THE TEST rather than asserted.
    **TWO FACTS ABOUT THIS AXIS, MEASURED BY `ai-engineer` AT PLAN AND RE-VERIFIED BY THE
    ORCHESTRATOR — the gloss that used to sit here was wrong twice over.**
    (a) **`--rooms 12` is BYTE-IDENTICAL to `--rooms 6`** in every need and guest counter:
    demand saturates at ~5 concurrent guests (12 arrivals/day × 480-tick stays), so this axis
    is **starved vs adequate**, not small vs large. It still discriminates — that is what the
    criterion needs — but nothing here is a claim about capacity beyond ~5 rooms.
    (b) **`--rooms 1` is NOT "a hotel that serves nobody"**, which is what this line used to
    say. The engagement reservation does not require a room (`guests.ts:1402-1437`), so a
    guest queuing for lodging still uses the amenities. Measured at `--days 30 --seed 7`:
    **comfort met 179 at `--rooms 1` against 145 at `--rooms 6`** — the starved hotel serves
    *more* engagement needs, because waiting guests have time to. **The upper arm is not
    better at everything, and a review function that assumed it were would be tuned against
    a fiction.** The separation the axis actually carries is **1.75 → 3.00 needs met per
    departure**, and the review scale has to turn that into more than one band.
  - **AXIS 2 — THE STAY. HOLD ROOMS FIXED, VARY AMENITY DENSITY, AND REQUIRE THE REVIEW MEAN
    TO MOVE** — **now a THREE-POINT LADDER, strengthened at PLAN on `ai-engineer`'s argument
    and accepted: `mean(amenities 0) < mean(amenities 1) < mean(amenities 5)` strictly, at
    fixed `--rooms 6`.** Two points cannot distinguish *"the scale moves"* from *"the scale is
    a switch"*, and the property this criterion is actually named for — the shipped default
    sitting **strictly inside** the scale — needs the middle point to be a measurement. Each
    gap is COMPUTED BY THE TEST. `watch-ticks` and
    `watch-amenities` already ship with identical entity composition, so this costs an
    invocation rather than a design. **Written into the criteria list 2026-08-09 by the
    orchestrator: the human ruled it a criterion before PLAN and it had been recorded only
    in the prose below — which is the defect G-020b spent three rounds on, a rule living
    where nothing executes it. WITHOUT AXIS 2, AXIS 1 PASSES GREEN ON A REVIEW FUNCTION THAT
    READS ONLY `night_rest`** and three-quarters of the need vector contributes nothing.
  - no sim module reads the review store — the boundary made mechanical, not documented
  - **THE LODGING WAIT TERM IS PINNED BY A CONFIGURATION THAT MOVES IT (MAJOR, §5.6).**
    **Deleting the wait term leaves every criterion in the original list byte-identical** —
    `balance-critic` scored with and without it across (6,0), (6,1), (6,5), (1,1), (12,1) at
    30, 365 and 1000 days: **guests whose band the term moved: zero, everywhere.** A satisfied
    guest must wait ≥145 of 180 patience ticks to lose a band, and waits are quantised by the
    arrival cadence to 0, 120 or 160. **The one part of the review that is not "count the
    needs" was pinned by nothing** — in the goal whose §5.8 ruling reports two *other* unpinned
    criteria. `--rooms 6 --arrivals 60` moves **528 of 711** guests' bands and is now in the
    criteria, so the term is measured or it comes out.
  - **THE EVICTION ARM IS NAMED, BECAUSE REPORT LAW B OTHERWISE INSPECTS NOTHING (MAJOR).**
    Evictions are **0 in all five criterion configurations and in all twelve of the 1000-day
    sweep**; `--build`/`--demolish` appear in no criterion. ADR-0007 requires reaching the
    check from the real path *and* a case proving it can fail. Arm, measured:
    `--days 30 --rooms 6 --amenities 5 --arrivals 60 --demolish 900` → **5 evictions, 5 floor
    reviews.** (Law A is fine by contrast: it folds a min over every need row and bites hard
    at `--rooms 1 --amenities 1`, where 89 maximal reviews sit against a minimum row of
    exactly 89 — equality, at 30 days.)
  - **A WATCH ENTRY IN `JOURNAL.md` FROM THE BIMODAL RECORDING, ~6 rooms and ~24
    arrivals/day** — a human sees a guest succeed AND a guest fail in the same run. This is
    one criterion doing two jobs deliberately: G-019 needs both outcomes visible, and M2
    exit separately owes a recording in **the middle band** — 36 arrivals gave 32 satisfied
    and ZERO gave up; 216 gave 16 satisfied and 189 gave up, and no recording sits anywhere
    between. **It must be WATCHED, NOT MANUFACTURED** (human): record the run, look at it,
    and write what you saw — including "nothing looked wrong" if that is the truth.
  - all §2 invariant gates green (pnpm verify)
Out of scope: the outcome table (G-015); reputation as a stateful aggregate; reviews
  feeding demand, pricing or arrival rate (ALL M4); review text (M5/M6)
Critique rounds used: 0/3

  **ORCHESTRATOR RULINGS AT PLAN, 2026-08-10.**

  1. **NO SEAM, AND THE BUILDER DID NOT OFFER ONE — accepted with its argument, not by
     default.** It enumerated three cuts and showed each leaves a half unable to discharge a
     criterion: *function/record* ships a mechanism that is off, **verbatim G-014b's
     criterion-2 failure**; *reviews/boundary* ships the field before the fence, which is the
     wrong order for a fence; *reviews/WATCH* spends a goal's ceremony on one `--record` flag.
     The load-bearing reason it stays sweepable: **the review function reads no world state
     but the departing guest** — no provider search, no reservation, no ordering — so none of
     the classes `ai-critic` hunts is expressible in it. Its predictions (1-2 sweeps, 0
     BLOCKERs, **at least one MAJOR landing on the derivation or the evidence rather than the
     code**) are scored at REFLECT.
  2. **CRITERION 2 GAINS A NEGATIVE CONTROL.** "Three distinct scores" is a measurement only
     if some configuration yields fewer: `--rooms 6 --amenities 0` yields **one**. Without it
     the number 3 is a constant.
  3. **THE SCALE'S SIZE IS DERIVED, NOT CHOSEN — AND THE INEQUALITY BELOW IS WRONG. SEE
     RULING 7, WHICH SUPERSEDES IT.** Corrected in place rather than appended beside, because
     `balance-critic` found the superseded form still standing here after the build had already
     removed the field it describes — a reader of this block would have re-introduced it. A top
     review must be unreachable while any need is unmet; with uniform weights that holds
     **exactly when `bands > needTypes`**. Shipped: 1..5 against 4 need types. **It is
     refused at bind time**, so content whose review scale cannot express its own need table
     does not load — the same standing as a need no provider claims.
  4. **THE SATURATION ADMISSION IS ACCEPTED AND PARKED, NOT PATCHED.** At `--amenities 5`
     every guest meets every need with no wait, so every review is maximal. **That is a
     correct answer to an oversupplied hotel, and inventing a term to make a perfect stay
     review imperfectly is manufactured difficulty.** Demand is a fixed cadence until M4, so
     the question is not answerable here. Parked with its falsification test: *when M4 makes
     arrivals respond to reputation, re-run the ladder at the configuration a player can
     afford; if the top score is still modal there, the scale needs a term oversupply cannot
     buy.* **`balance-critic` owns this goal precisely because this is dominant-strategy
     territory — if it reads this as a dominant strategy rather than a correct answer, that
     is a §5.3 adjudication and I would rather have it than a pre-emptive patch.**
  5. **THE §5.8 SWEEP FOUND THE CLASS IN TWO SHIPPED TESTS, AND NEITHER IS REPAIRED HERE.**
     `needs.report.test.ts:108,116,335` — G-012's criterion as a test — asserts *two* of four
     need rows straddle met-and-unmet, so **a build with two inert needs passes**: the human's
     G-019 finding, one goal earlier, in a closed goal's recorded criterion. And
     `hysteresis.report.test.ts:133,344` sums `abandoned` across rows, so three of four rows
     at zero satisfies it. **Reported with locations rather than repaired** — widening this
     goal to fix two earlier goals' criteria is how a fat goal starts. Parked.
  6. **I2's HASH WILL MOVE** — a new `World` field and new content. The builder reports the
     new value; that is expected, not a regression, and the unmoved set to check is
     `SAVE_V1_CONTENT` `8e09fe4f0fa162a3` and the v1 fixture's zero-line diff.

  **§5.6 RULINGS 7-12 — `balance-critic` returned PROCEED with 1 BLOCKER + 5 MAJOR, every one
  carrying a measurement from 1000-day runs across twelve configurations. Its verdict on scope:
  *"the risk in this goal is not size. It is that four of the five criteria are satisfied by
  distributions that are point masses, and one term of the design is pinned by nothing."***

  7. **THE BAND DERIVATION IS WRONG AS RULING 3 STATES IT. `bands > needTypes` USES THREE
     SYMBOLS AND CONSTRAINS TWO.** Counter-example that passes bind time: **min 1, max 5,
     bands 8, needTypes 4** — a guest meeting 2 of 4 needs scores `1 + floor(0.5 x 8) = 5 =
     max`, **a top review with half the need vector unmet**, which is exactly what the
     inequality exists to forbid. **The property holds iff `(max - min) >= needTypes`**, i.e.
     `bands` is DERIVED as `max - min + 1` rather than authored. Shipped: two integers on disk,
     `bands` derived, so the 1/5/8 document **cannot be written**. The shipped scale sits
     exactly on the boundary (5 - 1 = 4 = 4 needs), so **a fifth need type refuses all content
     until the scale widens** — intended, and nobody would guess it from ruling 3's wording.
  8. **THE EVICTION FLOOR STAYS AND ITS JUSTIFICATION IS REPLACED.** The money-loop argument
     was **wrong**: evicting forfeits the guest's 8,500p stay and refunds 5,000bp of a
     250,000p build, so "let them in, demolish, refund" already **burns 133,500p per guest**
     before any review is written. The one place demolition pays is the free `--rooms N`
     seeded stock — ADR-0013 §5's scenario-capital contamination, **an M4 prerequisite with
     its own owner, not something the review scale should be defending against.** The honest
     justification, and the one written in the code: **an eviction scores the HOTEL'S CONDUCT,
     not the guest's experience.** Its cost is pinned as a test rather than hidden: an evicted
     guest meeting three of four needs scores 1, while a gave-up guest meeting one scores 2.
  9. **THE TOP-BAND SHARE IS NON-MONOTONE IN ROOM COUNT AND PEAKS AT THE SHIPPED DEFAULT.
     RECORDED AS A MEASURED PROPERTY AND PARKED, NOT PATCHED.** 1000 days, seed 7,
     `--amenities 1`:

     | rooms | five-star share | mean |
     |---|---|---|
     | 1 | **25.00%** | 2.750 |
     | **3 — `HOTEL_ROOMS`, the default** | **41.66%** | 3.583 |
     | 6 | **0.01%** | 4.000 |
     | 12 | **0.01%** | 4.000 |

     **Building from 3 rooms to 6 destroys 41.65 points of five-star share while raising the
     mean.** A queueing guest completes its engagement needs while it waits, and the queue
     costs it nothing below 145 of 180 patience ticks. **THE MEAN IS MONOTONE**, so this is a
     constraint on M4 rather than a defect in what ships here: **a reputation term reading the
     MEAN is safe; one reading share-of-top-reviews inverts the build loop at the
     configuration a player starts in.** Parked with its falsification test, and the parked
     item must say **which statistic M4 may read** — ruling 4's hypothesis does not cover this,
     because it asks only whether the top score is modal under high amenity density.
  10. **ONE INTEGER DIVISION, NOT TWO.** `floor(sum/needCount)` then
     `floor(x*bands/ONE_WHOLE)` is not `floor(sum*bands/(needCount*ONE_WHOLE))` unless
     `ONE_WHOLE % bands == 0`. Shipped bands 5 divides 10,000, so no bite today — **but the
     scale is content.** Counter-example, shipped as a test: min 1, max 3, bands 3, needTypes
     2, lodging-only with waitShare 3333 → **score 1 two-step, score 2 one-step. A whole
     band, from a rounding step nobody would look for.**
  11. **THE REVIEW STORE FOLLOWS THE `needOutcomes` IDIOM** — sparse rows, created on first
     use, ascending and unique, empty by default. `assertWorldShape` is content-free by
     construction and the review scale is CONTENT, so a fixed-length table indexed by the
     scale has no content-free shape check available at load. **And `buildSummary` states that
     law B is FALSE of a legitimately migrated v9 world carrying evictions** — latent because
     nothing builds a summary from a loaded save, but every other law there carries its own
     why-this-cannot-fire paragraph and this one's would otherwise be weaker.
  12. **THE SATURATION PARKING GAINS ITS COST SIDE.** `balance-critic` does **not** read the
     `--amenities 5` saturation as a dominant strategy, and said so with pennies rather than an
     opinion: the top band costs **22,500,000p per 1000 days at `--rooms 6` — 22.1% of room
     revenue** — against **4,500,000p (4.4%)** for the two bands `--amenities 1` buys. **The
     last band costs 4x the first two, so the ladder already has diminishing returns priced
     in.** My ruling 4 stands, now with its numbers, and those numbers belong in the parked
     hypothesis because "the configuration a player can afford" is not decidable at M4 without
     the cost side.

  **AND THE REJECTED `satisfyTicks` WEIGHTING WAS REJECTED FOR A STRONGER REASON THAN THE
  BUILDER GAVE.** Under it, **every one of the three engagement-need flips leaves the top band
  intact** — entertainment 0.844, comfort 0.844, nourishment 0.813, all clearing the 0.800
  threshold. Not just `guest_entertainment`: all three.

  **THE HEADLINE CRITERION CANNOT DETECT WHAT IT CLAIMS — HUMAN FINDING, 2026-08-09,
  BEFORE PLAN. Read this before designing the review function.**

  **Departure outcome is currently IDENTICAL to `night_rest`'s outcome — not correlated,
  identical.** Measured across all three of G-017's recordings:

  | recording | satisfied | night_rest met | gave up | night_rest unmet |
  |---|---|---|---|---|
  | crowded | 16 | **16** | 189 | **189** |
  | amenities | 32 | **32** | 0 | **0** |
  | ticks | 8 | **8** | 0 | **0** |

  And in the crowded run, of the **16** who departed satisfied, only **2 got comfort and 3
  got entertainment**. **A guest who met one need of four leaves under the same departure
  reason as one who met all four.** Comfort, entertainment and nourishment are currently
  **instrumentation, not mechanics** — recorded, and changing nothing. Giving them
  consequence is this goal's job.

  **THE PROBLEM: `--rooms 1` vs `--rooms 12` varies `night_rest` satisfaction enormously**,
  so **a review function that reads ONLY the lodging need produces two wildly different
  distributions and passes the differential criterion green.** Three-quarters of the need
  vector could contribute nothing and the criterion advertised as the one that "cannot be
  faked" would not notice.

  **THE REPAIR — A SECOND AXIS, and it is a criterion, not a suggestion:**

  > **Hold room count FIXED and vary amenity density, and require the review mean to move.**

  The first arm measures whether reviews respond to **lodging**. The second measures whether
  they respond to **the stay**. The content to build the control already ships — `watch-ticks`
  and `watch-amenities` have identical entity composition — so this costs an invocation, not
  a design.

  **This is the ADR-0007 class arriving at a goal BEFORE it is built, which is the cheapest
  possible moment**, and it is the first time in this project that has happened.

  **A SECOND READING, WORTH TAKING BEFORE M2 EXIT: THERE IS NO MIDDLE.** 36 arrivals → 32
  satisfied, **zero** gave up. 216 arrivals → 16 satisfied, **189** gave up. **The system is
  bimodal — flawless or catastrophic, with nothing between.** For a casual management sim the
  interesting territory is the middle band, where most guests are mostly happy and a few
  grumble, because that is where a player's decisions register as improvements rather than as
  flipping a switch. **Whether that is a real defect or an artefact of two deliberate
  extremes is not decidable from three recordings, and neither of them sits anywhere near the
  middle.** Record one at roughly **6 rooms and 24 arrivals/day** — the configuration a
  player would actually be in — before M2 exit.

  **AND ONE GENUINELY GOOD SIGN IN THE SAME DATA, NOBODY WROTE IT:** with cafés plentiful,
  nourishment is met **32/32 by rooms** and the vending machine goes unused; when starved,
  **7 of 13** satisfactions come from the machine. **The utility scorer prefers the better
  provider and falls back under pressure. That is emergent, not designed.**

  **THIS IS THE BEHAVIOURAL HALF, AND IT IS DOMINANT-STRATEGY TERRITORY.** A review scale
  that saturates for any hotel that opens the door is the failure to hunt, and `ai-critic`'s
  catalogue does not cover it — which is why `balance-critic` owns this goal rather than
  taking a bolted-on second round. The differential criterion (1 room vs 12) is the one
  that cannot be faked.

  **LAST IN MILESTONE → second critic from a different pair (§7.1).** `ai-critic` takes it,
  hunting guest-loop mechanics while `balance-critic` hunts the dominant strategy. The
  split gives that rule **a small diff to work on rather than the largest one in the
  milestone**, which is the point of splitting rather than a side effect.

  **THIS GOAL DISCHARGES M2's "VISIBLY"** (§8, ADR-0013). The review distribution is a good
  criterion and it is not what that word says. The WATCH entry is a criterion here, not a
  courtesy.

## G-016 — Guest-loop cost under a need vector
Status: done — 2 critique rounds (3 MAJOR + 2 MINOR). Trigger fired and discharged;
  I5 ~~61-63% raw~~ (withdrawn G-018). Signed off WITH its criterion mismatch recorded, not re-scoped.

  G-012 is `blocked` on this goal. Its work is complete, correct and critiqued; I5 is
  red — **against the invented budget, which G-018 has since shown was ~39x tighter than
  any stated requirement. The blockage was real, its cause was a number nobody could
  source, and this is what "a made-up constant is promoting goals" looks like from
  inside.** §2 is explicit that no goal is done while any gate is red, so G-012 does not
  commit until this lands. The builder refused to report ready rather than shipping a
  red gate, which is the rule working.

  THE NUMBERS — CORRECTED 2026-08-08, AND THE CORRECTION IS THE LESSON.
  This block first recorded HEAD at 4,618ms, G-012 at 11,151ms, and "this machine is
  ~30% slower than when the project's figures were taken". **The ratio survived; the
  absolutes and even the DIRECTION of the drift did not.** Later paired measurement put
  HEAD at 2,898ms (builder) and 2,939ms (sim-critic) against G-011's recorded 3,510ms —
  so the machine was *faster* than the record, not slower. The same G-012 build measured
  3,087ms early in the session and 1,740ms later on one workload.

  **WHAT IS TRUSTWORTHY: THE RATIO. WHAT IS NOT: ANY ABSOLUTE COMPARED ACROSS SESSIONS.**
  Three independent measurements of G-012 against HEAD — 2.41x, 2.37x, 2.32x — agree
  within noise across hours of drift. Every figure in this project taken as an absolute
  against a baseline captured at a different moment should be read with that in mind;
  two such figures have now had to be retracted (this one, and the ledger-append trigger
  corrected at G-010).

  The trigger fired on a real reading: five consecutive orchestrator runs were 11.3s to
  12.7s, consistently red, and G-012 measured 2.3-2.4x HEAD by every method tried.

  SCOPE QUESTION G-016 MUST ANSWER RATHER THAN INHERIT (ai-critic, G-012 round 1):
  `assertGuestStoreInvariants` is **1.56s of an 8.22s run — 19%** — measured by
  no-opping its body. At HEAD the same function was ~0.4s, so a per-tick re-validation
  of state the tick just produced grew **~4x** and is now a fifth of the run. **That is
  VALIDATION POLICY, not guest-loop cost.** G-016 must say which of the two it is
  optimising. It must NOT simply delete the scans: they are what makes a reservation
  leak loud, they run at load as well as per tick, and G-010's builder refused to gate
  them on the grounds that "the honest fix is to make the check cheaper, not rarer".
  Gating or sampling is a real decision that needs its own argument and its own record
  of what coverage is surrendered.

  What the profile says is NOT the problem: no superlinearity (scaling ratios 3.74x and
  3.72x against the 6x bound), cost flat in amenity count, `stepGuests` 21.3% and
  `advanceNeeds` 11.4%.

  ---
  CRITERION 1 COULD NOT FAIL IN THE STATE THAT CREATED THIS GOAL, and I am signing it
  off with the mismatch recorded rather than re-scoping it, on sim-critic's advice.
  The TRIGGER is "sim:bench exceeds 70% of budget"; the EXIT CRITERION is "sim:bench
  green", which is "under 100%". The pre-G-016 build was already green at ~~68% raw~~
  (withdrawn G-018), so
  criterion 1 was satisfied before a line was written, and criterion 4 restates it.
  **G-018 MAKES THIS WORSE, AND SAYS SO HERE BECAUSE THIS IS WHERE IT WAS DIAGNOSED.**
  Both the trigger and the exit criterion were percentages of a budget that was itself
  invented and ~39x tighter than any stated requirement. So criterion 1 could not fail for
  a second, deeper reason than the one recorded above: there was no requirement behind the
  number it compared against. This block is the evidence for ADR-0013 §4 and for the goal
  that acted on it. The
  goal STATEMENT was likewise already true at BUILD start. **The real subject was
  HEADROOM, and no criterion names a headroom number.** Third criterion in the project
  with this class (`pnpm test -- world` G-001, "zero guests served by an invalid room"
  G-009). Criteria 2 and 3 are honest and were verified independently.
  The point of recording it rather than rewriting it: the next goal inherits a NUMBER
  rather than a green tick.

  MEASURED OUTCOME (sim-critic, paired and interleaved, all arms hash-identical):
  HEAD 2,939ms · pre-G-016 6,812ms (2.32x) · **G-016 6,081ms (2.07x)** · real cut
  **10.7%** · ~~I5 raw 61.5%, normalised onto G-011's baseline 74%~~ (withdrawn G-018).
  The paired ratios and the 10.7% cut are exactly what survives a budget change — a
  percentage of the budget was never the finding here, and the normalisation onto another
  session's baseline is the practice `CLAUDE.md` rule 3 now forbids.
  Per lever: L1 `depart` hoist 7.8% · L2 lazy message -0.4% · L3a lockstep 1.6% ·
  L3b and L3c dropped for paying under 2%.

  THE COSTED LEVER, PINNED SO THE NEXT RED GATE PULLS IT INSTEAD OF REDISCOVERING IT:

  | option | 365-day bench | recovers |
  |---|---|---|
  | as shipped | 6,154ms ~~(61.5%)~~ | — |
  | gate the scan on guests/entities identity | 6,071ms | **1.3%** |
  | sample the scan every 8th tick | 5,024ms | **18.4%** |
  | no-op the scan body (ceiling) | 4,971ms | 19.2% |

  **GATING IS DEAD, AND IT IS NOW MEASURED RATHER THAN ARGUED.** Over 525,600 bench
  ticks the guest store is reference-unchanged on **exactly one**. G-010's builder said
  change detection buys nothing here; that is now a number. **Take it off the table
  permanently — do not re-argue it at G-013.**

  SAMPLING IS LEFT UNPULLED, DELIBERATELY. It recovers 18.4% of the available 19.2%, so
  this is a real 19%-against-coverage trade with no third option — "make it cheaper" is
  largely spent at ~20ns per need over 31.5M need-ticks. ~~But I5 sits at 61.5% with 38%
  headroom~~ (withdrawn G-018 — and the headroom is now ~98%, which strengthens this
  paragraph rather than weakening it) and G-004's rule stands: optimising against a gate
  that is not failing is speculative work.
  **WHAT SAMPLING WOULD SURRENDER, stated correctly** — the orchestrator's first
  argument ("a leak persists by definition, so sampling only misses one that
  self-heals") was WRONG. It surrenders a **one-tick double-booking: two guests in one
  bed for a minute.** Player-visible, §6.1's "reads as stupid" literally, and this scan
  is the only thing in the build that would catch it. Unexpressible today (one `held`
  set per tick) — but **M3 makes a provider a queue with capacity and M6 adds
  `placeItem`, and both weaken that construction argument.**
  When it is pulled: sample on the TICK COUNTER, never on change detection; keep
  `save.ts`'s call unconditional; and record the transient double-book as the surrendered
  class, not merely a self-healing leak.
Milestone: M2
Owner pair: ai-engineer / ai-critic
Statement: ~~The guest loop's per-tick cost stays inside the I5 budget~~ **RESTATED AT
  G-018 ROUND 3:** the guest loop's per-tick cost stays inside its stated SCALING BOUND
  when every guest carries the full need vector and every need has competing providers.
Exit criteria:
  - ~~pnpm sim:bench green with the shipped M2 content~~ **RESTATED:** `pnpm exec vitest
    run scaling` green, with `pnpm sim:bench` green as a floor rather than as the measure
  - pnpm exec vitest run scaling  asserts cost at N needs per guest is under <k>x cost
    at 1 need, AT FIXED CONCURRENT GUEST COUNT (the honest axis — G-010 made tick cost
    O(guests), and --rooms 20/60/120 all cost the same)
  - the optimisation does not move the I2 state hash (the G-010 acceptance bar)
  - all §2 invariant gates green (pnpm verify)

  ~~TRIGGER: promote to pending if, after G-014, pnpm sim:bench exceeds 70% of the I5
  budget~~ **— DEAD AS OF G-018 AND NOT REPLACED, DELIBERATELY.** The budget is derived
  and the bench reads ~2% of it, so that half of the trigger can never fire again. No
  substitute threshold was invented here: doing it inside the goal that deleted the first
  unsourced number would have minted the second. **What still promotes this goal: the
  needs-scaling ratio exceeding its bound** — which is a ratio, has a stated derivation,
  and is the half that was always doing the work. A budget-shaped replacement, if one is
  ever wanted, is a paired ratio against a committed baseline (`PARKING.md`, out of
  G-018). Otherwise it stays parked and the
  readings go in PARKING.md. Per G-004: optimising against a gate that is not failing is
  speculative work.

  **ROUND 3 — THE STATEMENT AND CRITERION 1 ABOVE ARE RESTATED, AND G-018 SHOULD HAVE DONE
  IT WHEN IT STRUCK THE TRIGGER.** Striking the trigger and leaving them was half a fix:
  "per-tick cost stays inside the I5 budget" and "`pnpm sim:bench` green" are now satisfied
  at ~2% — **by a build 50x slower than the one that motivated this goal** — so the goal
  could be promoted by a live path and then exit on criteria that could not fail. That is
  ADR-0007's amendment exactly, and this diff spends three paragraphs applying it to this
  very block while re-creating it two lines above. Both now rest on the SCALING RATIO,
  which the paragraph above already identifies as "the half that was always doing the
  work". `sim:bench` stays as a floor: it can still catch a catastrophe, which is all a
  sanity ceiling claims (`HOTELSIM.md` §2.1.3).

---

## G-020a — The measurement instrument (`sim:measure`)
Status: **done** — 3 sweeps (**1 BLOCKER** + 4 MAJOR + 3 MINOR + 1 NIT). The project's
  first BLOCKER, twenty goals in, and it was an **evidence** defect rather than a code one.
Milestone: M2
Owner pair: sim-engineer / sim-critic
Statement: A command that measures the working tree against a baseline revision at a
  single-sourced workload and **reports a ratio**. No bound, no verdict, no CI gate.
Exit criteria:
  - `pnpm sim:measure --head <a sim-changing revision>` prints a ratio, the workload it
    names, its method, both resolved SHAs and both digests, and exits 0
    *(could pass vacuously alone — 2 and 3 are the teeth)*
    **CORRECTED A SECOND TIME.** It read `pnpm sim:measure` bare — which **cannot** print a
    ratio, both SHAs or graph digests **by construction**: the default head is the working
    tree, which has no SHA (`measure.mjs:239`), and a run that changes no sim file returns
    at IDENTICAL before the graph audit. **That is correct instrument behaviour and a wrong
    criterion** — and it is the same defect as the round-2 correction eight lines below,
    which repaired criterion 2 and left this one carrying it. **The remedy is the criterion,
    not the instrument.**
  - `pnpm check:measure` green, **including**: *(**CORRECTED at round 2 — this read
    `pnpm exec vitest run measure`, a command THIS GOAL MADE UNMEETABLE by deleting the file
    it selects. Not failing: unmeetable, §7's own definition, and the block said `done`
    above it. The proofs moved to a standalone gate by human ruling — "it is a gate wearing
    vitest's clothes" — and the criterion did not follow them.*) a planted decoy leak → ERROR;
    empty materialisation → ERROR; `IDENTICAL` textually distinct from `MEASURED`; the null
    experiment inside its derived tolerance with identical state hashes; `bench.mjs`
    declares no workload of its own; **`ROOMS 60→3` and `ARRIVAL_EVERY_TICKS 32→3200` each
    redden the golden**, which before this goal they did not
  - the readings recorded in `JOURNAL.md`
  - `pnpm verify` green
Critique rounds used: 1/3

  **THE SEAM WAS TAKEN, AND THE BLOCKER THAT FORCED IT WAS `sim-critic`'s.** The original
  G-020 planned a bound of `2.40^(1/7)`, where **N = 7 was a reading, not a derivation** —
  at commit `9e08d6f` the same method on the same milestones gave N = 5 and a bound of
  1.191, because **M2 was in flight and grew 5 → 11 while we worked.** Defensible N spans
  5.5–11 and the bound spans 1.083–1.191. *"A moving quantity nobody committed to, sampled
  once"* — §2.1's own definition of a superstition, in the goal written to enforce §2.1.

  **THE ORCHESTRATOR'S RULING WAS ALSO REFUTED.** I ruled the tight bound because drift
  compounds. The answer: **the failure is cumulative and the instrument is per-goal**, and
  they coincide only if growth is evenly spread — which the repo's own data denies.
  Worst-case full compliance was `7 × 1.1332 = 2.40×`: **the entire M3 allocation spent with
  the gate green at every step.** Red on the one shape observed, green on the shape it was
  built to stop.

  **THE BLOCKER**: two tests named historical revisions by sha while **CI checks out a
  shallow clone** (`fetch-depth` defaults to 1), so `pnpm test` — the I4 gate — would have
  gone red on all three platforms the moment this landed, **and worse after COMMIT**, when
  the tip's parent disappears too. Reproduced in a real `--depth 1` clone by both critic and
  builder. Fixed with `fetch-depth: 0` **and a test asserting the workflow declares it**, so
  a later CI tidy-up cannot silently re-shallow the clone and take both proofs with it.

## G-020b — The tick-cost tripwire: a bound, a verdict, and proof of bite
Status: **done, DRY at 3/3** — 3 sweeps (1 BLOCKER + 4 MAJOR + 5 MINOR) plus 3 verification
  passes, **one of which converted and spent the last sweep**. Closed on the round the budget
  allowed and no further. **HARD PREREQUISITE OF M3 — discharged.**

  **THE GOAL'S OWN SHAPE, IN ONE LINE: every round found the same defect one constant further
  along.** Round 1 — `NOISE_CEILING` was a hand-typed literal beside a campaign of display
  strings nothing read, so the bound was arithmetic between three literals. Round 3 — the
  ratchet brake that should have stopped a pooled ceiling running to absurdity was prose;
  a 2.06 "noise" ceiling shipped green. Round 4 — **ADR-0015's REPLACE half was still prose**,
  and `MEASURE_DAYS` 30 → 3 ran a 3-day arm under a 30-day bound at exit 0. Three instances of
  ADR-0007's class, in the file built to hunt it, found in three consecutive rounds.

  **VERIFIED BY THE ORCHESTRATOR, NOT READ** (§5 VERIFY). The round-4 fix was probed
  independently in a scratch copy — guard present → exit 1 refusing on the configuration;
  guard neutralised → **exit 0, `days=3 bound=1.4557`**, the hole verbatim. `pnpm verify` ×2,
  ten gates green each; `check:tickcost:proof` ×3, control 0.97/0.94/0.96, M1 4.84/4.07/4.30×
  red, M2 2.78/2.91/3.18× red. Regime for every figure: quiet, `win32/12cpu`.

  **THE GATE'S FIRST LIVE RUN ON ITS OWN GOAL IS AN ABSTENTION**, and that is correct rather
  than embarrassing: `git diff --stat -- packages/` is empty, so the arms are byte-identical
  and the verdict is `IDENTICAL:1`. It is also the exact case the verdict COUNT exists for —
  without it, a reader cannot tell an abstention from a measurement.

  **G-020b IS BUILDABLE, AND THE ORCHESTRATOR'S CLAIM THAT IT WAS NOT IS WITHDRAWN.**

  I reported that G-020a *"established the repo cannot measure at the precision a tripwire
  needs"*. **That was wrong, and I derived it from the wrong figure.** Checked in the code
  rather than the plan:

  > `measure.mjs:330-346` — **six samples per arm, arms INTERLEAVED at the process level
  > with the first-mover ALTERNATING**, warm-up discarded, medians. `SAMPLES = 6` and *"the
  > parity is load-bearing"*, because the null experiment showed the second arm in a round
  > pays ~33% for the first one's garbage and an odd count re-opens that bias.

  **It is a paired interleaved ratio instrument by construction — `CLAUDE.md` rule 2's own
  method — not an absolute one.** So the human's concern that it might have *"inherited an
  absolute tripwire by default"* does not apply.

  > **BOTH FIGURES BELOW ARE WITHDRAWN AT G-020c, IN PLACE RATHER THAN DELETED.** The `±10%`
  > carried **no load condition** (rule 4's fifth slot, ruled in after this was written), and the
  > `±3%` **does not reproduce** — two `--repeat` medians on a null read 0.9067 and 1.0501.
  > `CLAUDE.md` rule 5: withdrawn, not restated. The pinned replacement is `tripwire.mjs`'s
  > `BOUND_CAMPAIGN`, whose arms each carry five slots and whose ceiling is computed from them.
  > The paragraph stands as the record of what was believed; **do not quote its numbers.**

  **What the ±10% actually is**: the spread of **that ratio** across repetitions of a
  six-sample invocation, near 1.0. It is not a single-reading absolute. **A `--repeat 7`
  median is ~±3%**, which is within touching distance of the ±2% `CLAUDE.md` records for
  G-012's three independent campaigns — and those measured a **2.3× effect across hours**,
  not a 1.0× null in one sitting, so they were never the like-for-like comparison I treated
  them as.

  **THE QUESTION THAT DECIDES THE BOUND, AND IT IS STILL UNANSWERED — ANSWER IT AT PLAN:**
  *what class of regression is this for?* **Every performance defect this project has
  actually produced was a MULTIPLE** — 2.32×, 235% of budget, two quadratic folds. **None
  was a 10% creep.** If the subject is algorithmic regression, **a ~1.15× bound at ±3%
  precision is comfortable and the tool's inability to resolve 10% is irrelevant rather
  than fatal.** If the plan comes back measuring single readings or chasing a drift-scale
  bound, G-020a's finding has correctly killed the goal and it is re-scoped or closed.

  **TWO OBLIGATIONS INHERITED WITH DIAGNOSES ATTACHED — both are pending rulings, and a
  pending ruling whose urgency has just been reduced is a pending ruling that dies.**

  **1. THE EXTRACTION IS OWED IN FULL, AND `--maxWorkers: 2` IS A STOPGAP WITH AN EXPIRY.**
  The human ruled (2026-08-09) that the instrument test is *"a gate wearing vitest's
  clothes"* and belongs in its own script beside `test:determinism`. G-020a began it
  (`pnpm check:measure`). **The cap in `vitest.config.ts` is provisional, carries a comment
  saying so, and is REMOVED AND RE-MEASURED when the extraction completes.** It weakens no
  assertion and every test still runs — **but a concurrency cap applied globally to
  accommodate one 39-second test is a tax on every future run**, and this repo already
  holds two examples of a stopgap becoming policy by inertia (the 30s timeout, and
  `bench.mjs`'s withdrawn "faster tick, not a bigger number").

  **2. `needs.scaling.test.ts` IS THE OTHER I4 DEFECT AND IT IS YOURS.** A **named**
  assertion failure against hard timing bounds (2.5×, 1.9×) — ~8% isolated, ~33% in-suite —
  ~~**and G-020a's own measurement explains it: a single timing reading here is worth ±10%.**~~
  **THE EXPLANATION WAS RIGHT IN SHAPE AND WRONG IN QUANTITY, AND G-020c MEASURED THE
  DIFFERENCE**: the `±10%` is withdrawn (it named the `sim:measure` ratio, in no stated regime),
  and the actual cause is that **the incumbent 2.5 bound sat inside the assertion's own QUIET
  spread** — 2.5906 / 2.6534 / 2.5903 observed with nothing to find, on three harnesses.
  *A gate built on one timing sample cannot be more reliable than one timing sample.* The
  repair is the same repair this goal owes its own bound: **repeat, or move the bound onto
  something a single sample can carry.** `check-measure.mjs` is the pattern for the venue.

  **THE TWO ARE DISTINCT DEFECTS AND WERE ONCE COUNTED AS ONE** — one has zero failing
  tests and an RPC timeout, the other names a test. **Do not inherit the conflation**;
  `ESCALATIONS.md` carries both signatures with counts and observers.

  **INHERITED FROM G-020a AS MEASUREMENT, NOT ASSUMPTION:**

  1. **THE CALIBRATION IS NOT DISCHARGED AND CANNOT BE.** `CLAUDE.md`'s 2.41/2.37/2.32×
     **is not a commit pair** — it measured G-012's *unoptimised* need vector, a state never
     committed, and G-012 and G-016 shipped in **one commit**. The shipped pair is 2.07×,
     and even that is unreachable: `f43699d → aa30218` returns INCOMPARABLE because HEAD's
     harness calls `roomTypeServes`, added at G-013. **The instrument's reachable history
     starts at G-013, and the repo's only cross-session-durable ratio is on the wrong side
     of it.**
  2. ~~**THE SINGLE-READING FLOOR IS ±10%; a `--repeat 7` median is worth ~±3%.**~~
     **BOTH FIGURES WITHDRAWN AT G-020c** — no load condition on the first, and the second does
     not reproduce (0.9067 / 1.0501). The CONCLUSION below needs neither and stands: Five
     sittings. **The null spread overlaps both real pairs**, so **the 1.13 bound originally
     ruled is not measurable by one invocation of this tool.** The two ways out are
     `--repeat` (measured, linear cost) and a longer arm (unmeasured — and it re-derives the
     instrument's own cross-check but no longer touches the golden).
  3. **A residual head-slow slot bias of ~1% is not excluded** — the null median sat at or
     above 1.000 in four of five sittings.

  **AND THE SHAPE THE BOUND PROBABLY WANTS**, from `sim-critic`: on the **running product
  against a milestone anchor**, not on HEAD~1. That catches 7×1.13, passes
  1×2.37-then-flat, **needs no N**, and makes *"this goal spent 40% of M3's headroom"* the
  thing the gate says out loud. Its honest cost: an anchor drifts from the working tree's
  API, so the INCOMPARABLE rate gets worse the longer a milestone runs. The cheap middle is
  a per-goal gate **plus a reported running product** — a sum of logs of numbers the gate
  already has, report-only, which removes the always-green-while-the-allocation-empties hole.

  **INCOMPARABLE IS A VERDICT, NOT AN ERROR** — including when the arms disagree about how
  much work they did. **The first M3 commit that changes how many guests arrive must not
  turn the tripwire red**, and M3 is queued shared resources, where a guest who cannot reach
  a room is the headline case.
Milestone: M2
Owner pair: sim-engineer / sim-critic
Statement: A paired ratio against the previous commit, at fixed workload, with a stated
  bound, run as a gate. The thing that has actually guarded tick cost for eighteen goals
  becomes a mechanism instead of a practice.
Exit criteria:
  - a gate command measures HEAD against the previous commit **paired and interleaved in
    one sitting**, medians of ≥5, warm-up discarded, at a fixed workload it names
  - its bound is derived and stated (`HOTELSIM.md` §2.1). ~~G-010's "measured × 1.5, then
    held at or below" is the shape~~ — **REPLACED AT BUILD, see ADR-0015: that rule is for a
    measured SIGNAL, and applying it to a noise floor is circular, because a perfect null of
    1.0000 yields 1.5000 too.** The shape is `sqrt(noise ceiling × smallest known
    regression)`; a round number is still not.
  - ~~a deliberately inserted O(n²) in the guest loop turns it **red**, proven by mutation,
    and that mutation turns nothing else red~~ **REWORDED AT PLAN — the second half was
    UNMEETABLE and it was the orchestrator's.** `scaling.test.ts` compares arms differing by
    4× concurrent guests against `BOUND = 6` (measured 3.19–3.80 today, worst at 63%), so a
    guest-loop quadratic makes that ratio ~16× and reddens it too: no correct implementation
    could satisfy it. **Sixth criterion of ADR-0007's class, and the same shape as G-020a's
    criterion 1.** Replaced by: **two mutations, each turning it red and NO CORRECTNESS TEST**
    — a quadratic (records what else it reddens rather than claiming nothing), and a
    **constant factor at the shipped workload**, which is the marginal-value witness
  - it reports the **ratio**, never an absolute against a figure from another session
  - all §2 invariant gates green (pnpm verify)
Out of scope: pulling any optimisation (the sampling lever stays pinned); changing I5;
  changing any other gate's threshold; **`vitest.config.ts`'s `maxWorkers` cap and
  `needs.scaling.test.ts` — both SPLIT to G-020c at PLAN, see below**
Critique rounds used: 0/3

  ### BUILT 2026-08-09 — what shipped, and every number with all FIVE of rule 4's slots

  **`pnpm check:tickcost`** — `tools/gates/tripwire.mjs`. It spawns `measure.mjs --json` and
  applies a bound to the JSON, so **the seam G-020a was split on is a process boundary**: the
  judging code cannot reach into the measuring code, the instrument still renders no verdict,
  and `check-measure.mjs` asserts both halves. `packages/sim` is untouched.

  **THE BOUND IS 1.4557, AND THE RULE THAT PLACES IT IS ADR-0015.**
  `sqrt(1.0238 × 2.07)` truncated to 4dp. Margins **1.42186× above noise and 1.42200× below the
  class it catches** — near-equal, **not equal**: the geometric mean equalises them exactly and
  the truncation required by "held at or below" does not. **The ceiling is COMPUTED from the
  campaign readings** — there is no `NOISE_CEILING` literal — and the gate refuses to start if
  the written bound is not its own derivation, in either direction.

  **IT MOVED 1.4550 → 1.4557 AT ROUND 3, BECAUSE A READING WAS ADMITTED — AND THAT IS THE
  MECHANISM WORKING.** `workload.mjs` recorded n=9 of the same `--null` quantity, same
  instrument, same hotel, same 30-day arm, at **0.9268 .. 1.0238** — a larger excursion than the
  campaign's own nulls — and it had been left out of the derivation **only because it was filed
  under "which arm length to ship"**. `sim-critic` found it; the orchestrator ruled it in on
  ADR-0015's own words, *an observed excursion counts whatever produced it*. **Round 1 removed
  the transcription step from the derivation; this removed the CURATION step**, which was the
  one still deciding by hand which readings counted. **First time in this project a bound has
  changed because a reading was admitted rather than because someone edited a number.**

  **CORRECTED AT ROUND 1, MECHANICALLY, BY THE MACHINERY BUILT TO CATCH IT.** It shipped as
  **1.4551** off a ceiling transcribed as **1.0229** — a round **UP** of 1.0228405, in a file
  whose own text says "held at or below, never rounded up". The moment the ceiling became
  computed rather than typed, the gate refused to start and named the correct figure. The
  effect is 0.007%; **the point is that the transcription step was the unpinned link and it had
  already drifted on its first use.** `sim-critic` flagged the round-up as a MINOR; deriving the
  value removed the step rather than correcting it.

  **THE CAMPAIGN, AS SHIPPED — FOUR ARMS, 24 READINGS.** What: the `sim:measure` ratio, on two
  null arms and two real adjacent sim pairs (`9af0e50` G-015, `a011f38` G-014a) · Workload:
  60 rooms, an arrival every 32 ticks, seed 42, **30 days = 43,200 ticks** · Samples: per-arm
  below, each reading itself a ratio of medians of 6 process-level samples · **Regime: QUIET,
  no deliberate concurrent load, 12-core developer machine** · Aggregation: largest upward
  overshoot over the arm's centre (1.000 for a null, the median for a fixed real pair).

  | arm | n | min .. max | centre | upward overshoot | sitting |
  |---|---|---|---|---|---|
  | null | 5 | 0.9841 .. 1.0146 | 1.0000 | +1.46% | rotated, one sitting |
  | pair-A `9af0e50` | 5 | 1.0067 .. 1.0882 | 1.0639 | +2.284% | rotated, one sitting |
  | pair-B `a011f38` | 5 | 1.0018 .. 1.0689 | 1.0580 | +1.03% | rotated, one sitting |
  | **null, arm-length campaign** | **9** | 0.9268 .. **1.0238** | 1.0000 | **+2.38%** <- the ceiling | interleaved, two sittings |

  **The table said three arms, n=5, 15 readings and pair-A as the ceiling for a round after the
  fourth arm was admitted** — residue of the 1.4550 → 1.4557 change, in the artefact that
  carries rule 4's five slots. The sitting is per-arm because the arms were not all taken in one;
  pooling across sittings is sound under rule 2, since each reading is itself a paired
  interleaved ratio, but the header had described a method one of its arms did not follow.

  **AND THE SAME MEASUREMENT UNDER LOAD, WHICH IS A DIFFERENT NUMBER — round 1, MAJOR 2.**
  The campaign above omitted its load condition: **a FIFTH item beyond `CLAUDE.md` rule 4's four
  slots — and now slot 5, ruled in by the human DURING this goal, with this campaign cited as
  one of the three failures that forced it — the exact
  omission for which this session withdrew a different G-020b finding.** Measured rather than
  inherited: `--null` ratio · shipped 30-day arm · quiet and loaded **alternated in one
  sitting** · **n=3 per regime** · load = 12 busy processes on 12 cores:

  | regime | min .. max | upward overshoot | cost/reading |
  |---|---|---|---|
  | quiet | 0.9666 .. 0.9911 | none | ~35s |
  | **loaded** | 0.9497 .. **1.0973** | **+9.73%** | ~113s |

  **Over 4x the quiet figure.** `sim-critic` measured the same contrast independently at n=2
  (+7.96%); **the builder's own reading is the worse of the two and is the one recorded.**
  It is **not folded into the ceiling** — the bound derives from the regime the gate runs in,
  **which must be MEASURED on the machine the gate runs on and never inferred from how this
  repo schedules its own work** (the `verify.mjs`-runs-gates-sequentially justification was
  withdrawn at round 2 and must not be re-quoted) — but the gate **checks the bound against
  every regime the noise has been observed in**. Margin 1.4557 / 1.0973 = **1.327x**.

  **ADR-0015 GAINS THE RULE THIS EXPOSED**: a bound whose margin approaches the loaded noise
  needs the noise re-measured under load before it is trusted. **The shipped gate is not
  threatened; the ADR's general reusability was** — at a 1.3x regression class,
  `sqrt(1.0238 x 1.3) = 1.1537` against a loaded reading of 1.0973, **a margin of 1.05x rather
  than 1.327x**. *(An earlier version of this line said 1.1537 "sits BELOW the loaded reading".
  It does not — it is 1.05x above it. ADR-0015 corrected the twin of this sentence in the same
  commit and this copy was left standing.)*

  **AND THE CI REGIME IS UNOBSERVED — STATED, NOT COVERED (round 2, MAJOR 2).** Every reading
  above was taken on a **12-core developer machine**. `pnpm verify` also runs on a **three-OS
  hosted matrix** where a runner is a shared **2-4 vCPU** box, and there **the load is a
  neighbouring tenant, not the sibling gate**. The comment that covered this said the bound
  derives from "the regime the gate actually runs in — `verify.mjs` runs its gates
  sequentially": **a claim about this repo's scheduling standing in for a claim about the
  machine — the same slot-2 substitution this goal already withdrew a finding for, one level
  out.** It is struck in `tripwire.mjs` rather than quietly reworded.

  **The bound is NOT widened to cover it**, because ADR-0015 forbids widening for an unmeasured
  regime. The position is **shipped, regime stated, observation owed** — and the observation is
  **G-020c's: read the first three `TICKCOST` lines and the proof's three ratios off a real CI
  run, and record them with their regime.** One push. The exposure is why this is written down
  rather than assumed: §9 forbids editing a gate to pass, so a false red on `main` is an
  escalation, and §2.0 makes a third unreliable gate a stop condition. `check:tickcost:proof`
  doubles it — **its control is by design a false-positive canary carrying exactly the gate's
  own margin** — at 67s here and plausibly several times that on a hosted runner.

  **`sim-critic`'s PLAN PREDICTION IS SCORED FAILED ON THE SHIPPED DATA, AND THIS BLOCK SAID
  "HELD" FOR A ROUND AFTER ITS OWN TABLE 49 LINES ABOVE MARKED THE NULL ARM AS THE CEILING.**
  This is the artefact REFLECT scores predictions from, so it is corrected rather than softened:

  | | ceiling set by | prediction |
  |---|---|---|
  | campaign as first taken, 3 arms | pair-A, +2.284% vs null +1.46% | **held** |
  | **campaign as shipped, 4 arms** | **the admitted null, +2.38%** | **FAILS** |

  The rescue — *"the null only won because n=9 beats n=5"* — is **unavailable**, being the
  unequal-n comparison this same commit forbids at `workload.mjs`. **What survives is the
  STRUCTURAL claim, which needs no reading and carries the design**: `--null`'s arms are one
  comment apart — same code, same code path, same JIT shapes — so **whatever its spread turns
  out to be**, it is a lower bound on real-pair noise and never an estimate of it. That is why
  real pairs stay in the campaign, and the orchestrator's null-only plan would have sized the
  bound on the easiest measurement the instrument can make.

  **THE ARM WAS LENGTHENED 5 → 30 DAYS, AND THAT IS WHAT MADE A BOUND POSSIBLE.**
  `measure-arm.mjs` listed a longer arm as the unmeasured lever; measured, it beats `--repeat`
  on both axes. What: the `--null` ratio · same hotel, arm length varied · n=9 per arm · **arm
  lengths alternated and rotated against each other ACROSS TWO SITTINGS**, n=4 each in the
  first and n=5 each in the second (rule 1 is satisfied by the pairing WITHIN each sitting,
  which is what makes the readings poolable across them) · min..max · **regime: quiet, no
  deliberate concurrent load, 12-core developer machine**:

  | arm | n | spread | cost/reading |
  |---|---|---|---|
  | 5 days (was shipped) | **n=9 interleaved** | 0.9572 .. **1.0984** | 11.8–13.9s |
  | 30 days (ships) | **n=9 interleaved** | 0.9268 .. **1.0238** | 36.5s |

  **The equal-n pair is the comparison** — a max over few samples is systematically smaller
  than a max over many, so quoting a short arm's n=19 tail against a long arm's n=5 would
  flatter the long arm by construction (`sim-critic`, PLAN). The 5-day arm's full record is
  **n=20, 0.7646 .. 1.2064**, and its top was contributed by `sim-critic` from *outside* the
  n=19 the builder had measured — which is itself the argument for not trusting a short tail.
  **`--repeat 7` at 5 days costs ~83s; one 30-day reading costs ~36.5s and has the tighter
  tail.** 80% of a short invocation's wall clock is process startup, not simulation.

  **PROOF OF BITE — `pnpm check:tickcost:proof`**, `tools/gates/check-tripwire.mjs`, ~70s,
  copy-the-gate (G-018 round 3's technique, second user). **Seven distinct gate outcomes over nine probes**, derived from the gate's behaviour rather than its rendered text.
  **n=4 consecutive runs, this machine, one sitting**, at the shipped mutation sizes:

  | | M1 quadratic | M2 constant factor | control (empty body) |
  |---|---|---|---|
  | ratios | 4.49 · 4.54 · 4.67 · 4.46 | 2.75 · 2.82 · 2.83 · 2.66 | 1.00 · 1.05 · 1.00 · 1.03 |
  | margin vs the 1.4557 bound | **3.07× worst** | **1.83× worst** | 1.39× headroom |
  | verdict | **RED 4/4** | **RED 4/4** | **green 4/4** |

  **The closing line now reports `8 distinct gate outcomes over 10 probes`, both DERIVED.** It
  said `6 verdict paths observed` as a hand-typed literal while the probes exercised more than
  that — **verbatim the defect `check-measure.mjs:487-490` records having fixed**, *"a count
  that could not go wrong, in the file built to hunt counts that cannot go wrong"* — reintroduced
  one file over, in the same goal, by the same author. The label is now read off **what the gate
  did**, so a probe that stopped provoking what it names cannot inflate the set. **Do not write
  either number into prose**: it has gone stale twice as probes were added, which is the same
  defect one level up. Read it off the gate.

  **THE MUTATIONS WERE RESIZED DURING BUILD, AND THE REASON IS §2.0.** At the first sizing they
  fired 6/6 (M1 2.10–2.51, M2 1.76–2.11, control 0.93–1.12 at a 3-day probe arm) — but **M2's
  worst margin was 1.21× and the control's 1.30×, both THINNER than the ~1.422× the shipped
  gate itself carries**. A proof that flakes more readily than the gate it proves is a false
  alarm about the gate, and §2.0 makes an intermittent check its own escalation rather than
  something to re-run. **The control now runs at the SHIPPED 30-day arm with no `FAST` patch**,
  which gives it exactly the gate's own margin and makes it a **false-positive canary**: if it
  reddens, the shipped gate was equally likely to fire on nothing, and that is a reading worth
  having. Mutation sizes are for a proof that does not flake, **not** for minimality — the
  minimum detectable mutation is a different question and is parked with its own test.

  **BOTH MUTATIONS ARE BEHAVIOUR-PRESERVING, AND THAT IS WITNESSED RATHER THAN ASSERTED.**
  Both probes run in `--null`, where `measure.mjs:363` refuses to report a ratio unless the two
  arms' **state hashes match**. A mutation that changed one bit of simulated history would make
  the proof ERROR rather than pass. With the hash identical, **I2, I4 and I6 cannot see the
  mutation at all** — a property of the hash, not a claim about coverage, which is why the
  proof does not re-run three gates to say so. *(The first draft ran the probes without
  `--null` and the check never fired; caught and fixed during BUILD.)*

  **THE CONTROL IS WHY M1 AND M2 MEAN ANYTHING.** Same copy, same injection site, an EMPTY
  body. Without it, both mutation probes are satisfied by a copy that fails for its own reasons.

  **THE SENTENCE THAT IS THE GOAL'S JUSTIFICATION**, in `tripwire.mjs` and here: *the two
  scaling tests catch quadratics on an axis they vary — rooms, needs, provider density. The
  tripwire's addition is a **constant-factor regression at the shipped workload**: a change
  that makes every tick more expensive without changing how cost scales with any axis. **No
  varied-axis ratio test can see it, because it moves both arms together — which is exactly the
  failure G-016 predicted for the density arm and G-013 confirmed.*** M2 is that mutation, and
  it is the one that could not be witnessed by the criterion as originally written.

  **M2 LEAVING THE SCALING TESTS GREEN IS A THEOREM, NOT A SAMPLE.** If both arms of a ratio
  test gain the same additive per-tick constant `k`, then `(a+k)/(b+k) < a/b` whenever `a > b`
  — a constant factor pulls any same-code ratio **towards 1**. The orchestrator ruled at PLAN:
  take the structural argument, decline the vitest alias, witness it once at VERIFY.

  **THE VERIFY WITNESS, RUN — AND IT CORRECTED THE BUILDER'S OWN FILE.** Each mutation applied
  to the working tree's `guests.ts`, `pnpm exec vitest run scaling`, then `git checkout --`:

  | | `scaling.test.ts` | `needs.scaling.test.ts` |
  |---|---|---|
  | **M1 quadratic** | **RED** — 13.23 and 9.77 against `BOUND = 6`, 2 failed | **GREEN**, 6 passed |
  | **M2 constant** | GREEN | GREEN — **10 passed in total** |

  **`check-tripwire.mjs`'s header had claimed M1 "reddens the two scaling tests". It does not,
  and the correction makes the goal's case STRONGER.** `needs.scaling.test.ts` holds the guest
  population still and varies need count, so a term quadratic in GUESTS lands on both arms
  equally and cancels in the quotient. Only `scaling.test.ts` sees it, because that file ties
  arrivals to rooms and therefore varies the guest population between its arms. **The honest
  statement: of the two existing timing tests, ONE can see a guest-quadratic and NEITHER can
  see a constant factor.** A claim in a comment that no test pinned, caught by measuring it —
  ADR-0007's class, found in this goal's own diff before a critic saw it.

  **NOT A §2 INVARIANT, AND THAT IS A DECISION NOT TAKEN.** It sits in `verify.mjs`'s `—`
  column beside `typecheck` and `check:measure`. It has a bound and renders a verdict, so it
  looks more like an invariant than `check:measure` does — **minting a seventh is a human
  decision (§9) and nothing here takes it.**

  **AND IT IS DELIBERATELY NOT IN `pnpm test`.** A timing bound inside a parallel unit-test
  runner is precisely the defect this goal inherits. Building the tripwire into the suite would
  have committed the defect the goal exists downstream of.

  ### SPLIT AT PLAN — both I4 obligations went to G-020c, and R4's headline was WITHDRAWN

  **THE BUILDER'S "EATEN MARGIN" FINDING DOES NOT REPRODUCE. It was load, and it is
  withdrawn.** The builder measured `needs.scaling.test.ts`'s need ratio at **1.723–2.263, worst
  at 91% of its 2.5 bound** (6 fresh processes) and reported a possible real per-need regression
  sitting uncaught in the repo. `sim-critic` replicated the four arms in **quiet** processes:
  **1.576 · 1.658 · 1.740 · 1.759 · 1.773 · 1.782 · 1.788 · 1.790 · 1.913, median 1.77 — worst
  at 76%, none over 2.0, indistinguishable from G-016's recorded 1.61–1.95 / median 1.74.**
  Five *loaded* processes interleaved with quiet ones gave **1.520–2.123**, which brackets the
  builder's readings **by contention alone**. **The builder's figures carried no load
  condition** — `CLAUDE.md` rule 4's slot 5, ruled in by the human during this goal.

  **WHAT SURVIVES, AND IT IS A REAL FINDING**: this ratio is **not load-invariant upward**,
  which **falsifies the file's own guidance** at `needs.scaling.test.ts:160-162` and `:329-336`
  — *"load pulls any ratio towards 1"*, *"anything up to ~2.0 is this spread and the machine"*.
  That holds for the density arm (1.19 → 0.91 under load) and **not** for this one. The
  discriminating measurement nobody has taken — this arm at HEAD against a **pre-G-013**
  revision, interleaved, quiet and loaded — is **G-020c's**, and it is a better reason for the
  split than the dependency argument the builder gave.

  **AND `maxWorkers: 2` WENT WITH IT.** The builder's plan relocated obligation 2 and was
  **silent on the cap** — *"silence is how a stopgap becomes policy"*, which that comment names
  about itself. Removing the cap can re-expose defect B, and discovering that inside VERIFY is
  a round. **Both obligations need repeated-run evidence, so they belong in one goal.**

  **STATED PLAINLY: G-020b does NOT return the unreliable-gate count to zero. G-020c does.**

  ### ROUND 4 — TWO HALVES OF ONE RULE, AND ONLY ONE OF THEM EXECUTED

  **ADR-0015 says POOL within a configuration, REPLACE on a configuration change. Round 3 put
  the POOL half's brake in code and left the REPLACE half as prose — the ratchet's exact twin,
  in the same round that fixed the ratchet.** `sim-critic` reproduced it: set `MEASURE_DAYS`
  30 → 3 and the gate ran a **3-day arm under a 30-day bound at exit 0**, deriving from readings
  of a different quantity — and this same commit records the 3-day configuration as materially
  noisier (0.93 .. 1.12). **Fixed**: `BOUND_CAMPAIGN.configuration` is numeric and compared
  against the imported workload at startup; the gate refuses and names the drifted key.
  **Witnessed by a probe, and the probe witnessed non-vacuous** by neutralising the guard.

  **AND THE `TICKCOST` LINE DROPPED THE SLOT THIS GOAL ADDED TO THE CHARTER.** It claimed to
  carry "all four of rule 4's slots"; **the human grew rule 4 to FIVE during this goal, citing
  three of this goal's own failures**, and the line carried no regime. The consequence was
  already written into the goal it feeds — G-020c was asked to record these lines *"with their
  regime"*, i.e. to **hand-transcribe the missing slot, the manual step this goal removed from
  the noise ceiling three constants away.** Fixed: the line prints `regime=<platform>/<n>cpu`,
  read off the machine. G-020c's criterion now says copy rather than transcribe.

  **THE SHAPE THAT RAN THROUGH THIS ROUND, AND IT IS §5.8's OWN**: the fix landed on one copy
  and the twin was untouched — **three separate times**. The pooling brake without the replace
  brake; ADR-0015's corrected "sits below the loaded reading" while `GOALS.md`'s copy kept the
  error; the withdrawn `verify.mjs`-sequential justification struck in `tripwire.mjs` while both
  ledgers still quoted it inside the rule a future goal reads. **All three are now fixed in both
  copies, and where a claim says "corrected everywhere" it names where it looked.**

  ### §5.8 — THE REGIME-LESS-NOISE CLASS, AND WHERE ELSE IT LIVES (round 3)

  **The class: a NOISE figure quoted without the load condition it was taken under.** Ruled at
  round 2 for the bound campaign; `sim-critic` then found the same defect in `workload.mjs`, one
  file over in the same commit, under a heading claiming *"all four slots"* (rule 4 has since
  grown to five, and this goal's failures are what grew it). Swept with results,
  not assurances:

  - `tools/gates/workload.mjs:58-67` — **carried it. Fixed here**: regime added (quiet, 12-core
    developer machine), with the +9.73% loaded contrast named and pointed at `LOADED_OBSERVATIONS`.
  - `tools/gates/tripwire.mjs` `BOUND_CAMPAIGN` / `LOADED_OBSERVATIONS` — **clean**, both carry a
    per-arm `regime` field; fixed at round 2.
  - `tools/gates/arm/measure-arm.mjs:74-80` — **CARRIES IT.** The shipped noise floor (`~±10%`
    single reading, `~±3%` at `--repeat 7`) names sittings and spreads but **no load condition**.
    Untouched by this diff (G-020a's file) and **compounded**: the builder already reported at
    PLAN that the ±3% figure is not reproducible — two `--repeat` medians on a null read 0.9067
    and 1.0501. **Handed to G-020c**, which owns re-measuring noise.
  - `tools/headless/src/needs.scaling.test.ts:221-234` — **CLEAN, and it is the repo's best
    example of the fix**: it tabulates the same ratio in three named environments (isolated /
    file alone / whole suite) and reasons about the direction load pushes it.
  - `tools/headless/src/scaling.test.ts:110-111` — **CARRIES IT.** `NOT_OVERHEAD_DOMINATED`'s
    note says *"measured at ~39x when this was written"* — no regime, no sample count, no date.
    G-020c's file; handed over with the two bounds already named there.
  - `GOALS.md` / `JOURNAL.md` G-020a blocks (the ±10% / ±3% readings) — **CARRY IT**, same
    figures as `measure-arm.mjs`. They travel together and are corrected together at G-020c.

  ### §5.8 — MAJOR 1's CLASS, AND WHERE ELSE IT LIVES (round 1)

  **The class: a constant presented as derived from a measurement, with nothing executing the
  derivation.** `sim-critic` found it in `tripwire.mjs` — a frozen campaign of display STRINGS
  that `grep` showed nothing reads, beside a hand-typed `NOISE_CEILING`, with a self-check that
  compared three literals to each other. **Nudging the ceiling to 1.2000 and the bound to
  1.5760, 8.3% looser, passed every check.** Three constants above the two vacuity defects this
  same diff had already fixed, in the file whose own comment reads *"a derivation nothing
  executes is a derivation nobody re-runs"*.

  **Fixed here**: readings are numbers, the ceiling is computed, and `check-tripwire.mjs`
  **nudges a reading and watches the bound move** — witnessed non-vacuous by re-introducing the
  literal, which trips **both** guards.

  **Where else it lives, each with a result and a location rather than an assurance:**
  - `tools/gates/budget.mjs` (I5's 389,333ms) — **checked, clean.** `bench.budget.test.ts`
    executes the arithmetic and pins `HOTELSIM.md` §2.1.2's row; it is derived from a
    **requirement**, not a measurement, so there is no reading to decouple from.
  - `tools/gates/workload.mjs` — **checked, clean.** Not a derived constant; `check-measure.mjs`
    ties it to a committed golden by spawning the shipped CLI.
  - `needs.scaling.test.ts:190` `BOUND = 2.5` and `:245` `DENSITY_BOUND = 1.9` — **BOTH CARRY
    THE CLASS.** Each cites a measured median (1.74, 1.281) and a rule (`× 1.5`), and **nothing
    executes either derivation**; the readings live only in prose. Not fixed here — these files
    are G-020c's by the PLAN split, and the finding is **recorded on G-020c's block**.
  - `scaling.test.ts:108` `BOUND = 6` — **carries it too**, same shape, same owner.
  - `tripwire.mjs`'s `SMALLEST_KNOWN_REGRESSION = 2.07` — **carries it and cannot be fixed the
    same way.** It is a historical reading from G-020a that no live measurement can reproduce
    (the instrument's reachable history starts at G-013). Stated as a limit rather than closed:
    the ceiling is now derived, the regression figure is not, and it is the remaining hand-typed
    input to the bound. **CLOSED BY ADR, NOT BY PARKING** — see `DECISIONS.md` ADR-0015, *"only
    one of the two inputs can be executed"*. The falsification test was written, then found to
    have been **already answered twice in this repo** (`GOALS.md:1606`, `JOURNAL.md:1304`) and
    re-run to confirm: `sim:measure --head aa30218` → base `f43699d` → **INCOMPARABLE,
    `roomTypeServes is not a function`**. The parked entry was deleted and the limit moved into
    the ADR, **and this pointer said "parked" for one round after the entry it pointed at was
    gone** — the residue of the fix, in the block a later goal reads to learn whether the class
    was closed.

  **INHERITED FROM G-018 — NOTHING TIES A GATE'S WORKLOAD TO ANYTHING, AND YOU ARE ABOUT
  TO BUILD A GATE WITH A WORKLOAD.** `sim-critic` found that mutating `bench.mjs`'s
  `ROOMS 60 → 3` or `ARRIVAL_EVERY_TICKS 32 → 3200` leaves every test green:
  `bench.workload.golden.test.ts` **declares its own copies of those constants at lines
  53-55 and never reads `bench.mjs`**, so the golden pins a workload nothing connects to
  the workload that runs. G-018 fixed the budget half and left this deliberately — it is
  the workload half, which G-018 said at PLAN it would report rather than change.
  **This goal ships a gate whose whole meaning is "at a fixed workload", so it inherits
  the question.** Whatever ties your ratio to its workload should tie `bench.mjs`'s to
  its own, or say why not. The shape to avoid is G-018's MAJOR 1 one level out: a test
  that pins a re-declared copy rather than the value the gate uses.

  **HUMAN RULING, 2026-08-08 — UNPARKED, over the orchestrator's recommendation to park
  it.** G-018 widened I5's ceiling by ~39×, which is correct, *"and the honest consequence
  is that I5 now protects against approximately nothing. Meanwhile the thing that has
  genuinely guarded tick cost for eighteen goals is a paired ratio that exists as practice
  rather than as a gate."*

  **Why it lands before M3 and not "eventually":** M3 is pathfinding and queued shared
  resources — *"the single most likely place in this entire project for a quadratic to
  appear. This repo has already found two, one of which reappeared two files away from
  where it was removed. Retiring the only working brake immediately before the milestone
  most likely to need it is the one move here I'd argue against."*

  I recommended parking this and was wrong: I read "I5 is a sanity ceiling, not a
  regression tripwire" as a description and stopped, when it was a gap.

  **INHERITED FROM G-018 ROUND 2 — "DOES THIS GATE ACTUALLY GATE?", WHICH IS YOUR OWN
  QUESTION ONE FILE OVER.** `sim-critic` mutation-tested I5 while G-018 was pinning its
  budget, and three holes are yours rather than G-018's, because closing them is building
  a gate rather than sourcing a number:
  - ~~**NO TEST HAS EVER WITNESSED I5 GO RED.**~~ **DISCHARGED AT G-018 ROUND 3 — ONE
    DOES NOW**, and the parking above was wrong on its facts. It asserted a
    dichotomy — "a six-minute run or an injectable budget" — and `sim-critic` refuted it by
    building the third option: **copy the shipped `bench.mjs` and `budget.mjs` to a temp
    dir, rewrite only `ROOT`, set `DAYS = 1` and `BUDGET_MS = 0` IN THE COPY, and spawn
    it.** Nothing under `tools/gates` changes, so no env var, flag or CI lever exists to
    pull; the loosening lives in a throwaway file the test wrote. It runs in ~700ms and
    prints `FAIL  I5 headless — 1 days took 617ms, budget is 0ms (I5)` with **exit code
    1**. It ships in `bench.budget.test.ts`. **G-020 inherits the TECHNIQUE, not the
    debt**: a gate's failing path can be witnessed by copying the gate rather than by
    making it configurable, and "it would take too long" deserves one attempt at a third
    option before it becomes a parked item.
    Context worth keeping, and stated so that it needs no count: `HOTELSIM.md` §10 asks
    only that the gates "pass trivially against an empty sim", so proving a gate BITES was
    never a charter requirement. The bootstrap records say each gate was deliberately
    broken and observed red (`ESCALATIONS.md`, `JOURNAL.md`, commit `b92a815`), and this
    goal has no evidence against them and does not touch them. **What is true regardless:
    no record distinguishes WHICH gates were proven red or HOW, and no committed test
    pinned I5's failing path until this one.** A one-off manual probe is not a test — it
    leaves nothing behind for a later change to trip over, which is the whole difference
    between the bootstrap ritual and your third criterion.
    **G-018 asserted "five of the six" here and it was withdrawn at round 4.** It was an
    inference made in the session, not a record of the event, and it is the exact class
    this goal exists to delete: a number in prose, offered as evidence, that nothing pins.
    It arrived inside the fix for the previous count error. **Do not replace a withdrawn
    count with a better-sounding one — say the weaker thing that needs no evidence.**
  - **`bench.mjs`'s OTHER TWO ERROR PATHS ARE STILL UNPINNED, AND THEY ARE CHEAP.** A
    non-zero CLI exit and a stdout missing the `days N` line both `process.exit(1)` before
    the budget is ever compared, and no test fires either. G-018 listed this as unreached
    and guessed it was expensive; **it is not — `sim-critic` fired both in under a second
    using the copy-and-run technique already in `bench.budget.test.ts`.** The cost is a
    second `replace()` call on the copied source, not a six-minute run. Cheap enough that
    "unreached" was the wrong disposition and the estimate was the error, not the work.
  - **THE BENCH'S WORKLOAD IS PINNED BY NOTHING.** `ROOMS 60 -> 3` and
    `ARRIVAL_EVERY_TICKS 32 -> 3200` leave every assertion in `bench.budget.test.ts` green
    and every other gate green. G-018 said at PLAN it would report the workload and not
    change it, and it did not.
  - **AND THE GOLDEN THAT LOOKS LIKE IT PINS THE WORKLOAD DOES NOT.**
    `tools/headless/src/bench.workload.golden.test.ts:53-55` declares its OWN `ROOMS` and
    `ARRIVAL_EVERY_TICKS` with a comment saying they are "`bench.mjs`'s own figures, so
    this pin and that gate describe the same building" — and never reads `bench.mjs`. It
    is the duplicated-constant shape G-018 removed from the budget by extracting
    `budget.mjs`, still live one file over, with a comment asserting the property it
    lacks. Same fix, same reason.

## G-020c — The two unreliable-gate defects, and one campaign that settles both
Status: **done, DRY at 2/3, WITH ONE CRITERION UNMET AND ESCALATED.** 2 sweeps (**1 BLOCKER** +
  7 MAJOR + 5 MINOR + 1 NIT) plus four verification passes, one of which converted. **Criterion 5
  — the unreliable count reaching 0 — is NOT met and was NOT claimed**: defect A is repaired,
  defect B is diagnosed and unrepaired, so the count is **1 gate / 1 defect**, and that is an
  `ESCALATIONS.md` entry exactly as this block pre-registered before any reading existed.
  Split out of G-020b at PLAN by the orchestrator, over the builder's narrower proposal. Both
  entries in `ESCALATIONS.md`'s I4 record are here and nowhere else.

  **DEFECT A IS REPAIRED. DEFECT B IS DIAGNOSED AND UNREPAIRED, AND THE THING THAT WAS
  SUPPOSED TO BE HOLDING IT OFF DOES NOTHING.** Under 12 busy processes on 12 cores, `pnpm test`
  produced signature B in **10 of 10 runs across BOTH arms** — capped and uncapped — with all
  1,426 tests passing every time; quiet, **0 of 20**. The discriminator is LOAD, not worker
  count, so the cap is removed as measured-ineffective rather than as expired. **The
  unreliable-gate count therefore reaches 1 gate / 1 defect, not 0**, and the criterion that
  says 0 is not met. See the CRITERION STATUS table in the BUILT section.

  **ONE CRITERION IS STRUCK AND HANDED TO THE HUMAN: THERE IS NO REMOTE, SO CI HAS NEVER RUN.**
  Measured at SELECT — `git remote -v` is empty, and `.github/workflows/verify.yml` has existed
  since bootstrap without ever executing. **No agent can meet the CI-regime criterion.** It is
  restated as an M2-exit condition owed by the human (`ESCALATIONS.md`, 2026-08-10). The rest
  of this goal proceeds unchanged. **The consequence, stated plainly: `check:tickcost` is a
  timing-dependent bound shipped into `pnpm verify`, whose behaviour on the three-OS hosted
  matrix `verify.yml` describes is completely unobserved — and no gate in this project has ever
  been seen running on any machine but this one.**
Milestone: M2
Owner pair: sim-engineer / sim-critic
Statement: I4 stops being intermittent. The two distinct defects behind it — a worker RPC
  starvation accommodated by a concurrency cap, and timing bounds living inside a parallel
  unit-test runner — are repaired with repeated-run evidence rather than with one green run.
Exit criteria:
  - `pnpm test` run **n ≥ 10** with `maxWorkers` removed, and the rate of signature B
    (exit 1, ZERO failing tests, `[vitest-worker]: Timeout calling "onTaskUpdate"`) reported.
    Either the cap goes for good, or it returns **carrying a measured rate instead of a
    stopgap comment** — a pending ruling discharged by a reading, not by inertia
  - the timing bounds in `needs.scaling.test.ts` and `scaling.test.ts` no longer run inside
    `pnpm test`; they run as a standalone check beside `check:tickcost`, which is the human's
    own precedent for this shape (*"a gate wearing vitest's clothes"*, 2026-08-09)
  - **the discriminating measurement**: `needs.scaling.test.ts`'s need-vector ratio at HEAD
    against a **pre-G-013** revision, paired and interleaved, **quiet and loaded, both stated**.
    **ITS EFFECT CLASS IS PRE-REGISTERED AND IT IS A MULTIPLE, NOT A DRIFT (BLOCKER 1, §5.6).**
    `sim-critic` measured the instrument's own spread at the planned sample size — n=7,
    alternated, quiet, `win32/12cpu` — and it is **+19%/-14% about the median**, so a ratio of
    two such medians resolves **~12% at 2σ**. The effect this criterion was written to detect
    is **1.7%** (the recorded 1.74 against the ~1.77 measured). **The campaign as first
    specified was seven times too small and would have returned "indistinguishable" whatever
    was true** — a criterion satisfiable by every outcome, ADR-0007's class one level up.
    **So: this criterion tests for a `>= 1.3x` MULTIPLE**, which `tripwire.mjs:51-63` already
    establishes is the only class this project has ever produced, and **a drift is BELOW ITS
    RESOLUTION AND IS SAID SO IN THE REPORT.** n>=7 is ample for that question and hopeless
    for the other.
  - **BOTH REVISIONS RUN THE 3-ARM ROTATION** — the one that exists at both. HEAD interleaves
    four arms, `aa30218` three, and interleaved arms share one process's heap, GC and JIT, so
    **an arm-set change is a workload change to the arms that remain**: `sim-critic` measured
    **10.5% between the two rotations at the median in one alternated sitting.** The
    denominator moved too — HEAD's `lodgingOnly` filters `itemTypes` and drops
    `fitBasisPoints`; `aa30218`'s does neither. A ratio of ratios divides out machine speed; it
    does **not** divide out a control arm that changed. The shipped 4-arm reading is a
    **different quantity** and the report says so.
  - **PER-ARM MODULE IDENTITY IS ASSERTED, NOT ASSUMED.** pnpm's workspace links are
    **absolute** into this checkout, so copying `node_modules` into the extracted tree makes
    the "pre-G-013 arm" import **HEAD's simulation** under `aa30218`'s harness — a plausible
    number and no error. `pnpm install --offline` avoids it (verified: 99 packages, 0
    downloaded, lockfile byte-identical between the revisions). Resolve `@hotelsim/sim` in the
    child, assert the realpath is inside that arm's own tree, and cross-check the state hash
    against that revision's own CLI. `measure.mjs` is the precedent — it fails on "a module
    resolved outside its arm".
  - ~~**the CI regime, read off a real run rather than argued**~~ — **STRUCK 2026-08-10 AND
    OWED BY THE HUMAN. There is no remote; CI has never run.** Restated as an M2-exit
    condition: add a remote, push, and record the first three `TICKCOST` lines and
    `check:tickcost:proof`'s three ratios. The `TICKCOST` line prints its own regime, so it is
    a copy rather than a transcription. **If the control or any probe lands near the bound
    there, that is a §2.0 finding about the gate, NOT a licence to widen it (§9).** In its
    place, this goal owes only that `tripwire.mjs` states the limitation at the point of
    use — which it already does, more correctly than its author knew.
  - **THE BOUND IS RE-DERIVED ABOVE THE OBSERVED QUIET MAXIMUM. RELOCATION ALONE DOES NOT
    DISCHARGE THIS (BLOCKER 2, §5.6).** Criteria 2 and 5 only connect if defect A is a
    contention artefact, **and it is not.** `sim-critic` measured the shipped test isolated,
    one fresh process per run, **n=10, QUIET**, on a clean extraction of HEAD: **9 × exit 0,
    1 × exit 1 — "expected 2.653418174841722 to be less than 2.5".** Its independent tsx probe
    produced **2.5903** in the same conditions. **Two harnesses, two exceedances of
    `BOUND = 2.5`, neither under load.** So the assertion does not stop flaking when it leaves
    the parallel runner — it flakes in `check:scaling` instead, and the count would go from
    "one gate carrying two defects" to "one gate carrying one defect plus a new unreliable
    check". **This also falsifies two live sentences harder than this block first stated**:
    `needs.scaling.test.ts:160-162`'s *"anything up to ~2.0 is this spread and the machine"*
    (quiet readings reach **2.65**) and `:230-231`'s *"load can only push the reading down,
    never up"*, offered as the reason the bound is flake-proof — **not the mechanism here at
    all.**
  - **THE BOUND'S TWO CONSTRAINTS GET AN EXECUTABLE BRAKE AND A PRE-REGISTERED CROSSING
    RESPONSE.** `BOUND <= trunc(median × 1.5)` is correct and ADR-0015 does not displace it —
    `DECISIONS.md:733-737` names 1.74/1.281/4.2 as **signals**, for which G-010's ×1.5 holds,
    and reserves the geometric rule for a noise floor. But: **they can cross, by six parts in
    ten thousand on the repo's own recorded median** (ceiling 2.6550 against the quiet maximum
    2.6534), so **the goal block must say which campaign supplies the median** — ONE stated
    regime for the signal, every observed regime for the max, and **taking the median from the
    loaded arm to widen the window is the regime-mixing this goal exists to stop.** And the
    floor is **monotone non-decreasing**, i.e. the same ratchet `tripwire.mjs:384-402` ships
    `MAX_NOISE_CEILING` against — **port that shape: a limit derived from figures already in
    the file, refusing in code, never in prose.** `tripwire.mjs:353-366` records what happened
    the last time that clause was prose: a 106% "noise" ceiling shipped green.
  - the count of unreliable gates in every digest reaches **0**, and §2.0's guard is satisfied
  - all §2 invariant gates green (`pnpm verify`, **eleven rows**), plus the unmoved-reading
    set — **I2 `10926cc3b569c887`**, `SAVE_V1_CONTENT` `8e09fe4f0fa162a3`, save v9, `BUDGET_MS`
    389,333ms. G-021's block carries these and this one did not: extracting arms reaches
    `report.ts`'s `schedule()`, which is where the determinism log's command stream comes from,
    so **a green `test:determinism` would not by itself say the hash held.**
Out of scope: optimising anything the discriminating measurement finds — if a real per-need
  regression exists, fixing it is its own goal  (-> PARKING.md)
Critique rounds used: 0/3

  **ORCHESTRATOR RULINGS AT PLAN, 2026-08-10.**

  1. **SEAM A — the cross-revision instrument — STAYS IN THE GOAL**, which is `sim-engineer`'s
     own recommendation and the argument is decisive: the recorded pre-G-013 figure
     (`needs.scaling.test.ts:156`, median 1.74 over six processes) **carries no load
     condition**, so under rule 4's fifth slot it cannot be compared against anything measured
     now. **Either both arms are re-measured in one sitting, or the sentence at `:160-162` is
     withdrawn.** Deferring the instrument means choosing withdrawal by default, and that is a
     decision worth making deliberately rather than by scheduling. The builder also checked
     feasibility rather than flinching: `schedule()` at `aa30218` has the identical 9-parameter
     signature, and the `roomTypeServes` wall blocks an **absolute** cross-revision comparison,
     not a **ratio of ratios** where each arm uses its own revision's sim, content and harness.
  2. **SEAM B — a shipped proof-of-bite gate for `check:scaling` — IS TAKEN. Do not build it
     here.** The builder's reasoning is right and it is the §5.5 rule working as designed: a
     third ~600-line proof harness is what would make this goal unsweepable, and **G-020b's
     proof harness took a round to get right and shipped a hand-typed count in the file built
     to hunt hand-typed counts.** Instead: pin the arithmetic in `scaling.bound.test.ts`, and
     **witness the bite once at VERIFY** with the `git stash push -u` recipe, re-using G-020b's
     already-measured M1 quadratic (which reddened `scaling.test.ts` at 13.23 and 9.77 against
     `BOUND = 6`). **Park the proof gate with its falsification test.**
  3. **RULE 5 APPLIES TO LIVE CLAIMS, NOT TO HISTORY — and this is a correction to the plan.**
     Withdrawing the unreproducible `±10%` / `±3%` figures from **code comments** and from
     **live goal blocks** is right. **`JOURNAL.md` is NOT to be retro-edited**: ADR-0008 says a
     thing describing the past must not track the present, and a REFLECT entry recording what
     was believed and measured at G-020a is history. If a journal entry carries a figure now
     known unreproducible, **the correction goes in the CURRENT entry**, pointing back — never
     by rewriting the old one. The same holds for `ESCALATIONS.md`'s closed entries.
  4. **`verify` GOING TO ELEVEN ROWS IS ACCEPTED** and follows from the human's own ruling that
     a timing bound is "a gate wearing vitest's clothes". The closing line still says six
     invariants; **minting a seventh remains a human call** (§9).

  5. **CAMPAIGN 1 RUNS AFTER THE RELOCATION, AND ITS CLASSIFIER GETS A FOURTH CELL.** Defect A
     fires at ~8% isolated and ~33% in-suite, so run before relocation it lands as
     `exit 1, >=1 failed`, the classifier calls it "not B", and the sample is spent diagnosing
     a suite that is not the one whose cap is being decided. After relocation A cannot fire
     inside `pnpm test` at all. **And the triple partitions three cells of a four-cell space:
     `exit 1 / 0 failed / no such string` is exactly what the G-016 diagnosis missed, one level
     out.** An explicit **UNCLASSIFIED** bucket is REPORTED, never folded into "not B" — a rate
     computed over a partition that does not cover the space reads clean because the classifier
     could not see the event. **Capture the full output of every run**, because re-running a
     30-45 minute campaign for a third class is the expensive failure. And note where the
     classifier lives that **the string is a vitest internal**: a version bump silently
     reclassifies every run as UNCLASSIFIED.
  6. **THE STOPWATCH SCAN ALLOW-LISTS MATCHED LINES, NOT FILENAMES** — filename exemption is
     the rot, as I said, and the stated reason for this one is **measurably wrong**:
     `bench.budget.test.ts:289-299` spawns a real copied `bench.mjs` with `BUDGET_MS = 0` and
     asserts exit 1, so it **executes a gate** rather than only pinning source text. (The
     exemption is still right — a zero budget fails at any elapsed time, so it cannot flake —
     but a maintainer reasoning from the wrong reason will exempt the wrong thing.) All three
     of its matches are inside one regex literal and two string searches; **exempt those exact
     texts, so a genuine `process.hrtime.bigint()` added there tomorrow is a new unexempted
     match and goes red.** Reuse `speed-ladder.scan.test.ts`'s per-root counting and
     bites-on-synthetic-source shape rather than re-deriving it, and **derive the file set from
     `vitest.config.ts`'s actual `include`/`exclude`** or the scan and the runner can disagree
     about what "in the suite" means.
  7. **WHAT MOVES AND WHAT STAYS, because "move the timing assertions" is not precise enough.**
     The measurement runs in the `describe` **body**, so the file runs a stopwatch even for its
     non-timing tests. **STAY in `pnpm test`**: the arms-really-differ-in-need-count assertion
     (pure content) and the dense-arm-really-has-more-providers assertion (two full sims, no
     stopwatch, and the behavioural anti-vacuity floor). **LEAVE WITH THE BOUND**:
     `NOT_OVERHEAD_DOMINATED`, which is itself a timing assertion and is ADR-0007's guard on
     the ratio — leave it behind and a timing bound stays in `pnpm test` **with the scan
     green.** `scaling.test.ts` has no non-timing assertions and moves wholesale.
  8. **TWO CITATIONS IN THIS BLOCK WERE WRONG AND ARE FIXED.** The `measure-arm.mjs` pointer
     read `:74-80`, which is the guest-rules header; the noise floor is at **`:92`** and
     **`:96`**, and there is a **third occurrence at `:109`** this block never named. §5.8's
     guard is that a location can be re-inspected — a wrong one cannot. Also:
     `vitest.config.ts:39`'s *"THE CAUSE: `measure.instrument.test.ts`"* **is the conflation
     `72ae268` retracted, still standing in the file the cap lives in** — the correction went
     into `ESCALATIONS.md` and left its twin in the config. In scope by criterion 1.

  **WHY BOTH, IN ONE GOAL.** They are distinct defects with distinct signatures — one names a
  failing test, the other has none at all — and `ESCALATIONS.md` carries both. But **they need
  the same kind of evidence**: repeated runs, because each fires at a rate no single run can
  measure. G-020b's builder proposed taking the cap and splitting the test; the orchestrator
  ruled the other way, and the reason is better: **removing the cap can re-expose defect B, and
  discovering that inside G-020b's VERIFY is a round.**

  **THE TRAP THIS GOAL MUST NOT FALL INTO, because two careful actors already did.** The
  original entry blamed `measure.instrument.test.ts` and "fixed" it by extraction; measured
  with that file deleted entirely, `pnpm test` still exited 1 on 2 of 3 runs with all 1,235
  tests passing. **Diagnose from the SIGNATURE, never from the rate.**

  **AND THE ONE FINDING IT INHERITS IS A FALSIFIED DOC, NOT A REGRESSION.** G-020b's builder
  reported a possible uncaught per-need regression (need ratio worst at 91% of bound);
  `sim-critic` refuted it with nine quiet processes (worst 76%, none over 2.0) and reproduced
  the builder's range **by contention alone**. **Withdrawn.** What survives: the ratio is **not
  load-invariant upward**, which falsifies `needs.scaling.test.ts:160-162` and `:329-336` in
  their own words. Fix the guidance, or fix the bound — but measure the pre-G-013 arm first,
  because nobody has, and it is the only reading that tells the two apart.

  **RULED FOR YOU BEFORE YOU RE-MEASURE (ADR-0015, G-020b round 3): POOL WITHIN A
  CONFIGURATION, REPLACE ON A CONFIGURATION CHANGE.** Your re-measurement changes the
  configuration — a different runner, and possibly a different arm — so **it REPLACES the
  campaign rather than pooling into it.** Do not add loaded or CI readings as extra arms of the
  quiet 30-day campaign: that would mix two quantities under one name, and because a pooled max
  is **monotone non-decreasing** it would loosen the bound permanently and silently. **The
  ratchet is real and G-020b shipped an executable brake against it** (`MAX_NOISE_CEILING`,
  derived); if your figures approach it, the finding is *the instrument is too noisy to gate*,
  **not** a wider bound (§9).

  **INHERITED FROM G-020b ROUND 3 — THE REGIME-LESS-NOISE CLASS, THREE LOCATIONS.**
  `arm/measure-arm.mjs:74-80`'s shipped noise floor (`~±10%` single, `~±3%` at `--repeat 7`)
  carries **no load condition**, and the ±3% is **already known not to reproduce** — two
  `--repeat` medians on a null read 0.9067 and 1.0501 (G-020b PLAN). `scaling.test.ts:110-111`
  says *"measured at ~39x when this was written"* with no regime, sample count or date. The same
  ±10%/±3% figures sit in `GOALS.md` and `JOURNAL.md`'s G-020a blocks. **Restate with the regime
  or withdraw — `CLAUDE.md` rule 5 says withdraw rather than restate a number you cannot
  re-measure.**

  **AND A THIRD LOCATION, WHICH G-020b's SWEEP CALLED CLEAN FOR THE WRONG CLASS.**
  `needs.scaling.test.ts:228-231` is the repo's best example of stating a regime — and inside
  that same block it carries the **falsified load generalisation** in its strongest form:
  *"load can only push the reading down, never up"*, offered as the reason the bound is
  flake-proof. G-020b measured the opposite on the very ratio that file bounds: **quiet
  1.576-1.913 against loaded 1.520-2.123**, and the `--null` ratio at **+9.73% under load
  against no overshoot quiet**. It holds for the density arm and not for the need arm.
  **The claim that the bound is flake-proof rests on it, so this is the sentence to fix before
  the bound is re-derived.** Three locations, not two. `tripwire.mjs`'s `BOUND_CAMPAIGN` is the worked example of the fix, and
  `needs.scaling.test.ts:221-234` is the better one because it is yours already.

  **INHERITED FROM G-020b ROUND 1 — TWO TIMING BOUNDS IN YOUR FILES CARRY MAJOR 1's CLASS.**
  `needs.scaling.test.ts:190` (`BOUND = 2.5`, cited from a measured 1.74) and `:245`
  (`DENSITY_BOUND = 1.9`, from 1.281), plus `scaling.test.ts:108` (`BOUND = 6`, from ~4.2).
  Each states a reading and a rule (`measured x 1.5`) in **prose that nothing executes** — the
  same defect `sim-critic` found in `tripwire.mjs`, where it allowed an 8.3% loosening with
  every check green. **`tripwire.mjs` is the worked example**: readings as numbers, bound
  computed, and a probe that nudges a reading and watches the bound move. **And note ADR-0015
  supersedes `x 1.5` for anything that is a noise floor rather than a signal.**

  **INHERITED READING, so it is not re-derived**: `vitest.config.ts:34`'s `testTimeout: 30_000`
  was checked at G-020b and is clean — slowest individual test **3,166 ms = 10.6% of the
  ceiling**, full suite, `maxWorkers: 2`, 1,235 tests in 56.9s, max over 1,234 timed lines, one
  run. **That reading was taken AT the cap**, so removing the cap changes contention and this
  goal retakes it in the same campaign. The two obligations share a measurement.

  ### BUILT 2026-08-10 — what shipped, and every number with all FIVE of rule 4's slots

  **`pnpm check:scaling`** — `tools/gates/scaling.mjs`, the **eleventh row** of `pnpm verify`
  and the fifth in the `—` column. The three ratios asserted inside `pnpm test` from G-010 to
  today are asserted there instead, against bounds **re-derived** from a campaign taken at the
  new instrument. **`packages/sim` is untouched by this goal.**

  **THE SEAM IS A PROCESS BOUNDARY**, as `check:tickcost`'s is. `scaling-harness.ts` measures
  and holds no bound; `scaling-bound.mjs` holds the readings and derives; `scaling.mjs` judges;
  `scaling.bound.test.ts` asserts the instrument names none of the four bounds and does not
  import the module that does. **One process per ROTATION**, because interleaved arms share a
  heap, GC and JIT — an arm set is part of the workload, and the gate refuses if an axis is
  measured in a rotation its campaign was not taken in.

  **THE BOUNDS ARE THE CEILING EXACTLY — THERE IS NO FREE PARAMETER.** "Measured × 1.5, then
  held at or below" leaves a RANGE, and a number chosen from inside a range is a number nobody
  can source (§2.1) as well as a number a later editor can nudge. So each constant is pinned to
  **equality** with `trunc(quiet median × 1.5, 4dp)`, and the worst reading observed in ANY
  regime is a separate refusal beneath it. Nudge a reading and the gate refuses to start,
  **in either direction** — the shape `tripwire.mjs:343` uses, with a second side.

  | axis | was | now | direction | why |
  |---|---|---|---|---|
  | `rooms-saturated` | 6 (shared) | **5.7516** | **tighter** | today's quiet median is 3.8344, not the ~4.2 the 6 was set from |
  | `rooms-bench` | 6 (shared) | **4.6119** | **tighter** | it never had its own bound; it has one now |
  | `needs` | 2.5 | **3.1135** | **looser, and FORCED** | quiet readings of 2.5906 (here), 2.6534 and 2.5903 (`sim-critic`, two harnesses) are ABOVE the incumbent |
  | `density` | 1.9 | **2.0239** | **looser by 6.5%, not forced** | the worst observed reading is 1.6154, under either number; the MEDIAN moved (1.281 → 1.3493) and the rule is applied uniformly |

  **THE REJECTED ALTERNATIVE, RECORDED BECAUSE IT LOOKS SAFER AND IS NOT**: cap each new bound
  at the incumbent so a bound may only tighten. That imports a median measured inside vitest's
  parallel workers, under a different rotation, at a sample count this instrument no longer
  uses — **pooling a reading from a configuration that no longer exists**, which is exactly
  what ADR-0015's REPLACE half forbids. A uniform rule that moves two bounds down and two up is
  also its own evidence that it is not a widening dressed as a derivation.

  ### CAMPAIGN 2 — the readings the four bounds derive from

  What: the per-tick cost ratio between two arms of one rotation, from
  `tools/headless/src/scaling-harness.ts` · Workload: 60 rooms, an arrival every 32 ticks, seed
  42, 4,320 ticks; the rooms rotation varies rooms and arrivals together · Samples: each reading
  is a ratio of medians of **5** in-process samples, arms interleaved with the order
  alternating, one warm-up discarded · Aggregation: **median of the QUIET readings for the
  signal, max over EVERY reading in EVERY regime for the floor** · Regime: **quiet n=12 and
  loaded n=8, alternated within one sitting, `win32/12cpu`, node 22.16; loaded = 12 busy
  processes on 12 cores** (`tools/gates/arm/load.mjs`, so "loaded" is an invocation rather than
  a sentence).

  | axis | quiet min .. median .. max | loaded min .. median .. max | bound | margin over worst quiet / worst anywhere |
  |---|---|---|---|---|
  | needs | 1.8763 .. **2.0757** .. 2.5906 | 1.7462 .. 2.1636 .. **2.9733** | 3.1135 | 1.2018× / **1.0472×** |
  | density | 0.9915 .. **1.3493** .. 1.6154 | 1.2284 .. 1.3829 .. 1.5619 | 2.0239 | 1.2529× / 1.2529× |
  | rooms-saturated | 3.1047 .. **3.8344** .. 4.2525 | 3.0356 .. 3.7255 .. **4.3803** | 5.7516 | 1.3525× / 1.3131× |
  | rooms-bench | 2.1788 .. **3.0746** .. 3.9312 | 2.3596 .. 3.8136 .. **4.1044** | 4.6119 | 1.1732× / 1.1236× |

  **THE NEEDS AXIS IS THE THIN ONE AND THAT IS STATED RATHER THAN AVERAGED AWAY**: 1.0472× over
  the worst reading in any regime. `pnpm verify` runs quiet, where the margin is 1.2018×, and
  **both figures are printed by the gate** — reporting only the first would overstate it and
  only the second would understate what a normal run has to survive.

  **THE INSTRUMENT DID NOT MOVE BETWEEN THE TWO REGIMES**, which is checkable rather than
  asserted: `scaling-arms.ts` (05:41) and `scaling-harness.ts` (05:44) both predate the quiet
  campaign (05:47) and the loaded campaign (05:51), and `scaling-bound.mjs` was written after
  both (05:53).

  ### CAMPAIGN 1 — the cap, discharged by a reading

  **THE CAP IS GONE.** `vitest.config.ts` no longer sets `maxWorkers`, and the comment that
  carried it is replaced by the campaign below rather than by another comment.

  What: the outcome of `pnpm test`, classified by **SIGNATURE and never by rate**, into a
  partition that covers the space —

  | cell | test |
  |---|---|
  | `PASS` | exit 0 |
  | `B_WORKER_RPC` | exit ≠ 0, **zero** failing tests, and `Timeout calling` + `onTaskUpdate` present |
  | `A_NAMED_FAILURE` | exit ≠ 0, ≥ 1 failing test |
  | **`UNCLASSIFIED`** | **anything else — reported, never folded into "not B"** |

  **THE FOURTH CELL IS THE POINT.** `exit 1 / 0 failed / no such string` is exactly what the
  G-016 diagnosis missed, one level out: a rate computed over a partition that does not cover the
  space reads clean because the classifier could not see the event. And the classifier's string
  is a **vitest internal** — a version bump silently reclassifies every run as `UNCLASSIFIED`
  rather than as B, which is why that is said where the classifier lives.

  Workload: the suite **as it ships after the relocation** — 74 files, 1,426 tests · Samples:
  **n=10 per arm quiet, n=5 per arm loaded** · Aggregation: the full classification table, not a
  percentage · Regime: **BOTH — quiet and loaded (12 busy processes on 12 cores,
  `tools/gates/arm/load.mjs`), `win32/12cpu`, arms ALTERNATED within each sitting**;
  `--maxWorkers=2` supplied on the command line so both arms run one binary and one config.
  *(The first version of this slot line said "quiet" over a table with two loaded rows —
  rule 4's fifth slot mis-stated in the summary of the campaign that measured it.)*
  The classifier is `tools/gates/arm/suite-signature.mjs`; the campaign re-runs as
  `node tools/gates/arm/suite-signature.mjs --runs 10 --label quiet --out <dir> -- pnpm test`.

  | regime | arm | n | PASS | **B** | A | UNCLASSIFIED | wall clock, median (min..max) |
  |---|---|---|---|---|---|---|---|
  | quiet | **uncapped** | 10 | 10 | **0** | 0 | 0 | **53.9s** (53.1..55.1) |
  | quiet | `--maxWorkers=2` | 10 | 10 | **0** | 0 | 0 | 84.3s (83.2..84.5) |
  | **loaded** | **uncapped** | 5 | 0 | **5** | 0 | 0 | 171.4s (169..175) |
  | **loaded** | `--maxWorkers=2` | 5 | 0 | **5** | 0 | 0 | 343.4s (326..379) |

  **THE PRE-REGISTERED RULE, WRITTEN BEFORE THE READINGS EXISTED**: zero of both signatures in
  n=10 quiet and n=5 loaded ⇒ the cap goes for good; any B uncapped with none capped ⇒ the cap
  returns **carrying the measured rate**; **B in both ⇒ the cap is not the remedy, the count does
  NOT reach 0, and that is an escalation rather than a claimed zero.** *The third branch fired.*

  ### THE CAP DOES NOT PREVENT B ON THE SUITE THAT SHIPS — AND THAT IS ALL THE CAMPAIGN COVERS

  **Ten loaded runs, both arms, every one of them signature B**: exit 1, 74 files and 1,426
  tests PASSED, `Timeout calling "onTaskUpdate"`. **THE DISCRIMINATOR IS LOAD, NOT WORKER
  COUNT.** Capping halves the parallelism, **doubles the wall clock (343.4s against 171.4s)**,
  and the RPC channel starves anyway.

  **THE SCOPE OF THAT CLAIM, STATED BECAUSE THE FIRST VERSION OVERREACHED AND SAID "THE CAP
  NEVER WORKED".** What was measured is **today's 1,426-test suite, after the relocation**. The
  sitting the cap was ruled in on ran **1,235 tests**, was never re-run, and its load condition
  is unrecorded — and *inferring* that regime from the absence of a label is **rule 4 run
  backwards**, which is the error this goal exists to stop, committed while correcting it.
  ADR-0015's REPLACE half says those are different configurations; they are not pooled and the
  older one is not re-interpreted. `sim-critic` caught this, and it was in four places including
  a settled `ESCALATIONS.md` entry and a proposed digest line.

  **What the campaign does support, and it is enough for the decision**: on the configuration
  that ships, the cap prevents nothing in either regime and costs 1.564× in both. **The removal
  is not in dispute.** What is withdrawn is the historical generalisation about a suite nobody
  re-ran. Paying for it would mean materialising the old tree and running the same classifier
  against it — a stated, affordable experiment, parked with its falsification test rather than
  asserted.

  *"It passes clean at `--maxWorkers=2`"* — the observation the cap was ruled in on — **carried
  no load condition**, which is `CLAUDE.md` rule 4's fifth slot **inside a fix rather than
  inside a number**, a place this project had not yet looked. That is a statement about what the
  observation PINS, not a claim that it was false.

  **CONSEQUENCE, AND IT IS NOT THE ONE THIS GOAL WANTED.** Defect A is repaired. **Defect B is
  DIAGNOSED, NOT REPAIRED** — it now has a reproducible trigger instead of a rate, and the thing
  that was supposed to be holding it off does nothing. **The unreliable count therefore goes from
  1 gate / 2 defects to 1 gate / 1 defect, NOT to zero**, and the exit criterion that says 0 is
  **not met**. Claiming it on the quiet arm alone would be "green on the run I took" (§2.0) with
  a loaded arm in the same campaign saying otherwise.

  **AND IT SHARPENS THE ITEM ALREADY OWED BY THE HUMAN.** A hosted CI runner is a shared box
  whose load is a neighbouring tenant. This campaign says what that regime does to `pnpm test`:
  **exit 1 with every test passing.** The remedy candidates (vitest `pool`, a worker-count
  policy, or handling the RPC timeout) are parked with a falsification test; none of them is
  this goal's, and inventing one at this hour is the fat-goal defect.

  **AND THE TAX THE COMMENT ASSERTED IS NOW MEASURED.** The cap's own text said *"a concurrency
  cap applied globally to accommodate one 39-second test is a tax on every future run"* — a
  comment offered as evidence with nothing pinning it (ADR-0007's amendment). It is true and it
  is **1.564× wall clock** on this machine (84.3 / 53.9), every run, for every agent and every
  human, since 2026-08-09.

  **THE `testTimeout` READING IS RETAKEN AT THE SHIPPED CONFIGURATION, AND IT MOVED IN THE
  DIRECTION NOBODY NAMED.** The inherited figure — slowest individual test 3,166 ms = 10.6% of
  the 30s ceiling — was taken AT the cap. Uncapped, the slowest single test is **8,233 ms =
  27.4%** of the ceiling, against **4,218 ms = 14.1%** capped, both maxima over 10 runs of the
  same suite. **Removing the cap makes the SUITE faster and individual TESTS slower**, which is
  what twelve workers contending for twelve cores does, and it is the opposite of the direction
  a reader would assume from the wall-clock figure. 30s stays: the worst observed test still has
  3.6× headroom, and the ceiling exists to catch a deadlock rather than a busy laptop.

  ### CAMPAIGN 3 — the discriminating measurement, and it PRE-REGISTERED what it could see

  `pnpm sim:needs-history --base aa30218` — `tools/gates/needs-history.mjs`. **Not a gate**: no
  bound, no verdict about the build, not in `pnpm verify`.

  **HOW IT REACHES BEFORE G-013 WHEN `sim:measure` CANNOT.** That instrument compares an
  ABSOLUTE per-tick cost, so it needs one harness across both arms, and HEAD's harness calls
  `roomTypeServes` (G-013). This one compares a **ratio of ratios**: each revision's ratio is
  internally paired, so each side runs its own simulation, its own content and its own
  `schedule()`. **It does NOT re-open `SMALLEST_KNOWN_REGRESSION`**, which is an absolute and is
  still unreachable — do not quote it as if it had.

  **PER-ARM MODULE IDENTITY IS ASSERTED TWICE.** Each revision is `git archive`-extracted and
  `pnpm install --offline`-ed in its own tree; the child resolves `@hotelsim/sim` and refuses
  unless the realpath is inside its own tree, and the PARENT re-checks the path the child
  reports — so deleting the child's check would not quietly remove the property. Each arm's
  `full-vector` state hash is cross-checked against **that revision's own CLI**
  (`--ticks 4320 --seed 42 --rooms 60 --arrivals 32 --quiet`): `285eecf460e41ac8` at head,
  `0b0c44de93660ed2` at base, **both AGREE**.

  What: the three-arm need rotation's ratio (`full-vector` / `one-need`) · Workload: as above ·
  Samples: 5 per arm per reading · **n=25 readings per revision per regime** · Aggregation:
  median of readings per revision, then the ratio of the two medians, **judged on a
  distribution-free interval at 95.7% coverage** · Regime: **quiet and loaded (12 busy processes
  on 12 cores), revisions alternated within each sitting, `win32/12cpu`**.
  *(This line read "quiet n=9 and loaded n=7" for a round — slots 3 and 5 naming the campaign
  the block withdraws twelve lines below, directly above the shipped one's table. The same
  defect as Campaign 1's slot line in sweep 1: the campaign moved and the slot line did not
  follow it. Twice in one goal is a habit, not an accident — a slot line belongs in the same
  edit as the table it describes.)*

  **THE VERDICT COMES FROM AN INTERVAL, NOT FROM THE POINT ESTIMATE** (sweep 2). Each revision's
  median carries a distribution-free interval from ORDER STATISTICS, and the ratio's interval is
  taken corner to corner; a verdict is rendered only when that interval falls entirely on one
  side of the threshold. n=25 per revision was **pre-registered before either regime was run**,
  after n=9 came back INCONCLUSIVE.

  | regime | head `455a538` | base `aa30218` | ratio | interval (95.7%) | verdict |
  |---|---|---|---|---|---|
  | **quiet**, n=25 | 1.7442 .. **2.0155** .. 2.3134 | 1.4834 .. **1.7094** .. 1.8540 | 1.1791 | **1.1071 .. 1.2534** | **NO MULTIPLE — excluded** |
  | **loaded**, n=25 | 1.4917 .. **2.1077** .. 2.5887 | 1.1115 .. **1.9157** .. 2.3212 | 1.1002 | **0.9668 .. 1.3228** | **INCONCLUSIVE** |

  **THE LOADED ARM CANNOT ANSWER THE QUESTION, AND SAYS SO.** Same instrument, same n, same
  coverage: load widens both revisions' readings until the interval straddles the threshold. The
  point estimate is *further* from 1.3 than the quiet one — 1.1002 against 1.1791 — and it
  supports LESS, which is exactly the trap a point estimate sets. Criterion 3 asks for both
  regimes stated; this is what the loaded one honestly states.

  **TWO EARLIER CAMPAIGNS ARE WITHDRAWN RATHER THAN QUOTED.** The first (2.0569 / 1.8073 /
  1.1381) was taken from a version of `needs3-arm.ts` that a scripted edit then corrupted into an
  unparseable file, which SHIPPED — unreproducible as shipped, so `CLAUDE.md` rule 5 withdraws
  it. The second (1.0868 / 1.2337 at n=9 and n=7) was taken through the point-estimate verdict
  that sweep 2 removed. **The instrument changed under both, so both are gone**; only the n=25
  pair above is quotable.

  **THE THRESHOLD WAS FIXED BEFORE THE READING EXISTED.** `>= 1.3×`, sourced to
  `tripwire.mjs:51-63` — every performance defect in twenty goals was a MULTIPLE (2.07×, 3.9×,
  6.6×) and not one was a 10% creep.

  **AND THE TOOL NOW REFUSES TO RENDER A VERDICT IT CANNOT SUPPORT, WHICH IT USED TO DO.**
  `sim-critic` ran `--repeat 1 --samples 2` and got **1.3117 → "MULTIPLE"**; the orchestrator ran
  the same command and got **1.2725 → "NO MULTIPLE"**. Two runs of one command, opposite
  verdicts across the threshold — **and the branch asserting a regression was the one that
  SUPPRESSED the paragraph explaining the instrument cannot tell 1.23 from 1.00.** The caveat was
  attached to the conclusion a reader was least likely to over-read. Fixed at the control flow
  rather than by moving the string: the caveat prints in every branch, the verdict is taken from
  the interval, and `--repeat 1` now prints **`NO VERDICT — too few readings`** because no order
  statistic reaches the coverage floor at n=1.

  **WHAT IT SETTLES: THE PRE-G-013 REVISION READS ~1.71 QUIET HERE TODAY, NOT 1.74 — AND HEAD
  READS ~2.02 ON THE SAME MACHINE IN THE SAME MINUTES.** The natural reading of "the file records
  1.74 and the instrument now says ~2" is a per-need regression. **The quiet interval EXCLUDES a
  1.3× multiple, so whatever the difference is, it is not the class this project has ever
  produced.** That is the finding, and it stands alone.

  **AND THE SENTENCE THAT USED TO FOLLOW IT IS WITHDRAWN, BECAUSE THE CAMPAIGN IT IS ATTACHED TO
  FALSIFIES IT.** It read *"most of the apparent movement is the distance between two SITTINGS
  rather than between two revisions"*. Decomposed on the shipped n=25 figures:

  | term | arithmetic | |
  |---|---|---|
  | sitting | base today 1.7094 / recorded 1.74 | **0.9824 → −1.8%** |
  | apparent movement | head today 2.0155 / recorded 1.74 | 1.1583 → +15.8% |
  | **revision** | head 2.0155 / base 1.7094 | **1.1791 → +17.9%** |

  **The revision term is LARGER than the apparent movement and the sitting term works against
  it.** Essentially none of the movement is the sitting. The sentence was defensible on campaign
  1, where the base median read 1.8073 and the sitting term was +3.9% — **and it was carried
  unchanged through two campaign replacements while the base median walked back onto the
  recorded 1.74, with nobody re-deriving it.** A conclusion outliving the numbers under it is
  the class this goal exists to remove, committed in the paragraph reporting the goal's own
  headline measurement. Found by `sim-critic` re-deriving it rather than re-reading it.

  *(The recorded 1.74 also came from a DIFFERENT INSTRUMENT — in-vitest, four-arm rotation — so
  it was never a like-for-like comparand. That cuts the same way: a further reason the sentence
  is unsupported, not a rescue for it.)*

  **WHAT THE QUIET ARM POSITIVELY SHOWS, WHICH THE FIRST VERSION OF THIS BLOCK UNDER-CLAIMED.**
  Its interval is **1.1071 .. 1.2534, and it excludes 1.0 as well as 1.3** — so it is not merely
  a failure to rule a multiple out, it is **positive evidence that a real difference exists**,
  localised to roughly 11-25%, between HEAD and the last commit before G-013 on the same machine
  in the same minutes. The loaded arm's interval spans 1.0 and cannot say either way.

  **AND MORE READINGS WOULD NARROW IT — the previous version of this paragraph said they would
  not, and that was wrong.** A distribution-free median interval tightens with n (the coverage
  ladder moves: k=8 of 25 gives 95.7%, k=7 gives 98.5%), and 13.2% of width against an ~18%
  question is already close. Saying "this needs a different instrument" could send a future goal
  to build one when it needs a larger `--repeat`. **What is out of scope is not the measurement
  but the OPTIMISATION** — that is this goal's stated boundary, and the difference is parked with
  its falsification test.

  ### THE FALSIFIED GUIDANCE, REPLACED WITH A MEASUREMENT RATHER THAN DELETED

  `needs.scaling.test.ts` carried, as the reason its bound was safe: *"contention adds roughly
  the same ABSOLUTE cost to both arms, so load pulls any ratio towards 1. That makes the bound
  flake-proof — LOAD CAN ONLY PUSH THE READING DOWN, NEVER UP."* Measured on all four axes,
  same instrument, same sitting design:

  | axis | quiet median → loaded median | quiet max → loaded max |
  |---|---|---|
  | needs | 2.0757 → 2.1636 (**+4.2%**) | 2.5906 → 2.9733 (**+14.8%**) |
  | density | 1.3493 → 1.3829 (+2.5%) | 1.6154 → 1.5619 (−3.3%) |
  | rooms-saturated | 3.8344 → 3.7255 (−2.8%) | 4.2525 → 4.3803 (+3.0%) |
  | rooms-bench | 3.0746 → 3.8136 (**+24.0%**) | 3.9312 → 4.1044 (+4.4%) |

  **Three of four move UP on the median and three of four move UP on the max**, and the axis the
  claim was written about (density) is the only one it holds for on the tail. What survives
  needs no stopwatch and is now stated instead: contention adds an absolute cost to every arm,
  so a ratio between arms **of similar cost** compresses. These arms are not of similar cost.
  The old sentence generalised a property of one arm pair to every pair in the file.

  **AND `:160-162`'s OTHER HALF IS FALSIFIED TOO** — *"anything up to ~2.0 is this spread and
  the machine, and anything well past it is a real per-need regression"*. Quiet readings reach
  **2.5906** here and **2.6534** in `sim-critic`'s extraction, and a reading of ~2.06 is what
  the PRE-G-013 revision produces today. Both halves of that sentence pointed a future reader at
  the wrong conclusion, which is ADR-0007's "a comment offered as evidence" class.

  ### SWEEP 1 — 1 BLOCKER + 7 MAJOR + 3 MINOR, ALL ANSWERED

  **THE BLOCKER IS THE GOAL'S OWN SUBJECT, COMMITTED BY ITS AUTHOR.** `needs3-arm.ts` shipped
  **unparseable** — a scripted edit had left a corrupt duplicate of `fileURLToPathish` beside the
  original — so **Campaign 3 could not run in the shipped tree**, and criteria 3, 4 and 5 were
  marked MET resting on it. `pnpm verify` was **eleven rows green over a file that does not
  parse**, because **no tsconfig in this repository references `tools/gates`** and no test
  imported it. The goal about things nothing checks shipped a file nothing checks.

  - **Fixed**: the corrupt copy is gone and the function is declared above its use.
  - **Given a home a checker can see**: the template moved to
    `tools/headless/src/needs3-arm.ts` — **the location it is copied to**, so its imports resolve
    identically in the arm and under `pnpm typecheck`, which **immediately found a second real
    defect** in its `lodgingOnly` types (a cast that dropped `id` and `name` from the result).
  - **The parked falsification test is now EXECUTED, not parked**:
    `needs-history.spawn.test.ts` runs the arm and asserts its shape, and — **the assertion that
    had never once executed** — watches the **module-identity refusal fire**, on a decoy that
    resolves the simulation successfully and outside its own tree. Two earlier decoys were
    rejected by the test itself for failing with `ERR_MODULE_NOT_FOUND` instead: satisfiable by
    the harness breaking, which is G-021's malformed-arm defect.
  - **Campaign 3 was RE-RUN and its earlier numbers are WITHDRAWN**, not restated. Verdict
    unchanged in both regimes; every figure different.

  **THE SEVEN MAJORS, each with what discharges it:**

  1. **The REPLACE brake inspected nothing for two of four axes** — the harness reported module
     constants (60/32) while the rooms rotation runs 25/100 rooms at arrivals 20/5/60/15. Now
     every rotation reports a **per-arm fingerprint** (`name:rooms/arrivals/amenities/needTypes`,
     in order) and the campaign records it. `sim-critic`'s exact repro — `saturated-100` 100 →
     200 — **now refuses and names the drifted arm**; witnessed.
  2. **The quotable `SCALING` line stated the wrong workload** for the two room axes. It now
     prints its own two arms: `arms=saturated-100(100r/5a/1m)/saturated-25(25r/20a/1m)`.
  3. **`MIN_READINGS_PER_REGIME = 7` was sourced to text that does not exist** — and this goal's
     own Campaign 1 used n=5 loaded. **The constant is gone**: the campaign now DECLARES its
     counts and the derivation pins the arrays to them. A pin, not a threshold, so there is no
     number left to source.
  4. **`load.mjs` could not spawn `pnpm` on win32 and never checked `result.error`** — the
     invocation that makes "loaded" reproducible could not run. Fixed (shell for a bare name,
     never for a path; a failed spawn is now loud), and **the four-cell classifier now exists in
     the tree** as `tools/gates/arm/suite-signature.mjs`, with `suite-signature.test.ts` proving
     all four cells reachable — including that a reworded vitest string degrades to
     UNCLASSIFIED rather than to PASS.
  5. **"The cap never worked" was broader than the campaign** — restated in all four places to
     what it covers, with the historical question parked *with its falsification test*.
  6. **The stopwatch scan's glob translation was inert and its guard could not fail.** `**` is
     now expanded in both forms by an explicit tokeniser, and the exclude step is witnessed:
     `sim-critic`'s probe — delete the clause from `suiteFiles` — **now reddens**, checked.
  7. **ADR-0016's worked example was wrong by two orders of magnitude** (164 parts in ten
     thousand, not six; the six belongs to a different pair). Corrected, with the swap recorded.

  **THE THREE MINORS**: the `median` convention is now **declared, with the cost of the choice
  tabulated** (+0.28% to +2.64% looser than the mean-of-middles) and **pinned in both
  directions** by a test; the `TIMED_RUNS` citation is `:144`; Campaign 1's slot line names both
  regimes.

  ### SWEEP 2 — ONE CODE FINDING, AND IT WAS THE GOAL'S OWN INSTRUMENT COMMITTING THE GOAL'S OWN DEFECT

  **`needs-history.mjs` rendered a verdict it could not support, and hid the caveat in exactly
  the branch that asserted a regression.** Two runs of `--repeat 1 --samples 2` — one by
  `sim-critic` at 1.3117, one by the orchestrator at 1.2725 — returned **opposite verdicts**
  across the threshold, and only the "NO MULTIPLE" branch printed the sentence explaining that
  the instrument cannot resolve a difference that size. **Fixed in the control flow**:

  - **the verdict is taken from a distribution-free INTERVAL** (order statistics, coverage
    printed, corner-to-corner combination that is deliberately conservative because this tool's
    failure mode is over-claiming);
  - **the caveat prints in every branch**;
  - **`--repeat 1` refuses** — `NO VERDICT — too few readings` — because no order statistic
    reaches the coverage floor at n=1. The same shape as `scaling-bound.mjs`'s pin: refuse when
    the readings cannot support what is claimed of them.

  **AND THE FIX CHANGED AN ANSWER, WHICH IS THE POINT OF FIXING IT.** At n=9 the quiet arm came
  back INCONCLUSIVE where the point estimate had said NO MULTIPLE. n=25 was then pre-registered
  for both regimes before either was run, and reported as it came: quiet excludes a multiple,
  **loaded still cannot tell**.

  **AND THE VERIFICATION PASS THAT FOLLOWED FOUND THE CONCLUSION THIS BLOCK HAD OUTLIVED.**
  `sim-critic` checked the interval arithmetic by measurement rather than by reading — the exact
  coverage ladder at n=25 (`k=7` 98.54%, `k=8` 95.67%, `k=9` 89.22%, so `k=8` is the tightest
  admissible), and **320,000 Monte Carlo trials across σ=0.05, σ=0.30 and a heavy right tail**,
  finding the corner-to-corner ratio interval delivers **~99.5% coverage while labelled 95.7%**:
  conservative by four points, invariant to spread and skew, and erring in the direction the file
  says it errs in. It then re-derived the block's own headline sentence and **falsified it** —
  see the sitting/revision decomposition above. A pass that verifies the arithmetic and then
  checks whether the PROSE still follows from it is the pass that catches this class.

  **THE TWO PROSE FINDINGS**: the median-cost table's `rooms-bench` row was wrong (4.5502 →
  **4.5576**, +1.36% → **+1.19%**) in a table built to make a free parameter checkable and left
  unchecked — **now parsed and recomputed by `scaling.bound.test.ts`**, with the old figures
  shown to redden it. And **ADR-0016's worked example is DELETED**: it was wrong in three
  successive drafts, including inside its own correction, so the ADR now states the rule and
  points at the code that executes it — which is the lesson `budget.mjs` taught at G-018.

  ### THREE DEFECTS THIS GOAL FOUND IN ITS OWN WORK, BEFORE ANY CRITIC SAW IT

  1. **`stopwatch.scan.test.ts` fired on its author, twice.** `scaling.bound.test.ts` timed the
     gate's refusal with `Date.now()` to assert it happened "before measuring", and READ the
     harness's path. The clock is gone — the ORDER is now asserted without one, by running the
     copied gate from a temp directory where the harness cannot be found, so a gate that reached
     the measurement would say *"the instrument failed"* instead — **with a control arm that
     shows the unpatched copy does say exactly that**. The importer check now matches an
     `import`, not the word.
  2. **The regex-literal blind spot in `stripComments` RECURRED**, one goal after
     `speed-ladder.scan.test.ts:132-149` recorded it and parked it. Written as `/'([^']+)'/g`,
     the two quotes on that line swallowed the next several comment blocks and the scan reported
     its own prose as a violation of itself. Fixed by building the pattern from
     `String.fromCharCode(39)`; the shared copy in `tools/gates/lib/scan.mjs` — behind I1, I2 and
     I3 — is untouched and still parked, because the failure direction is a loud false positive.
  3. **A PILOT CAMPAIGN WAS DISCARDED, NOT PATCHED.** Fifteen runs of campaign 1 were taken
     while two tests were being added to the tree, so the suite went from 1,424 to 1,426 tests
     mid-campaign and one run failed on a half-written file. Under ADR-0015 that is a
     configuration change and the readings measure a different quantity, so **the whole campaign
     was re-taken on a frozen tree** rather than pooled or explained. Recorded because the
     temptation was to keep the fifteen: *do not edit the tree during a measurement campaign.*

  ### THE BITE, WITNESSED ONCE AT VERIFY (seam B was taken, so there is no proof gate)

  `git stash push -u` → G-020b's **M1 quadratic** (factor 3) injected at `stepGuests`'s
  per-guest loop → `git stash pop` → `pnpm check:scaling`. **Exit code 1**, and the two axes it
  reddened are the two a guest-quadratic can reach:

  | axis | mutated | bound | verdict |
  |---|---|---|---|
  | `rooms-saturated` | **9.9921** | 5.7516 | **RED** (1.74× over) |
  | `rooms-bench` | **5.9200** | 4.6119 | **RED** (1.28× over) |
  | `needs` | 1.8626 | 3.1135 | green |
  | `density` | 1.2391 | 2.0239 | green |

  **The two green axes are the theorem, not a gap**: both hold the guest population still, so a
  term quadratic in GUESTS lands on both arms and cancels in the quotient — exactly what
  `check-tripwire.mjs` measured at G-020b, reproduced here against the relocated bounds.

  **REVERTED BY REVERSING THE EXACT EDIT AND PROVED BY DIGEST**, never by `git checkout --`:
  `packages/sim/src/guests.ts` is byte-identical to `HEAD` afterwards,
  `sha256 34e762acc73865b0…` before and after.

  ### VERIFY — ELEVEN ROWS, ALL GREEN, AND THE UNMOVED SET

  `typecheck` 8.1s · I1 4.1s · I3 1.0s · **I4 51.0s** · I2 8.4s · I6 4.8s · I5 9.1s ·
  `check:measure` 31.5s · `check:tickcost` 1.1s · `check:tickcost:proof` 79.3s ·
  **`check:scaling` 5.9s**. Unmoved: **I2 `10926cc3b569c887`**, save **v9**, `SAVE_V1_CONTENT`
  `8e09fe4f0fa162a3`, `BUDGET_MS` **389,333ms**. `check:tickcost` returned in 1.1s because the
  arms' simulation and content bytes are IDENTICAL — this goal changes no file under
  `packages/sim` or `packages/content`, which is what that row is saying.

  ### CRITERION STATUS, STATED BY THE BUILDER RATHER THAN LEFT TO BE INFERRED

  | criterion | status |
  |---|---|
  | `pnpm test` at n ≥ 10 uncapped, signature-B rate reported, cap decided by a reading | **MET** — n=10 per arm quiet, n=5 per arm loaded, four-cell classifier, cap removed |
  | the timing bounds no longer run inside `pnpm test`; standalone beside `check:tickcost` | **MET** — `pnpm check:scaling`, plus `stopwatch.scan.test.ts` making "no clock in the suite" checkable |
  | the discriminating measurement, quiet and loaded, both stated | **MET, third campaign** — n=25 per revision per regime. **Quiet EXCLUDES a 1.3× multiple AND excludes 1.0** (1.1071..1.2534), so a real 11-25% difference is positive evidence and is parked; **loaded is INCONCLUSIVE** (0.9668..1.3228) and says so. Two earlier campaigns withdrawn: one unreproducible as shipped, one taken through a point-estimate verdict |
  | both revisions run the 3-arm rotation | **MET** — and the 4-arm reading is named as a different quantity |
  | per-arm module identity asserted | **MET, and now WITNESSED** — child refuses, parent re-checks, each arm's hash matches its own revision's CLI, and `needs-history.spawn.test.ts` watches the refusal fire. It was previously asserted by a file that did not parse |
  | the bound re-derived above the observed quiet maximum | **MET** — and above the loaded maximum too; the floor pools regimes |
  | the two constraints get an executable brake and a pre-registered crossing response | **MET** — equality pin, floor refusal, "too noisy to gate", response written before the campaign |
  | **the unreliable count reaches 0 in every digest** | **NOT MET, AND NOT CLAIMED.** Defect B is diagnosed and unrepaired; the count is **1 gate / 1 defect** |
  | all §2 gates green (`pnpm verify`, eleven rows) | **MET** |

  **The digests are NOT edited here.** §4.1 makes that REFLECT's step and requires all four to
  carry a byte-identical as-of line, rewritten in one pass. The line this goal supports is:
  *"Unreliable: 1 gate, 1 defect (I4 — worker RPC starvation under load, diagnosed, cap removed
  as measured-ineffective)."*

  ### §5.8 — "A STOPGAP THAT BECAME POLICY", AND WHERE ELSE IT LIVES

  The class this goal's headline fix lands on: **a provisional accommodation, correctly reasoned
  when made, that nothing is scheduled to revisit.** Swept with locations and results — a
  location can be re-inspected, an assurance cannot (`HOTELSIM.md:279`).

  - `vitest.config.ts` `maxWorkers: 2` — **THE INSTANCE. Fixed by a reading** (campaign 1
    below), not by inertia and not by another comment.
  - `vitest.config.ts:25` `testTimeout: 30_000` — **re-measured at the shipped configuration**,
    because the inherited reading was taken AT the cap. See campaign 1.
  - `tools/gates/arm/measure-arm.mjs:84,144` `WARM_UPS = 2`, `TIMED_RUNS = 3` — **CARRIES THE
    SHAPE AND ALREADY DECLARES IT.** The file records that `TIMED_RUNS = 3` was measured and does
    NOT move the noise floor (sd 6.8% against 8.4% at n=7, unresolvable), and keeps it because it
    is cheap rather than because it works: *"~150ms against the ~900ms a process costs to
    start"*. **Checked, not changed**: a stopgap that states its own evidence and its own cost is
    the thing this rule asks for, and re-litigating it is not this goal's.
  - `tools/gates/bench.mjs:47` — the ten seconds' policy, *"when this gate starts to hurt, the
    answer is a faster tick, not a bigger number here"*. **Checked, CLEAN**: genuinely withdrawn
    in the file, with its replacement stated in the same paragraph. The cap's comment cited this
    correctly.
  - `.github/workflows/verify.yml` — **CARRIES IT IN ITS PUREST FORM.** Written at bootstrap
    "even though there's no remote yet"; there is still no remote, so it has never run. Measured
    and escalated at SELECT (`ESCALATIONS.md`, 2026-08-10); **the human's, not an agent's.**
  - `tools/gates/measure.mjs`'s `--repeat`, forwarded by `tripwire.mjs` and never used —
    **checked, unchanged, still parked with its falsification test** (G-020b). Nothing in this
    goal disturbs it.
  - `NOT_OVERHEAD_DOMINATED = 2` — **checked, clean, and it now carries its own measurement.**
    Not a stopgap but an ADR-0007 anti-vacuity guard, and it moved with the bounds because it is
    itself a timing assertion. Measured headroom (n=12 quiet medians, campaign 2's rotations,
    `win32/12cpu`): `one-need` **6.2×** idle, `full-vector` **13.7×**, `bench-100` **30.1×**,
    `saturated-100` **80.5×**.

  **AND THE `~39×` IN THE OLD `scaling.test.ts:111` IS RESTATED RATHER THAN CARRIED.** It said
  *"measured at ~39x when this was written"* with no regime, sample count or date — the
  regime-less-noise class handed to this goal. It is now the four figures above, each with its
  five slots, and it lives in `scaling-bound.mjs` beside the constant it justifies.

  **THE OTHER TWO REGIME-LESS LOCATIONS ARE WITHDRAWN, NOT RESTATED** (`CLAUDE.md` rule 5).
  `arm/measure-arm.mjs`'s `~±10%` single-reading and `~±3%` `--repeat 7` figures are struck at
  **`:92`, `:96` and the third occurrence at `:109`** the block never named, and the pointer in
  `workload.mjs:42` with them: the first carried no load condition, and the second is already
  known not to reproduce (0.9067 and 1.0501). Where a pinned figure is wanted,
  `tripwire.mjs`'s `BOUND_CAMPAIGN` carries five slots per arm and computes its ceiling.
  **`GOALS.md`'s G-020a block is annotated in place; `JOURNAL.md` and `ESCALATIONS.md`'s closed
  entries are NOT retro-edited** — ADR-0008, and the orchestrator's ruling 3: history records
  what was believed, and the correction goes in the current entry.

## G-021 — The speed ladder is content
Status: **done, DRY at 1/3** — 1 sweep (4 MAJOR + 4 MINOR) plus a §5.6 plan pass that returned
  **1 BLOCKER + 8 MAJOR before a line was written**, and three verification passes, **none of
  which converted.** Zero BLOCKERs survived into code. The plan pass is where this goal was
  won: the BLOCKER it caught would have made criterion 5 unmeetable.
Milestone: M2
Owner pair: sim-engineer / sim-critic
Statement: The play-speed ladder — ticks per real second at each rung — is JSON in
  `packages/content` validated by a schema, not a constant in code.
Exit criteria — **REWRITTEN 2026-08-10 after `sim-engineer` found all three defective at
PLAN (§5.7). The originals are struck, not deleted, because the pattern is the finding.**

  - ~~`pnpm check:content` green with the ladder as content~~ — **VACUOUS: green at HEAD, and
    green if this goal ships nothing.** Verified by the orchestrator. ADR-0007's sixth
    amendment, in exit criteria, **for the second consecutive goal.** Replaced by:
    **`pnpm exec vitest run speed-ladder` green**, including a scan of `packages/sim/src`
    and `tools/` finding **zero** speed literals, shown to bite on a synthetic one, and
    **RED at HEAD with the reading recorded.** `check:content` stays as a named guard row,
    never as evidence.
  - **…and the second clause of that criterion is FALSE TODAY, which nothing could see.**
    `tools/viewer/viewer.js:551` holds `const SPEEDS = [1, 5, 30, 120]` — a ticks-per-second
    ladder in code, containing the **dead 1× the human killed** and a 120 the ruling does not
    contain, **inside the very instrument whose watching produced the ruling**, under a
    comment naming itself the discharge point. The scan above is what makes this a
    measurement rather than a sentence.
  - ~~`tools/gates/bench.mjs` derives I5's budget~~ — **WRONG FILE, and following it would
    UNDO a critique fix.** `bench.mjs` deliberately derives nothing; `sim-critic` split the
    arithmetic into `budget.mjs` at G-018 round 1 so it could be pinned. Verified: the
    constant lives at `budget.mjs:39`, and `bench.mjs` only imports `BUDGET_MS`. Replaced by:
    **`tools/gates/budget.mjs` derives `TOP_SPEED_TICKS_PER_SECOND` from the content ladder**
    rather than a local constant, and `bench.budget.test.ts` still ties every copy together.
  - changing a rung in JSON changes the derived budget with **no code edit**, proven against
    a **byte-identical copy of the shipped module (`sha256` asserted equal)**, with a
    **control** arm at the shipped ladder, arms in **both directions** (×2 halves, ÷2
    doubles), an **order** arm (fastest rung written last, pinning `max` not `[0]`), and a
    **malformed** arm that must **throw rather than fall back**. Each arm also asserts
    `BUDGET_MS > 0` and that `TOP_SPEED` itself moved — **the ×2 relation is preserved by
    zero**, which the builder caught in its own first draft.
  - all §2 invariant gates green (`pnpm verify` — **ten rows**), plus the unmoved-reading
    set: I2 `10926cc3b569c887`, `SAVE_V1_CONTENT` `8e09fe4f0fa162a3`, save v9, fixture
    zero-line diff, `BUDGET_MS` 389,333ms.
Out of scope: choosing the final rung values (that is a balance question the viewer
  informs); speed-control UI (M5)
Critique rounds used: 0/3

  **ORCHESTRATOR RULINGS AT PLAN, 2026-08-10.**

  1. **THE SEAM IS THE VIEWER, AND IT IS NOT TAKEN.** `sim-engineer` named it (move
     `viewer.js`'s ladder to a separate G-021b) and recommended against, and I concur:
     the wire already exists (`serve.mjs:39` serves `/content/`), it is ~12 lines, and it is
     **the only place in the repo where "labels travel with the values" is load-bearing
     rather than anticipated.** Shipping "the speed ladder is content" while
     `const SPEEDS = [1, 5, 30, 120]` stays in `tools/` would ship a known instance of the
     class the goal exists to remove. **Scored at REFLECT** — the builder's stated cost of
     NOT splitting: *one extra file in the critic's sweep with no new invariant surface.*
  2. **THE BUDGET DOES NOT MOVE, AND THAT IS THE GOAL'S CENTRAL RISK — STATED BY THE BUILDER
     BEFORE IT BUILT.** `max{30, 12, 5} = 30`, the incumbent constant, so `BUDGET_MS` stays
     389,333ms and **no gate reading discriminates a working feature from a decorative one.**
     Criterion 3's probe is the only discriminator in the goal. That is why its control and
     malformed arms matter more than its headline arm.
  3. **THE CHARTER IS MINE TO EDIT.** §2's I5 row and §2.1.1's "PROVISIONAL WORKING FIGURE"
     framing both become false on landing. The builder hands me exact text; **I apply it in
     the same commit** so the charter is never false in a committed state. The builder owns
     the comment corrections in `budget.mjs`, `bench.mjs` and `viewer.js`.
  4. **A NEAR-MISS WORTH KEEPING.** The obvious enforcement — *"no rung may be an integer
     multiple of another"* — **would reject the human's own ladder**: 30 = 6 × 5. The
     enforcement has to constrain the **format and the consumers**, never the designer's
     values.

  **§5.6 RULINGS, 2026-08-10 — `sim-critic` returned PROCEED with 1 BLOCKER + 8 MAJOR.**

  - **BLOCKER, and it made the goal unmeetable as planned. ACCEPTED.** Resolving the ladder
    relative to `budget.mjs`'s own `import.meta.url` breaks **two more harnesses than the
    plan accounted for**: `check-measure.mjs:229` and `check-tripwire.mjs:160` both
    `cpSync` the gates into a temp dir and run the copy, and `measure.mjs:56` imports
    `budget.mjs` **statically**, so a top-level throw is fatal at module load — with a
    perfectly valid shipped ladder. `check:measure` and `check:tickcost:proof` would go red
    and criterion 5 could never be met. Verified by the orchestrator. **Fix: `budget.mjs`
    gets a repo-root constant of exactly `measure.mjs:73`'s shape** so the existing rewrite
    at `check-measure.mjs:241` / `check-tripwire.mjs:172` reaches it in one added
    `.replace` per harness — and both already throw when a patch matches nothing.
  - **The ORDER arm cannot be implemented as I wrote it. ACCEPTED.** A permutation has the
    same `max`, so "each arm asserts `TOP_SPEED` moved" is false for it *by construction*;
    its real assertion is that TOP_SPEED did **not** move. And "fastest written last" only
    kills `[0]`, not `last`. **Replaced by the fastest rung in the MIDDLE — `[12, 30, 5]`:
    max 30, first 12, last 5, min 5, sum 47, so one arm kills four wrong reducers** and
    subsumes the fastest-last arm.
  - **The MALFORMED arm was satisfiable by the harness breaking. ACCEPTED** — a wrongly
    assembled mirror also exits non-zero. **Assert the thrown message names the ladder
    file**, never the status. Precedent: `bench.budget.test.ts:60-67` asserts
    `budget is 0ms (I5)` for exactly this reason.
  - **"RED at HEAD" was satisfiable with no scan at all. ACCEPTED.** Verified:
    `pnpm exec vitest run speed-ladder` at HEAD prints **"No test files found, exiting with
    code 1"**. An empty file named `speed-ladder.test.ts` turns it green. **Record the
    scan's own failure message naming the viewer's lines**, not an exit code.
  - **`viewer.js:552` — `let ticksPerSecond = 30;` — is a SECOND literal one line below the
    one I named. ACCEPTED, and it is my defect for the third consecutive goal.** A builder
    implementing to my block would delete `SPEEDS` and leave the default rung hardcoded.
    Name both lines; the scan's identifier set must cover `ticksPerSecond`, not only
    `SPEEDS`.
  - **E2 is real but leaky, and it does not touch the failure the ruling names. ACCEPTED as
    restated.** Measured against the plan's own regex: `"2x"`, `"2×"`, `" 30 X "`, `"2 x"`
    refused; **`"×2"`, `"x2"`, `"2x speed"`, `"Fast (2×)"` all admitted.** And "M5 hardcodes
    1×/2×/3×" is a property of `apps/game` source that no content schema can reach — E4's
    own admission. **State E2 as what it is: it stops the DESIGNER encoding a relation in a
    label.** That is worth having and it is not the ruling's failure mode.
  - **Two validators, and only the weaker one guards the shipped bytes. ACCEPTED.**
    `strictObject` — the whole of E1 — would be applied to synthetic documents and never to
    the file that ships. Follow `tools/gates/lib/content-id.mjs` + `content-id-agreement
    .test.ts`: a **live cross-check** over a battery of documents, plus one test that reads
    and validates the shipped file, matching `content-loader.test.ts:175`.
  - **The scan's root set. ACCEPTED both halves.** A single global visited-file count cannot
    see a dead root — `tools/` alone contributes ~40 files, so a mistyped sim root is
    invisible. **Count PER ROOT.** And **add `apps/game/src`**, which exists today: M5 is
    the failure the ruling names, and that root is the only part of the scan still doing
    work at M5. (Reading `apps/game` is not opening it — §9 forbids *work* there.)
  - **THE 120 RUNG — RULED, because the goal block was changing the WATCH instrument
    silently.** Shipping {30,12,5} to the viewer removes its fast-scrub, and a 30-day
    recording is 43,200 ticks: **~6 minutes of watching at 120 ticks/s, ~24 at 30.** G-019
    owes a watched recording two goals away and that cost lands on the human. **The viewer
    keeps a fast REVIEW control, and it is NOT a rung and NOT in the JSON** — review speed
    over a recording and play speed over a live sim are different quantities, and the ladder
    is the second. The play buttons come from the ladder; the review control is separate and
    labelled as such.
  - **Two justifications in the plan are false and support correct decisions. ACCEPTED —
    keep the decisions, drop the reasons.** (a) *"a zero rung makes `min` zero"* —
    `max{0,5,12,30}` is 30 and nothing consumes `min`. The real reason pause is not a rung
    is that **pause is a transport state, not a rate**; say that, because the human's ruling
    reads "with pause beneath" and M5 will otherwise take the ladder for the complete set of
    transport states. (b) *"it would move `SAVE_V1_CONTENT`'s fingerprint"* — not as stated;
    `content.ts:1137-1140` omits optional keys when undefined precisely so a new table does
    not. **The I2 ground alone is sufficient and correct**: it is a wall-clock quantity.
  - **The ÷2 arm as specified would exercise the malformed path. ACCEPTED** — halving
    {30,12,5} gives {15,6,**2.5**}, which the `int()` schema rejects. Use **{15,6,2}**; the
    criterion's "÷2" is about the budget's direction, not per-rung division.
  - **Rung ids need an underscore** (`content-id.mjs:17`): `speed_fast` passes, `fast` would
    turn I3 **red**. The planned ids are already correct; pin it in a test.
  - **§5.8's table must land in the goal block or the commit message**, not only in a
    report — a location can be re-inspected, an assurance cannot (`HOTELSIM.md:268`).

  **THE LADDER'S SHAPE, RULED 2026-08-09 AFTER WATCHING — and it is NOT a linear ramp.**

  > **30 / 12 / 5, with pause beneath.** A fast, a working and a careful speed, all three of
  > which someone would actually select.

  **30 ticks/s is the ANCHOR, not the ceiling.** It is the number that reads right, so the
  rungs below it are spaced by **what is playable**, not by round multipliers. *"Shipping a
  1x that nobody ever touches is a dead rung wearing a label."*

  **Two things go in the JSON alongside the numbers, because this goal mints the format:**
  1. **The labels travel with the values.** A rung carries its own name.
  2. **There is no implied arithmetic between rungs.** They are not multiples of each other
     and nothing may compute one from another.
  Otherwise **M5 hardcodes "1x / 2x / 3x" against content that does not mean that, and the
  first rebalance produces a UI that lies about itself.**

  **A HUMAN PREDICTION WAS SCORED HERE, AND IT WAS HALF WRONG — RECORDED BY THE HUMAN.**
  The prediction was that 48 s/day would read **sluggish**, reasoned from the settlement
  heartbeat: several settlements per decision cycle. Watched, it reads **brisk**.
  In the human's own words: *"I derived a feel from arithmetic rather than from watching,
  which is precisely the move ADR-0013 exists to forbid. **The instrument corrected the
  person who argued for the instrument.**"*
  **The half that held is the one that matters more: 1x is dead** — and that is what makes
  the ladder non-linear rather than merely re-scaled.

  **HUMAN RULING, 2026-08-08.** G-018 needed *a* top speed to derive I5's budget and used
  30 ticks/s — a simulated day in 48 real seconds. **That figure is PROVISIONAL and was
  explicitly not ratified as a design fact.** The human's objection is about the bottom of
  the ladder, not the top: at this mapping **1× is 24 real minutes per simulated day, so
  nobody will ever play at 1×. A ladder whose lowest rung is dead is one speed with
  decoration below it** — and you would find that out the first time someone used the
  viewer.
  *"1 tick = 1 real second is aesthetic tidiness, not a design finding. I chose 1 tick =
  1 in-game minute in the charter and that's sound. Mapping it 1:1 onto real seconds is a
  separate choice that inherited its justification from the first one by adjacency."*

  **Making it content dissolves the "cheaper now than after M5" problem entirely** — the
  ladder becomes a JSON edit at any point, including after the first person watches a
  hotel. I3 already says this kind of balance number is data.
  **The only thing that would make it expensive is animation timing tuned against the
  constant, and the M5 block is forbidden from doing that** (see M5's note).
  **Discharge point for the 48 s figure: G-017's viewer** — the first question a watching
  human can actually answer, and the cheapest possible use of the instrument.
  The derived budget is not safe against this moving — it is **inversely proportional** to
  the top rung, so **changing a rung in JSON re-derives I5's constant, which is what this
  goal's own exit criteria require.** What is safe is the CONCLUSION: 389.3 / 12 = 32.4s,
  so any ladder change within ~12× leaves the budget at least 2.5× the old ten seconds.
  Establish that by division. G-018's sensitivity table varies S and H, not the ladder,
  and reaches only 5× from the shipped cell — do not cite it for this.

---

## M2 exit — human sign-off required

When **G-012 to G-021** are `done`, that is a §5.4 escalation. Write it to
`ESCALATIONS.md` and stop.

**M2 exit additionally requires, per ADR-0013:**
- **M2 EXIT IS NOT RIPE AND MUST NOT BE ESCALATED EARLY (human, 2026-08-09).** As of
  G-020b closing DRY, **four goals outstanding — G-014b, G-019, G-021, G-020c** — plus the
  WATCH obligations. (G-020b was on this list and is discharged; G-020c was created during
  it and joined the list, which is why the count did not fall. **The M2 denominator moved
  from 12 to 13 goals at that moment and the digests did not notice for a full goal** — see
  the digest scoring below, where it is the third failure.)
- **A COUNT OF KNOWINGLY-UNRELIABLE TESTS GOES IN THE DIGEST, BESIDE THE GATE READINGS.**
  Currently **one gate — I4 — carrying two distinct defects**, one unrepaired and one held
  at bay by a stopgap. *(An earlier version named "I4's instrument test (now moved out to
  `check:measure`)" as one of two, which is the conflated diagnosis `72ae268` retracted:
  removing that test fixed neither defect.)* **A THIRD BEFORE G-020b LANDS IS A STOP CONDITION, NOT A THIRD
  DEFENSIBLE DECISION.** Each one is defensible alone; that is exactly how a suite stops
  being evidence.
- **THE BIMODAL RECORDING TAKEN AND WATCHED, NOT MANUFACTURED.** ~6 rooms, 24 arrivals/day.
  **It should look substantially more alive than the crowded run** — where 18 of 216 guests
  ever held a room and most of what was watched was people standing still. **If it does not,
  that is the finding.**
- **SCORE THE DIGEST EXPERIMENT HONESTLY — human ruling, 2026-08-09.** §4.1's digests are an
  experiment, not a settled mechanism, and **they failed twice in their first day**: four
  files gave three different answers to "where are we", and **the hand repair itself missed
  `PARKING.md`** because its as-of line wraps. *"The mechanism needed a mechanical check
  within a minute of being repaired by hand is as good an argument for DELETING it as for
  automating it."* At M2 exit, say which — kept, automated, or deleted — **and say it against
  the evidence rather than by preference. ARGUE THE DELETE CASE AS WELL AS THE AUTOMATE
  CASE**: *"I would rather see the argument than the defence."*

  **EVIDENCE ACCUMULATING FOR THAT SCORING — recorded as it happens rather than
  reconstructed at the boundary, because reconstructing it is how the last count went
  wrong.** Failures so far, all within two days of the mechanism existing:
  1. **Four files, three different answers to "where are we"** (G-020a). The defect §4.1
     was built to close, exhibited by §4.1.
  2. **The hand repair missed `PARKING.md`** because its as-of line wraps.
  3. **G-020b's REFLECT: two of four digests breached the fifteen-line cap** — GOALS at 20,
     DECISIONS at 17 — and **the M2 denominator had been stale for a whole goal** (12 vs 13)
     because G-020c was created mid-goal and no step re-counted. Caught only because the
     orchestrator counted lines by hand, which is not a mechanism.
  4. **G-014b's REFLECT: ALL FOUR breached the cap — one REFLECT after failure 3 was written
     down by the same orchestrator, in the same file, as an argument for automating it.**
     19 / 16 / 18 / 17 against a limit of 15. It took **four** further editing passes to get
     them back under, and the only thing that caught it was counting by hand again.
     **This is the strongest single item on the delete side of the ledger**: a rule that its
     own author breaches immediately after recording the breach is not being enforced by
     anything, and the labour of hand-enforcing it is now visible and recurring.

  **AND THE MECHANICAL CHECK §4.1 SEEDED IS STILL UNASSIGNED.** `HOTELSIM.md:213` says the
  byte-identical as-of line is *"seeded as an obligation on the next goal that owns a
  ledger-shaped check; until then the orchestrator re-stamps all four in one edit and says
  so at REFLECT."* **No goal owns it. It has been hand-verified twice and hand-repaired
  twice.** That is the delete-vs-automate question in its concrete form, and the honest
  framing for sign-off is: the mechanism has failed three times, been repaired by hand every
  time, and the check that would make it self-enforcing has no owner. **Either it gets one,
  or the fifteen-line cap and the as-of line are aspirations rather than rules.**
- **THE NEXT MECHANISM PROPOSED TO MAINTAIN THE LEDGERS MUST ARGUE FOR ITSELF THE WAY A
  FEATURE WOULD** (human, same ruling). At eighteen goals this repo holds **~5,600 lines of
  markdown against 5,210 lines of simulation — near 1:1, with nobody having played the
  game.** The ledgers have earned their keep: the parked-hypothesis chain, the ADR-0007
  lineage, the digest catching stale state. But **a cycle was just spent repairing the
  mechanism that maintains the summaries of the record, and then needing a mechanical check
  for the repair.** That is process requiring process, *"which is the point at which
  documentation starts consuming the attention it exists to save."* **Not a instruction to
  write less — an instruction that the next ledger mechanism carries the burden of proof.**
- **G-020 — THE TICK-COST TRIPWIRE — IS DONE.** Hard prerequisite of M3, by human ruling.
  This bullet exists because `sim-critic` found G-020 seeded with "M2 does not exit without
  it" while **neither this block nor the digest order mentioned it** — two of the three
  places the loop consults at a milestone boundary would have let M2 escalate for sign-off
  without the tripwire, defeating the ruling in the same edit that recorded it. An
  orchestrator error, found by a critic reading the post-state rather than the diff.
- **G-021 — the speed ladder is content** — is `done`, so the provisional 30 ticks/s is a
  JSON value rather than a constant before M5 can tune anything against it.
- **WATCH observations in `JOURNAL.md` for G-013, G-014 and G-015** — what looked wrong,
  or that nothing did. M2's statement contains the word "visibly" and that is how it is
  discharged. G-017's own falsifiable claim is answered here too: at least one behaviour
  every test calls correct and a human calls wrong, **or an honest record that a month of
  hotel was watched and nothing looked wrong**, which retires the concern.
- **A sourced I5 budget** (G-018 — **DONE**: 389,333ms, derived in `HOTELSIM.md` §2.1.2),
  so the milestone hands M3 a number rather than a
  superstition.
- **Every critique in M2 closed DRY**, not FIXED (§7.1).

**M3 AND M4 GATING, recorded here so it is not rediscovered at the milestone boundary:**
M4 does not start until the scenario-capital mechanism lands (ADR-0013 §5). `--rooms N`
seeds stock that is cash at the refund rate — `--rooms 3` carries 375,000p against a
500,000p starting constant — and every balance sweep and every bench in this project used
that flag, so `balance-critic`'s whole accumulated evidence base was taken in a world with
**75% more effective opening capital than the shipped figure**. Harmless until M4 tunes
demand curves and pricing against exactly those sweeps.


---

# M3 — Circulation

**Stairs and lifts as queued shared resources. Vertical pathing. Wait time as a first-class
satisfaction input.** §8: *"where the genre's difficulty actually lives."*

**M3 DOES NOT OPEN UNTIL G-022 IS DONE** (`HOTELSIM.md` §8, human 2026-08-10). Both of its
prerequisites are instrument debts, and the second is the largest unverified claim in the project.

## G-022 — The instrument debts M2 left, before circulation touches anything
Status: **pending — HARD PREREQUISITE OF M3. No M3 behaviour goal starts until this is done.**
Milestone: M3 (gate goal)
Owner pair: sim-engineer / sim-critic
Statement: I4's defect B is repaired and the `--maxWorkers` stopgap is gone; the as-of stamp is
  checked mechanically and owned; every scanner gate has a proof-of-bite test; and **CI has
  actually run green on a real remote across three operating systems.**
Exit criteria:
  - **CI GREEN ON A REAL REMOTE, THREE OS, INCLUDING `compare-hashes`.** A run URL in
    `JOURNAL.md`. **This cannot be satisfied locally and it is the point.** `JOURNAL.md`'s
    bootstrap entry has recorded the three-OS matrix as wired since G-001; **it has never
    executed**, so that claim has sat in the permanent record for nineteen goals having
    inspected nothing — ADR-0007 at the infrastructure layer. **I2 says byte-identical on every
    platform and has only ever been tested on one**, and it is the tripwire the whole design
    rests on. *(Audited 2026-08-10: the workflow is well-formed, `fetch-depth: 0` is pinned by
    `check-measure.mjs`, and `sim:run --ticks 100000 --seed 42 --quiet` was verified to return a
    hash. What is untested is every platform but this one.)*
  - **I4's DEFECT B REPAIRED**, with the rate measured by the shipped signature classifier under
    the loaded arm that produced 10 of 10 at G-020c — **not by a quiet run.** `--maxWorkers`
    leaves `vitest.config.ts` entirely. **The unreliable count reaches 0 and the digest says so
    with its noun.**
  - **THE AS-OF STAMP IS MECHANICAL AND OWNED.** One source, four files; REFLECT fails if they
    disagree. **The fifteen-line cap is NOT reinstated and NOT automated** — see §4.1.
  - **EVERY SCANNER GATE HAS A PROOF-OF-BITE TEST**, each shown to fail for the RIGHT reason.
    G-019 shipped one that removed the scanned subject rather than the mention, so a predicate
    hard-coded to `false` satisfied it — **that shape is the thing to avoid, and it is the
    acceptance bar.** Inventory the scanners first and state the list; `check-purity.mjs`,
    `check-content.mjs`, `determinism.mjs`, `speed-ladder.scan.test.ts`,
    `stopwatch.scan.test.ts`, `review.boundary.test.ts` and `viewer.readonly.test.ts` are the
    ones known at PLAN.
  - all §2 invariant gates green (`pnpm verify`, **TWELVE rows** — the stamp check landed as
    the twelfth `—` row, ruled at PLAN), **plus the same twelve green in CI on all three
    platforms**
Out of scope: any circulation behaviour; anything in `packages/sim` beyond what repairing B
  requires (expected: nothing).
Critique rounds used: 0/3

  **WHY THIS IS ONE GOAL AND NOT FOUR.** All four are instrument debts, none touches the
  simulation, and three of them are the same shape — **a check that nobody owns, or that nobody
  has watched fail.** Splitting them would give each a ceremony larger than its diff. If
  `sim-critic` disagrees at §5.6, the seam is CI (which needs a human action) against the three
  local repairs.

  **THE SEQUENCING ARGUMENT, WHICH IS THE HUMAN'S AND IS THE REASON THIS BLOCKS M3.** Defect B
  is a **load-sensitive** flake, and M3 is pathfinding and queued shared resources — the
  milestone most likely to add load. **Carrying a load-sensitive unreliable gate into the
  milestone that stresses it is bad sequencing rather than acceptable risk.** And a
  timing-derived bound now ships inside `pnpm verify`, calibrated on one machine; M3 would be
  the first milestone where a cross-platform surprise costs real rework.
