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
Status: pending
Milestone: M1
Owner pair: sim-engineer / sim-critic
Statement: A room is valid only if it is enclosed, has a door, and holds its required
  items. An invalid room is not a provider, and the reason it is invalid is legible.
Exit criteria:
  - pnpm exec vitest run validity  (all green)
  - pnpm sim:run --days 30 --seed 7 reports zero guests served by an invalid room
  - every invalidity reason is reachable by a test that constructs it
  - all §2 invariant gates green (pnpm verify)
Out of scope: item variety and item content beyond what a room requires (M6); staff (M4)
  (-> PARKING.md)
Critique rounds used: 0/3

## G-010 — The bench simulates a real hotel, and tick cost stays linear
Status: pending
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
Critique rounds used: 0/3

  This is the parked I5 debt coming due, and it is scheduled inside M1 deliberately:
  M1 is the milestone that hands room count to the player, and `ai-critic` measured I5
  failing between 50 and 75 rooms (27.7s projected at 75). The bench being a three-room
  toy is why the gate is green while the game would be unplayable — fixing the workload
  is half the goal. Any room -> occupant index built here is DERIVED state: rebuilt on
  load, never saved, never authoritative (see PARKING.md for why).

---

## M1 exit — human sign-off required

When G-007 to G-010 are all `done`, that is a §5.4 escalation. Write it to
`ESCALATIONS.md` and stop. Do not start M2, and do not open `apps/game`.
