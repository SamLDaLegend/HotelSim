# JOURNAL

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-08, HEAD `aa30218`. 13 goals done, M0 and M1 signed off, M2 a third built.*

- **State**: save v6 · summary v1 · 1,000 tests / 51 files · all six gates green ·
  I2 `6c3e1baa8b87d2f6` · `SAVE_V1_CONTENT` `8e09fe4f0fa162a3` · I5 61–63% of a budget
  that is about to be re-derived (G-018), so quote the ratio and not the percentage.
- **The recurring defect this project actually produces**: checks that succeed while
  inspecting nothing. Seven instances now — decorative `TICK_PHASES`, `check:content`
  inspecting zero ids, `deserialise` never calling its own gap detector, the guest-loop
  RAN flag, the never-executed violations path, G-010's unwitnessed release counter,
  G-012's counter tested at one of four sites. Plus five *exit criteria* of the same shape.
- **The measurement lesson (G-016)**: the ratio survived and every absolute did not. Same
  build, 3,087ms and 1,740ms hours apart. Measure paired and interleaved in one sitting;
  withdraw what cannot be re-measured rather than restating it.
- **Newest turn**: the human ruled (ADR-0013) that the charter had been asking agents to
  verify things nobody can observe. A replay viewer, a WATCH step, DRY/FIXED closes.
- **Open obligation**: G-013's WATCH is owed retroactively at G-017. No WATCH entry
  exists yet in this file — the first one is the point of the whole ruling.

---

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

---

## 2026-08-07 — G-004 — One guest, one need (1/3 rounds)

First goal for the `ai-engineer` / `ai-critic` pair, and the first where the guest loop
actually runs: 30 days, seed 7, 360 arrivals, 267 satisfied, 89 turned away, 0 stuck,
0 orphaned reservations, balance exactly 267 x 8500p.

Two design choices carried the goal, both the builder's. **A guest is not an `Entity`** —
reasoned from `Entity.kind` being a validated content id, to the only content that could
name a guest being an archetype, to archetypes being M6. So guests got their own store
and the question dissolved: a guest is distinguished by nothing but its id and its stay.
And **the reservation is a field of the guest and nothing else**, which closes §6.1's
leak class *by construction* — a despawned guest cannot hold anything because it does not
exist. The critic tried to break it (despawn mid-stay, spawn-and-despawn in one tick,
save/load with three guests in mixed states) and could not. Its verdict on thrashing was
"unexpressible, not merely unlikely", which is the stronger property.

The smallest decision mattered most: making the new content fields **optional so that
absent is not the same as empty**. That kept `SAVE_V1_CONTENT` fingerprinting to its
original value, which kept the v1 fixture a world that still *ticks* rather than a husk
that only exercises the reader.

**ADR-0006 fired for real and worked.** The permanent fixture rejected the new world,
forcing a genuine `1 -> 2` migration; the fixture has a zero-line diff and the migration
is what carries it. The migration's defaults were argued rather than chosen: a v1 world
is not a world whose guests were omitted, it is a world in which no guest ever existed,
so the migration asserts nothing about them. G-003's `WORLD_KEYS` mapped type also paid
for itself — `save.test.ts` was not edited and gained four tests on its own.

The critic's MAJOR: the phase-guard property from G-001 had **regressed**. Adding
`runGuests` took the survivor set from one sequence to three — the guest loop could be
dropped on any quiet tick, or run twice, undetected. Worse, the code comment cited the
arrival check as "the only thing that notices", and on a no-arrival tick that check
inspects nothing. ADR-0007 in the wild, named in the code as the source of the guarantee.
Fixed with a tick-local `guestsRun` flag, and the critic's distinction is the part worth
keeping: **one boolean per system phase, never a `ranPhases` list**, because a list
reintroduces the order written down twice, which is the exact thing ADR-0005 prevents.
G-005 puts settlement in this same slot and now inherits the pattern instead of the gap.

Two lessons about measurement. The builder reported I5 at 16%; the critic measured 10.5%
and I measured 11.4% — the first figure was noise, and the builder said so plainly when
told. And my own first survivor search reported two survivors and a regression; my
predicate had omitted the new flag. **The probe was wrong, not the code.** Worth
remembering that a verification tool needs verifying too, especially one written to check
somebody else's work.

The second MAJOR was mine, not the builder's: I5 breaks between 50 and 75 rooms, and the
parked index targeted M2/M3 when **M1** is the milestone that hands room count to the
player. Threshold and measurements now recorded in `PARKING.md` so M1 meets it as a known
cost. Deliberately not optimised here — I5 is green and stays green through M0, and
optimising against a gate that is not failing is speculative work.

