# JOURNAL

Two or three lines per goal, appended at REFLECT (`HOTELSIM.md` §5): what changed,
what the critic caught, what got parked, and whether any invariant nearly broke.

This is the memory that survives context compaction. Write it for someone who was not
there.

Newest last.

---

## 2026-08-07 — Bootstrap (`HOTELSIM.md` §10)

Scaffolded the pnpm workspace, wrote the six invariant gates before any game code, and
wired them into `pnpm verify` and a three-OS CI matrix. All six pass against a
deliberately empty sim: a tick counter, a seeded PRNG, a canonical-JSON state hash, a
versioned save with a migration registry, and an append-only ledger primitive. Eight
agent definitions written; critics have no write tools.

Nearly broke I2 before it existed: the first cut of the determinism gate would have
passed on a constant hash, because an empty world has no seed-dependent state to
diverge. Fixed by putting the PRNG state inside `World` — so the RNG is hashed, saved
and replayed like anything else — and by adding a sensitivity check that fails if two
different seeds produce the same hash. Same reasoning drove the "different tick ⇒
different hash" test. A gate that cannot fail is not a gate, which is also why the
bootstrap ends by deliberately breaking each gate and watching it go red.

Parked: linting, coverage thresholds, git hooks, `--json` output for the balance
critic's long runs, a scaling bench for tick cost vs agent count, and a stored v1 save
fixture for the first real migration. Recorded four decisions: content is injected not
imported (ADR-0001), money is integer pennies (ADR-0002), snake_case literals are
content IDs (ADR-0003), and the orchestrator wrote the bootstrap because §10 orders the
gates before the agents that would otherwise write them (ADR-0004).

---

## 2026-08-07 — G-001 — Tick scheduler and world entity model (2/3 rounds)

`EntityStore = { nextId, list }` with monotonic never-reused ids and `list` strictly
ascending **by construction**, so no sort exists anywhere and there is no comparator to
get wrong. No `Set` or `Map` in hashed state. Three tick phases, `applyCommands` →
`commitEntities` → `advanceTime`. `assertEntityStoreInvariants` runs at both commit time
and load time, so a store the simulation could not have produced cannot be loaded into
it. Idle ticks stay O(1): a clean commit returns the same store object by reference.

The critic earned its keep twice. **Round 1:** it proved `TICK_PHASES` was decorative by
moving `advanceTime` to the front and getting a byte-identical hash over 200 ticks — the
goal's headline claim, "named phases with a documented order", was unfalsifiable, and
neither the phase test nor the I2 gate could see it. That finding landed on my PLAN
ruling, not on the builder: I had overruled the builder's own doubt and argued a constant
plus a test cannot rot. It rots identically. Fixed by making `stepTick` fold over
`TICK_PHASES` (ADR-0005), plus phase preconditions so a wrong order throws rather than
merely failing one test.

**Round 2:** the builder volunteered that the uniform phase signature had put the raw
command log in scope for every phase, downgrading a structural guarantee to a comment —
and asked for it to be weighed rather than burying it. The critic said fix, and supplied
the fact that decided it: `state.commands` had exactly one read site, so blanking was
free. This mattered because `runSystems` is already parked into the slot between phases
1 and 2; a system peeking at the log would double-apply staged intent, and that is a
replay divergence that **hashes perfectly on the machine that produced it** — the one
shape of I2 violation the gate cannot catch.

Nearly broke nothing, but two gates were weaker than they looked. The determinism harness
originally ran only noops, so the 100k-tick I2 proof would not have touched the entity
store at all; the builder fixed that unprompted and the critic independently replayed the
log to confirm 75 live entities and `nextId` 101 at tick 100,000. And `sim:run` passes no
schedule, so I5's 365-day bench still simulates zero entities and says nothing about tick
cost under load — parked as a G-006 dependency rather than papered over.

One exit criterion turned out not to be a command. `pnpm test -- world` filters in
PowerShell but silently discards the filter in Git Bash, where `pnpm test -- zzznotafile`
runs the whole suite **green**. The builder and I contradicted each other twice on this
and both of us were right; the critic reconciled it. Amended to `pnpm exec vitest run
world`, which means one thing in both shells. Lesson for future goals: an exit criterion
that passes on a filter matching nothing is not a measurement.

Parked nine items out of PLAN, none built. Rounds used 2 of 3; no BLOCKER at any point.
