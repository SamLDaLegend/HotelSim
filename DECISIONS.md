# DECISIONS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-13, M2.5: 4 of 9 goals done (G-030, G-027a, theta-a, theta-b1). Two owe a human WATCH. Unreliable: 0 gates, 0 defects.*

- **Load-bearing**: ADR-0001 content injected · ADR-0002 integer pence · ADR-0003
  snake_case = content ID · ADR-0006 the v1 fixture is permanent — **nine migrations deep at
  v10** (G-013 paid v7, G-015 v8, G-014b v9, G-019 v10), never regenerated. **ADR-0002 was
  paid off in evidence at G-022**: integer pence is why one hash survives two architectures.
- **Cited most, SIX amendments deep**: **ADR-0007** — a check that succeeds while inspecting
  nothing is not a check. Vacuous ≠ unreachable · promoted by a threshold, exit on one · a
  threshold must itself be derivable · deleting a bad check is not evidence a good one
  exists · a comment offered as evidence may not carry a figure no test pins · **a REPAIR of
  this class is not exempt, and EXIT CRITERIA are where it certifies rather than misses.**
- **Reading a defect count**: 3/3 is a near miss; counts across eras are not like-for-like.
- **ADR-0013** (human) a perceptual criterion needs a perceptual check · **ADR-0014**
  placeholder art, M5 neither waits nor relitigates.
- **ADR-0015** (G-020b) — the tripwire's bound is `sqrt(noise ceiling × smallest known
  regression)`; **POOL within a configuration, REPLACE on one change.** Both halves execute
  now; both were prose first. **A two-halved rule gets one half executed, one admired.**
  **ADR-0016** (G-020c) — a SIGNAL bound is pinned to equality with its derivation and
  **refused beneath the worst reading observed in any measured regime.**
- **The newer rulings live in the charter, not here** — §2.0, §4.1, §5.5–5.8, §7.1.
- **Open contradictions**: **three**, in `GOALS.md`'s digest. **I4 is no longer among them** —
  0 gates / 0 defects since G-022, and the three falsified remedies for its defect B are
  recorded in `vitest.config.ts` so nobody re-argues them.

---

Design decisions that are settled, with the reasoning that settled them. Two kinds go
here: an adjudication when builder and critic disagree twice on the same point
(`HOTELSIM.md` §5.3), and a critique finding a builder rejected rather than fixed
(§5 RESPOND). Once a decision is written here, both agents treat it as closed.

Newest last. Do not edit an old entry — supersede it with a new one.

---

## ADR-0001 — packages/sim does not import packages/content at runtime
Date: 2026-08-07 · Context: bootstrap · Decided by: orchestrator

**Decision.** `packages/sim` may `import type` from `@hotelsim/content`, but never
value-imports it. Content is loaded and validated by the host — `tools/headless` today,
`apps/game` at M5 — and injected into the simulation as plain data.

**Why.** I1 requires `packages/sim` to have zero runtime dependencies. `@hotelsim/content`
depends on Zod, so a value import would give the sim a transitive runtime dependency and
put schema validation inside the sim's hot path. Injection also makes content trivially
substitutable in tests, which the goal loop needs.

**Consequence.** `tools/gates/check-purity.mjs` fails on a non-type import of
`@hotelsim/content` from `packages/sim`. If the sim needs a content shape, it declares
its own structural type or imports the type only.

---

## ADR-0002 — Money is integer minor units
Date: 2026-08-07 · Context: bootstrap · Decided by: orchestrator

**Decision.** Every monetary amount in the simulation is a signed integer in minor
units (pennies). No monetary value is ever a float. `appendTransaction` throws on a
non-integer amount.

**Why.** I2 requires byte-identical state after 100,000 ticks on every platform, with
no tolerance. Floating-point money accumulates rounding differently depending on
operation order and platform, and would break the determinism gate — the gate being
the tripwire for the whole design, this is not a trade worth making. Integer money
also makes rounding an explicit, single-place decision rather than an emergent one.

**Consequence.** Prices, wages and upkeep in `packages/content` are integers in
pennies. Formatting for display is the render layer's job (M5), never the sim's.

---

## ADR-0003 — A snake_case string literal is a content ID
Date: 2026-08-07 · Context: bootstrap · Decided by: orchestrator

**Decision.** Content IDs are `snake_case` (`standard_room`, `double_bed`,
`night_porter`). Code identifiers are camelCase or PascalCase and are never string
literals. Therefore: a snake_case string literal appearing in `packages/sim` or
`apps/game` is a content definition that has leaked into code, and `pnpm check:content`
fails on it.

**Why.** I3 says "fails if a new type literal appears outside packages/content", which
needs a mechanical definition of "type literal" to be a gate rather than a code review
note. This convention gives one, at the cost of reserving a naming style.

**Consequence.** Genuine non-content snake_case strings need an entry in the `ALLOWED`
map in `tools/gates/check-content.mjs`, with a reason. If that map starts growing, the
convention is wrong and should be revisited rather than diluted.

---

## ADR-0004 — Bootstrap scaffolding was written by the orchestrator
Date: 2026-08-07 · Context: bootstrap · Decided by: human

**Decision.** The orchestrator wrote the workspace config, the six invariant gates, CI,
the agent roster, these ledger files, and a minimal empty-sim stub (world, tick, RNG,
hash, save, ledger primitives). Every stub file is headed `// SCAFFOLD`. From G-001
onward, all simulation code is written by the §6 builder agents.

**Why.** `HOTELSIM.md` §10 orders the bootstrap: write the gates (step 2) *before*
creating the agents (step 3). The agents do not exist yet, so the bootstrap cannot be
delegated. The gates also need something to execute against — a gate that has never
run is not evidence of anything. Confirmed with the human before starting.

**Consequence.** §9's stop condition — "you are writing feature code yourself instead
of orchestrating" — is in force from G-001. If the orchestrator finds itself editing
`packages/sim`, it has broken this decision and must stop.

---

## ADR-0005 — `stepTick` iterates the phase table; it does not hard-code the order
Date: 2026-08-07 · Context: G-001 critique round 1 · Decided by: orchestrator

**Decision.** `TICK_PHASES` is the single source of truth for tick order, and `stepTick`
composes the tick **by iterating it**. Reordering the tick therefore requires editing
`TICK_PHASES`, which fails the test that pins it against a literal. The order is not
written down twice.

**This supersedes my own PLAN ruling.** At PLAN I told `sim-engineer` to keep
`TICK_PHASES` as an exported constant plus a test, arguing that "a comment rots the
first time someone reorders the calls; a constant plus a test does not." That
reasoning was wrong, and `sim-critic` demonstrated it rather than asserting it: a
constant compared against a hardcoded literal in a test rots in exactly the same way,
because nothing connects either to what `stepTick` actually runs.

**Why it matters.** The critic proved the gap is real — moving `advanceTime` to the
*front* of the tick produces a byte-identical state hash over 200 ticks with spawns
and despawns. Neither the phase test, nor `test:determinism`, nor the I2 gate can see
it. The goal's headline claim — "the tick runs in named phases with a documented
order" — was therefore unfalsifiable. A goal whose central claim no test can refute is
not done, whatever the gates say.

The order is unobservable *today* only because nothing yet reads `world.tick` during a
phase. That changes at G-004, which is precisely when a silent reorder would become
load-bearing and expensive.

**Rejected alternative: land `spawnedAt` on `Entity` now.** The critic offered this as
the other way to make order observable, and it would work — an entity spawned at tick
*t* recording *t+1* would prove the order in hashed state. It is rejected as scope: it
is parked to G-004, which may want `Entity` shaped differently, and it buys nothing
that the phase table does not already buy. Adding a state field to test a control-flow
property is the wrong tool.

**Consequence.** G-001 gains an exit criterion: reordering the tick phases must fail a
test. `spawnedAt` stays in `PARKING.md` and stays out of this diff.

**Amendment (round 2) — the phase contract is structural, not documented.** The uniform
`(TickState) => TickState` signature that makes the table foldable also put the raw
command log in scope for every phase, turning "only `applyCommands` reads the commands"
from a structural guarantee into a comment. `applyCommands` therefore returns a frozen
empty array in `commands`, and `commitEntities` carries that forward: there is nothing
left to read. Free, because `state.commands` had exactly one read site.

This matters because `PARKING.md` already schedules `runSystems` into the slot between
phases 1 and 2. Every system written there will be a `TickPhaseFn`. A system that peeks
at the command log and acts on it double-applies intent `applyCommands` already staged —
a replay divergence that hashes perfectly on the machine that produced it, which is
exactly the class of bug I2 exists to catch and the one shape of it I2 would miss.

The rejected stronger fix — drop `commands` from `TickState` and closure-bind it into
`applyCommands` — would cost the uniform signature that ADR-0005 depends on. The general
rule this sets: **when a phase contract can be made structural at no cost, make it
structural.** A rule that only a comment enforces survives exactly as long as one author
holds the whole file in their head.

`TICK_PHASES` is `Object.freeze`d for the same reason: ADR-0005 made it load-bearing and
it is exported on the public surface, where `as const` buys nothing at runtime.

---

## ADR-0006 — The v1 save fixture is permanent, and the next `World` field owes a migration
Date: 2026-08-07 · Context: G-003 plan · Decided by: orchestrator

**Decision.** `packages/sim/src/fixtures/save-v1.ts` holds the exact bytes of a real v1
save, the content it was made under, and its state hash. **It is never regenerated.**
Consequently, the next goal that adds a field to `World` — G-004 on current plans — will
find that fixture rejected by `assertWorldShape`, and the correct response is to bump
`SAVE_SCHEMA_VERSION` to 2 and write a real `1 -> 2` migration. That cost is accepted.

**Why.** Today a new `World` field silently changes what every existing save means; the
suite stays green because every test round-trips through the same build, so the reader is
only ever tested as the inverse of the writer. A committed fixture makes the reader face
bytes it did not write. A field addition then fails loudly against real old data instead
of quietly redefining it, which converts a silent break into a deliberate schema decision.

**Why it must never be regenerated.** A fixture regenerated by the build that broke it
proves nothing — it would agree with whatever the writer currently does, which is the
exact property it exists to deny. If it is ever regenerated, its entire value is gone and
it should be deleted rather than trusted.

**Consequence.** G-004's goal block carries this as a stated obligation, so its builder
meets it as a known cost rather than a surprise red test. When the bump happens, the
synthetic-chain tests from G-003 already prove the runner handles gaps, duplicates,
out-of-order steps and mid-chain throws, so the first real migration inherits a tested
mechanism.

---

## ADR-0007 — Safety mechanisms must be wired to the path they protect
Date: 2026-08-07 · Context: G-003 plan · Decided by: orchestrator

**Decision.** A check that can succeed while inspecting nothing is not a check. Whenever
one is found, two things are required: reach it from the real code path, and add a case
proving it can fail.

**Why.** This repo has now produced the same defect three times in three goals, in code
written by three different hands:

- **G-001** — `TICK_PHASES` documented a tick order that nothing enforced. Moving
  `advanceTime` to the front produced a byte-identical hash.
- **Gate repair** — `check:content` reported `ok` while inspecting **zero** ids for any
  wrapper-object content file.
- **G-003** — `deserialise` never calls `assertMigrationPathComplete`, and its own gap
  check used `>=` rather than `===`, so a gapped chain fed v2 data through a v3 migration
  and returned it as valid. The detector and the defect were wired to different circuits.

Each was invisible to a green suite, and each was caught by mutating something and
observing that nothing failed.

**How to apply.** For any assertion, ask: *can this succeed while looking at nothing?* If
yes, it needs a companion case that makes it throw — `assertMigrationPathComplete` with an
empty chain over a two-version span, a probe file for `check:content`, a reordered
`TICK_PHASES`. Prefer making a fact checkable over documenting it: a count assertion beats
an unvisited loop, a mapped type beats a hand-written key list, and a fold over a frozen
table beats a comment describing the order.

**Consequence.** Critics should hunt this class explicitly; it is not in §6.1 by name but
it has produced more real defects here than anything that is.

**Amendment (G-016) — a criterion that cannot fail in the state that created its goal.**
The class also applies one level up, to goals themselves. G-016 was promoted by a trigger
("`sim:bench` exceeds 70% of budget") whose exit criterion was "`sim:bench` green" — i.e.
under 100%. The pre-G-016 build was already green ~~at 68% raw~~ (percentage withdrawn at
G-018, which derived the budget it was a fraction of), so **criterion 1 was
satisfied before a line of the goal was written**, and the goal's own statement was
already true at BUILD start. The real subject was *headroom*, and no criterion named a
headroom number. Signed off with the mismatch recorded rather than re-scoped, so the next
goal inherits a number instead of a green tick. **When a goal is promoted by a threshold,
its exit criterion must name a threshold** — not merely the absence of failure.

**Amendment (ADR-0013) — a threshold must be derivable from a stated requirement.**
The amendment above says a goal promoted by a threshold must exit on a threshold. The
human went one level further: **the threshold itself must be sourceable.** I5's ten
seconds was invented at bootstrap with no basis and then promoted a goal. *"A number
nobody can source is not a gate, it is a superstition with CI access."* Applies to every
bound in the repo — the scaling ratios, the patience caps, the review means — and is why
G-010's "measured × 1.5, then held" is the right shape and a round number is not.

**Amendment (G-013) — deleting a bad check is not evidence that no good one exists.**
Produced by `ai-engineer`, which made the error, caught it, and wrote the rule:

> *"Deleting a bad check is not evidence that no good one exists. I reached that inference
> and the orchestrator accepted it in writing, one round after the deletion. The
> over-correction cost as much as the original defect."*