---

## 2026-08-07 — G-005 — Append-only ledger and nightly settlement (1/3 rounds)

First goal for economy-engineer / balance-critic, and the first to come back with **no
findings at any severity**. Money in and money out both run: seed 3, 30 days, revenue
2,269,500p, upkeep −225,000p, balance 2,044,500p — every number matching its closed form
to the penny, checked by hand at VERIFY.

The design decisions that held: payment stays at departure (the goal names two events on
purpose — revenue is guest-driven, upkeep is clock-driven; per-night charging is pricing,
which is M4, and the `payForStay` seam survives for exactly that replacement). Settlement
is **a law, not an event** — one transaction per night, unconditionally, so an empty
hotel books amount 0 and `countSettlementTransactions === dayOf(world)` is exact with no
exceptions to hide in. `Transaction.reason` became a closed union enforced at the single
append choke point, but the load path only tightened to "non-empty string": the permanent
v1 fixture carries free-text reasons, and migrating history to satisfy a type would
invent semantics and break a pinned hash for nothing. The union governs what the sim
writes, not what history contains.

The G-004 phase-guard pattern scaled correctly to a second system: `runSettlement` has
its own `settlementRun` boolean, and the exhaustive search — kept fully exhaustive at
19,530 sequences, 579ms — still leaves exactly one survivor. The revenue-before-upkeep
ordering on a shared tick is structural, not documented: `runSettlement` throws unless
`guestsRun` is true.

The honest headline from the critique: **balance-critic declared its own standing mandate
vacuous.** Twelve seeds produce byte-identical economies, because the guest loop draws no
randomness until M4's demand model — so a seed sweep is one anecdote reported twelve
times, and it said so rather than dressing twelve identical rows up as a distribution.
What the sweep did establish, once: the RNG stream stays out of the money path, arithmetic
is exact at 1000-day scale (no division exists in the money path, so there is no drift to
accumulate), and overflow headroom is ~3.2x10^8 simulated years. It also *tested* the one
exploit reachable at M0 — demolish rooms before midnight to dodge upkeep — and found it
unprofitable by 1,774,500p over 100 days, which is the difference between reasoning about
an exploit and pricing it.

The append-copy cost was measured (19ms at I5 scale, 3.1s at 2x M4 density, wall at 10x)
and deliberately kept, with the restructure trigger (~15k appends/run) parked to M4 —
changing the hashed ledger shape now would owe a migration for a problem M0 does not have.

Parked four items. One goal left in M0.

---

## 2026-08-07 — G-006 — Day cycle and headless reporting (1/3 rounds)

The last M0 goal, and deliberately a restructuring goal: the sim already counted
everything, but `cli.ts` computed report lines, invariant checks and quiet mode from
three separate reaches into the world. Now one `buildSummary` computes every number once
— violations included — and three renderers take only the summary, so recomputation is
impossible rather than avoided. `--json` (schema 1, integer pennies, seed grouped under
`input` as an echo not an outcome), `--rooms`/`--arrivals`/`--content`, a golden pinned
against hand-derived closed forms, and the seed caveat written as an assertion that goes
red at M4 by design.

The critique's two MAJORs were both edges the suite structurally could not see. First:
the documented invocation `pnpm sim:run --json` produced INVALID JSON, because pnpm
writes its banner to stdout — and every automated consumer spawns node directly, so the
contract was proven for a path the docs never show and unproven for the one they do.
Fixed with `--silent` in the docs plus a test that spawns through pnpm itself. Second:
the violations output path had never executed — G-004 closed stuck and orphans by
construction, the typed reasons closed the partition, unconditional settlement closed
the cadence, so no real run can violate anything and the failure clause of the consumer
contract was code that had never run. Fixed with forged-world tests and an
injected-write hook proving report-then-throw. Both are the ADR-0007 wiring shape, found
in the goal whose whole subject was wiring numbers to outputs.

The critic also decomposed the I5 number for sign-off: of the bench's ~12.5%, ~585ms is
fixed process startup (node, tsx, zod, content load) and ~640ms is 365 days of actual
simulation — 1.2 µs/tick. The headline is roughly half a constant that does not scale
with --days.

A verification note for the record: PowerShell pipelines re-encode piped output and add
a BOM, which makes `pnpm --silent ... --json | ...` LOOK broken when the bytes are
clean. The builder hit it, named it, and left the warning in the test comment; my VERIFY
used direct byte comparison and Git Bash accordingly.

