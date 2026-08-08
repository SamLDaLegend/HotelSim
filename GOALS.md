# GOALS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-08, G-013 done. 14 goals complete; M0 and M1 signed off; M2 half built.*

- **Schema versions**: save **v7** · summary **v1** (v2 owed by G-015).
- **Gates**: all six green. I2 `4b8db9b1ac36cb35` · `SAVE_V1_CONTENT` `8e09fe4f0fa162a3`
  · 1,095 tests / 58 files. **I5 reads 78–83% and its budget is unsourced** — G-018
  re-derives it; quote the ratio, not the percentage, until it does.
- **Order**: **G-018** (derive I5) → **G-017** (viewer) → G-014 → G-015 → G-019 → M2 exit.
- **Obligations owed by future goals**: G-013's **WATCH is undischarged** and is G-017's
  first subject. G-018 must strike `bench.mjs`'s stale `45% <- what ships`. G-014 runs the
  §5.5 seam question first. G-015 owes summary v2 and a conservation law that is **not** an
  identity over its own inputs. G-019 is last-in-milestone: second critic, and M2's
  "visibly". **M4 does not start** until scenario capital lands (ADR-0013 §5).
- **Open contradictions**: G-012's criterion pins a content property that any provider
  addition can flip — G-014 and G-015 both touch it. `--rooms N` contaminates every balance
  sweep to date. Sampling the guest-store scan recovers 18.4%, deliberately unpulled.
- **On trial**: §7.1's conversion guard has fired once, on prose, on its own author.

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
  All six gates green, I2 331604a67c725a7a, I5 35.1%. The refund-0 credit line is refused
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
    removed from settlement earlier in the same build. --loan 1 at 365 days cost 23,534ms,
    235% of budget. Worse than diagnosed: removing the ledger re-fold only halved it, and
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
  Verified by the orchestrator: all six gates green, I5 61-63%, I2 6c3e1baa8b87d2f6,
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
  78.4%, I2 `4b8db9b1ac36cb35`, `SAVE_V1_CONTENT` unmoved at `8e09fe4f0fa162a3`, fixture
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
Status: pending
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
Critique rounds used: 0/3

  THE HUMAN'S OWN WORDS: *"Ten seconds for 365 simulated days was invented at bootstrap
  with no basis, and it is now promoting goals."* G-016 exists solely because of it.

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
Status: pending
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
Status: pending
Milestone: M2
Owner pair: ai-engineer / **sim-critic**
Statement: The four outcome counters become a table by reason. `SUMMARY_SCHEMA_VERSION`
  bumps to 2 and the conservation law holds against it.
Exit criteria:
  - pnpm exec vitest run outcome  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  prints an outcome table with at least
    FOUR distinct reasons non-zero
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

## G-019 — Reviews, and a hotel that reviews differently from a bad one
Status: pending
Milestone: M2 — **LAST GOAL IN THE MILESTONE**
Owner pair: ai-engineer / **balance-critic** · second critic `ai-critic` (§7.1)
Statement: A departing guest leaves an integer review derived from its own recorded
  experience: which needs were met, how long it waited against its patience, and whether
  its stay was cut short. The review is recorded and reported; nothing reads it.
Exit criteria:
  - pnpm exec vitest run review  (all green)
  - pnpm sim:run --days 30 --seed 7 --rooms 6  prints a review distribution with at least
    THREE distinct scores non-zero
  - --rooms 1 and --rooms 12 produce review distributions whose means differ by more
    than <n>, COMPUTED BY THE TEST rather than asserted — a hotel that serves nobody
    must not review the same as one that serves everybody
  - no sim module reads the review store — the boundary made mechanical, not documented
  - a WATCH entry in `JOURNAL.md` from a recorded run in which a human saw a guest
    succeed and a guest fail
  - all §2 invariant gates green (pnpm verify)
Out of scope: the outcome table (G-015); reputation as a stateful aggregate; reviews
  feeding demand, pricing or arrival rate (ALL M4); review text (M5/M6)