What happened. G-013's report asserted `metByRoom + metByItem === met` where `metByRoom`
was computed nine lines earlier as `met - metByItem` — a tautology, with a comment claiming
it was the only thing that would catch a misattribution. `ai-critic` reproduced it: mutate
the attribution to always-zero, every satisfaction misfiled, `violations` empty, exit 0.
Correctly deleted. **Then the builder concluded, and the orchestrator agreed in writing,
that no such check was possible** — that "the code attributes correctly" is a property of
the code rather than of the report. Round 2 disproved it in the same function: `buildSummary`
holds `content`, and content pins the answer. *No room type provides this need ⇒
`met - metByItem` must be 0. No item type provides it ⇒ `metByItem` must be 0.* Neither is
an identity over the two stored numbers; each cross-references the tally against a separate
input, which is exactly what the deleted law lacked.

The tell was nine lines above the deletion the whole time: `met + unmet === departed` is
equally "a property of the code" and is checked anyway, and its comment gives the
counter-argument verbatim.

**How to apply.** When a check is found vacuous, the fix has two steps and the second is
the one that gets skipped: delete it, **then ask what a non-vacuous check here would
compare against.** A vacuous check compares a number to itself; a real one compares it to a
*separate input* — content, a frozen literal, an independent accumulation, the filesystem.
"No check is possible" is a claim that needs the same evidence as any other, and it is
easier to believe right after deleting one.

**Why this sits with ADR-0007 rather than in `PARKING.md`.** `ai-critic` was asked directly
and ruled: parking is deferred work, nothing there is owed, and the sentence had been
attached to a struck-through entry — the one place a reader scanning for live obligations
is meant to skip. It is a rule about how to *respond* to a vacuity finding, so it belongs
next to the rule that produces them. Filing it as a parked item would repeat the error §4.1
records costing a day.

**Amendment (G-013, human) — two corrections to how a defect COUNT is read.** The
orchestrator recommended against splitting G-013 and was upheld on the cost argument, but
two steps of the reasoning were wrong and both affect what future goals carry forward.

**1. "The sweep-side failure did not occur" is too clean. It occurred at the boundary.**
Instances 8 and 9 were found at **round 3**. Rounds 1 and 2 did not reach exhaustion; the
critic reached a swept diff at the last round the budget permitted. **"The sweep succeeded"
and "the sweep succeeded with zero headroom" are different facts and only the second is
true.** A diff needing three full sweeps is itself weak evidence of the condition splitting
addresses — the budget merely happened to be exactly sufficient. Read a 3/3 goal as a near
miss, not as a system working comfortably.

**2. Nine against seven is not like-for-like, and this repo already knows why.** The
orchestrator compared G-013's nine instances of the vacuous-check class against seven
across the previous thirteen goals. **Instances 1–3 were caught by the builder before any
critique** — ADR-0007 discipline that did not exist for most of those thirteen goals.
Detection sensitivity has risen sharply, so part of the spike is **better instrumentation
rather than worse authoring**. This is G-016's lesson in another register: *the ratio
survives, the absolutes do not*. **Record the confound whenever a defect count is cited**,
or the next goal that produces four will read as an improvement when it may only have had
a thinner sweep.

**Amendment (G-013, human) — a comment offered as EVIDENCE is subject to the same rule as
an assertion.** This ADR's "prefer making a fact checkable over documenting it" has always
been read as applying to *code*. It applies to *evidence* too, and G-013 is the fourth time
the lesson has arrived:

- **G-001** — `TICK_PHASES` documented an order nothing enforced.
- **G-010** — a comment claimed the gate witnessed something it cannot.
- **G-013 round 1** — a comment claimed a tautological law was "the only place that would
  say so". False in both halves.
- **G-013 round 3** — the determinism log's justification described *a second lounge at
  (0,30) with its own chair*, kept alive because *comfort* is oversubscribed. `secondHost`
  resolves by ascending id to `games_room`, so the code builds a games room, a vending
  machine and a nourishment need. Wrong room, wrong item, wrong need, and the quoted
  met/unmet figures stale on top.

**The rule.** When a comment is offered as evidence — "measured, not estimated", "this is
what the gate sees", "the pass is reached because X" — it makes a checkable claim, and it
is subject to this ADR exactly as an assertion is. *A second lounge stands at (0,30) with a
chair* is two lines of test against the world the log actually builds. Write the assertion,
or do not make the claim.

**The trap that makes it worse than a stale comment.** G-013 round 3's text marked
`guest_comfort` oversubscription as load-bearing. That is the one dial the same diff parked
as unswept and owed to M4 — so the number a future goal is most likely to move was the one
falsely flagged as critical, while the property actually holding the pass up (nourishment
staying oversubscribed) was written nowhere. **A false evidence comment does not merely
fail to help; it aims the next maintainer at the wrong variable.**

**THE RULE THIS BECOMES (human, 2026-08-08, after the same paragraph failed a third time):**

> **A comment offered as evidence may not carry a figure that no test pins. Prose that
> cannot be verified may describe, but it may not measure.**

The escalation that produced it: one paragraph in `determinism-log.ts` was wrong three
times in three *different* mechanisms — a world the code does not build (round 3); a
lifetime denominator spanning a window in which the measured event is impossible by
construction (verification); and a retraction whose stated cause reproduces to 5,486 rather
than the 11,268 it retracts, with two other natural readings giving 22,823 and 48,915.

**What survived all three failures was the qualitative claim** — wave 1 thin, wave 2
robust; the cell busy while the item was not. The numbers were the part that kept rotting
and they were doing no work the conclusion needed. So: state the conclusion, drop the
figures, and if a figure is load-bearing it becomes an assertion in a test rather than
prose in a comment. Third demonstration inside a single goal; it stops being a lesson here
and becomes a rule.

**Recorded because it is unusual and cuts the other way:** the denominator correction
**widened** the conclusion — 11.2% against 97.1% is a bigger gap than 5.5% against 49%. A
retraction that *strengthens* what it corrects is rare, and it is mild evidence the
underlying reading was sound and only the framing was broken, which is the opposite of what
three failures would normally suggest.

**Amendment (G-003 critique) — vacuous and unreachable are opposites, not synonyms.**
As first written this ADR could be read as condemning defensive asserts. It does not.
`sim-critic` drew the line, and it is the right one:

- **Vacuous** — succeeds while inspecting nothing, *and is relied on as evidence*. This
  is the defect. All three cases above share it: each told a reader that something had
  been verified when nothing had.
- **Unreachable** — cannot fail given the checks above it, and establishes a fact those
  checks already establish. This is what a correct postcondition looks like. It cannot
  mislead anyone, and it fires if a check above it is ever weakened.

The test is not "can this branch be reached" but **"does anything rely on this as proof
that a thing was checked?"** The terminal `version !== currentVersion` check in
`assertMigrationPathComplete` is unreachable — verified across 47,988 chain/span
combinations, reached zero times — and is kept deliberately. Deleting it would trade a
real backstop for a coverage percentage, which §9 already names as an anti-pattern.

*(This amendment sat under ADR-0011 from 2026-08-08 until `economy-engineer` reported it
at G-011 PLAN — an editing slip that made the human's dead-state ruling read as though it
had also settled a question about defensive asserts. Moved to where it belongs.)*

**AMENDMENT (G-014b PLAN, 2026-08-09) — A REPAIR OF THIS CLASS IS NOT ITSELF EXEMPT, AND
THREE CONSECUTIVE ONES WERE NOT.**

G-014b's exit criteria were written by the orchestrator *specifically to remove* instances
of this class from the goal before it was built. `ai-engineer` found at PLAN that **three of
the four had it anyway**:

- **Criterion 2**, rewritten by the orchestrator as a differential precisely because the
  original was satisfiable by not shipping the feature, **remained satisfiable by not
  shipping the feature**: a saturating margin gives `abandoned(shipped) = 0`, and
  `abandoned(0) > 0` still passes. The two-term form was the defect wearing the repair.
- **Criterion 3**'s ruled repair was **self-contradictory**: it required margin 0 to
  reproduce the pre-margin era, when margin 0 is the *opposite* end — maximum thrash. The
  era that reproduces total commitment is the SATURATING margin.
- **Criterion 4** was **already discharged verbatim** by a test shipped in the previous
  goal, so it could be met by writing nothing at all.

**The generalisation, and it is the useful part.** The class is usually described as a
property of *checks*. These were three instances in **criteria** — the things that decide
whether a goal is done — and criteria are worse, because a vacuous check fails to catch a
defect while a vacuous criterion **certifies the goal**. The existing discipline points
agents at their own assertions; nothing pointed anyone at the acceptance conditions until
§5.7 made the orchestrator's claims reviewable, and this is that rule's first substantive
return.

**Consequence.** A goal block's exit criteria are read by the builder at PLAN against this
ADR, in the same pass that reads the diff, and **finding one there is worth more than
finding one in code** — it is the cheapest moment in the loop, before a line exists. It
does not consume critique budget: §7.1's guard splits by subject, and a criterion is prose.

---

## ADR-0008 — Things that describe the past must not track the present
Date: 2026-08-07 · Context: G-007 build and critique · Decided by: orchestrator

**Decision.** Any artefact whose subject is a *historical* fact — an old save's meaning, a
retired schema version's shape — is written as a **frozen literal** and must not derive
from anything the current build can change. Three consequences, all now in force:

1. **A migration's output is a pure function of its input bytes and its own era.**
   `migrateV2ToV3` carries `V3_MIGRATION_BOUNDS` as its own frozen four integers; it must
   never call `createGridBounds()`. If it read the live constant, the same v2 bytes would
   produce a *different* v3 world after anyone edited the plot — history would drift with
   the build.
2. **A test oracle for a historical schema version is a literal, not a mapped type.**
   `guest.save.test.ts`'s v2 key set is hand-written **deliberately against ADR-0005's
   mapped-type discipline**, because v2 is frozen and `WORLD_KEYS` tracks the current
   `World`. This is not an exception to ADR-0005 — it is its precondition: "a mapped type
   beats a hand-written list" holds when the list describes something that *changes*.
3. **Where the values coincide, the guard must be structural, not a value assertion.**
   `V3_MIGRATION_BOUNDS` and `createGridBounds()` are identical integers today, so no
   assertion can tell the implementations apart. A source scan forbidding `save.ts` from
   referencing the live grid constants is what makes the promise checkable.

**Why.** `sim-critic` showed the cost of getting (2) wrong concretely: had the v2 oracle
tracked `keyof World`, G-007 would have made it demand that a v2 intermediate carry a
`grid` key, and the natural "fix" would have been to make the **v1 -> v2 step emit
`grid`** — corrupting a historical migration to satisfy an oracle pointed at the wrong
era. It also checked the tempting middle road, deriving the v2 key set from
`MIGRATED_V2_BYTES`, and found it worse: both sides would then come from the same pinned
artefact, making the assertion vacuous.

**How to apply.** Ask what era the artefact describes. If the answer is "an era that is
over", it is a literal, and anything that would make it move is a defect rather than an
update. If the answer is "now", ADR-0005's mapped-type rule applies as written.

---

## ADR-0009 — The build refusal tests affordability, not wisdom
Date: 2026-08-07 · Context: G-008 critique round 2 · Decided by: orchestrator

**Decision.** `buildRoom` refuses when `balance - cost < 0` and on nothing else. It will
not refuse a build the player can afford on the grounds that the room will never repay.

**The finding this answers.** `balance-critic` showed the cash test is the economy's only
negative feedback, and that it is *anti-correlated* with the harm it appears to prevent.
Revenue is capped by demand (12 arrivals/day x 8,500p, saturating at ~4 rooms) while
upkeep is unbounded in room count, so any cadence that keeps passing the cash test walks
the hotel past the point of negative net income and holds it there. Worse, a **slower**
cadence overshoots **further**, because cash accrues between attempts so more attempts
pass: `--build 10080` reaches −38,214,000p at 2,000 days, falling exactly −23,000p/day
with no floor, while `--build 120` ends +21,198,500p. The slowest strategy is the worst.

**Why the predicate stays anyway.** Refusing an affordable build because the simulation
judges it unwise is the simulation playing the game for the player. Overbuilding is
*meant* to be possible and *meant* to hurt — that is the build loop having a real trap,
and M0's capacity sweep found the same trap before a player could reach it. A rule that
prevents the mistake also deletes the decision.

**What is actually missing is a consequence, and it is M4's.** The spiral has no
terminator because there is no bankruptcy state and no demand response. Both are M4.
Pulling either forward would be M4 arriving inside a build-command goal.

**Consequence.** M4 inherits two obligations, recorded in `PARKING.md`: give the spiral a
terminator, and note that build cadence interacts with the cash brake in a way that
punishes caution. The second is a balance signal nobody would guess — it should be tested
against, not rediscovered.

---

## ADR-0010 — `nightlyRatePence` is per completed stay, and the name stays
Date: 2026-08-07 · Context: G-008 critique round 2 · Decided by: orchestrator

**Decision.** `nightlyRatePence` is charged once per *completed stay*, not once per night.
A stay is `night_rest.satisfyTicks` (480 ticks = 8 hours), so a room bills 8,500p **three
times a night**: 25,491.5p per room-day against 2,500p of upkeep, a **10.2:1 margin**, not
the 3.4:1 the two field names imply. **The field is not renamed and the billing model is
not changed.** The coupling is documented instead, in `schema.ts` and cross-referenced
from `needTypeSchema`'s `satisfyTicks`.

**Why not rename.** `perStayRatePence` would change `SAVE_V1_CONTENT`'s shape. That literal
is frozen under ADR-0006, and its fingerprint `8e09fe4f0fa162a3` is what keeps the
permanent v1 fixture a world that still **ticks** rather than a husk that only exercises
the reader. G-004 spent its smallest and best decision avoiding exactly that outcome, and
a field name is not worth undoing it.

**Why not change the billing model.** Pro-rata per-night billing is a pricing change. That
is M4's, and it would arrive inside a goal about build commands.

**Why this could not simply be logged.** `schema.ts` told designers that balancing the
economy means editing `nightlyUpkeepPence` and `nightlyRatePence`, "never code" — which was
**false**: the dominant term is `satisfyTicks`, in a different content file that nobody
balancing revenue would open. `balance-critic` measured a **3.85x swing in profitability**
from editing it alone (1440 -> 5,957.5p per room-day; 480 -> 25,491.5p). A comment that
misdirects the person balancing the game is worse than no comment.