M0's six goals are done. All six invariant gates green, 361 tests across 18 files, the
guest loop and money loop both running end to end, headless, deterministic, saved and
reloaded. Escalating for milestone sign-off per §5.4.

---

## 2026-08-07 — M0 SIGNED OFF, M1 opened

The human asked the right question at sign-off: *is there anything playable?* No — and
not only because there is no renderer. There is **no player agency at all**, because
build and demolish are M1 and pricing is M4. §8's "playable-but-boring" is not
achievable as M0 is scoped; the boring half shipped and the playable half is M1.

Worth recording for whoever reads this later: the build loop was already visible in M0's
numbers before any player could touch it. A capacity sweep at 30 days / seed 42 —
1, 2, 3, 6, 12 rooms — shows satisfied guests scaling linearly to saturation near 6
rooms, and 12 rooms serving the *same* 356 guests for 450,000p less profit, matching the
six idle rooms' upkeep (6 x 2500p x 30 nights) to the penny. There is a real optimum in
the economy around 4-6 rooms, discoverable, with no player able to discover it yet. That
is the strongest single piece of evidence that the money and build loops are real rather
than decorative, and it cost nothing to produce — the flags G-006 added were enough.

The offer to build a minimal interactive harness before M1 was made and declined, on the
grounds that it would be new scope smuggled into a signed-off milestone and would
duplicate what M1's build commands do properly. Agreed and recorded.

M1 seeded with four thin goals: G-007 grid, G-008 build/demolish with construction cost,
G-009 validity rules, G-010 the bench measuring a real hotel. That last one is the parked
I5 debt deliberately scheduled inside the milestone that causes it — M1 hands room count
to the player, and I5 was measured failing between 50 and 75 rooms while the gate stayed
green on a three-room bench. A gate that is green because it measures a toy is the same
family as everything ADR-0007 catalogues.

G-007 also inherits the first **multi-step** migration: the permanent v1 fixture will
have to walk 1 -> 2 -> 3. The chain walk has been tested against synthetic gaps since
G-003 and discharged once at G-004; this is where it does real work.

---

## 2026-08-07 — G-007 — Multi-floor grid and coordinates (1/3 rounds)

**A cell is a coordinate, not a container.** `World.grid` is four integers of bounds;
`Entity.at` is the sole authority for position; a cell's contents are derived. No
cell -> entity back-pointer exists, so the two directions cannot drift and a demolished
room cannot leave a ghost — the same call I4 makes about the balance and G-004 makes
about reservations, now made a third time. The critic attacked the claim directly and
found no second record anywhere in the diff.

The multi-step migration worked, and the best evidence was a deletion: removing the
2 -> 3 step fails **first** at G-003's step-count assertion — *"1 step(s) but v1 -> v3
requires exactly 2"* — before any data is touched. That anti-vacuity device was written
against an empty migration list where it could only assert "0 required, 0 present"; this
is the first time it had a real number, and it caught the real failure first. Both links
are pinned independently, so G-004's `f250ba1dc0a8c3e1` survived the chain growing past
it rather than being retired.

The migration question — what to do with three positionless rooms — got the right answer
with a **stronger** argument than the G-004 precedent it cites. They become unplaced; no
position is invented. G-004's case was that inventing a counter invents history; here an
invented position is **not inert**, because G-008 refuses builds on occupied cells and
G-009 computes enclosure from placements. Inventing history the simulation then acts on.
The distinction that makes it coherent: **bounds may be defaulted because they are a
property of the space; positions may not because they are history.**

My one ruling changed the plan: the migration must hard-code its own era's bounds rather
than call `createGridBounds()`, or the same v2 bytes yield different v3 worlds after
anyone edits the plot. The critic then found that the test *named* for that guarantee
could not verify it — the values coincide today, so it passed under either
implementation. I reproduced the argument by performing the actual deduplication
refactor: **411 tests stayed green and only the new source scan went red.** The fix is a
scan rather than an assertion because no value assertion can separate implementations
that agree; and because the scan runs inside `pnpm test`, `pnpm verify` catches it, so
the guard is on the gate path.

That produced **ADR-0008 — things that describe the past must not track the present**,
which unifies three cases: a migration must not read live constants, a historical schema
oracle is a literal not a mapped type, and where values coincide the guard must be
structural. It is not an exception to ADR-0005; it is that rule's precondition.

