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