**Consequence.** M4 owns the model change, and when it lands, per-night billing also makes
`constructionCostPence` a real decision: at 1,440-tick nights the margin is 5,957.5p/day
and 250,000p is a 42-day payback rather than an 11-day one.

**SUPERSEDED BY ADR-0020 (G-027a). NOTHING ABOVE IS EDITED — this is a pointer, in the
amendment idiom ADR-0007 uses, appended so that a reader who lands here is not left with
arithmetic that is no longer true.** ADR-0017 replaced the terminator: a stay is now
`stayDurationTicks` in `guest-rules.json`, **not** `night_rest.satisfyTicks`, which has no
economic role at all any more. The formula, the 10.2 : 1 and the 3.85× sensitivity table
above are all true of the era this ADR describes and false of the current build. Read
ADR-0020 before quoting any of them — including the 5,957.5p in the line directly above,
which G-027a re-measured and found LOW, because the stay clock now runs from arrival.

---

## ADR-0011 — The hotel can always recover: capital, a loan, and a refund
Date: 2026-08-08 · Context: M1 sign-off · Decided by: **the human**

**Decision.** All three closures to the absorbing dead state are approved and all three
are to be built: **starting capital**, a **loan**, and a **balanced demolition refund**.
Not a choice between them.

**The defect this closes.** A world with zero rooms and a zero balance could not recover:
no rooms means no revenue, no revenue means the balance never moves, and every build is
refused forever. Reachable in three legal commands from the shipped default —
`--rooms 3 --demolish 1` scraps the inherited rooms before any revenue arrives — after
which 1,000 days report 12,000 guests arrived, 11,999 unsatisfied, every player action
refused, and no notification. Found by `balance-critic` at G-008 and escalated at M1
sign-off because "starting capital is parked to M4" and "the game has a reachable dead
state with no exit" are different claims.

**Why all three rather than the cheapest one.** They close different failures. Starting
capital stops the *opening* being the most fragile moment in the game. A refund makes
stock convertible back into buildable cash, so a hotel that overbuilt is not stranded. A
loan covers the case where neither applies — no stock left and no capital remaining. Any
one alone leaves a reachable hole.

**The constraint that binds the refund, and it is a number.** `balance-critic` priced the
demolish-before-midnight upkeep dodge at G-005 and re-priced it at G-008 at 102.4:1
against the player. A refund above **247,500p** — 99% of construction cost — reopens it
exactly, because the dodge then costs `constructionCost − refund` and saves
`nightlyUpkeep`. The refund must sit meaningfully below that, and G-011 must *price* the
dodge rather than assert it is closed.

**Scheduled as G-011**, pulled forward from M4 by this ruling, ahead of M2's needs work —
because M2 and M3 would otherwise be built on top of a reachable unrecoverable state.
Interest-rate tuning, bankruptcy as a game-over state, and demand response remain M4's.

**On determinism.** The human's "we don't need to be deterministic" was read as *all three
are correct, do not agonise over choosing one*. I2 is untouched and all three mechanisms
are deterministic. Recorded here because a misread of that sentence would have been the
single most damaging thing this project could do to itself.

---

## ADR-0012 — The need vector is at least Comfort, Entertainment and Nourishment
Date: 2026-08-08 · Context: M2 start · Decided by: **the human**

**Decision.** *"It must have multiple needs for certain. Comfort, Entertainment,
Nourishment being at least 3."* G-012 ships at least those three named need types.

**Why it was worth a human call.** M2's seeding already recorded that the vector having
length one is the milestone's biggest vacuity risk — every criterion in G-013, G-014 and
G-015 measures nothing without a second need. That made "how many needs" a question the
goal could not answer for itself, because a builder choosing the number would be choosing
how hard its own criteria are.

**The consequence the ruling forces, which is the interesting part.** `bindContent`
refuses content in which a need has no provider — G-002's guard, strengthened at G-013 to
mean *reachable* rather than merely declared. Items do not become providers until G-013.
Therefore **every need G-012 ships must be provided by a room type at G-012**, or the
content will not load. G-012 must ship provider content alongside the needs, and that is
not scope creep — it is the satisfiability guard doing its job one goal early.