Two measurement notes. The builder measured the hash cost of its own design, found a
dense cell array is **cheaper** until ~130 entities — the opposite of what it expected —
and reported it rather than letting a convenient number carry the argument. And it
refused to claim an I5 speedup its own before/after suggested, attributing it to machine
warm-up; the critic's controlled number was 1.218 µs/tick, the G-006 figure to three
decimal places. Both are the discipline propagating from earlier goals where it was
absent.

Fourth builder to report a gate defect rather than touch one: `check-purity.mjs` exempted
test files from the Node-builtin ban, but the external-package catch-all rejected them
anyway — so the exemption was dead code and the diagnostic called a builtin an "external
package". Fixed in its own commit `c6e136d`. The behaviour was right and the code was
lying about it, so the fix deletes the dead exemption rather than making it work: a sim
test that needs the filesystem belongs in `tools/headless`, which is exactly where this
goal's source-scan ended up after hitting the same wall.

Four builders, four gate defects, four reports rather than edits. The ADR-0004 boundary
is doing real work: keeping gates out of builder hands is what makes "an invariant gate
has been modified to make a test pass" (§9) a check worth having, and it has cost
nothing — every one of the four was found and fixed anyway, just in a commit where it
could be seen.

---

## 2026-08-07 — G-008 — Build and demolish with construction cost (3/3 rounds)

The game is playable. A player command places a room and charges for it; another removes
it; illegal placements are refused deterministically. **One rule, two doors, and the door
decides who is at fault**: G-007's structural primitives throw (a caller ignoring the plot
it holds is a bug), the player commands record a refusal (a player clicking a full cell is
a move). `spawnEntity` gained the occupied-cell throw so there is one definition of a
legal world rather than a laxer one every test reaches.

The design decision I most want kept: **no conservation law was invented.** `built −
demolished` is not the population of anything, since the store also changes through
`spawnEntity` and through migration — and rather than write a plausible identity that
would hold for the wrong reason, the builder said so and supplied two laws that can fail.
Both were seen red under mutation while 408 other tests stayed green, which is what makes
them the *only* witnesses rather than merely present ones.

**The builder contradicted its own plan by measuring.** It had claimed — and I approved on
that basis — that a tick with no build command pays nothing. A git-stashed paired
measurement found a **34% regression, 1.306 → 1.752 µs/tick**, arriving in the goal
immediately before G-010 measures scaling, where it would have poisoned the very number
G-010 exists to produce. Fixed, re-measured, and the improvement *not* claimed because it
was inside noise. Third goal running where a builder declined a flattering number.

**Round 1** caught a diagnostic that lied. The CLI's build schedule reached 420 of the
plot's 1,840 cells and advanced its index on refused commands, so past 417 commands every
refusal was blamed on geometry when the constraint was cash. What made it MAJOR rather
than cosmetic: `balance-critic` reviews next, its mandate is parameter sweeps, and it
would have concluded the build loop was plot-limited when it was cash-limited — a wrong
conclusion handed to the next review by the tool that review is required to use.

**Round 2 was the best critique of the project**, and the first non-vacuous sweep: five
MAJORs, two MINORs, and a **107-million-penny spread** across build strategies where the
previous two sweeps had produced twelve identical rows. Two findings were G-008's and were
fixed. The sharper one: `nightlyUpkeepPence` and `constructionCostPence` were both
optional, so a room type omitting them was **free to build and free to keep — strictly
dominant on every axis, one forgotten JSON key away, with `check:content` and `pnpm
verify` both green.** 1,680 rooms built from a balance of zero. That is the
dominant-strategy failure in its literal form, and G-008 opened it by adding construction
cost as optional. Now required on disk, still optional in the sim's own type, so the
frozen fixture — which never passes through zod — is untouched.

Three findings were real and **not G-008's**, and saying so is the job as much as fixing
is. ADR-0009: the refusal predicate tests affordability, not wisdom, because refusing a
build the player can *afford* would be the simulation playing the game for them —
overbuilding is meant to be possible and meant to hurt; the missing piece is a
consequence, which is M4's. ADR-0010: `nightlyRatePence` is charged per completed *stay*,
not per night, so a room bills three times a night and the margin is 10.2:1 rather than
the 3.4:1 the field names imply — documented rather than renamed, because renaming would
change `SAVE_V1_CONTENT`'s shape and turn the permanent fixture into a husk, undoing
G-004's best decision for a field name.

The balance signal worth carrying to M4: **a slower build cadence is worse.** Cash accrues
between attempts so more attempts pass the affordability test, and the hotel overshoots
further. `--build 10080` ends 36M behind `--build 120`, falling −23,000p/day with no
floor. Nobody would guess that; it should be tested against, not rediscovered.