Critique rounds used: 0/3

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
  I5 61-63% raw. Signed off WITH its criterion mismatch recorded, not re-scoped.

  G-012 is `blocked` on this goal. Its work is complete, correct and critiqued; I5 is
  red. §2 is explicit that no goal is done while any gate is red, so G-012 does not
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
  green", which is "under 100%". The pre-G-016 build was already green at 68% raw, so
  criterion 1 was satisfied before a line was written, and criterion 4 restates it. The
  goal STATEMENT was likewise already true at BUILD start. **The real subject was
  HEADROOM, and no criterion names a headroom number.** Third criterion in the project
  with this class (`pnpm test -- world` G-001, "zero guests served by an invalid room"
  G-009). Criteria 2 and 3 are honest and were verified independently.
  The point of recording it rather than rewriting it: the next goal inherits a NUMBER
  rather than a green tick.

  MEASURED OUTCOME (sim-critic, paired and interleaved, all arms hash-identical):
  HEAD 2,939ms · pre-G-016 6,812ms (2.32x) · **G-016 6,081ms (2.07x)** · real cut
  **10.7%** · I5 raw **61.5%**, normalised onto G-011's baseline **74%**.
  Per lever: L1 `depart` hoist 7.8% · L2 lazy message -0.4% · L3a lockstep 1.6% ·
  L3b and L3c dropped for paying under 2%.

  THE COSTED LEVER, PINNED SO THE NEXT RED GATE PULLS IT INSTEAD OF REDISCOVERING IT:

  | option | 365-day bench | recovers |
  |---|---|---|
  | as shipped | 6,154ms (61.5%) | — |
  | gate the scan on guests/entities identity | 6,071ms | **1.3%** |
  | sample the scan every 8th tick | 5,024ms | **18.4%** |
  | no-op the scan body (ceiling) | 4,971ms | 19.2% |

  **GATING IS DEAD, AND IT IS NOW MEASURED RATHER THAN ARGUED.** Over 525,600 bench
  ticks the guest store is reference-unchanged on **exactly one**. G-010's builder said
  change detection buys nothing here; that is now a number. **Take it off the table
  permanently — do not re-argue it at G-013.**

  SAMPLING IS LEFT UNPULLED, DELIBERATELY. It recovers 18.4% of the available 19.2%, so
  this is a real 19%-against-coverage trade with no third option — "make it cheaper" is
  largely spent at ~20ns per need over 31.5M need-ticks. But I5 sits at 61.5% with 38%
  headroom and G-004's rule stands: optimising against a gate that is not failing is
  speculative work.
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

When G-012 to G-018 are `done`, that is a §5.4 escalation. Write it to `ESCALATIONS.md`
and stop.

**M2 exit additionally requires, per ADR-0013:**
- **WATCH observations in `JOURNAL.md` for G-013, G-014 and G-015** — what looked wrong,
  or that nothing did. M2's statement contains the word "visibly" and that is how it is
  discharged. G-017's own falsifiable claim is answered here too: at least one behaviour
  every test calls correct and a human calls wrong, **or an honest record that a month of
  hotel was watched and nothing looked wrong**, which retires the concern.
- **A sourced I5 budget** (G-018), so the milestone hands M3 a number rather than a
  superstition.
- **Every critique in M2 closed DRY**, not FIXED (§7.1).

**M3 AND M4 GATING, recorded here so it is not rediscovered at the milestone boundary:**
M4 does not start until the scenario-capital mechanism lands (ADR-0013 §5). `--rooms N`
seeds stock that is cash at the refund rate — `--rooms 3` carries 375,000p against a
500,000p starting constant — and every balance sweep and every bench in this project used
that flag, so `balance-critic`'s whole accumulated evidence base was taken in a world with
**75% more effective opening capital than the shipped figure**. Harmless until M4 tunes
demand curves and pricing against exactly those sweeps.
