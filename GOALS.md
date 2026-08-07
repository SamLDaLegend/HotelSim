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
Status: pending
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
Critique rounds used: 0/3

  KNOWN OBLIGATION (ADR-0006): this goal adds fields to `World`, which will be rejected
  by the permanent v1 save fixture committed in G-003. That is deliberate. The correct
  response is to bump SAVE_SCHEMA_VERSION to 2 and write a real 1 -> 2 migration — not to
  regenerate the fixture, which would destroy the only thing it is for. Budget for it in
  PLAN. G-003's synthetic-chain tests already prove the runner handles gaps, duplicates,
  out-of-order steps and mid-chain throws, so the migration inherits a tested mechanism.

## G-005 — Append-only ledger and nightly settlement
Status: pending
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
Critique rounds used: 0/3

## G-006 — Day cycle and headless reporting
Status: pending
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
Critique rounds used: 0/3

---

## M0 exit — human sign-off required

When G-001 to G-006 are all `done`, that is a §5.4 escalation: a milestone's exit
criteria are met and need human sign-off. Write it to `ESCALATIONS.md` and stop. Do
not start M1, and do not let anyone open `apps/game`.