And a fifth gate defect reported rather than touched — this time in config, not a gate:
vitest's default 5,000ms timeout against subprocess-spawning tests measured at 4,844ms
under load, so `pnpm verify` could go red at I4 for reasons unrelated to the code. Fixed
separately in `f2d1e4d`. The reasoning matters more than the fix: §9's stop condition is
only worth having while a red gate means something, and **a gate that cries wolf under
load does the same damage as one that never fires.**

---

## 2026-08-08 — G-009 — Room validity rules (1/3 rounds)

A room is valid when it is placed, supported, doored and furnished; an invalid room is
not a provider; the reason is legible. **Enclosure is support**, derived from what
already exists rather than from an invented wall entity: *the only piece of a room's
shell that another entity must provide is the floor beneath it.* Validity is derived,
never stored, argued on **non-locality** — a stored flag would need invalidating on
every build, demolish, spawn, despawn and migration, and a missed invalidation gives a
world whose flag and geometry disagree **while hashing perfectly**. Fifth goal to close
that drift class by construction.

**The hotel could float, and that was my miss.** The rule I approved at PLAN asked only
whether *a room* stood in the cell below — never whether that room was itself supported.
One sacrificial invalid room therefore bought an arbitrarily tall tower of **valid**
providers in mid-air, serving guests. `sim-critic` reproduced it from the CLI with no
forging: 95 rooms reported ok, **55 of which never reached the earth**, and a wholly
floating six-storey block printed as "1 unsupported, 5 ok" — failing the provider clause
and the legibility clause at once. Fixed as transitive support in one ascending-floor
pass over an index already sorted by `compareCells`, so every dependency is resolved when
reached: O(n log n), no recursion, in a goal already at 26% of the I5 budget.

**The fix exposed a better finding than the fix.** After making support transitive, the
I2 hash **did not move** — every room in the determinism log either stood on the earth or
had nothing directly below, so the local and transitive rules agreed everywhere. *The
gate had been blind to the defect and was equally blind to its correction.* The builder
added a tower to the harness — and found that placing it late still changed nothing,
because guests take the lowest-id valid free room and the harness is almost never short
of one, so a high-id tower is never reached. Spawning it at tick 47 fixed that, and the
whole thing was verified by mutation rather than assumed: reverting to the local rule now
moves the hash `1b5fcd4cca759510` -> `5bf86be21f2d1ade`. ADR-0007 at the gate level.

**And a scaling number that could not see what it measured.** The builder left G-010 a
reading of 2.08x cost for 4x rooms, comfortably inside G-010's "under 6x" bound. It was
taken with `--arrivals` at default, so guest load — the dominant cost driver — was held
constant while rooms quadrupled and 96 of 100 rooms sat empty all year. Under a workload
where occupancy tracks room count it is **4.70x, superlinear at the top (50->100 alone is
2.97x), 78% of G-010's limit**, and `--rooms 100 --arrivals 5` takes **109s for 365 days,
10.9x the whole I5 budget**. G-010 would have started from a measurement taken where its
own criterion cannot bite. Corrected in `PARKING.md` with both readings and their
workloads — the record is mine, so the correction was too.

Two smaller catches worth keeping. `nightlyUpkeepOf` walked every entity and threw for
any non-room kind, so **the first bed would have killed the sim at midnight** — a trap
G-005 left that was invisible until a goal introduced a non-room entity. And three MINORs
were all comments claiming more than the code does, including one in the single file
whose stated purpose is that claims about the harness are checkable.

My own verification failed three times before succeeding, and the code was right on all
three: `spawnEntity` does not furnish (only `buildRoom` does), items share a room's cell
so they counted as rooms, and a legitimately grounded room sat at the tower's column. A
probe is a tool and a tool needs checking — the same lesson as G-004, where my survivor
search reported a regression that turned out to be my predicate omitting a field.

---

## 2026-08-08 — G-010 — The bench measures a real hotel (1/3 rounds). M1 COMPLETE.

The first goal in the project that was engineering rather than design, and the builder
**profiled before deciding**. The profile overturned two entries in this very file.

**The ledger was not the problem.** Its copy-per-append had crossed `PARKING.md`'s
~15k-append trigger at 22,245 and was predicted at ~16% of budget. Measured in the real
run: **0.7%**. The knee is real but arrives roughly an order of magnitude later — 13.1%
at 43,800 appends. Trigger corrected to ~40k. **Second parked measurement in two goals
taken where the thing it measured was not the thing that drives cost**, and a standalone
benchmark of one function is not a measurement of a system.

