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

---

## 2026-08-07 — G-002 — Content pipeline and one room type (1/3 rounds)

One room type as JSON, a Zod schema in `packages/content`, loaded and validated by the
host and injected. `packages/sim` still has zero runtime dependencies and no import of
`@hotelsim/content` of any kind — not even type-only, so there is nothing for a later
refactor to promote into a value import.

The design question that mattered was where injected content lives. Data rides in
`TickState`; only a **fingerprint** lands in `World.contentHash`, computed by the sim from
the injected data rather than supplied by the host — because a host-supplied version
number can lie, and the promise a designer forgets is exactly the silent-divergence class
I2 exists to catch. `beginTick` compares it every tick, so a save reloaded after someone
edits a price **refuses to tick** with a legible error instead of diverging at tick
40,000. Verified: one penny moves the fingerprint `ac496e19b27da075` → `ebc34728f1f77984`
and the day-1 hash `1396cf4968cf7095` → `5d37178b1f347bcf`.

The accepted price, chosen not overlooked: editing content invalidates old saves. Correct
at M0, where a content edit genuinely is a different simulation. It will not survive M6,
and the escape route is parked.

The critic's MAJOR: `bindContent`'s freeze was **shallow**. The wrapper, the content object
and the array were frozen; the room-type records were not, and `[...roomTypes]` copies the
array rather than the entries, so they stayed the caller's objects. A single property write
made the sim read a new price while the fingerprint stayed stale — the exact silent
divergence `contentHash` was added to prevent. It also broke the binary search's sorted
precondition when an `id` was mutated. What made it MAJOR is that **it defeated the guard
the builder had already added**: `stepTick` rejects a phase that *replaces* `state.content`,
but the cheaper mistake — mutating a field in place — passed both the identity check and
the fingerprint check. The deliberate act was closed, the careless one open. Fixed by
cloning then freezing each record, deliberately not freezing in place: reaching back into
the host's objects is a side effect of the same family as mutating them.

Nearly broke nothing else, but two things are worth carrying forward. The builder found a
real hole in `check:content` — a wrapper-object content file makes the snake_case id check
silently pass over nothing — and correctly routed it to me under ADR-0004 rather than
fixing it inside a feature diff. And `git diff` cannot verify any untracked file, which is
most of this diff; the builder's temporary swap of the data file was confirmed by
consequence instead, because an imperfect restore would not have reproduced
`ac496e19b27da075`.

I5 moved 5.7% → 8.8% of budget. It is startup, not tick cost: importing Zod and loading
content costs ~250ms once, against ~160ms of actual simulation for 365 days. Not a finding,
but the bench now measures a fixed startup cost that will only grow.

Parked eight items, two of them gate defects for the orchestrator. Rounds used 1 of 3.

---

## 2026-08-07 — Gate repair (not a goal) — `check:content` was inspecting nothing

Both defects `sim-engineer` found during G-002, fixed by the orchestrator in their own
commit `8f1b7ff` so a gate repair never sits inside a feature diff — §9 treats a gate
modified to make a test pass as a stop condition, and the way to keep that check
meaningful is to keep gate changes out of builder hands and visibly separate.

The first was worse than it looked. `Array.isArray(parsed) ? parsed : Object.values(parsed)`
meant a wrapper-object content file inspected **zero** ids and reported `ok`. Measured
against the old logic: 0 ids for `{"roomTypes":[...]}`, 0 for anything nested two deep.
I3 has been green since bootstrap partly because it was barely looking. The document is
now walked at any depth, and a content file yielding no ids at all is a violation — a
gate that inspects nothing is worse than no gate, because it reports success.

The second was the snake_case pattern living in both the gate and the Zod schema, which
cannot share a module import. Single-sourced into `tools/gates/lib/content-id.mjs`, with
a test that imports **both live values** and asserts they agree on 16 hand-picked and 729
generated ids. Not a test against a copied literal — that distinction is ADR-0005's whole
subject.

Lesson worth carrying: the bootstrap proved each gate *bites* on the failure it was
written for, and that is not the same as proving it *looks at everything it claims to*.
A gate can be simultaneously correct on its test case and blind in production.

---

## 2026-08-07 — G-003 — Save and load the real world model (1/3 rounds)

The first goal to come back from critique with **no BLOCKER and no MAJOR**. It also
found the worst defect so far, and it was mine.

`deserialise`'s migration runner used `migration.from >= current`. Given `[1 -> 2,
3 -> 4]` and a v1 save, the v3 -> v4 step ran against v2 data and the result was returned
as a valid world. `assertMigrationPathComplete` — the only check that could catch a
gapped chain — was **never called by `deserialise`**. The builder's name for it is the
one to keep: the gate for the failure and the code that would fail were wired to
different circuits. Verified before approving, fixed both halves, and the line's history
is now a comment rather than a silent correction.

That made three instances of one defect in three goals, in code from three different
hands, so it became **ADR-0007**: a check that can succeed while inspecting nothing is
not a check. The critique then improved the ADR — `sim-critic` proved the builder's
self-flagged terminal branch unreachable across 47,988 chain/span combinations and then
argued *against* calling it a finding. **Vacuous** (succeeds while inspecting nothing and
is relied on as evidence) is the defect; **unreachable** (cannot fail given the checks
above, establishing a fact they already establish) is what a correct postcondition looks
like. As first written the ADR would have had a builder delete a real backstop for a
coverage argument, which §9 names as an anti-pattern.

The anti-vacuity device is the best thing in the diff: `assertMigrationPathComplete` now
asserts `migrations.length === currentVersion - minVersion`, so the shipped v1 -> v1 case
is "0 required, 0 present" — a checked fact rather than an unvisited loop — and it is
paired with a test running the same empty chain over a wider span and watching it throw.
Verified it fires in both directions.

The other structural win: `WORLD_KEYS` now derives from `Readonly<Record<keyof World,
true>>`, so `keyof World` is written once and a forgotten field is a typecheck failure
rather than a missed test. The unknown-key sweep uses `.includes` rather than `in`,
which closes a real `__proto__` hole — `JSON.parse` makes it an own key.

And the committed v1 fixture is now permanent (ADR-0006). The reader had only ever been
tested as the inverse of the writer in the same build, so a coordinated rename would have
kept the suite green while breaking every save on disk. The critic dry-ran the ADR's
prediction and found the chain closed at every link, so G-004's migration obligation is
demonstrated, not assumed.

Parked five items. I5's drift turned out to be machine noise — 0.299 µs/tick against
0.305 at G-002, measured under control rather than read off the bench.