**Not settled here, for G-012's PLAN to propose and the orchestrator to adjudicate:** how
the existing `night_rest` relates to the three. The natural reading is that rest is the
*lodging* need — the reason a guest books at all — and comfort, entertainment and
nourishment are *engagement* needs met during the stay, which maps exactly onto the
lodging/engagement split already approved at M2 seeding. But that is an inference, not the
ruling, and renaming or removing `night_rest` would move the content fingerprint and cost
the permanent fixture its ability to tick (ADR-0010's lesson).

---

## ADR-0013 — A perceptual criterion needs a perceptual check
Date: 2026-08-08 · Context: M2, before G-014 · Decided by: **the human**

**Decision.** *"A criterion that uses a perceptual word needs a perceptual check, or the
word must come out."* Nobody has seen this game run. The charter has nonetheless been
asking agents to verify things that are structurally unobservable in this build, and has
been doing so since §6.1 was written. Six changes follow, all ruled together.

**The three instances, all already in the ledgers before this ruling:**

- **§6.1 tells `ai-critic` to hunt behaviour that "reads as stupid to a watching player".
  There is no watching player and no way to become one.** That mandate has been vacuous
  for thirteen goals — precisely the defect class [ADR-0007](#adr-0007) exists to name: a
  check that succeeds while inspecting nothing, relied on as evidence.
- **M2's own statement in §8 is "guests visibly succeed and fail".** G-015 discharges that
  word with a review distribution and an outcome table. Those are good criteria. They are
  not what the word says.
- **G-016 pinned a one-tick double-booking — two guests in one bed for a minute — as the
  class sampling would surrender, and called it "player-visible".** Nobody can see it. The
  argument for and against pulling an 18.4% lever therefore rests on a claim neither side
  can test.

And several defects that *were* caught would have been obvious on sight rather than
expensive to find: 55 rooms floating in mid-air (G-009), and a content sort order that
would have made the whole hotel cafés with every gate green (G-012).

**1. A replay viewer, built now, ahead of G-014.** New goal G-017, owned by
`render-engineer` / `render-critic` — the pair that has been idle for the whole project,
which is its own small warning. A run can be recorded and watched; a human can scrub a
simulated month and see rooms, guests, and what each guest is doing. The constraints are
what make it safe and are **not negotiable**: it lives in `tools/viewer` and `apps/game`
stays shut; it is a **replay** viewer that consumes recorded frames from a completed run,
so "it cannot act" is structural rather than promised — there is nothing to send a command
to; its input comes from a new `--record <path>` flag on `sim:run` emitting frames through
the **existing** save serialiser, and a serialiser that cannot express what the viewer
needs is a **finding to report, not a licence to add a field**; no new `World` field, no
migration, no content-fingerprint movement; recording is off by default and `sim:bench`
runs without it, so I5 must not move. **It is explicitly disposable** — coloured
rectangles, labels, a scrubber, a speed control, and if it starts acquiring features it
should be deleted rather than defended.

**2. WATCH becomes a step in the loop.** §5's state machine gains a step between VERIFY
and COMMIT: for any goal that changes guest, room or economy behaviour, record a run and
watch it, then append to `JOURNAL.md` what looked wrong — or that nothing did. A goal that
changes behaviour and produces no visual observation has skipped a step.

**3. §6.1's "reads as stupid" finding now requires a frame reference** — a recording, a
tick number, and what it shows. Until this ruling it was unfalsifiable; from here it is a
finding like any other and subject to §7's citation rule.

**4. I5's ten seconds was invented at bootstrap with no basis, and is now promoting
goals.** G-016 exists solely because of it, and its exit criterion could not fail
(ADR-0007's amendment). It is replaced by a derivation from what the game needs — a
60-room hotel at the fastest intended play speed sustaining real-time on a mid-range
laptop, times a stated headroom multiple for M3, M4 and M6 — written down, with every
recorded I5 figure re-baselined in **one commit that changes no simulation code** (G-018).
If the honest derivation says 61–63% is comfortable, that is a real answer; if it says the
budget was always too tight or too loose, that is worth knowing before M3 adds
pathfinding. **Standing rule, generalising ADR-0007's amendment: a gate threshold must be
derivable from a stated requirement. A number nobody can source is not a gate, it is a
superstition with CI access.**

> **ANSWERED BY G-018, appended rather than edited into the ruling above** — the ruling is
> a record of what the human said and rewriting it would falsify that record. The `61–63%`
> in it is one of the readings G-018 struck (recorded against the invented budget, not
> re-measurable paired). **The derivation says neither "comfortable" nor "too tight": it
> says the budget was ~39× TIGHTER than any stated requirement.** Derived budget
> **389,333 ms**; the same build reads **~2%** of it. So the third branch the ruling did
> not offer is the true one — *the number was not calibrated at all*, which is exactly why
> it could promote G-016.
> **The consequence the human then drew, and which this ADR did not anticipate:** widening
> the ceiling 39× leaves I5 protecting against approximately nothing, so the paired-ratio
> tripwire that has guarded tick cost as *practice* for eighteen goals becomes a gate —
> **G-020, a hard prerequisite of M3**, because M3 is the likeliest place in this project
> for a quadratic to appear.

**5. The `--rooms N` capital contaminant is a hard prerequisite of M4.** `--rooms 3`
carries 375,000p of hidden capital against a 500,000p starting constant, because seeded
stock is seeded cash at the refund rate — and every balance sweep and every bench in this
project uses that flag. `balance-critic`'s entire accumulated evidence base was measured
in a world with **75% more effective opening capital than the shipped figure**. Harmless
now; not harmless when M4 tunes demand curves and pricing against exactly those sweeps.
The scenario-capital mechanism in `PARKING.md` is promoted to a hard prerequisite of the
first M4 goal. **M4 does not start until it lands.**

**6. Critics must close DRY or FIXED, and a goal may only close on DRY.** Thirteen goals,
mostly 1/3 rounds, zero BLOCKERs; the one goal that ran to 3/3 produced the best critique
in the project. Every critic's final report now ends with one of two statements
explicitly: **DRY** — "I have no further findings at any severity in this diff" — or
**FIXED** — "my findings are resolved; I have not exhausted this diff". A FIXED close
consumes a round and the critic goes again. **This costs rounds and is meant to.**
Additionally, any goal that is the **last in a milestone** gets a second critic from a
different pair in its final round, per the G-008 precedent that produced the 107M-penny
sweep and the G-015 ruling that already followed it.

**7. Ledger digests.** The four ledgers are 2,836 lines and `JOURNAL.md` — which calls
itself the memory that survives compaction — is 753 of them. An ADR amendment has already
spent a day filed under the wrong ADR. Each of the four gains a **rolling digest** at the
top under a fixed heading, **rewritten every REFLECT and never appended to**, fifteen
lines maximum, carrying: current schema version, current gate readings, live obligations
owed by future goals, and open contradictions. The append-only history stays exactly as it
is beneath it.

**What this ruling does NOT do, stated so both sides know it is bounded:**

- It does **not** open `apps/game`. M5 is unchanged. The viewer is not the renderer.
- It does **not** weaken I1, I2 or any other invariant. If any part of it appears to
  require weakening one, **stop and escalate** instead. (I5's *threshold* is being
  re-derived from a requirement, which is the opposite of weakening it — §4 above.)
- It does **not** reopen M0 or M1 sign-off.
- It does **not** make the viewer a deliverable. It is a disposable instrument.

**What it must find, stated up front so the goal is falsifiable.** The human expects
watching a month to surface at least one behaviour that every current test calls correct
and a human calls wrong. **If it finds nothing, that is recorded honestly as a real result
that retires the concern** — not as a failure of the goal.

---

## ADR-0014 — The first playable build ships placeholder art
Date: 2026-08-08 · Context: M2, answered outside the loop · Decided by: **the human**

**Decision.** The game ships its first playable build with **placeholder art** — flat
coloured shapes with clear silhouettes. Real art is a **separate track** that can replace
them at any point without touching the simulation. M5 does not relitigate this and does
not wait on it.

**Why it is decided now rather than at M5.** Deciding it at M5 is deciding it too late,
because the answer changes what M5 *is*. §8 already says "coloured rectangles are an
acceptable shipping state for this milestone"; this converts an allowance into the plan,
and makes the art track's absence a non-blocker rather than an open question.

**Where the vocabulary gets established: G-017's viewer.** It is the cheapest possible
test of whether a side-on cross-section reads clearly *at all* — which is a question about
the whole visual direction, and one worth answering before M5 is built on the assumption
that it does. The viewer is disposable ([ADR-0013](#adr-0013)); the finding about
legibility is not.

**Consequence.** Art is never on a goal's critical path. If a room type or a guest state
cannot be told apart by shape and colour alone, that is a **design** finding about the
cross-section, reportable at M5 by `render-critic` — not a request for a sprite.

---

## ADR-0015 — A ratio bound is placed by equal multiplicative margin, not by a multiplier
Date: 2026-08-09 · Context: G-020b, the tick-cost tripwire · Decided by: sim-engineer,
verified by the orchestrator, after `sim-critic` refuted the first rule at PLAN

**Decision.** A gate that compares a **ratio** against a bound places that bound at the
**geometric mean of two measured quantities**: the instrument's measured **noise ceiling**
and the **smallest regression of the class the gate exists to catch**.

```
BOUND = sqrt(NOISE_CEILING x SMALLEST_KNOWN_REGRESSION)
```

**Why not G-010's "measured x 1.5, then held at or below".** That rule is right when the
measured quantity is a **signal** — 4.2x rooms -> 6, 1.281 density -> 1.9, 1.74 needs ->
2.5. A noise floor is not a signal; it is the thing the gate must never fire on. **The tell
is that a perfect null of 1.0000 yields 1.5000 too: the multiplier does all the work and
the measurement almost none.** Found by `sim-critic` at PLAN, on a draft the orchestrator
had already accepted.

**What the geometric rule buys.**
1. **The measurement is load-bearing.** noise 1.0000 -> 1.4387 · 1.1000 -> 1.5090 ·
   1.2064 -> 1.5803. The bound moves with the reading instead of the multiplier carrying it.
2. **Equal multiplicative margin against both failure modes**, which are both multiplicative:
   firing on noise, and missing the smallest regression worth catching. At G-020b's readings
   the geometric mean equalises them EXACTLY, but **truncating the bound to 4dp does not** —
   at G-020b's shipped figures they are **1.42186x above noise and 1.42200x below the class**,
   which differ in the fifth place. **Say the two numbers; do not say "equal".** The equality is
   a property of the untruncated value and "held at or below" requires the truncation, so the
   rule buys near-equal margins rather than equal ones.
3. **It degrades legibly.** As the instrument gets noisier the bound rises with it, and when
   the two margins stop being useful the rule says *the instrument is too noisy to gate*
   rather than quietly widening. G-020b was told to report exactly that if the bound landed
   above ~1.6. It landed at 1.4557.

**THE NOISE CEILING CARRIES ITS LOAD REGIME, AND THE REGIME IS NOT A FOOTNOTE.** The same
`--null` ratio, same 30-day arm, quiet and loaded readings **alternated in one sitting**,
n=3 per regime, min..max and largest upward overshoot, load = 12 busy processes on 12 cores:

```
quiet    0.9666 .. 0.9911    no upward overshoot
loaded   0.9497 .. 1.0973    +9.73%
```

**Over 4x the quiet figure**, and `sim-critic` measured the same contrast independently at
n=2 (+7.96% loaded). **A noise figure without its regime is unpinned** — rule 4's **slot 5**,
ruled in by the human during this goal,
and the exact omission for which this session withdrew a different G-020b finding.

**THE RULE THAT FOLLOWS, AND IT BINDS FUTURE USES OF THIS ADR:** derive the ceiling from the
regime the gate actually runs in — **which must be MEASURED on the machine the gate runs on,
never inferred from how the repository schedules its own work** — but
**check the bound against every regime the noise has been OBSERVED in**, because the first
principle is that the gate never fires on noise and an observed excursion counts whatever
produced it. **A bound whose margin approaches the loaded noise needs the noise re-measured
under load before the bound is trusted.** At G-020b's figures the margin is 1.4557 / 1.0973 =
**1.327x**, so the shipped gate is not threatened. **But the rule is general and the margin
is not**: at a regression class of 1.3x rather than 2.07x, `sqrt(1.0238 x 1.3) = 1.1537`
against a loaded reading of 1.0973 — **a margin of 1.05x rather than 1.327x.** The gate would
still not fire on the observed noise, so the CORRECTED claim is about the margin collapsing,
not about the ordering reversing. **An earlier version of this paragraph said 1.1537 "sits
below the loaded reading". It does not — it is 1.05x above it** — and the stated consequence
therefore did not follow from its own figures. At a 1.05x margin the honest response is to
re-measure under load and refuse to ship the bound, not to widen it by hand; but that is a
judgement about a margin too thin to trust, not an arithmetic impossibility.

**THE NOISE CEILING IS MEASURED ON REAL PAIRS AS WELL AS NULLS, AND THE SHARPER VERSION OF
THIS CLAIM HAS BEEN SCORED AND FAILED.** G-020b predicted at PLAN that a real pair would SET
the ceiling because `--null`'s arms are one comment apart. **On the campaign as first taken it
did — null +1.46% against a real pair's +2.284%. On the SHIPPED campaign it does not**: the
admitted fourth arm is a null at +2.38%, so **the shipped ceiling is a null's.** Recorded as
failed-on-the-shipped-data rather than dropped, because it was on the record as a scored
prediction. **What survives is the weaker claim that carries the design**: sizing on nulls
ALONE would be sizing on the easiest measurement the instrument can make, so real pairs stay in
the campaign. The rescue — "the null only won because n=9 beats n=5" — **is unavailable**, being
the unequal-n comparison this same commit forbids elsewhere.

**And this is why real pairs stay, stated STRUCTURALLY so it cannot be read as a measurement
that the shipped data contradicts:** `--null`'s two arms are one comment apart — same code,
same code path, same JIT shapes — so **whatever its spread turns out to be, it is a lower bound
on real-pair noise and never an estimate of it.** That argument needs no reading and survives
any campaign. **The measured form is deliberately NOT restated here**: it was scored failed one
paragraph above, and repeating "null 1.46% against a real pair's 2.29%" as fact would reinstate
it — on the shipped four arms the pooled null max is +2.38%, above the pooled real-pair max of
+2.284%, and pair-B sits below the null besides. `tools/gates/tripwire.mjs`'s note is the model
for how to say this.

**The blind spot is part of the decision, not a defect in it.** Anything between the noise
ceiling and the bound is invisible. That is affordable **only because the class is a
multiple**: every performance defect in twenty goals was 2.07x, 3.9x or 6.6x, and not one
was a 10% creep. **If this project ever produces a drift-scale regression, this rule is the
thing that has to change** — not the bound inside it.

**AND THE DERIVATION MUST BE EXECUTED, NOT WRITTEN DOWN.** G-020b's first implementation
stored the campaign as **display strings that nothing read**, beside a hand-typed ceiling, and
checked the bound against `sqrt(ceiling x smallest)` — **arithmetic between three literals**.
Nudging the ceiling to 1.2000 and the bound to 1.5760, 8.3% looser, passed every check. So
"the measurement does the work" was true of the prose and false of the code. **The readings
must be numbers, the ceiling must be computed from them, and a probe must nudge a reading and
watch the bound move** — otherwise this ADR describes a rule the repository does not follow.
The first real run after that fix immediately caught a **round UP** in the transcription
(1.022840 recorded as 1.0229, putting the bound 0.007% above its own derivation), which is the
whole argument for removing the transcription step rather than correcting it.

**BUT ONLY ONE OF THE TWO INPUTS CAN BE EXECUTED, AND THAT IS A STATED LIMIT OF THIS ADR
RATHER THAN A DEFECT IN AN IMPLEMENTATION OF IT.** The noise ceiling is re-derivable on
demand: run the campaign, recompute. **`SMALLEST_KNOWN_REGRESSION` is not, and this has been
CHECKED rather than assumed.** The figure is G-012's shipped commit pair, and that pair is
unreachable by the instrument:

```
pnpm --silent sim:measure --head aa30218
  head  aa30218 feat(sim): the need vector and its decay (G-012, G-016)
  base  f43699d feat(sim): starting capital, a loan, and a balanced refund (G-011)
  INCOMPARABLE — an arm would not run: head-0: roomTypeServes is not a function
```

Re-run in G-020b round 2, and already on record at `GOALS.md:1606` and `JOURNAL.md:1304`:
**the instrument's reachable history starts at G-013**, and the only cross-session-durable
ratio this project has is on the wrong side of that line.

**So a bound placed by this rule is HALF-EXECUTED BY CONSTRUCTION** — the ceiling moves with a
re-measurement, the regression class cannot. **A reader re-deriving a bound under this ADR
needs to know that before they start.** It is here rather than in `PARKING.md` because
G-020b's first response parked it as a hypothesis with a falsification test, and `sim-critic`
found the test had already been answered twice, in two files the author had read. **A parked
test whose answer is already in the ledgers is not a hypothesis — it is an undischarged
finding.**

**WHAT TO DO WHEN THE REGRESSION CLASS GOES STALE**, since it cannot be re-measured: replace
it with a **newer** defect of the same class, measured as a commit pair the instrument can
reach, and cite that. Do not attempt to re-derive 2.07; it is a citation for good.

**THE REGIME A GATE RUNS IN UNDER CI IS NOT THE REGIME ITS BOUND WAS MEASURED IN, AND AT
G-020b IT IS UNOBSERVED.** The quiet campaign and the +9.73% loaded reading were both taken on
a **12-core developer machine, load = 12 busy processes**. `pnpm verify` also runs on a
**three-OS hosted matrix**, where the machine is a shared 2-4 vCPU runner and **the load is a
neighbouring tenant rather than a sibling gate**. An argument that "our gates run sequentially"
is a claim about this repository's scheduling and **not about the machine** — the same slot-2
substitution this project has already withdrawn a finding for, one level out.

**The honest position when the regime cannot be measured before shipping is: SHIP, STATE THE
REGIME AS UNOBSERVED, AND OWE THE OBSERVATION** — never a wider number nobody can source.
Widening a bound to cover an unmeasured regime is what the rule above forbids. **The cost of
being wrong is why it must be written down**: §9 forbids editing a gate to make it pass, so a
false red on `main` is an escalation, and §2.0 makes a third unreliable gate a stop condition.

**POOL WITHIN A CONFIGURATION; REPLACE ON A CONFIGURATION CHANGE.** Two clauses of this ADR
were in tension and neither said which governed: "run the campaign, recompute" reads as
REPLACE, and "every qualifying reading is an arm" reads as POOL. The rule:

- **Readings of the same quantity at the same shipped configuration ACCUMULATE.** That is the
  anti-curation property and it is the one worth keeping: a reading does not stop counting
  because it was filed under a different heading.
- **When the configuration changes — arm length, workload, hotel, instrument method — the
  campaign is RE-TAKEN AND REPLACES.** The old readings measure a different thing, and pooling
  them would mix two quantities under one name.

**AND POOLING CREATES A RATCHET, WHICH IS THE PRICE AND MUST BE BRAKED IN CODE.** A pooled max
is **monotone non-decreasing**, so a pooled ceiling — and therefore the bound — **can only ever
loosen.** G-020b's own 1.4550 -> 1.4557 is the first instance, and it rose **because more
readings were pooled, not because the instrument got noisier** — which is not what the
"degrades legibly" clause above attributes a rise to. Say which it was, every time.

`sim-critic` showed the hole: with the only executed brake being `BOUND < SMALLEST`, a ceiling
of 2.0600 and a self-consistent bound of 2.0649 **passed every check and shipped green — a 106%
"noise" figure.** The "too noisy to gate" clause was prose nothing executed.

**SO THE BRAKE MUST EXECUTE, AND ITS LIMIT MUST BE DERIVED.** Both margins equal
`sqrt(SMALLEST / CEILING)`, and the gate is worth having only while it can absorb one excursion
of the size the instrument has actually been observed producing — the worst loaded overshoot on
record. Hence `CEILING <= SMALLEST / (worst loaded overshoot)^2`, which at G-020b's figures is
`2.07 / 1.0973^2 = 1.7192`; the gate refuses to start above it, naming the instrument rather
than the bound. **It is a sanity brake and not a tight limit** — the shipped ceiling sits 1.68x
inside it and `BOUND < SMALLEST` remains the binding constraint in normal operation. What it
stops is the ratchet running quietly to absurdity.

**Scope.** It governs ratio bounds. It does not govern I5, whose budget is derived from a
requirement rather than from a measurement (§2.1.2) and therefore has no margin to eat.

---

## ADR-0016 — A SIGNAL bound is pinned to equality with its derivation, and refused beneath the worst reading observed
Date: 2026-08-10 · Context: G-020c, the scaling bounds leaving `pnpm test` · Decided by:
sim-engineer, to be verified by the orchestrator

**Decision.** A gate that compares a **signal ratio** against a bound places that bound at

```
BOUND == trunc(quiet median x 1.5, 4dp)          and          BOUND > max(every reading, every regime)
```

and **refuses to start** if either fails, in either direction. The first constraint is
G-010's rule, which ADR-0015 keeps for a signal; the second is new, and the equality is new.

**Why equality, when G-010 says "held at or below".** "At or below" leaves a RANGE, and this
project has twice discovered that a number chosen from inside a range is a number nobody can
source (§2.1) and a number a later editor can nudge (ADR-0015's 8.3% demonstration). At G-020c
every candidate inside the range was defensible and none was derivable. Pinning the constant to
equality removes the choice: the diff still shows the constant moving — which is why it stays
written out — but it can only move because a reading moved.

**Why a floor at all, and why it pools regimes.** ADR-0015's ceiling exists so a bound cannot
admit the class it catches. Nothing in it stops a bound being placed UNDER the instrument's own
spread, and that is exactly how `needs.scaling.test.ts` came to make I4 unreliable for five
goals: `BOUND = 2.5` against quiet readings of 2.5906, 2.6534 and 2.5903. **A bound beneath a
reading the instrument has already produced with nothing to find is not a tight gate, it is a
gate that fires on nothing** — §2.0's unreliable, not §2's red. The floor pools every regime
because ADR-0015's first principle is that the gate never fires on noise and **an observed
excursion counts whatever produced it**.

**The two constraints can cross, and the crossing is the useful output.** They were already
crossed on this repository's own history: **G-016's recorded median of 1.74 puts the ceiling
BELOW a quiet reading `sim-critic` observed on the shipped assertion.** That is not a
hypothetical about a future campaign; it is the state the incumbent bound was in when this ADR
was written, and it is why the floor is a refusal rather than a footnote.

**THE WORKED EXAMPLE THAT USED TO SIT HERE IS DELETED, AND THAT IS THE FINDING.** It stated a
gap between two constants and was **wrong three times in three drafts** — once with the numbers
swapped under the right descriptor, once with the descriptor kept over the wrong pair, and once
with a percentage off by a factor of ten in the correction itself. Three attempts, three
arithmetic errors, in a paragraph whose only job was to illustrate a rule the reader can apply
in one division. `budget.mjs` taught this repository the same lesson at G-018: **the derivation
belongs in code that executes, and prose should state the rule and stop.**
`tools/gates/scaling-bound.mjs` carries the readings, computes both constraints, and refuses
when they meet; `scaling.bound.test.ts` recomputes them and now parses the one cost table that
remains in prose. Anyone wanting the figures should read those, where they cannot go stale. When they cross the gate says **the instrument is too
noisy to gate this axis** and refuses; it does not widen, pick the looser constraint, or fall
back to the incumbent. **The pre-registered response is a change to the INSTRUMENT** — more
samples per reading — followed by a **re-taken campaign that REPLACES** (ADR-0015: a different
sample count is a different configuration, and a pooled max only ever rises).

**Which regime supplies which statistic, because this is the part a later editor will get
wrong.** ONE stated regime for the signal (the quiet arm); EVERY observed regime for the floor.
Taking the median from a loaded arm to widen the window is regime-mixing: under load these
ratios do not merely get noisier, **they move** — measured on four axes at G-020c, three of four
moved UP on the median and three of four moved UP on the max, which falsified the
"load can only push a ratio down" generalisation the previous bound rested on.

**What this does NOT govern.** A NOISE bound — ADR-0015's geometric rule owns those, and the
tell is unchanged: a perfect null of 1.0000 would yield 1.5000 under the rule above, so the
multiplier would be doing all the work. `check:tickcost` is a noise bound; `check:scaling`'s
four axes are signals. A gate that cannot say which it has does not yet know what it is
measuring.

---

## ADR-0017 — Needs are STOCKS, not tasks; and a stay ends by checkout or by dissatisfaction

**Human ruling, 2026-08-12, taken during G-023 PLAN and explicitly accepting that it re-opens
closed work: *"I'd rather make this decision now before we proceed much further as it seems like
the gameplay loop will be dependent upon it."***

### The context — what forced the question

G-023 needed a time budget for travel and the shipped content has **exactly zero**. The three
engagement needs sum to 480 ticks (`need-types.json`: 150 + 150 + 180), the lodging window is
480 ticks (`night_rest.satisfyTicks`), `night_rest` is served on every tick a guest holds a room,
and the guest departs the tick `night_rest` is met. So engagement work and the window it must fit
inside are the same 480 ticks, starting on the same tick, and **every tick in transit is a tick
stolen from engagement.**

**Measured both ways, orchestrator-run, `--days 30 --seed 7 --rooms 6 --amenities 5`:**

| arm | `guest_nourishment` |
|---|---|
| shipped content | 356 met, 0 unmet |
| `guest_nourishment.satisfyTicks` 180 → 181 | **0 met, 356 unmet** |
| `night_rest.satisfyTicks` 480 → 479 | **0 met, 356 unmet** |

Total, not gradual, and identical from both sides — it is a cliff, not a knife-edge. This is the
fourth appearance of one hypothesis: *the engagement vector sums to the lodging budget*, parked
at G-013 with its experiment, confirmed by G-017's recording, hit as a knife-edge at G-014a, and
arriving here as a wall.

**Three patches were offered to the human and all three patched the WINDOW.** The human rejected
the framing and removed the window instead. Recorded because the orchestrator's option set was
the smaller thought.

### The decision, in five parts

1. **A NEED IS A STOCK.** It has a level that decays over time and is refilled by being served.
   It is never "done". This deletes `progressRemaining`'s terminal semantics — today
   `needs.ts:86-95` makes zero **terminal** ("a met need is terminal, so `advanceNeeds` returns it
   by reference from then on"), which is what makes a need a task with a deadline.
2. **ACTIVITY DRAWS A STOCK DOWN.** Doing things costs rest; a guest that does a lot may want a
   nap. Eating tops nourishment up and it stays up, then decays. The loop is oscillation, not
   completion.
3. **REST REFILLS ONLY IN THE ROOM** (ruled earlier the same day, and it survives this change
   intact). Under stocks it carries no starvation consequence: a guest that stays out gets tired,
   which is the intended behaviour rather than a failure mode.
4. **A STAY ENDS TWO WAYS AND ONLY TWO.** (a) **Checkout**, after the guest's stay duration
   elapses. (b) **Dissatisfaction** — the guest gives up and leaves. There is no third
   terminator, and in particular a stay no longer ends because a need completed.
5. **THE MODEL MUST ADMIT TWO THINGS IT WILL NOT YET CONTAIN.** A **non-lodging guest** — one
   that holds no room, comes for a provider, pays and leaves (food, a gym, a spa, a pool) — and
   **per-personality tolerance**, so that the dissatisfaction threshold in (4b) is a parameter the
   model reads rather than a constant the code holds. **Both are structural admissions now; the
   archetypes and their content are M6** (`HOTELSIM.md` §8 already puts guest archetypes there).
   Hard-wiring "every guest lodges" or "every guest has the same patience" is what makes M6
   expensive later, and it is free to avoid today.

### What is NOT decided here, and must be derived rather than chosen

Decay rates, refill rates, the dissatisfaction threshold, and the stay duration are **content**
(I3, ADR-0003) and each needs a derivation from a stated requirement (§2.1, ADR-0007's third
amendment). This ADR fixes the model, not the numbers. **A number chosen to make the suite green
is the failure §9 names**, and it is the specific risk here because the old numbers were tuned
against a model that no longer exists.

### Consequences, stated rather than discovered

- **It re-opens behaviour from four M2 goals**, in a milestone signed off 2026-08-10: G-012's
  decay model, G-014a/b's utility inputs, G-015's outcome table, and G-019's reviews — the last
  two because "met / unmet" is a task-shaped tally with no stock-shaped meaning. The natural
  analogue is **time spent below a threshold**, which is arguably a better review signal than a
  count. **The human ruled the re-opening acceptable in advance**; it is recorded in
  `ESCALATIONS.md` rather than treated as drift.
- **`nightlyRatePence` becomes fixable.** ADR-0010 documents it as charged per *completed stay*
  rather than per night, giving a 10.2:1 margin where the field name implies 3.4:1, and declined
  to rename it because the permanent fixture would become a husk. A checkout-based terminator is
  what makes per-night charging expressible. **This ADR does not itself change the charge** —
  that is the money loop and belongs with M4 — but it removes the obstacle.
- **Every balance figure in the project moves.** Less costly than it sounds: they were already
  taken with `--rooms N` seeding ~75% extra opening capital, which is why M4 is blocked on
  scenario capital regardless (ADR-0013 §5).
- **G-023a is unaffected and stands.** Where a guest *is* does not depend on how needs work.
- **G-023b's blocker dissolves.** With no completion deadline, travel is time not spent doing
  something else — a trade-off, which is what M3 is for — rather than theft from a fixed budget.


---

## ADR-0018 — The loop is re-tuned for velocity, and a playable surface comes forward

**Human ruling, 2026-08-12**, in answer to a measured estimate that the remaining M2.5 + M3 work
was 7 goals, ~25,000 insertions and 16–20 critique sweeps: *"How can we speed that up — at this
rate it's going to take ~100 hours for the MVP"*, then *"I agree with all 6 — I also agree that
a playable surface is important sooner."*

**The measurement that prompted it.** The live ledgers had reached **10,034 lines** across seven
files, and every agent reads a large fraction of them before writing a line — G-023's PLAN agent
spent 281K tokens, its critic 176K, much of it re-deriving the same context. **The governance
had become a per-invocation tax proportional to the project's own history.**

### The six changes

1. **CLOSED MILESTONES ARE ARCHIVED.** `GOALS.md` 3,630 → 240 lines, `JOURNAL.md` 2,091 → 120,
   into `GOALS-ARCHIVE.md` and `JOURNAL-ARCHIVE.md`. **Nothing is edited in the move** (ADR-0008).
   *Verified before the move*: nothing reads a ledger programmatically except `tools/gates/stamp.mjs`,
   which requires the goal named in the as-of stamp to be marked `done` **in `GOALS.md` itself** —
   so the archive boundary is drawn to leave the stamped goal live, and `check:stamp` plus
   `ledger-stamp.test.ts` (21 tests) were run green after the split.
2. **THE §5.6 PLAN PASS IS TIERED.** Kept for any goal that changes behaviour or content; dropped
   for mechanical goals. It is not dropped wholesale, because it had just paid for itself
   spectacularly — it found G-023's BLOCKER before a line of code existed.
3. **WATCH VERDICTS ARE BATCHED.** Recorded per goal, watched by the human in one sitting, so a
   perceptual criterion no agent may discharge stops sitting on the critical path per goal.
4. **§4's ONE-GOAL-IN-PROGRESS RULE IS RELAXED to independent goals in parallel worktrees.**
   This is the largest single lever (~2×) and it is the one that trades rigour: the rule exists so
   no handover lands on a half-swept diff. **Permitted only where the goals' file sets are
   disjoint, and the orchestrator states the disjointness before starting the second.**
5. **G-024 AND G-025 MAY MERGE** — stairs and lifts are both "a queued shared resource with
   capacity", and the difference (direction, call ordering) may be content plus a policy rather
   than a second mechanism. **Put to the builder at PLAN rather than decided here**, because this
   project's history is unambiguous that fat goals cost sweeps.
6. **G-029 (a guest need not lodge) DEFERS TO M6** with the rest of the archetype work. The
   *structural admission* — lodging is optional, tolerance is a parameter the model reads — stays
   a constraint on G-027's design, which costs a paragraph rather than a goal.

### A playable surface comes forward, and what that supersedes

**`HOTELSIM.md:66`'s "apps/game may not be opened before M5" is superseded.** §9's stop condition
is unaffected and was never in the way: it names **M0** sign-off, which happened 2026-08-07.

**The argument, and it is evidence rather than preference.** Twenty-two goals in, nobody has
played this game. **ADR-0017 — the largest design change in the project — came from the human's
intuition about how the game should feel, not from any test**, and it arrived at goal 23 and
re-opened behaviour in four earlier goals. That is the real cost the estimate was measuring, and
it is not agent hours. **Design feedback is the scarce input, and playing is how it is generated.**

What the rigour did buy is stated too, because it is why this is a re-plan and not a repudiation:
determinism and twelve green gates are precisely why a need-model rewrite at goal 23 is safe
rather than terrifying.

**AN OBLIGATION FALLS DUE THE MOMENT `apps/game` OPENS.** `HOTELSIM.md:66` records that nothing
in `packages/content` can stop render code computing `ladder[i] / ladder[0]` and reintroducing
the speed-ladder-as-multiplier defect G-021 deleted; the instrument is **a source scan over
`apps/game`**, parked with its falsification test *because the directory was shut*. It is no
longer shut. **The scan ships with the first renderer goal, not after it** — a parked instrument
whose precondition has expired is ADR-0007's class waiting to happen.

**Sequencing, and the reason it is this way round.** G-023a (positions) → the playable surface →
**G-027 (the need model)**. The need model's four content numbers — decay rate, refill rate,
dissatisfaction threshold, stay duration — are exactly the kind that are tuned by feel, and
ADR-0017 warns that they have no old baseline to inherit because the model they were fitted to
will not exist. **Building the surface first is what lets those be chosen by playing rather than
by arguing.** The first renderer goal draws structure and position — rooms, guests, movement —
which is the part G-027 does not change.


---

## ADR-0019 — Parallel tracks need DISJOINT GATES, not just disjoint files; they join at VERIFY

**Orchestrator, 2026-08-12, amending ADR-0018 §4 within hours of writing it, because the
condition it stated was wrong and the first parallel pair proved it.**

**What ADR-0018 §4 said**: parallel tracks are permitted *"only where the goals' file sets are
disjoint, and the orchestrator states the disjointness before starting the second."* I stated it,
and it was true: track A (G-030) touched `apps/game`, `tools/gates` and docs; track B (G-023a)
touched `packages/sim` and `tools/viewer`. **No file was contended at any point.**

**What happened anyway.** Track B finished its round-1 fixes and could not obtain a green
`pnpm verify`: the `typecheck` row was red with **8 errors, every one in track A's in-progress
files**. `pnpm -r typecheck` is workspace-wide, and so, in their own ways, are `check:purity`
(depcruise over `packages apps tools`), `check:content`, `check:ladder` and `test`.

**THE CORRECTED CONDITION.** Disjoint files is **necessary and not sufficient**. The gates are
shared, and a gate is the thing a goal is measured by — so:

> **Two tracks may build in parallel. They cannot VERIFY in parallel, and neither commits until
> the shared gates are green for both.** Parallel tracks **join at VERIFY**.

**Why this is not a reason to stop running tracks in parallel.** The parallel window still buys
what it was ruled in for: track A built an entire renderer while track B went through a critique
round and its fixes. What it does not buy is independent *closure*, and pretending otherwise
would mean either committing on a partially-green gate — §9's shape — or redefining `verify` to
fit a scheduling decision, which is worse.

**What an orchestrator must state before starting a second track, replacing ADR-0018 §4's
sentence**: the disjoint file sets, **and** which shared gates the two tracks will contend for,
**and** the join order at VERIFY. A track whose gate contention is not stated up front is a track
whose VERIFY will be discovered rather than planned.

**A NOTE ON WHAT THIS COST, SO IT IS NOT REMEMBERED AS FREE.** Nothing, on this occasion — track A
was going back for legibility work anyway after WATCH #5, so the join was happening regardless.
**That is luck rather than design**, and it would have cost track B a real wait if the WATCH had
passed.


---

## ADR-0020 — `nightlyRatePence` is billed per STAY DURATION, and the trap has moved file

**Builder (`ai-engineer`) at G-027a BUILD, under ruling C. SUPERSEDES ADR-0010's ARITHMETIC and
edits none of it (ADR-0008: an artefact whose subject is the past is not rewritten).**

### What ADR-0010 said, and which half of it is now false

ADR-0010 recorded that `nightlyRatePence` is charged **once per completed stay**, that a stay was
`night_rest.satisfyTicks`, and therefore that

> effective revenue per room-day = `nightlyRatePence × (1440 / satisfyTicks)`

with the consequence a designer had to carry: **`satisfyTicks` is the dominant term in the margin,
and it lives in another file.** All of that was true of the era it describes.

**ADR-0017 deleted the premise.** A stay no longer ends when `night_rest` is met; it ends by
checkout after `stayDurationTicks`, or by the guest giving up. So:

- **the denominator is `stayDurationTicks`**, in `guest-rules.json`;
- **`night_rest.satisfyTicks` has no economic role at all.** It decides when a guest's rest need
  is met, and nothing else. Editing it moves pacing and the review distribution and moves revenue
  by nothing.

### The decision

1. **The live formula is `nightlyRatePence × (1440 / stayDurationTicks)`**, and it is stated in
   exactly two places in code: on `nightlyRatePence` in `roomTypeSchema`, and on
   `stayDurationTicksSchema` where the dominant term now lives. Both were false-and-sourced before
   this goal and both were corrected in the same commit (§5.8).
2. **THE TRAP MOVED FILE AND THE SIGN MOVED WITH IT.** ADR-0010's whole force was that the number
   which decides the hotel's margin was in a file nobody balancing revenue would open. That is
   still true and it is now a **different** file: `guest-rules.json`, whose subject is guest
   behaviour. A designer halving `stayDurationTicks` to make the game feel brisker doubles the
   hotel's income. `stayDurationTicksSchema` carries that warning in the field's own doc comment.
3. **The field is still not renamed and the billing model is still not changed.** ADR-0010's two
   refusals stand for their own reasons: renaming would move `SAVE_V1_CONTENT`'s shape and its
   `8e09fe4f0fa162a3` fingerprint (ADR-0006), and per-night proration is a pricing change and
   belongs to M4. What ADR-0017 promised — that a checkout terminator makes per-night charging
   *expressible* — is delivered; nobody has spent it.

### The margin, measured — and it is NOT the number this goal was briefed to expect

At the shipped numbers the NOMINAL margin is `8,500p` against `2,500p` of `nightlyUpkeepPence`:
**3.4 : 1, which is finally what the two field names imply**, where ADR-0010 measured 10.2 : 1.

**The REALISED figure is 9,066.7p per bedroom-day — 3.63 : 1, ABOVE the nominal ceiling — and the
reason is worth more than the number.** *What: total `roomRevenue` over bedroom-days. Workload:
`pnpm sim:run --days 30 --seed 42`, the shipped default — 3 bedrooms, one of each amenity, an
arrival every 120 ticks. Sample: one run. Aggregated: `816,000p / (30 days × 3 bedrooms)`. Regime:
none needed — this is a deterministic simulation output, byte-identical on any machine under I2,
not a stopwatch reading.*

**A room turns over slightly FASTER than once per stay duration**, because the stay clock runs from
ARRIVAL: a guest that queued 180 ticks for a room occupies it for 1,260 rather than 1,440, so a
busy hotel fits up to `1440/1260 = 1.14` stays per room-day. 96 completed stays over 90 bedroom-days
is 1.07.

**G-027a's brief predicted ~2.38 : 1 and that prediction is wrong, in the direction that matters.**
It came from ADR-0010's own `satisfyTicks 1440` sensitivity arm (5,957.5p per room-day), which was
measured under the model where a queued guest's stay began at CHECK-IN — so queueing lengthened a
guest's life and lowered throughput. It no longer does. **Anyone re-deriving the margin from
ADR-0010's table will be low by about half a band**, and that is exactly the kind of carry-over
this ADR exists to stop.

### What this cost, stated rather than discovered

**Every balance figure in the project moved, and none of them was repaired by touching a price.**
`room-types.json` and `economy.json` are **byte-identical** across G-027a — every value in both
asserted by `content.stay.test.ts` reading the shipped bytes (the whole room-type table, and all
five of the economy's numbers), and the bytes themselves by `git diff --exit-code` at VERIFY —
because the
cheapest way to make the balance goldens green was to raise `nightlyRatePence`, that is pricing,
that is M4's, and reaching for it inside a goal about guest behaviour is §9's stop condition. The
goldens moved instead, each with a note saying which way and why. The most visible: the G-008 build
arm builds **3 rooms where it built 10**, because a third of the revenue per room-day refuses far
more builds. That is the money loop telling the truth about a longer stay, and it is M4's to
answer.

---

## ADR-0021 — A benchmark constant is a PROXY for an axis, and the axis gets pinned

**Human ruling, 2026-08-12, during G-027a VERIFY, on an escalation from `ai-engineer` that
`check:tickcost` was red at 2.02x with `check:scaling` green.**

### The finding, measured rather than argued

`check:tickcost` compares the working tree against HEAD on a fixed workload. It read **2.02x**
against a 1.4557 bound. It was not a regression:

**THE RATIO IS THE FINDING AND THE ABSOLUTES ARE NOT** (`CLAUDE.md` rule 2). Stated first,
because the first draft of this ADR gave two ns/tick figures and derived its load-bearing claim
from them while citing none of sample count, aggregation or regime — three of the five slots, in
the same commit as ADR-0020 which names all five. `ai-critic` caught it.

**The finding: cost per guest-tick FELL by about a third**, while the paired per-tick ratio read
**1.98x**. *What: `sim:measure`'s head/base per-tick cost ratio, and the same quantity divided by
the concurrent guest count. Workload: 60 rooms / an arrival every 32 ticks / seed 42 / 30 days
(`workload.mjs`). Sample: 6 per arm, arms interleaved and alternating, warm-up discarded.
Aggregated: median per arm, ratio of medians. Regime: quiet, no deliberate concurrent load,
12-core developer machine (win32/12cpu).* The builder read **2.02x** independently on the same
regime, and the concurrent counts are exact simulation outputs rather than timings — 45 measured
(`in hotel 45`), 15 derived as 480/32.

| | concurrent guests | relative cost per guest-tick |
|---|---|---|
| HEAD | 15 *(derived, 480/32)* | 1.00 |
| G-027a | 45 *(measured)* | **~0.66** |

The absolute ns/tick readings behind that are deliberately not quoted: they are single-sitting
figures on one machine, and the same pair re-measured after the cadence change came back at less
than half the absolute while agreeing on the per-guest-tick direction (−40% against −34%), which
is rule 3's whole point. The tick was doing three times the guest-work
because ADR-0017 tripled the stay length, so the hotel held three times as many guests at the
same arrival cadence. `check:scaling` was green on all four axes throughout — complexity did not
move, quantity did.

### What had actually broken, and it was not the code

`workload.mjs` states its own axis: *"the honest axis is CONCURRENT GUESTS"*, and
`ARRIVAL_EVERY_TICKS` is documented as *"sets concurrent guests, which is what these measurements
actually measure."* Both sentences were true. **Neither was checked.**

`ARRIVAL_EVERY_TICKS = 32` was a PROXY for fifteen concurrent guests, and it was one only while a
stay was `night_rest.satisfyTicks` = 480. **G-027a redefined the benchmark from 15 to 45
concurrent without touching the constant, and nothing could say so.** A tripwire cannot
distinguish a regression from a workload redefinition; that is not a defect in the tripwire.

### The ruling

1. **`ARRIVAL_EVERY_TICKS` 32 -> 96.** `1440 / 96 = 15` restores the occupancy the bound campaign
   was calibrated against. **Predicted before the run and met exactly**: `--days 30 --seed 42
   --rooms 60 --arrivals 96` reports `in hotel 15` and `arrived 450` (`43,200 / 96`).
2. **THE BOUND DOES NOT MOVE.** 1.4557 stands. **Widening it was REFUSED**, and the reason is the
   whole of this ADR: a wider bound would have absorbed the reading and buried the fact that the
   benchmark's MEANING had changed. The gate would have gone green while measuring a different
   hotel than the one it was calibrated on — which is worse than a red gate, because it is a green
   one that has stopped being evidence.
3. **THE LITERAL STAYS A LITERAL.** `ARRIVAL_EVERY_TICKS` is not derived from content at runtime.
   This is a PAIRED RATIO gate: `measure.mjs` hands one `--arrivals` to both arms, and a constant
   that computed itself from content would let two arms built from two revisions run two different
   workloads. A stale literal is a comparability problem you can see; a self-adjusting one is one
   you cannot.
4. **THE AXIS IS PINNED MECHANICALLY, OVER EVERY CONSUMER — AND THE FIRST VERSION OF THIS
   CLAUSE WAS HALF TRUE.** `tools/headless/src/workload.concurrency.test.ts` asserts
   `stayDurationTicks / ARRIVAL_EVERY_TICKS === TARGET_CONCURRENT_GUESTS`, with 15 named as the
   calibrated target and sourced to the bound campaign. **The relationship now lives in an
   assertion rather than in a comment**, so the next such change reddens it by name instead of
   surfacing three gates downstream as a timing ratio nobody can attribute.

   **AS FIRST WRITTEN IT READ `workload.mjs` AND NOTHING ELSE, AND `ai-critic` found a SECOND
   COPY of the literal that this ADR had therefore left behind:** `scaling-arms.ts:32` held its
   own `ARRIVAL_EVERY_TICKS = 32` under a comment claiming it was the bench's hotel, so
   `check:scaling` went on measuring FORTY-FIVE concurrent guests against a campaign taken at
   fifteen. Its drift guard could not see it — the guard compares an arm fingerprint spelled in
   flags that are RENDERED FROM THE COPY IT IS GUARDING, which is G-018's duplicated-constant
   defect inside the check meant to catch it. `tripwire.mjs` refused only because this goal
   happened to move ITS literal.

   **THE RULING, EXTENDED: ONE LITERAL.** `scaling-arms.ts` imports the gate constant (through
   `workload.d.mts`, a declaration and not a build step), and the pin is over the value WHEREVER
   IT IS EXPORTED plus a source census that fails on a second copy **whether or not it has
   drifted yet** — which is the state `scaling-arms.ts` was in for a goal. The census
   immediately found a THIRD copy nobody had named, `needs3-arm.ts`, which is allowed one
   because `needs-history.mjs` copies that file into an extracted historical tree where
   `workload.mjs` does not exist; the exemption is checked rather than asserted.

`TARGET_CONCURRENT_GUESTS = 15` is **frozen, not derived**: it is a historical fact about a
measurement campaign, and re-deriving it would make the bound describe a hotel nobody calibrated
against (ADR-0008's argument, one artefact over).

### The consequence, which is NOT closed by this ADR

**`tripwire.mjs` AND `scaling.mjs` now both refuse to run**, each by its own ADR-0015 check —
the second only after the ruling above removed the duplicate literal that had been hiding its
drift. **That third red row is taken deliberately**, on this ADR's own words: the alternative is
knowingly shipping a gate that passes while measuring a different hotel, and a green gate that has
stopped being evidence is worse than a red one. The re-take goal covers BOTH campaigns, and
neither bound is touched.

`tripwire.mjs`'s refusal:

> THE BOUND CAMPAIGN WAS TAKEN AT A DIFFERENT CONFIGURATION.
> arrivalEveryTicks: campaign 32, shipped workload 96 — POOL within a configuration, REPLACE on a
> configuration change. RE-TAKE the campaign at the new configuration and replace the arms.

That is the gate working, and it collides with (2): **the bound is COMPUTED from the campaign
arms, so replacing them necessarily re-derives it.** Re-taking a four-arm interleaved campaign at
~36s a reading, plus its loaded-regime arm, is a goal's worth of measurement and a human decision
about the new ceiling. It is left open here rather than guessed at, and `ai-engineer` reports the
raw number the gate declined to render.

**AND ONE FACT THE RE-TAKE MUST FACE, because no cadence fixes it.** The two arms have different
stay lengths — 480 at base, 1,440 at head — so **no single `--arrivals` puts both arms at fifteen
concurrent guests.** Restoring head's occupancy un-restores base's: at 32 the pair was 45 against
15; at 96 it is 15 against 5. The 3:1 gap between arms is the same, mirrored. A paired-ratio
tripwire is not configuration-neutral across a content change that redefines occupancy, and the
campaign re-take is where that has to be answered rather than rediscovered.

---

## ADR-0022 — In a shared working tree, arms are MATERIALISED, never stashed

**Amends ADR-0019. Found by `ai-engineer` against its own work at G-027b θ-a's measurement
checkpoint, 2026-08-12 — and the first instance was the orchestrator's, earlier the same day.**

**What happened.** θ-a needed a HEAD arm for a paired measurement and used the mutation recipe's
`git stash push -u` / `git stash pop`. **It stashed and restored track A's in-progress G-031a
work as well** — `apps/game/*`, `README.md`, `PARKING.md` — because a stash takes the *tree*, not
the *author*. It restored cleanly. **But the `sha256` guard covered only the three files the
agent knew about**, so it could attest its own restore and not the other track's.

**The earlier instance was mine.** I isolated G-023a for commit with the same mechanism while
track A's agent was **dead** — which is why it was safe, and I said so at the time. The agent's
case is the same manoeuvre with the other track **live**.

### The rule

> **While two tracks share one working tree, a comparison arm is MATERIALISED — `tools/gates/lib/git-tree.mjs`, the route `measure.mjs` already uses — and never stashed.** A stash is
> scoped to the tree; a materialised tree is scoped to the commit. Only the second is safe when
> another author is writing.

**This does NOT weaken `CLAUDE.md`'s mutation recipe.** `git stash push -u` over
`git checkout --` remains correct, and for the reason it was written: **it is recoverable**. Four
agents once reached for the destructive form and it silently discarded unreviewed work each time.
What ADR-0019's parallel window adds is a **second** author, and recoverability is not the
property that matters when the thing being moved is someone else's in-flight edit — **scope is.**

### Why it is an ADR rather than a note

**The failure mode is invisible on success.** Both stashes popped cleanly, so nothing red ever
appeared; the only reason this is written down is that an agent audited the *coverage of its own
guard* rather than its outcome and noticed it had attested less than it appeared to. That is the
same shape as every scanner finding this session — **a check that passes while inspecting
something narrower than it claims** — arriving in a recovery mechanism instead of a gate.

**And the sha256 guard is not wrong, it is under-scoped.** The recipe says capture a hash and
compare after; it does not say *of what*. In a single-author tree "the files I touched" is the
right answer. In a shared tree it is the wrong one, and it fails silently in the reassuring
direction. **If a stash is genuinely unavoidable, the hash covers `git status --porcelain` in
full, not the author's own list.**

**Cost of the deferred alternative, stated**: materialising a tree is slower than a stash. That is
the whole price, and it buys the property that another author's uncommitted work is never in the
blast radius of a measurement.

## ADR-0023 — WATCH is discharged through `apps/game`; the viewer is a REPLAY instrument, not the picture of record

**Date**: 2026-08-13 · **Status**: accepted · **Amends**: ADR-0013 · **Raised by**: `ai-engineer`
at θ-a round-2 fixes, which correctly declined to decide it.

### The question

θ-a's round-2 pass added `drawLobbyFuse` to `apps/game/src/view/guest.ts` — a roomless guest's
`toleranceTicks` drawn as a shrinking bar under its feet. It did **not** add the fuse to
`tools/viewer/viewer.js`, on the grounds that the viewer is disposable and shrinking it is the
standing rule (§9). It then flagged the consequence rather than acting on it: **the two pictures
now differ, and ADR-0013 names the viewer as the instrument WATCH is discharged through.** A
human watching a recording would not see a mark a player would.

That is the right escalation. It is also a question the ledger should already have answered.

### The ruling

**The WATCH surface is `apps/game`. `tools/viewer` is a replay instrument for measurement and for
questions a live surface cannot answer; it is not the picture of record.**

### Why, and why this is a correction rather than a change

**It had already moved, and nobody wrote it down.** ADR-0013 named the viewer because, when it was
written, `apps/game` was shut and there was no other candidate. ADR-0018 then opened `apps/game`
by human ruling, and **all three of the human's WATCH verdicts since — *"reads quite difficult…
lots of washout of bars"*, *"reads much better, but I can only see one need"*, *"it reads"* — were
taken against `apps/game` at `localhost:5180`.** The practice changed at G-030 and the charter
kept describing the old arrangement for two goals.

**This is the same shape as the G-027b block that was split in dispatch and whole in the ledger**,
found by `ai-critic` in the same round: a decision made in the doing, correct in the doing, and
never written where the next reader looks. Two instances in one goal is a pattern, not a
coincidence.

> **When a practice moves and the ledger does not, the ledger does not become silent — it becomes
> WRONG, and it keeps being consulted.**

### What follows

1. **A WATCH obligation is discharged against `apps/game`**, and a frame reference means a frame
   of `apps/game` unless it says otherwise.
2. **The viewer does not grow features to keep pace with the game.** Divergence between the two
   pictures is *expected* and is not a defect. §9's rule stands with more force, not less: if the
   viewer acquires features or defenders, delete it.
3. **The viewer must still agree with the sim about anything it DOES draw.** Round 2's
   `isWantedWhileServed` transcription is the model: not "the viewer may drift", but "the viewer
   draws less, and what it draws is derived rather than guessed."
4. **ADR-0013's structural argument is untouched and is the reason this is safe.** The viewer
   cannot act, because it replays recorded frames through the save serialiser. `apps/game` is a
   live surface and *can* act — so a WATCH taken there is a reading of a hotel a player could have
   driven, which is a stronger observation, not a weaker one. **What ADR-0013 was protecting was
   "nobody has seen this game run", and that is discharged better by the thing a player sees.**

### The cost, stated

`apps/game` is heavier to stand up than a static replay page, and it needs a browser. Where a
question is answerable from recorded frames — counts, runs, distributions — **prefer the viewer or
a stepped harness**, and reserve the live surface for perceptual questions. This ADR moves the
picture of record; it does not claim the viewer is redundant.

## ADR-0024 — A defect CLASS is closed by ENUMERATION; sweeping finds instances and hides the size

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: ADR-0007 (a check that inspects
nothing is not a check), §7.1 (sweep budget) · **Raised by**: the orchestrator at θ-a sweep 3,
from five rounds of evidence.

### The evidence

θ-a's defect class R1 — *a derivation that outlives the model it was derived from* — was hunted
five times by four different actors. The yields, in order:

| pass | new sites found |
|---|---|
| PLAN | 5 (named in the plan) |
| sweep 1 | 3 more |
| sweep 2 | 8 more |
| the sweep-2 fix pass | **11 more files**, found by widening the grep |
| sweep 3 | 8 more |

**That is not a converging sequence, and it was never going to be.** Every pass grepped a slightly
different needle set over a slightly wider scope. Each one therefore **sampled** the class and
reported its sample as progress. The fix pass that found the most was the one that widened the
needle list — which is the tell: **the yield tracked the method, not the remaining defects.**

The sharpest single instance says the same thing from the other end. Sweep 3 found `needs.ts:239`'s
`unmet` docstring still describing two deleted fates — **one line below `:238`'s `met` docstring,
which that very diff had rewritten.** A sweep that reads a diff sees the line that changed. It does
not see the line that should have.

### The ruling

**When a defect is a CLASS rather than an instance, the first act is to enumerate the class and
publish its size. Fixing starts after the count exists, and the count is what the verification
checks.**

1. **Derive the needle set from the change itself** — the deleted identifiers, taken from the
   diffs — **not from the sites anyone has noticed.**
2. **Scan the whole surface**, not the diff. A stale claim's danger is unrelated to whether its
   file was touched.
3. **State the before-count and the after-count.** The after-count is the verification's subject.
   **A number nobody can check is worse than a large number.**
4. Only then fix: correct, or fence in past tense, or register as deliberate history.

### Why this is not just "sweep harder"

A sweep is bounded by a budget (three) **because sweeps are for finding what nobody predicted.**
A class is, by definition, predicted the moment its second instance appears. **Spending sweep
budget on a known class converts an open-ended search into a slow enumeration with a censoring
mechanism attached** — and the censor is that each round reports a number that looks like progress.

> **Sweeping tells you a class exists. Only enumeration tells you how big it is, and only a size
> can be driven to zero.**

### The corollary that saved the executable half

Half of R1 *was* closed, and by this rule rather than by hand: `deleted-vocabulary.test.ts` scans
live `Error` messages and test titles — **the two of the four first-contact surfaces that are
executable strings** — and it explicitly registers what it cannot see rather than letting silence
read as coverage. **A predicate can close the half of a class that is machine-readable. State the
other half as a named escape with its control**, which here is a human reading prose for tense.
Sweep 3 *was* that control running, and it came back positive — which is the escape working, not
failing.

### The cost, stated

Enumeration is front-loaded and feels slower: nobody fixes anything for the first stretch, and the
published count is usually embarrassing. **That is the point.** θ-a's alternative was five rounds
producing a number that never meant anything.

### OUTCOME, measured the same day — the rule paid on its first application

The enumeration ran immediately after this ADR was written, on the same tree sweep 3 had just
finished reading.

| | |
|---|---|
| sites sweep 3 found, by sweeping | **8** |
| present-tense sites the enumeration found, same tree | **31** |
| total occurrences of the deleted vocabulary | **407 lines / 70 files** → **392** after |

**The sweep found a quarter of what was there.** And the vocabulary itself was derived rather than
guessed — every identifier on a removed line of the diff with no live code referent left — which
surfaced two nobody had named (`assertStayFitsTheNeedTable`, `urgencyIn`) and **confirmed fourteen
others at zero**, which is the half of an enumeration that sweeping cannot produce at all: *proof
that a name is finished with.*

**The 23 extra sites are the argument.** Three of them sat inside prose that had already been
repaired for this exact class: `guests.ts:1529`'s `max(stay, patience)` **six lines below a correct
`max(stay, tolerance)` in the same docstring**; `utility.test.ts:102`'s *"`food` has less patience
than `fun`"* **twenty lines under the paragraph declaring that word is not carried**; and
`registry.ts:170` stating the **deleted** countdown margin bound as the live check. A reader
sweeping for the class had passed within a screen of each.

**And the sharpest instance was one prose cannot fence at all**: `patienceFractionOf`, live and
exported. Sweep 2 corrected every sentence around it and left the name. **An identifier has no past
tense** — it is either renamed or it is a lie. Renamed to `stockFractionOf`.

> **Corollary: when the class lives in names, fencing is not available. The only two moves are
> rename and delete.**

**The delta is 15, not 31, and the reason is not slippage**: a past-tense fence must name the field
it fences, so repairing a hit sometimes *adds* an occurrence. **That is why the count is published
with the grep that produces it rather than asserted** — a number whose movement needs an
explanation is only useful if the reader can re-run it. (Re-run by the orchestrator: **392**.)

## ADR-0025 — θ-b's seam is TAKEN; and a departure reason is the BUILD LOOP'S STEERING SIGNAL, so it gets two rows

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: §5.5 (seams), ADR-0024
(enumeration), ADR-0017 4(b), G-015 (departure reasons) · **Raised by**: `ai-engineer` at θ-b PLAN.

### 1. The seam is TAKEN. θ-b1 (the resident give-up) then θ-b2 (optional lodging).

§5.5 says a builder offering a seam gets it taken **or** gets a scored prediction of what declining
costs. **This one is taken, and it is not close.** The builder applied ADR-0024 at PLAN — enumerated
the lodging-assumption population before writing the plan, from a needle set derived from the change
rather than from the sites anyone had noticed:

> **25 candidate sites. The block names 4.**

**Six times the estimate**, and the block's 4 was itself a correction of ADR-0018 §6's "a paragraph".
That is the third time this one sub-goal has been mispriced, each time by someone reading a list
instead of counting a population.

**And one of the 25 is a hole, not a guard.** `guests.ts:1550` requires `lodgingRoom !== null` to
check out. Under lodging-free content a guest can never check out (it holds no room) and never give
up (that path needs a lodging need). **It lives forever.** Optional lodging is therefore not four
guards being relaxed — it needs the checkout branch re-keyed to the clock with payment, and only
payment, conditioned on a room. Two more unnamed: `content.ts:978`'s `assertEveryStayCanEnd` early-
returns on the stated ground that lodging-free content *"has no guest that could be stuck"*, **a
sentence that becomes false the moment a guest can arrive under it**; and `guests.ts:587` returns 0
for an undefined need, so `countStuckGuests` would report **every** guest stuck and fail the run.

The halves also differ in everything that makes a goal one goal: **θ-b1 carries a schema bump (v14)
and no new content; θ-b2 carries no schema and a whole new content shape.** The critic's frame
differs too — *when does a guest give up* against *what does the code assume exists*.

**θ-b1 goes first**, because it has the sharper proving arm and hands θ-b2 the terminator a
lodging-free guest will need.

### 2. TWO departure rows, not one. The builder recommended one and invited adjudication.

The builder's case for one row is real: `GUEST_DEPARTURE_REASONS`'s own docstring says `gaveUpWaiting`
*"lost its second word … the moment ADR-0017 4(b)'s dissatisfaction threshold lands"*, and a second
row costs a save-migration table row, a summary-schema bump and an `isCutShort` case.

**Overruled, on the loop rather than on the cost.** G-015 split `evictedRoomGone` from
`evictedRoomUnusable` because they are *"different events to a player"*. Apply that test here:

| the guest left because | what the player should build |
|---|---|
| nobody would give it a room | **more rooms** |
| it had a bed and nothing to do | **more amenities** |

**Those are opposite instructions.** One counter averages them into a number that tells a player
they are doing badly and not which lever to pull — and the build loop is one of the project's three
named loops, the one every feature must feed. **A departure reason is not bookkeeping; it is the
steering signal.**

The argument is stronger, not weaker, for being made now: **AXIS 1 is currently inverted** — one room
scores 3.90 against twelve rooms' 3.58 — so the build loop's *other* signal is already reading
backwards pending G-028. Collapsing these two rows would remove the one remaining direct reading of
*which* scarcity is biting.

**The docstring is not evidence against this.** It was written pre-4(b), predicting a merge that
nobody had yet tested against the loop. That is R1's shape — a derivation outliving its model — and
this ADR is its correction, not its violation.

### 3. What is NOT ruled here

The builder proposes **no bind-time refusal** for the reachability bound (`ageAtGiveUp ≤ stayDuration`),
buying it back with an executed two-sided boundary test over the shipped bytes instead, on the ground
that content where a stay ends before anything runs dry is a short stay rather than a bug. **Accepted
as reasoned, and left to the critic to object to** — it is exactly the trade `assertLodgingBecomesWanted`
went the other way on, and the difference (a dead rule versus a guest stuck forever) is stated.

## ADR-0026 — Dissatisfaction is a STOCK, not a run. The plan is sent back, not built.

**Date**: 2026-08-13 · **Status**: accepted · **Supersedes**: θ-b1's planned design ·
**Relates to**: ADR-0017 (needs are stocks), ADR-0021, ADR-0024, ADR-0025 · **Raised by**:
`ai-critic` at plan review, **before any code existed** — which is what §5.6 is for.

### The measurement that decides it

A provider serves **one guest at a time** (`guests.ts:679`; queues are M3's G-024). Closed form on
shipped bytes: an engagement need fills from its want line in 420/7 = 60 ticks and re-wants 420
ticks later, so **one provider sustains 480/60 = 8 concurrent guests.** `--amenities 1` seeds one
comfort and one entertainment provider **regardless of `--rooms`**. Above that throughput, waiting
is unbounded, so every excess guest crosses **any** tolerance.

| concurrent | max empty run | would give up |
|---|---|---|
| 8.06 | 124 | **0 of 246 (0 %)** |
| 8.44 | 460 | **200 of 258 (77.5 %)** |
| 14.77 — the I5 bench hotel | 460 | **426 of 450 (94.7 %)** |

**A 4.7 % change in occupancy moves walkouts from 0 % to 77.5 %.** And the tolerance parameter is
nearly inert: swept 180 → 459, the evicted population moves **7 %**. What decides everything is
**providers-per-guest**, and nothing in content binding or in any gate can see that quantity —
`assertNeedDemandIsServiceable` bounds one guest's own time budget and says so.

### The ruling

**A guest's dissatisfaction is a STOCK.** It fills while a need is empty and **drains while needs
are served**, and the guest leaves when it saturates. It is not a consecutive-tick run.

**Why this is the answer and not a patch.** θ-a's whole thesis is that a need is a level that
decays and refills, never a countdown that completes. **The planned give-up rule reintroduced a
countdown** — `starvedTicks`, incremented and reset to zero — one goal after the project deleted
countdowns from the need model, and the reset-to-zero is exactly what makes it a step function: a
guest that gets dinner once has its history erased, so the rule can only ever ask *"is this hotel
saturated right now"*.

> **A binary predicate over a saturating resource has no graded region to be tuned in. The cliff
> was not in the threshold; it was in the shape of the counter.**

A stock has the graded region by construction: a guest that occasionally misses dinner accumulates
some dissatisfaction and recovers, and one that never eats saturates. **The same content that
produces 0 % and 77.5 % on either side of 8.06 concurrent produces a spread under a stock**, which
is what makes the number a design dial rather than a coin toss.

### What this obliges, and what it does not

1. **The rule is `dissatisfaction`, a stock with a fill rate, a drain rate and a ceiling.** Its
   numbers get **derived from a stated requirement** — which also discharges MAJOR 3, the finding
   that θ-a *predicted in writing*: `toleranceTicksSchema` says 180 was preserved for the lobby-wait
   axis and warned that 4(b) *"is what will ask this number to serve a second axis it was never
   calibrated for."* **The resident axis gets its own field. It does not borrow 180.**
2. **`workload.concurrency.test.ts` is fenced IN θ-b1's OWN COMMIT, not deferred.** ADR-0021 §2
   already ruled that a green gate which has stopped being evidence is worse than a red one, and
   the assertion `stayDurationTicks / ARRIVAL_EVERY_TICKS === 15` would stay green while measured
   occupancy fell to ~12. **Deferring also hands the instrument goal an unrepairable premise**: once
   effective stay is emergent, `stay / arrivals` is not occupancy *in principle*, so no new literal
   fixes it. Assert the **measured** occupancy — the CLI already prints `in hotel`.
3. **ADR-0024 applies to this goal's own class, and the count comes first.** Two of the sites are
   **live `bindContent` error messages** asserting *"a guest that holds a room can never give up"* —
   the proposition θ-b1 falsifies, on the executable surface a predicate can close. First-pass
   needles already return 10 hits / 5 files and 15 hits / 8 files against a plan naming a list.
4. **v14 carries TWO schema changes.** ADR-0025 §2's second departure row must be **inserted at a
   fixed position by the migration** with its own era argument and frozen literal, because
   `assertGuestOutcomes` refuses a table whose row count or order differs. The plan's era argument
   covered only the new field. **`pnpm test:save` cannot pass without it.**
5. **The WATCH and the three-platform CI criteria are restored** — the plan dropped both, in the
   goal that produces *the most visible behaviour change this project has attempted*: a guest
   walking out mid-stay. The recording arm is the **over-subscribed** one, not `--amenities 0`,
   because the provider cliff is what a watcher would see.

### Corrections the review made to the plan's own arithmetic, kept because they will be re-derived

The closed form is off by one in both terms: measured **980 / 1,159**, not 981 / 1,161, because the
branch compares `>=` and step 4 decays before step 6. On `guest.stay.test.ts`'s fixture, **45 and
84**, not 46 and 86. The margin conclusion is unchanged. It matters because the criteria promise an
*executed* two-sided boundary test, and the temptation on a red assertion is to read the number off
the run.

**And one column of the plan's table does not reproduce.** The per-need figures do — `night_rest`
208, nourishment 129, comfort 60, entertainment 60 — so the wanted-unserved predicate is still
correctly rejected. But the *"residents ≥ 180"* column reads 198 under either natural reading where
the plan reported 6, and *"it evicts 175 of 198 at one-of-each"* rests on it. **The conclusion
survives on the per-need figure alone; the column is withdrawn rather than restated.**

### What is NOT ruled here

Whether a hotel *should* haemorrhage guests when oversubscribed. It probably should — that is the
build loop telling a player they added rooms without adding amenities. **The objection is to the
step function, not to the consequence.** The graded form is also what G-024's queues will need, and
G-028's outcome table is already stock-shaped, so all three converge.

## ADR-0025 AMENDMENT — the summary bump named in §2 was WRONG, and the builder caught it against the shipped policy

**Date**: 2026-08-13 · **Amends**: ADR-0025 §2 · **Raised by**: `ai-engineer` at θ-b1's plan revision.

ADR-0025 §2 listed *"a summary-schema bump for the reason strings"* among the costs of ruling two
departure rows. **That cost does not exist.** `report.ts:355-386` states the shipped policy in as
many words: *"an ADDITIVE block or field does NOT bump this. A removal, a rename, or a type change
DOES."* A sixth departure row is additive — nothing renamed, nothing removed, every v3 `reason`
string still present and still meaning what it meant. The v2 bump removed three fields; the v3 bump
renamed two values; **neither reading reaches an insertion.** `SUMMARY_SCHEMA_VERSION` stays **3**.

**How I got it wrong, because the mechanism is the reusable part**: I priced the ruling from the
*shape of the change* — "a new row is a schema change, schemas get bumped" — rather than from the
policy the schema actually publishes. **I did not re-read the policy before naming it as a cost.**
That is R1's shape pointed at myself: a rule of thumb outliving the document that would have
corrected it, in an ADR written the same week the project ruled that documents outlive their models.

**The ruling itself is unaffected** — two rows was argued on the build loop, not on the price — but
an ADR that overstates a cost makes the *next* reader weigh the trade wrongly, so the correction
matters more than the arithmetic.

**Guarded rather than asserted**: a test pins that every v3 reason string still resolves in the
v4-shaped document, so a future *rename* is still caught. And note the asymmetry, which is
`SUMMARY_SCHEMA_VERSION`'s own and worth stating: **a SAVE bump is owed for any field, because old
bytes must still load; a report is generated fresh every run.**

## ADR-0026 AMENDMENT — a guest's own excursion is NOT the hotel letting it down

**Date**: 2026-08-13 · **Amends**: ADR-0026 · **Raised by**: `ai-critic` at θ-b1 sweep 1, **with a
frame reference** (ADR-0013 §3).

### The frame

`--days 5 --seed 7 --rooms 6 --amenities 1`, tick **6428**: guest 50 is inside `hotel_cafe` #15,
engaged on `guest_nourishment`, dissatisfaction **546**. It sat down at tick 6382 and its
nourishment deficit has fallen from ~449 to 118 — **it is 13 ticks from finishing its meal.**
Tick 6429: gone.

> **A watcher sees a guest walk into the café, get served, and vanish mid-meal.**

**It is the dominant case, not a corner: 210 of 224 walkouts (94 %) happen while the guest is
being served.**

### The mechanism, which is the part worth ruling on

At 6428 the guest's comfort, entertainment and nourishment are all **below** the want line. The
only wanted-unserved need is **`night_rest`** — unserved *because the guest went out to eat*.

**That is not a bug in the rest model; it is ADR-0017 §2, designed in on purpose**: being busy is
the only thing that costs rest. θ-b1's `wantsSomethingUnserved` then charges that cost **to the
hotel**. Measured share of fill-ticks driven *only* by the lodging need while the guest is engaged
at a provider, 30 days, seed 7:

| | |
|---|---|
| `--rooms 6 --amenities 1` | 8.7 % |
| `--rooms 6 --amenities 5` | **48.4 %** |

**In a hotel that works, half the dissatisfaction is the guest's own dinner trip — and no amount of
building removes it.** A stock that cannot be paid down by playing well is not a design dial.

### The ruling, both halves

1. **The lodging need does not contribute to dissatisfaction while the guest is legitimately away.**
   The three-cell decay law ADR-0017 shipped already says rest is *expected* to be unserved when a
   guest is out; charging that to the hotel **double-counts a cost the model deliberately imposed
   elsewhere.** The hotel is culpable for a need it will not serve, not for one the guest has
   chosen to leave behind.
2. **The departure branch does not fire on a tick the guest is engaged at a provider.** A guest
   that is *being served right now* is not one the hotel is failing, whatever its accumulated
   stock. It leaves when it is next at liberty. This is one condition and it removes the
   mid-meal vanish, which is the perceptual half.

**Both are needed.** (1) alone leaves walkouts landing mid-service for the other needs; (2) alone
leaves the stock still filling from the guest's own excursions, so a well-provisioned hotel would
keep evicting.

### Why this is an amendment and not a new decision

ADR-0026 ruled the *shape* of the counter — a stock, not a run — and that ruling stands and was
right. **What it did not specify is what the stock counts**, and the build's answer ("anything
wanted that nothing is serving") swept in a cost the design had already charged somewhere else.

> **A stock is only a design dial if playing well can pay it down. If some of its fill is
> structural, the dial has a floor nobody can see, and the number that looks like patience is
> partly a constant.**

### Also withdrawn here, because it is the same class

The build reported I2's hash as `9e76bf0fb27494cb → 02aa190bb4ef2267`. **It does not reproduce.**
`pnpm test:determinism` **at the tree of 2026-08-13 sweep 1** returned `7f6ab9ec42bd2c88`, verified
by the orchestrator across two invocations of three processes. The orchestrator **repeated the bad
number to the human** before checking it. **Withdrawn, not restated** (CLAUDE.md rule 5) — G-020a's
exact shape, *a figure cited as belonging to a tree that never held it*, aimed at the project's
central tripwire and one REFLECT away from being written into three digests.

**AND THE CORRECTION ITSELF THEN COMMITTED THE SAME CLASS, ONE LAYER DOWN — found by `ai-critic` at
sweep 2, in the paragraph above.** It was written *"on this tree returns"*, **present tense**, about
a hash. The next fix pass moved it, and the sentence went on asserting. **ADR-0008's rule, in the
document that exists to correct a misattributed number**: an artefact describing the past must not
track the present.

> **A hash is never a property of "this tree". It is a property of a tree, at a moment, under a
> named instrument — and a correction that omits the moment inherits the defect it is correcting.**

**The real diagnosis, which is the durable part**: `02aa190bb4ef2267` was **not fabricated and not
wrong**. It is the CLI's `sim:run --ticks 100000 --seed 42 --quiet`, a *different instrument* from
the `commandLog` harness `test:determinism` drives. An "after" from one was paired against a
"before" from the other. **Slot one — what the number is a measurement OF — and that is this goal's
third instance, two of them the orchestrator's.**

Readings are therefore recorded **as pairs taken in one sitting, each naming its instrument**, and
carry no claim about any later tree:

| instrument | before (HEAD) | after (sweep-1 fixes) |
|---|---|---|
| `test:determinism` — harness over `commandLog` | `9e76bf0fb27494cb` | `21938e08d179c60c` |
| `sim:run --ticks 100000 --seed 42 --quiet` — CLI | `a2cc127cac5c8450` | `51f2bab2206f57de` |

Both "after" figures independently reproduced by the orchestrator. **The harness figure moves for
two causes — the state shape, and this goal editing `determinism-log.ts` itself — and they are not
separated anywhere in the tree.** That separation is owed before REFLECT.

## ADR-0027 — A REPAIR INHERITS THE OBLIGATIONS OF WHAT IT REPLACES

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: ADR-0007 (a check that inspects
nothing), ADR-0024 (enumerate, don't sweep) · **Raised by**: `ai-engineer` **against itself**, at
θ-b1's sweep-3 fix pass, and confirmed by `ai-critic` at verification.

### The class

> **A repair that is correct about its own subject, and silently drops a property the thing it
> replaced was carrying.**

The builder named it unprompted, about its own work: *"Both were caught by the instruments rather
than by me reading my own diff."* It is written here because **three instances landed in a single
round**, and the third was found by looking for it.

| # | the repair | what it dropped |
|---|---|---|
| 1 | the anti-vacuity arm rewritten to assert *"unread by the stock model"* field by field | it stopped resting on `simHash` equality, so **the mask's own certification evaporated** — with the mask removed the new arm stayed green |
| 2 | `review.report.test.ts:627`'s comment re-taken to θ-b1's figures | **the `it(...)` TITLE fourteen lines above** still states the θ-a pair, unfenced, where vitest prints it |
| 3 | whole-world `simHash` equality replaced by four named stock-model fields | `reviewOutcomes` at `SERVED_ARM` is now **asserted nowhere** — the row is true and unpinned |

And the same shape, earlier, in other goals: θ-a's `unmet` docstring left standing **one line below**
a `met` docstring the same diff rewrote; and `patienceFractionOf` renamed while **its own reference
179 lines away** was left behind.

### Why it is not just carelessness

**A repair has a subject, and attention follows the subject.** The author of a fix is, by
construction, thinking about the thing being fixed — so the properties most likely to be dropped
are the ones the *old* code was carrying **incidentally**: a precondition that made an assertion
mean something, a second assertion that rode on the first, a title that duplicated a comment.
**None of those is in the author's field of view, because none of them is the defect.**

That is also why it survives review: a critic verifying a fix reads the fix against the finding,
and the dropped property was not in the finding either.

### The rule

**When replacing a check, an assertion or a claim, enumerate what the old one was asserting before
writing the new one — and state which of those properties the replacement still carries.**

Concretely:
1. **A replaced assertion owes an accounting of the old one's coverage**, not only of the new one's
   correctness. *"Does my new test pass"* is the wrong question; *"what did the old test forbid
   that mine now permits"* is the right one.
2. **Where the dropped property was load-bearing, it gets its own case** — as the mask now does:
   fingerprints must differ, worlds must be equal once blanked, and **only then** does hash
   equality mean the mask did the work. **Precondition asserted, not assumed.**
3. **A repair to prose sweeps every surface carrying the same claim in that file** — title,
   comment, header, message — because duplication across surfaces is exactly what makes the
   dropped copy invisible.

### Its relationship to ADR-0024, which is not obvious and matters

ADR-0024 says enumerate the class rather than sample it. **This is the same rule pointed backwards
in time**: ADR-0024 enumerates the *sites a defect reaches*; this enumerates the *properties a
replaced thing held*. Both exist because **the mind's default is to work from the list in front of
it**, and in both cases the list is the sample somebody happened to notice.

θ-b1 demonstrates both in one goal: the figure enumeration (`547` → 0, `3.39` → 0) worked and
**still missed `review.report.test.ts:613`, because it enumerated a list of FIGURES rather than the
class of claims** — found by the critic reading for the class instead.

> **Enumerating a list is not enumerating a class. The list is always the part somebody noticed.**