The actual cost was **validity at 58.9%** — the context rebuilt 525,600 times for a
building that changed twice. Caching it (derived, caller-owned, never on `World`) plus a
candidate-list scan and a release-counter short-circuit took 60 rooms x 120 days from
6.39s to 1.65s, and validity is now **absent from the profile entirely**.

**The acceptance bar was the builder's own and it is the right one for any optimisation:
a pure optimisation must not move the I2 hash.** It did not — `1b5fcd4cca759510` before
and after — and the hash moved only afterwards, deliberately, when the determinism log
was strengthened. `sim-critic` reproduced that separation independently by replaying the
*pre-G-010* log through the optimised sim and getting the old hash exactly.

**Then the critique found two MAJORs, and both were defects in the EVIDENCE rather than
the code — which is worse, because they were about to be recorded as proof.**

The first: `search.releases += 1` is the entire soundness argument for the short-circuit,
and **deleting it left all 508 tests green and the I2 gate green with an unchanged hash.**
The pin that claimed to cover it ordered the *resting* guest first in every case, so the
release always preceded any failed scan and the skip branch was never once taken. The bug
it would have missed is a guest standing in the lobby beside a room freed earlier in the
same tick — deterministic, so I2 structurally cannot see it, and §6.1's "correct but reads
as stupid" in literal form. Fixed with one case whose *list order* is its whole content;
verified by mutation that it is now the only case that catches the deletion.

The second was mine as much as the builder's. The code claimed the I2 gate witnesses the
cache-invalidation clauses; measured, it witnesses **one of five**. Clauses 1 and 2 move
the hash to a *different constant*, and **the gate has no reference hash** — it compares
runs to each other, so a consistently-changed hash passes every check it makes. The
builder had written exactly this into `PARKING.md` two files away in the same goal, and I
repeated the overclaim to the human without checking it. *Moving the hash is not the gate
witnessing it.*

**I almost skipped this critique.** The builder's self-critique had been unusually
good — it caught its own wrong ratio prediction, its own wrong occupancy arithmetic, and
a hole in its own harness — and I wrote "no critique round was needed" into `GOALS.md`
before reversing myself. A builder cannot witness its own unwitnessed test. That is the
single most useful thing this goal produced.

**And the goal's success broke its own exit criterion.** Tick cost is now O(guests), not
O(rooms): 20, 60 and 120 rooms all cost the same. So "the bench at 60 rooms" is met by its
letter while measuring roughly a 20-room hotel — the same defect corrected twice already,
reappearing in a gate. The builder found this by running a falsification test nobody asked
for, after noticing its own `--arrivals` derivation was arithmetically wrong. Recorded in
`bench.mjs` itself rather than hidden; the room-scaling property the bench cannot see is
measured by `vitest run scaling`, which ties arrivals to rooms so occupancy is constant.

M1 complete. Escalating for human sign-off, with one design call outstanding since G-008.

---

## 2026-08-08 — G-011 — The hotel can always recover (1/3 rounds)

The first goal built on a **human** decision (ADR-0011) rather than an adjudicated one.
The dead state is closed and measured at full length: from zero rooms and zero cash,
1,000 days ends with 23 valid rooms and 11,831 satisfied guests; with demolition churn
added, 1,000 built, 499 loans drawn and **zero** funds refusals across the entire run.
The negative control matters more than the result — `--loan 0` locks at 125,000p and no
rooms **on day 4** and stays there for 996 days. One flag, one difference.

**I wrote an exit criterion that could not pass on any implementation** — `--rooms 3
--demolish 1` issues no build command, so no room could ever be placed. Fourth occurrence
of that shape, written three inches below the G-009 block where I recorded sharpening the
third. The builder found it before writing a line. A criterion is a claim about a command,
and I did not run the command.

**And the goal destroyed its own defining reproduction.** `--rooms 3 --demolish 1` was the
three legal commands ADR-0011 named as reaching the dead state; seeded rooms are spawned
free but refunded at 50%, so it now ends at 875,000p. I rewrote the criterion for the
*first* reason and never noticed the second. `balance-critic` did. A dead state we can no
longer demonstrate is one we cannot prove we closed, so both reasons are now in the block
with the measured baselines standing in its place.

**The critique was the best in the project.** Three MAJORs:

*The dodge guard was one-sided.* I asked whether content could **dodge** and still load,
and approved a guard bounding the refund from above. Nobody asked the mirror question —
and the refund turns out to be the loan's only brake, since eligibility rests on
liquidation value. At a refund of 0, documented as a legal designer choice, `drawLoan`
became an unbounded credit line: **1,602 loans and 480,600,000p in five simulated days**
from one changed content field. The shipped table was safe by coincidence of one number.
The builder's fix is better than my suggested alternative and it said why: eligibility
resting on liquidation value is *correct* — that is what "stock" means in ADR-0011 — and
the defect was that a refund of zero made stock worthless while still calling it stock.
So the right layer was the definition of stock, not the eligibility rule.

*A quadratic fold, of exactly the class G-010 spent a goal removing* — and which this
goal's own I5 fix had removed from `runSettlement` earlier in the same build, reappearing
two files away. `--loan 1` at 365 days cost 235% of the I5 budget. It was worse than the
diagnosis: removing the redundant re-fold only halved it, and the residue was **G-008's
once-per-tick balance fold, accepted on "builds are rare by construction"** — an
assumption that was true until a command with no position and therefore nothing to run out
of. Fixed by memoising outside state, which is the one concession I4 names explicitly, and
verified against G-010's bar: memo off and memo on hash identically. The tests pin
agreement at *every prefix*, because an incremental memo can be right at the end and wrong
in the middle.

*And the containment argument for the money-minting was a comment, not a mechanism.* No
player path exists today so it holds, but it is not free: `--rooms 3` — the flag every
sweep and bench uses — silently carried 375,000p of hidden capital against the 500,000p
starting capital this goal exists to size.

**My ruling on that third one was wrong, and the builder measured it rather than forcing
it**, which is exactly what I asked for. Seeding `--rooms` through `buildRoom` needs
capital to cover it, but capital is one content constant while `--rooms` is per-invocation:
at 500,000p every N collapses to two rooms, which would undo G-010's entire goal at the
60-room bench. It shipped the honest half instead — the hidden capital is now printed as
`scrap value` beside `capital`, and it is exactly the term the loan's eligibility test
adds, so a refusal can be checked by hand.

`balance-critic` declared its seed mandate vacuous for the second time rather than
reporting ten identical rows as a distribution, and produced the spread that is real:
across 48 strategy configurations, **doing nothing beats six of the eight active build
cadences.** ADR-0009's anti-correlation, now with a positive floor under passivity that
did not exist before this goal.

---

## 2026-08-08 — G-012 + G-016 — The need vector, and the cost of carrying it

Committed together because G-012 was **blocked** on G-016: its work was complete and
critiqued, and I5 was red. §2 says no goal is done while a gate is red, and the builder
refused to report ready rather than shipping one. The rule working.

**The human ruled the vector** (ADR-0012: Comfort, Entertainment, Nourishment), which
settled what would otherwise have been a builder choosing how hard its own criteria are.
`night_rest` became the *lodging* need — why a guest books — and the three are
*engagement* needs met during the stay, so a guest keeps its room while it goes to eat.
Thirty days at six rooms: entertainment 213/143, nourishment 214/142, and `night_rest`
**cannot** carry the criterion at that size because 18 stays/day of capacity against 12
arrivals means it never fails. "Just add rooms" cannot satisfy it.

**G-012's builder refused a premise I put in its brief and checked instead.** I told it
renaming `night_rest` would move the permanent fixture's content fingerprint. The fixture
has **no `needTypes` key at all**. A constraint from the orchestrator is still a claim.

It also found that both the CLI and the 100,000-tick determinism log took `roomTypes[0]`
as *the* room the hotel is made of — the lowest id after sorting. `cafe` sorts before
`standard_room`, so the first amenity would silently have made both a hotel of cafés,
**with the gate still green**. Third time an assumption held "by construction" until a
feature arrived.

`ai-critic` then found the G-010 defect class recurring in the same file one goal later:
the builder had found the evicted-mid-meal bug itself, fixed it, and written a
mutation-verified test — for **one of four** release sites. Breaking the common exit left
971 tests green and moved the state hash on four workloads including the bench.

---

**G-016 is the most instructive goal in the project, because almost every number in it
was wrong the first time and the corrections came from the people who made them.**

The builder reported a 44% cut and told me no-opping the invariant scan was *slower* than
optimising it — which I called the strongest possible resolution and used to rule that no
gating decision was needed. **It retracted both.** Machine drift: the same build measured
3,087ms early and 1,740ms later. Re-measured paired, the real cut was **10.4%**, the scan
really does cost **~20%**, and G-010's "cheaper, not rarer" is **not** vindicated by
measurement. It corrected the code comments and `PARKING.md` so nobody could read the
vindication out of the source.

`sim-critic` verified the retraction — every corrected figure reproduced — and then found
**the retraction had stopped at the test files**, where three drift-window numbers
survived *as fact*, one of them directly contradicting a "that was WRONG" note in the same
diff. A half-applied retraction is worse than none, because the survivor carries the
authority of a correction made everywhere else. The builder's second pass drew the right
distinction: a number it could re-measure paired was **corrected**; a number it could not
was **withdrawn rather than restated**, with the change left standing on an argument that
needs no stopwatch.

Then it caught that **my own ledger** still carried drift-window absolutes and, worse, the
wrong *direction* of the drift. The lesson is now recorded where the numbers were: **the
ratio survived and every absolute did not.** Three independent measurements of G-012
against HEAD — 2.41x, 2.37x, 2.32x — agree within noise across hours in which absolutes
moved by nearly 2x.

**The gating question was settled with numbers rather than principle.** Gating is dead:
over 525,600 ticks the guest store is reference-unchanged on **exactly one**. Sampling
works — 18.4% of the available 19.2% — but I5 sits at 61% with 38% headroom, and G-004's
rule holds. It is pinned as a costed lever so the next red gate pulls it instead of
rediscovering it. And `sim-critic` corrected my reasoning about what sampling surrenders:
not merely a self-healing leak, but a **one-tick double-booking — two guests in one bed
for a minute**, player-visible, with this scan the only thing that would catch it. The
trade gets *worse* over M3 and M6, not better.

**And G-016's own criterion could not fail in the state that created the goal** —
promoted by "exceeds 70%", exited by "green" meaning "under 100%", with the pre-work build
already at 68%. The real subject was headroom and no criterion named a headroom number.
Signed off with the mismatch recorded rather than re-scoped, and generalised into
ADR-0007: **when a goal is promoted by a threshold, its exit criterion must name a
threshold.**

---

## 2026-08-08 — The observability ruling (ADR-0013 / ADR-0014). No code changed.

**The human stopped the loop before G-014 and said the charter had been asking agents to
verify things nobody can observe.** Three instances, all already sitting in these ledgers
and none of them noticed by me:

- **§6.1 told `ai-critic` to hunt behaviour that "reads as stupid to a watching player".
  There is no watching player.** Thirteen goals of a mandate that could succeed while
  inspecting nothing — the ADR-0007 class, inside the prompt written to hunt that class.
- **M2's statement is "guests visibly succeed and fail"**, and G-015 discharges that word
  with a review distribution. Good criteria. Not what the word says.
- **G-016 rested an 18.4% performance decision on a "player-visible" one-tick
  double-booking** that neither side could test, because nobody can see it.

Two defects that WERE caught underline it: 55 rooms floating in mid-air (G-009) and a
hotel that would have been made entirely of cafés with every gate green (G-012) were both
expensive to find and would have been obvious on sight.

**What changed.** A disposable replay viewer (G-017, `tools/viewer`, `apps/game` stays
shut) fed by a `--record` flag through the existing serialiser; a **WATCH** step between
VERIFY and COMMIT; "reads as stupid" now requires a frame reference; critics must close
**DRY** or **FIXED** and a goal may only close on DRY; ledger digests at the top of the
four files, rewritten not appended; I5's ten seconds to be re-derived from a requirement
(G-018) because it was invented at bootstrap and has been promoting goals ever since;
scenario capital promoted to a hard M4 prerequisite, because `--rooms N` seeds 375,000p of
hidden capital against a 500,000p constant and every balance sweep in this project used it.
Separately, ADR-0014: the first playable build ships placeholder art, decided now so M5
neither relitigates it nor waits on it.

**The uncomfortable part, recorded because that is what this file is for.** The ruling is
mostly this project's own defect class, turned back on the charter, by the person who
could not see the game. I have been applying ADR-0007 to asserts and to exit criteria for
thirteen goals and never once to the critic prompts or to a milestone statement. Nor did I
question the ten seconds while treating a goal it promoted as legitimate.

**G-013 owes a retroactive WATCH.** It is planned but not built; it changes guest
behaviour; the viewer does not exist yet. It commits with the debt recorded and becomes
G-017's first subject — a fresh behaviour change is a better first subject than an old one.

Order for the rest of M2: **G-013 → G-018 → G-017 → G-014 → G-015 → exit.** G-018 ahead of
G-017 is my call, not the human's: it changes no simulation code, and every goal after it
quotes an I5 percentage that is currently unsourced.
