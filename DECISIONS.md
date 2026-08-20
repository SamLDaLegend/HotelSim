# DECISIONS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-16, G-034a is done: the grid has a third axis, save v17, and the shipped plot stays ONE ROW DEEP so the goal changes no behaviour — only the hash. Fourteen rows green, every row re-run by the orchestrator. The plan review found two BLOCKERs before any code, and the BUILD then corrected the plan review: floor-ASCENDING is the precondition, floor-FIRST is a convention, and it ships labelled as one. Unreliable: 0 gates, 0 defects.*

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
- **ADR-0043 (human ruling, 2026-08-14) is the governing entry for M3's shape**: sweep 3 is a
  **scanner by default** (sweeps 1–2 and plan review untouched) · the **instrument track is capped**
  after G-032b/c, debts deferred to an M3-exit goal in G-022's shape — **except a debt that makes a
  gate stop being evidence, which escalates rather than defers** · **an ADR reaching a SECOND
  amendment was wrong, not incomplete**, and is restated once with the originals struck.
- **STRUCK, do not cite**: ADR-0036 + 2 amendments → **ADR-0044** · ADR-0037 + 2 amendments →
  **ADR-0045**. Six banners in place. ADR-0025 and ADR-0028 restate only if cited again.
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

## ADR-0025 AMENDMENT 2 — §1's "θ-b2 carries no schema" was wrong, and the builder named it rather than quietly paying it

**Date**: 2026-08-13 · **Amends**: ADR-0025 §1 · **Raised by**: `ai-engineer` at θ-b2 PLAN.

ADR-0025 §1's seam table said **θ-b1 carries the schema bump and θ-b2 carries none.** θ-b2's plan
argues for a **seventh departure row, `visitEnded`, at index 1, and save v15.** The contradiction
is named here because ADR-0025's *first* amendment set that precedent: **an ADR that misprices a
cost makes the next reader weigh the trade wrongly, and the correction matters more than the
arithmetic.** Second time in one ADR; both times the builder caught it against the shipped policy.

### Why the row, and it turns on a criterion being vacuous

The block's law is `lodgingNeedOf(content) !== undefined ⇒ revenue === checkedOut`, **else
`revenue === 0`**. The second clause is **structurally true and was true before this goal existed**:
`reserve` (`guests.ts:2064`) gates room acquisition on `lodgingNeedId !== undefined`, so under
lodging-free content no guest holds a room and `payForStay` is unreachable. **Measured on the arm
with none of θ-b2's code written: 45 arrivals, 23 departures, roomRevenue transactions 0.**

> **A criterion that already passes at HEAD is not a criterion for this goal.** ADR-0007's sixth
> amendment, in the exit criteria rather than in a test.

And the alternative is worse than vacuous. If the visitor is filed under `checkedOut`, then
`report.ts:1601`'s `revenueTransactions === checkedOutStays` **must become content-conditioned** —
and it would stop looking **exactly on the code path this goal adds.** `guests.ts:487-512` says in
as many words that this is *the one cross-subsystem witness the outcome table has*, and that what
it catches is a departure misfiled between `checkedOut` and any other row. **Conditioning it away
is ADR-0027's class — a replacement better at its own subject that drops what the old one carried
— located in a criterion instead of a test.**

With a seventh row the law stays **unconditional and non-vacuous on both content shapes**, and
`revenue === 0` becomes a *consequence a mutation can falsify* rather than an axiom nothing can
move. There is also a naming argument: `checkedOut`'s docstring means *"the clock ran out **in a
room**"*, and ADR-0024's corollary is that when the class lives in a name, the only moves are
rename and delete.

### The ruling: CONDITIONALLY ACCEPTED, and the condition is an experiment the plan already names

**Criterion 3 decides it, not me.** Mutate the visitor's departure to file under `checkedOut` on a
materialised arm: **under the seventh row the revenue law goes RED; under the block's
content-conditioned form it stays GREEN.** If it stays green under the row too, **the row is wrong
and θ-b2 takes the block's form.**

**Run it before writing the migration.** This is the right shape for a disagreement between an ADR
and a plan: not an adjudication, but a one-run experiment whose outcome both parties agreed to in
advance. **`SUMMARY_SCHEMA_VERSION` stays 3** — additive, per amendment 1's policy.

### And the enumeration moved again

ADR-0018 §6 priced optional lodging at **a paragraph**; the block corrected it to **four guards**;
θ-b's plan enumerated **25**; θ-b2's plan, re-run after θ-b1 changed the tree, reports **37
behavioural sites** plus a 933-line identifier census. **Four estimates, each larger, each made by
someone reading the previous list.** The only one produced by counting a population rather than
reading a list is the one that keeps growing — which is ADR-0024's point, and the reason the
growth is evidence of method rather than of scope creep.

## ADR-0028 — θ-b2's four rulings, made BEFORE BUILD because each costs a sweep if it surfaces after

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: ADR-0023, ADR-0025 §2 + amendment 2,
ADR-0026 + amendment, ADR-0027 · **Raised by**: `ai-critic` at θ-b2 plan review — **two BLOCKERs
and five MAJORs before any code existed.**

### 1. THE VISIT TERMINATOR DEFERS WHILE THE GUEST IS ENGAGED

The plan's terminator is an **unconditional clock**, modelled on `checkedOut` at `guests.ts:1745`
rather than on the dissatisfaction branch at `:1816-1820`, **which carries `guest.engagement ===
null` precisely because ADR-0026's amendment put it there.** Measured on the arm with the
terminator installed:

| configuration | visits ended | **engaged at departure** |
|---|---|---|
| 1 provider/need, arrivals/60 | 236 | **236 (100 %)** |
| 1 provider/need, arrivals/30 | 473 | **471 (99.6 %)** |
| 3 providers/need, arrivals/60 | 236 | 0 — *the derived case* |

**That is the café frame at tick 6428 again, at a higher rate than the 94 % that forced the
amendment** — and it is ADR-0027's class for the third goal running: **the plan carried the clock
and dropped the deferral the branch beside it already had.** The bound survives (step 5 releases
on full, so `visit + ceil(maxCapacity/refill) + 1` is still attained for `countStuckGuests`).

> **The derivation is uncontended. The terminator is not. A number derived in the free-flow case
> must say so, or it will be read as a claim about the loaded one.**

### 2. THE CEILING MUST BE STRICTLY BELOW THE VISIT DURATION, OR THE WALKOUT ROW IS DEAD

**A visitor's dissatisfaction cannot exceed its age.** With the terminator at ~209 and the shipped
ceiling at 431, `leftDissatisfied` is **structurally unreachable** for lodging-free content.
Measured:

| configuration | visitEnded | leftDissatisfied | mean let-down ticks |
|---|---|---|---|
| 1 provider, arrivals/30 | 473 | **0** | **209.0 of 209 — let down on every tick** |
| 1 provider, arrivals/60 | 236 | **0** | 171.0 |
| 3 providers, arrivals/60 | 236 | **0** | 49.0 |

**The starved food court and the working one report the identical row and the identical count.**
That is exactly the failure ADR-0025 §2 spent a schema row to prevent — *"build more amenities"*
made unsayable — **arriving through the row this goal adds.** `assertDissatisfactionOutlastsTheLobby`
passes trivially here (431 > 180) while saying nothing about the case that matters.

**Ruled**: a **mirror refusal** — under content with no lodging need,
`dissatisfactionCapacityTicks` must be **strictly less than `visitDurationTicks`** — plus a fixture
that picks a ceiling under the duration and an arm asserting **non-zero `leftDissatisfied` in the
busy food court.** `content.ts:1137-1142`'s own rule applies: **loud failures get a boundary test;
silent misfilings get a refusal.** This is a silent misfiling.

### 3. THE DURATION IS 208, AND THE `+1` WAS ATTRIBUTED TO THE WRONG MECHANISM

Measured, uncontended: **`VISIT=208` departs at age 208 with the last need exactly full**
(deficits `[148,79,0]`); `209` departs at `[149,80,1]`, already decaying. The plan's transitions
*"2/62/131/210"* are **post-step tick counters**; the guest's **ages** are 0/60/129/208. Service
begins on the tick after arrival and runs contiguously, so **the completion age is the sum of the
service ticks: 60 + 69 + 79 = 208.** The arrival tick costs nothing the sum does not carry.

**`maxGuestLifetimeTicks`'s `+1` is a different term entirely** — it makes `limit` the *first age no
correct simulation can produce*, so `>=` counts the first illegal age and nothing before it.
Copying it into a **duration** makes the visitor furniture for one tick. **The consequence today is
one idle tick; the defect is the derivation**, and a term attributed to the wrong mechanism is how
the same figure gets re-derived wrongly next time. **208, with the correct warrant.**

### 4. θ-b2's WATCH IS DISCHARGED AGAINST `tools/viewer` — a stated ADR-0023 exception

`apps/game` **imports the shipped JSON statically through the bundler; there is no
content-selection path**, and `scenario.ts:78` carries a second throwing `lodgingRoomTypeOf`. So
**the goal that produces a guest arriving, eating and going home has no surface a human can watch
it on.** ADR-0023 made `apps/game` the picture of record; that ruling assumed one content set.

**Ruled**: θ-b2's WATCH is taken on a `--record`ed `--content <dir>` run **through `tools/viewer`**,
which is what the viewer's replay-through-the-save-serialiser design is for. **This is an exception
with a reason, not a retreat** — ADR-0023 §4 rests on *"nobody has seen this game run"*, and a
replay of a hotel `apps/game` cannot construct still discharges that better than nothing.
**Giving `apps/game` a content switch is real scope and drags `scenario.ts:78` in; it belongs to
whichever goal ships a second content set for real.**

### 5. SCOPE: THE GOAL STAYS WHOLE AND SHEDS THE CENSUS REPAIRS

The critic answers *"is this the right size for three sweeps"* with **no**, and offers a seam at the
departure row. **I decline that seam** — it costs *a whole goal's worth of visitor departures filed
under a row known to be wrong*, and ruling 2 has just shown that misfiling this particular row is
the failure mode with the highest blast radius.

**I take the critic's other suggestion instead: the two censuses' REPAIRS leave this goal.**
Publish the counts per ADR-0024 — that is the part that must happen at PLAN — and repair the
933-line identifier census and the 372-line claim census in the instrument-debt goal. **The
row-count claim class stays**, because θ-b2 is what invalidates it, and it is **nine live sites,
not seven** — the two the plan missed are **code, not prose** (`addDepartures`'s five positional
parameters, and `guests.ts:334`'s type-error claim). The twelve era-fenced *"five rows"* sites
**stay at twelve; a sweep that repairs them has damaged history.**

### What this review cost and what it bought

**Two BLOCKERs, five MAJORs and three MINORs, none of which required a line of code to exist.**
§5.6 is the cheapest moment in the loop and this is the second consecutive goal where it has
rebuilt the design. θ-b1's plan review saved a rule that would have evicted 77 % of a working
hotel's guests; θ-b2's has saved one that would have made every visitor vanish mid-meal **and**
made the amenity-scarcity signal unsayable.

## ADR-0028 AMENDMENT — §1's bound was LOOSE and §2's refusal was ONE-SIDED. Both raised by the builder, against the ADR written to correct its plan.

**Date**: 2026-08-13 · **Amends**: ADR-0028 §1, §2 · **Raised by**: `ai-engineer` at θ-b2 plan
revision 2, **with the measurements attached.**

### §1's bound — accepted, tightened from 409 to 299

I stated the deferred bound as `visit + ceil(maxCapacity/refill) + 1` = 208 + 200 + 1 = **409**.
Measured maximum deferred age across four contention regimes up to 45 concurrent guests per
provider: **296, 297, 297, 297.** Respected, and **never approached.**

**That is the one property `countStuckGuests` cannot afford.** Its entire warrant (`guests.ts:659`,
`:719-725`) is that the bound is **ATTAINED** — *"a measurement with no slack hiding inside it"*.
**A 112-tick slack hides exactly the class the function exists to catch.**

The correct derivation: **a need's deficit while engaged during a visit is at most
`wantLine + visit`, not `capacityTicks`** — 1,400 is unreachable inside a 208-tick visit.

```
visit + ceil((wantLine + visit) / refill_min) + 1  =  208 + ceil(628/7) + 1  =  299
```

Measured **297** against 299. **Accepted. The arm asserts the bound is attained, not merely
respected.** My error was reaching for the widest safe number instead of the reachable one — which
is the same slot-1 mistake in a different costume: **I bounded a quantity the model cannot produce.**

### §2's refusal — accepted, made two-sided

I ruled `dissatisfactionCapacityTicks < visitDurationTicks`. **That admits ceilings that break the
working food court.** Sweep, arrivals/30, 14,400 ticks:

| ceiling | working (3/need) | starved (1/need) | |
|---|---|---|---|
| 431 | 0 | **0** | row **DEAD** — the finding §2 was written for |
| **181 … 207** | **0** | **143 … 164** | **discriminates throughout** |
| **104, 60** | **476, 478** | 475, 478 | row **SATURATED** — every visitor walks out of a *working* hotel |

**104 and 60 satisfy my refusal and are broken.** And the lower bound is **derivable from the same
fold, not chosen**: a lone visitor in an empty, fully-provisioned food court still accumulates
**129** ticks of let-down, because it can only be served one thing at a time.

```
uncontended peak let-down = Σ_{i<n} t_i = 60 + 69 = 129 = visitDurationTicks − t_last = 208 − 79
```

**That is ADR-0026 amendment's own sentence, one field over**: *a stock is only a design dial if
playing well can pay it down; if some of its fill is structural, the dial has a floor nobody can
see.* **A ceiling at or below 129 puts the dial under its floor.** I ruled the ceiling against the
visit's *length* and never asked what the visit's *floor* was — **the identical omission I had just
ruled against in §1.**

**Accepted**: the refusal becomes `visitDurationTicks − t_last < ceiling < visitDurationTicks`.
The existing `toleranceTicks` chain narrows it to **[181, 207]** for free, and **all four corners
measured 0 working / 143–164 starved.** The fixture takes **190**, and the builder states plainly
that 190 is **a dial inside a derived window, not a derived constant** — ADR-0013 §4 forbids
manufacturing a derivation for a number that is tuned by play.

### And a discipline worth recording, because the builder applied it against itself

ADR-0028 §1 cites **100 % / 99.6 %** engaged-at-departure. The builder's own arm reads **49.8 % /
97.5 %** — its arm files under `gaveUp` and seeds three room types per amenity level, so **the
populations are not the same measurement.** Its ruling: *"The ratio is the finding; I cite mine and
leave the review's standing on its own instrument."*

> **Two instruments that agree in direction and differ in magnitude have not disagreed. Pooling
> them would be the error; replacing one with the other would be a second.** CLAUDE.md rule 4,
> applied by the party who would have benefited from the louder number.

**Both censuses reproduce exactly** (933 / 96 and 372 / 79). **The row-count class is ELEVEN, not
nine** — the two beyond my list are `outcome.report.test.ts:243`'s **executable
`expect(reasons).toHaveLength(6)`** and `outcome.test.ts:249`'s title, where *"sixth"* means *one
beyond the real five* and must become *seventh*. And the era-fenced *"five rows"* set is **13, not
12, with two sites DUAL-CLASS** — one sentence in both classes. **The builder publishes the needle
rather than the number**, which is ADR-0024's own rule turned on a count I had asserted.

## ADR-0028 AMENDMENT 2 — the attainment ruling was applied to ONE term and not to the `max` that selects it; and θ-b2 does NOT discharge ADR-0026's owed separation

**Date**: 2026-08-13 · **Amends**: ADR-0028 §1 and its first amendment · **Raised by**:
`ai-critic` at θ-b2 sweep 1.

### The attainment ruling had a hole one function wide

Amendment 1 tightened the deferred bound 409 → 299 because *"a 112-tick slack hides exactly the
class the function exists to catch"*, and `countStuckGuests`' entire warrant is **attainment**.
**That reasoning was applied to the visit term and never to the `max` that chooses between terms.**

`maxGuestLifetimeTicks` returns `max(stay, tolerance, visit) + 1`. The shipped food-court fixture
declares `stayDurationTicks: 1440` — deliberately, and marked *"KEPT, THOUGH NO GUEST HERE CAN
REACH IT"* — so **the stay term wins the `max` on lodging-free content and the visit term never
stands alone.** Measured through the real loader, `--rooms 0 --amenities 1`, arrivals/30:

| | |
|---|---|
| `maxGuestLifetimeTicks(FOOD_COURT, …)` | **1441** |
| observed oldest guest age | **275** |
| **slack** | **1166** |

**Ten times the slack the amendment refused, in the same commit.** And it is not a fixture quirk:
`guestRulesSchema` makes `stayDurationTicks` **required on disk**, so *every* food-court document
written through the real loader gets the loose bound. The consequence is live — **a visitor the
simulation has genuinely stopped progressing goes unreported by `countStuckGuests`, and therefore
unrefused by `emitReport`, for 1,441 ticks: nearly seven visit durations, on the one content shape
this goal exists to enable.**

`guests.ts:780` states the premise that would make it correct — *"such content has no stay to
bound, so the visit term stands alone"* — and **that premise is false of the fixture in the same
commit.** `:783`'s *"loose in the direction that cannot hide a leak"* is precisely the phrasing
amendment 1 refused.

**Ruled**: the term is **selected by the same fact branch 6b selects the terminator by**, not
maxed over inapplicable-but-declared terms. A blanket `max` over terms that are required on disk
regardless of applicability is not conservative — **it is unfalsifiable.**

### And the attainment evidence pointed at a file that does not carry it

`guest.visit.test.ts:310` declines to assert attainment on the synthetic fixture — **correctly**,
because a tolerance there would be a number chosen to make the arm green — and routes it to
*"`visit.content.test.ts`, which measures over the content that actually ships"*. **That file never
imports `maxGuestLifetimeTicks`, computes no maximum guest age, and contains neither 297 nor 299.
Neither figure is an executed assertion anywhere in the tree.**

So amendment 1's accepted condition — *"the arm asserts the bound is attained, not merely
respected"* — **is unmet, and the sentence claiming otherwise is ADR-0007's fifth amendment: a
comment offered as evidence, carrying a figure no test pins.** Write the arm (it goes red today,
which is the point) or withdraw the sentence and record the cost.

### THE ORCHESTRATOR'S ERROR: θ-b2 does not discharge ADR-0026's owed separation, and I said it did

I briefed θ-b2 that its I2 argument *"discharges the separation ADR-0026's amendment left owing"*.
**It does not.** The owed item is that **θ-b1's** harness figure moved for two causes — the state
shape **and** θ-b1 editing `determinism-log.ts` itself — never separated in the tree.
**`determinism-log.ts` is untouched by θ-b2, so θ-b2 simply does not have that confound. Not having
a confound is not resolving one.** The debt stays open and **must not be marked paid at REFLECT.**

The code comment was more careful than my brief: it separates **shape from behaviour**, which is a
real control with a real unmoved outcome block. **I read a correct claim as a different, larger
claim** — slot one, on a debt rather than on a number, which is a new costume for the same error.

### Owed to `PARKING.md`, from the WATCH

`tools/viewer/serve.mjs:19` serves `packages/content/data` from a **hard-coded path**, so a
`--content <dir>` recording is drawn against the **shipped** tables. Benign here only because the
fixture is shipped-content-minus-two-rows; **a genuinely different food court would render magenta
bars with nothing saying why.** ADR-0028 §4 routes this goal's WATCH through that instrument, so
the exception now carries a caveat: **it is sound for content that is a subset of the shipped
tables and unsound otherwise.** Files beside the `apps/game` content-switch entry.

## ADR-0029 — A NAP IS A FIXED-DURATION ACTIVITY; A SLEEPING GUEST IS NEVER IDLE; AN AWAKE GUEST IDLE IN ITS ROOM IS FINE

**Date**: 2026-08-13 · **Status**: accepted · **HUMAN RULING** · **Relates to**: ADR-0017 (needs
are stocks), ADR-0013 (perceptual criteria), ADR-0026 + amendment.

### What was asked and what was answered

The human was asked whether a guest going to bed three times a day reads as *resting* or as *a guest
that cannot decide*. The answer, verbatim:

> *"Napping should count as resting yes. It should be fixed time and there shouldn't be idleness
> whilst sleeping/napping, but reasonable for a guest to be idle in the room."*

**Note what that is not.** It is not a re-ratification of the earlier "Resting" verdict — it is the
first time the question has been answered against a picture in which a napping guest is not drawn
as idle. **The earlier ruling was given against a build where a guest asleep in its own room drew
as IDLE for 58 % of its nap.** This ruling supersedes it and stands on its own.

### The three clauses, each with what it obliges

**1. A NAP IS FIXED TIME.** Today rest is a stock that refills at `refillPerTick` until the need
stops being wanted, so **a nap's length is a function of how depleted rest was** — it varies run to
run and guest to guest. The ruling makes the nap a **discrete activity with a duration**, the way
an engagement is. *Owed*: a derivation for that duration from a stated requirement (ADR-0013 §4),
and a statement of what happens when a fixed nap ends with rest still below its want line.

**2. A SLEEPING GUEST IS NEVER IDLE — in the drawing AND in the metric.** These are two obligations
and both are live:
- **Drawing**: `apps/game` and `tools/viewer` must show sleeping as sleeping. The predicate repair
  at θ-a already stopped a napping guest reading as IDLE; **this ruling makes that a requirement
  rather than a bug fix, so it gets an assertion.**
- **Metric**: **every idle-share and idle-run figure in this project must exclude sleeping guests.**
  That reaches `PARKING.md`'s idle hypothesis, `stock.idle.test.ts`, and **G-028's falsification
  threshold X, which is written against `idleShareBasisPoints`.**

**3. AN AWAKE GUEST IDLE IN ITS OWN ROOM IS ACCEPTABLE.** This is the clause that retires work
rather than creating it. WATCH #8's *"a room-holder is motionless 64.9 % of the time"* was carried
as a concern; **under this ruling it is not a defect** provided the motionless guest is resting or
is in its own room. **What remains a defect is a guest idle in the LOBBY or a public space with
needs it cannot get met** — which is the provider cliff, and is G-024's queues.

> **The idle metric was measuring three different things under one name: sleeping, waiting at home,
> and stranded in public. Only the third is a defect, and it is the one the number was never
> isolating.**

### Why this is larger than it looks

**It re-scopes a number G-028 was going to be judged on.** `idleShareBasisPoints` currently folds
all three populations together, so **X — the ceiling G-028's criterion tests against — is a
threshold on a quantity this ruling says is not the quantity of interest.** G-028 must re-derive it
over the third population alone, or state why not.

**And it settles an open contradiction rather than adding one.** θ-a's withdrawn *"two-thirds of
the sitting-still is gone"* failed because the share moved when standing-in-your-room was
reclassified as resting. **Under this ruling that reclassification is not an artefact to correct
for — it is the correct classification**, and the reason the share was the wrong statistic is that
it was pooling populations the design treats differently.

### Not decided here

Whether a fixed nap that ends with rest below its want line triggers another nap immediately (which
would read as the dithering the original question was about), or leaves the guest short until its
next opportunity. **That is a perceptual question and it needs a picture, not an argument.**

## ADR-0030 — G-028 REPAIRS THE LADDER BEFORE THE SCORER; and §7.1's guard is RENAMED, not re-scoped

**Date**: 2026-08-13 · **Status**: accepted · **HUMAN RULINGS (two)** · **Relates to**: ADR-0024,
§7.1's 2026-08-09 split ruling and its 2026-08-08 scored prediction.

### 1. AXIS 1: the instrument is repaired before the scorer. Human ruling.

G-028's first job has stood as *"repair AXIS 1's reversal"* — i.e. rewrite the review function.
**The evidence says the review function may be telling the truth:**

| configuration | mean review |
|---|---|
| 1 room | 391 |
| 12 rooms, 1 amenity | 378 |
| **12 rooms, 2 amenities** | **420** |

One provider sustains roughly **8 concurrent guests** (`guests.ts:679` — one at a time, queues are
G-024's), and **the test ladder adds rooms while holding amenities at one.** So the ladder is not
building bigger hotels; it is building **progressively worse-provisioned ones**, and a score that
falls is correct.

**Ruled**: **G-028 repairs the ladder first, and only then asks whether the scorer is wrong.**
The provisioning is **derived** — one of each amenity per ~8 concurrent guests — not chosen. If the
ladder reads monotone afterwards, **the scorer needs no repair and G-028's budget goes elsewhere.**

> **A goal whose first job is "fix the thing the instrument is complaining about" should first ask
> whether the instrument is complaining correctly.** ADR-0024's shape, one level up: the list in
> front of you is the part somebody noticed.

**And θ-b2 sharpens the provisioning rule rather than merely confirming it**: a *visitor* occupies
a provider for 208 of its 208 ticks where a lodger sleeps most of its day — **roughly 8× tighter**.
The ladder's derivation must therefore be per-population, not a single constant.

### 2. §7.1's guard is RENAMED. The 2026-08-08 prediction is DISCHARGED — as half right.

Seven firings: **six prose, one code.** The prediction said that if firings stayed prose, the guard
*"is a prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND
RE-SCOPED."* **Human ruling: rename, do not re-scope.**

**The scope is right and the nickname was wrong.** What the arm actually catches is **not prose
that reads badly**. It is:
- an `it(...)` **title** stating superseded figures, where the runner prints them;
- an assertion **silently unpinned** by a rewrite;
- a live `Error` message asserting a proposition the build falsifies;
- a comment cited **as evidence** carrying a figure no test pins.

**Every one is a claim that has lost its pin.** The 2026-08-09 ruling already gave it the right
name — **UNPINNED-CLAIM ESCALATION** — and then everyone, this orchestrator included, went on
calling it "the prose arm" in every discussion, including the ADRs recording its firings.

**Ruled**: the arm is **`UNPINNED-CLAIM`**; the other is **`CODE`**. **The word "prose" is retired
from §7.1**, because it invited exactly the reading that made the prediction fire — that these
findings are cosmetic. **They are not: two of θ-b2's were false statements about shipped content,
and one was a withdrawn figure surviving in the docstring of the function its withdrawal was
about.**

> **A mechanism named for its most common symptom will be judged by that symptom. Name it for what
> it tests.**

**The prediction is scored and closed**: right that the name was wrong, wrong that the scope was.
**Its own instruction — record each firing with its subject — is what made the distinction
visible**, which is the argument for scored predictions rather than for this particular one.

## ADR-0031 — THE FOLD MUST NOT BECOME A SECOND SIMULATOR. Narrow its domain and refuse outside it.

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: ADR-0024, ADR-0027, §9 (*"if it
acquires features or defenders, delete it rather than defend it"*) · **Raised by**: `ai-critic` at
θ-b2 sweep 3, four MAJORs that are one problem.

### The pattern across three sweeps

`visitRoundTicks` predicts, analytically, the order and timing in which a visitor's needs get
served — and that prediction sets **both endpoints of a bind-time refusal.** Each sweep has found
it missing one more thing the simulation actually does:

| sweep | what the fold did not reproduce |
|---|---|
| 1 | it walked ascending id; the sim picks by pressure |
| 2 | *(repaired — the fold now reproduces `reserve`'s choice)* |
| 3 | **it does not clamp the deficit at `capacityTicks`, and the sim does** (`needs.ts:702`) |
| 3 | **it models only `reserve`'s UNENGAGED pass** — an engaged guest can be taken by a challenger clearing `abandonMarginBasisPoints`, and the fold has no term for the margin at all |

Measured on content the two new guards **admit**: needs reach full at ages 601 / 635 / 669, so the
true window is **(635, 669)**; the fold derives **(810, …)**. **Disjoint.** And with the *shipped*
abandon margin the visitor **abandons a need at age 59, makes 62 engagement switches, and that need
is never full in its entire 1,000-tick life** — against a fold claiming one clean round with each
need served exactly once. On a third table the refusal prints *"must sit strictly inside (810, 669)"*
— **an empty window: no ceiling whatsoever binds.**

`assertVisitRoundIsOneCycle` is green through all of it, because no need is served twice *in the
fold*. **The sweep-2 guard cannot see the sweep-3 class**, and there is no reason to think a
sweep-3 guard would see a sweep-4 one.

### The ruling

**The fold's domain is NARROWED and ENFORCED. It does not grow a clamp, a margin term, or a
preemption model.**

Each of those additions is individually correct and jointly fatal: **a function that reproduces
selection, saturation, preemption and timing is a simulator**, and this project already has one.
Building a second inside `bindContent` is §9's shape one level over from the render layer — and
unlike the viewer, this one would be **load-bearing on a refusal**, so it could not be deleted
later without also deleting the guard.

> **A predictor that must track a simulation to stay correct is a simulation. The escape is not a
> better predictor — it is a smaller domain, stated and refused at the boundary.**

**What θ-b2 ships**: the fold applies to content where its assumptions **hold**, and `bindContent`
**refuses** content where they do not — no need saturating while queued behind a longer service, and
a margin that cannot preempt within a round. **Refusing content nobody has written costs nothing;
mis-analysing it costs a silent wrong window**, which is the failure the refusal exists to prevent.

### And the duplicated fold is deleted, not synchronised

`visit.content.test.ts:48`'s `roundOf` is a **second copy**, and it is the **pre-sweep-2** one —
its docstring claims it is *"the same fold … so the criterion and the refusal cannot describe
different hotels"*, and it returns **73/10/63** where the shipped fold returns **70/34/36**. **They
already do describe different hotels.** It is green only because both live content sets are uniform
across their engagement needs, **which is the same reason the original defect shipped.**

**Export the fold from `packages/sim` and have the criterion call it.** ADR-0024's rule about names:
when the class lives in a duplicated decision, the moves are *call the original* or *delete* — not
*keep them in step*.

### The prose instance, and it is the fourth in one goal

`content.ts:1513-1530` — the fold's **own** domain block still describes the deleted ascending-order
version, **present tense, immediately above the repaired code**, including *"in an order this fold
cannot produce"* (it produces it) and *"no arm in this repository could have seen it"* (an arm
asserts it). **The repair swept the sibling function's docstring and left the subject function's
own** — the one a reader consults to decide whether the fold is safe to trust.

**ADR-0027 §3, four times in one goal, by the author who wrote the rule's evidence.** That is not a
discipline failure; it is the strongest argument yet that **the sweep is the wrong instrument for
this class and the enumeration is the right one.**

## ADR-0032 — VELOCITY: what is actually consuming the loop, and the four changes

**Date**: 2026-08-13 · **Status**: accepted · **HUMAN RULING**: *"We really need to be speeding up
development here, we should be past M3 by now."* · **Relates to**: ADR-0018 (the first velocity
pass), ADR-0019 (parallel tracks), ADR-0024, ADR-0027.

### Where the rounds went, from this milestone's own record

Three goals closed or nearly closed today, each running **3 sweeps plus 1–2 verifications** — the
maximum the budget allows, every time. Sorting the findings by what they were:

| pass | what it caught | value |
|---|---|---|
| **PLAN REVIEW** | **two designs killed before any code** — a rule that would have evicted 77 % of a working hotel's guests, and one that made every visitor vanish mid-meal | **highest in the project, and the cheapest** |
| **sweep 1** | real code defects — vacuous checks, an unfalsifiable bound, a fold that mispredicts the simulation | high |
| **sweeps 2–3** | **overwhelmingly one class: a number moved and the prose that mentions it did not** | low per round, and it is where the budget goes |

**The loop is not slow because it is careful. It is slow because sweeps 2 and 3 are mostly spent
re-reading English.** θ-a's five passes on one prose class is the extreme case; θ-b1's *"the cliff
moved and the prose did not follow — eight times in one sweep"* is the same thing.

*(Stated as a reading of the record, not a measurement. Nobody has counted findings by class, and
the honest version of this claim would.)*

### 1. NO DERIVED FIGURE APPEARS IN PROSE. Read it from the assertion, or omit it.

**This is the single largest lever and it removes the class rather than detecting it.** Every
instance this milestone — 208, 547, 431, 129, 297, 3.37, "six rows", "the four above", "FOUR
departure branches" — is a **derived number spelled into a comment or a test title**, where nothing
can keep it honest.

The repair the builders converged on independently is **de-numeralling**: say *"every row"*, not
*"all six rows"*; cite the assertion, not its value. **Where a figure genuinely must appear in
prose, it is read out of the shipped bytes or the refusal's own message** — θ-b2 did this for a
recovered range and it is the model.

> **A number in prose is a claim with no pin. Either the code says it or nobody does.**

### 2. GOALS THAT ARE NAMES ONLY ARE NOT GOALS

**`G-027c` and `G-031b` occur exactly once in the ledger — inside a list of goals not started.** No
statement, no criteria, no owner. **They have been counted in "M2.5 is nine goals" and in every
estimate of what remains**, and nobody can say what either is for.

**Ruled**: a goal with no block is **not counted**. M2.5 is **seven goals with four done**, not nine
with four done, until someone writes a statement and exit criteria for those two. **If a statement
cannot be written, the goal does not exist and the slot closes.**

### 3. THE REMAINING GOALS RUN IN PARALLEL

ADR-0019 already permits it and θ-a ran alongside G-031a successfully. **G-028 (economy) and the
render work touch disjoint subsystems and disjoint gates.** Sequencing them is habit, not a
constraint. **The join is at VERIFY, as ADR-0019 specifies.**

### 4. PLAN REVIEWS STAY. SWEEP 3 IS ON NOTICE.

**Do not cut the plan review to go faster** — it is the cheapest round in the loop and has twice
saved a goal from shipping a design that measurement destroyed. **What is on notice is sweep 3**:
if change 1 lands and sweep 3 still returns mostly unpinned-claim findings, the third sweep is
buying prose quality at a code-review price, and it should become a scanner rather than an agent.

### What this does not change

The findings the sweeps produce are real and several were serious. **Nothing here trades correctness
for pace** — it removes a category of work by making it unwritable, closes two goals that never
existed, and stops sequencing work that has no reason to be sequential.

## ADR-0033 — THE BUILD LOOP'S REVIEW SIGNAL IS ABSENT, NOT INVERTED. G-028 is re-aimed and made smaller.

**Date**: 2026-08-13 · **Status**: accepted · **Relates to**: ADR-0030 §1 (ladder before scorer),
ADR-0032 (velocity) · **Raised by**: `balance-critic`, one measurement pass, no diff.

### ADR-0030's ordering is VINDICATED, and its verdict rule did not fire

The human ruled the ladder is repaired before the scorer. **That was right and it paid**: with
amenities scaled to a derived rule, **the endpoint inversion disappears — 12 rooms reads 420
against one room's 391.** A goal that had gone straight at the scorer would have been rewriting a
function whose sign was being set by its harness.

**But "monotone ⇒ the scorer is exonerated" does not fire.** The re-read is *not* monotone (rung 2
sits at 376, below rung 1), and the surviving gap is **0.29 of a band where the criterion demands
more than 1.00.**

### The provisioning rule, derived rather than chosen

**`N_lodger = refillPerTick + 1 = 8`**, and it falls out of **flow conservation**, not out of the
cycle length: over a closed cycle a need's decay equals its refill, so the served fraction is
`1/(1 + refillPerTick)` — **independent of capacity and want line.** `N_lobby = toleranceTicks / 60
= 3`. `N_visitor = visitDurationTicks / 60 = 3.47`. Hence `M = ceil(L/8 + Q/3)` **at the converged
load**, and that last clause is load-bearing: `ceil` alone has two fixed points at twelve rooms,
because **a starved hotel suppresses the very concurrency the rule is measured on.**

Validated against the simulation rather than asserted: predicted comfort-provider occupancy
**0.9837** against measured **0.9824**. The derivation is a **floor** — under contention a guest
arrives at a provider with a deeper deficit and holds it longer, so demand runs ~10 % above it.

### THE BLOCKER: the review is a one-tick snapshot of a phase-locked population

Every guest arrives on a fixed cadence and stays exactly `stayDurationTicks`, so **every guest
departs at the same phase of the same deterministic need cycle.** Measured at 12 rooms / 3
amenities: **all 348 room-holding departures leave with `guest_comfort` at exactly the want line**,
so the satisfied test is false for the entire hotel and the run collapses to a point mass.

> **One tick moves the whole population a whole band.**

| hotel | `--arrivals` 119 / 120 / 121 / 127 | spread |
|---|---|---|
| 12 rooms, 2 amenities | 500 / 420 / 411 / 441 | **0.89 band** |
| 6 rooms, 2 amenities | 436 / 418 / 418 / 415 | 0.21 |
| 1 room, 1 amenity | 391 / 391 / 391 / 390 | 0.01 |

**The noise exceeds the signal on exactly the rungs the axis compares** — effect 0.29 band, top-rung
phase spread 0.89. **At `--arrivals 119` G-019's AXIS 1 criterion PASSES (1.09 band); at 120 it
fails.** Whether the criterion holds turns on a one-tick change in a cadence nobody derived. Sibling
symptom, same cause: **going from 2 amenities to 3 LOWERS the mean** (418 → 400). *More provision,
worse review.*

### And with BOTH axes scaled, the signal is not inverted — it is missing

The ladder holds `--arrivals` at 120, and `stayDurationTicks / 120 = 12` **caps the population**, so
it cannot test a bigger hotel above twelve rooms at all. `scaling-arms.ts` already carries the
ruling that a room ladder must scale arrivals with rooms, with `PARKING.md`'s correction that a
reading taken without it *"was worthless"*. **AXIS 1's ladder is the same defect, unfixed.**

Scaling both: **400 / 400 / 401 / 420 / 400** across a **24× size range** — flat to within 0.20 of a
band, with the one departure being the phase artefact above.

> **The build loop's review signal is not backwards. It is ABSENT.** Fourteen goals have been
> reasoning about a number that does not move when the hotel gets better.

### G-028 is re-aimed, and it gets SMALLER

Not *"the mean is inverted, rewrite the scorer"* but: **the mean is a one-tick snapshot of a
phase-locked population, and the replacement is already named in the code** —
`recordNeedsAtDeparture`'s own docstring specifies **time spent below the line, a per-need
accumulator, and a schema bump it explicitly deferred to the next goal.** That is a smaller and
better-aimed goal than the one on the block, and **the ladder repair is a prerequisite it now has
arithmetic for.**

### Two corrections, one of them mine

**ADR-0030 §2's "roughly 8× tighter" does not reproduce and is WITHDRAWN, not restated.** Every
construction gives **~2.31×** — guests per provider 8 against 3.47, or pooled provider-ticks per
guest-tick 0.375 against 0.865. **The ruling it supported — per-population, not one constant —
is confirmed by measurement and stands**: a pooled single constant of 8 gives M=1 at the six-room
rung and leaves the inversion exactly where it was. **The number was decoration on a conclusion
that had better support elsewhere**, which is the most dangerous kind: nobody checks the arithmetic
under a claim they already believe.

**"The ladder is CONTENT" (`GOALS.md` digest) is FALSE of this ladder.** AXIS 1's ladder is **four
CLI flag strings in a test file**, provisioned by `schedule()`'s defaults, and **no gate reads it**.
The content ladder guarded by `check:ladder` is the *speed* ladder — a different object with a
similar name, and the digest line has been read as covering both.

## ADR-0033 AMENDMENT — "the signal is ABSENT" was read off a CONTROL. And the golden I quoted was stale.

**Date**: 2026-08-14 · **Amends**: ADR-0033 · **Raised by**: `economy-engineer` at G-028 PLAN, with
the measurements attached.

### 1. The scaled ladder is a CONTROL, not the criterion — so "flat" was the right answer

ADR-0033 read the arrivals-scaled ladder (**400 / 400 / 401 / 420 / 400** across a 24× size range)
as *"the build loop's review signal is ABSENT"*. **That reading was wrong, and the correction is
better than the finding.**

**Scaling rooms AND arrivals together holds provision-per-guest constant.** A hotel twice the size
serving twice the guests with twice the providers is **the same hotel**, and a size-invariant score
**should** read flat. Measured on exact-ratio rungs (`L/8` an integer): the integral reads
**2616 / 2615 / 2488 basis points unserved — flat to 5 %** across 3×, while the snapshot on the same
rungs reads **391 / 382 / 435**, non-monotone, 0.53 band. **The snapshot is the one reading noise
there.**

> **The build-loop criterion is the FIXED-DEMAND ladder, where a bigger hotel serves the same
> arrivals better. The scaled ladder is the control that says the score is not merely counting
> guests.** ADR-0033 pointed the criterion at the control and concluded the signal was gone.

**What survives ADR-0033 intact, and it is the load-bearing half**: the snapshot is a one-tick
reading of a phase-locked population, the phase noise (0.89 band) exceeds the effect (0.29), and
`guest_comfort` unserved for **21 basis points of a stay** is recorded **met for 0 of 348 guests**.
The diagnosis stands; the sentence drawn from the control does not.

**And the replacement is measured, not proposed**: under the integral, AXIS 1 moves **1.82 bands**
where the snapshot moves 0.29, and the phase spread at the top rung goes to **zero** — 500 / 500 /
500 / 500 across the cadences that gave the snapshot 500 / 420 / 411 / 441. **Signal against worst
phase noise: 16.5×, against today's 0.33×.**

### 2. THE MEASURE GOLDEN I HAVE BEEN QUOTING ALL SESSION IS STALE

`GOALS.md`, `JOURNAL.md` and every brief I wrote carried the measure golden as
`5a8cec719d1e9e95`. **The shipped assertion is `bab5925fb9c5df13`**, and
`bench.workload.golden.test.ts` records the move at θ-b2 **in its own history comment**.

**How I got it**: I read the gate's output through `grep -oE "[0-9a-f]{16}" | head -2` and took the
**first sixteen-hex string in the stream** rather than the figure the gate reports. `check:measure`
prints its golden in a sentence; I never read the sentence.

> **Slot one, on a hash: I did not ask what the sixteen hex characters I had captured were the hash
> OF.** Fifth instance this milestone and the fourth of mine — and the first where the wrong number
> came from the *extraction*, not from the source. **A regex that matches a shape is not a
> measurement; it is a shape.**

Corrected in both digests. **This is also the second time a body-of-digest fact drifted while
`check:stamp` stayed green** — that gate compares the as-of line and never reads the body, and the
schema version did the same thing two goals earlier.

### 3. The seam is TAKEN — G-028a (instrument) then G-028b (scorer)

§5.5: a builder that offers a seam gets it taken or a scored prediction. **Taken, and the pricing is
mechanical rather than argued**: `NeedState` literals occur **66 times across 22 files**, and 16-hex
state-hash pins in **14 files** — roughly **25 files of mechanical diff before one balance number
moves.** Undivided, **sweep 1 would be reading hash re-pins instead of reading the migration and the
write-only fence**, which are the two places a defect could hide.

**G-028a changes no behaviour** — the accumulator is write-only inside the tick, so departures,
need tallies, ledger and revenue are identical and only the state hash moves. **That property is
what makes the split safe**, and it is itself the first thing its critic should try to break.

## ADR-0034 — THE REVIEW IS PER-NEED, WORST NEED DECIDES. And the pooled ladder is withdrawn.

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: ADR-0027, ADR-0031, ADR-0033 (+
amendment) · **Raised by**: `balance-critic` at G-028a plan review — **two BLOCKERs and six MAJORs
before a line of code.**

### 1. The pooled score reintroduces the defect the module was built to avoid

`band = floor((n·T − U)·bands/(n·T))` **pools unserved ticks across needs**, and `reviews.ts`'s own
header records that as the reason the weighted score was rejected: *"a guest could miss any single
amenity need and still review at the top … three-quarters of the need vector contributes nothing."*

Arithmetic on the shipped table: **a guest whose one need is unserved for 80 % of its stay, with the
other three perfect, scores the TOP band.** The shipped snapshot costs that same guest a band. **The
new statistic would be worse than the one it replaces at the thing the module exists to protect.**

**Ruled: per-need band, worst need decides.** Strictly increasing at every rung (**136 / 208 / 318 /
500**, endpoint gap **3.64 bands** against pooled's 1.82), it **preserves "a top review requires
every need met"**, and it introduces no constant either. It is also the reading a player would
recognise: **a guest who could not sleep does not care that the café was good.**

### 2. Law A would have gone red, and the plan's own ADR-0027 accounting missed it

`report.ts`'s review law A — `topReviews > leastMet` ⇒ `emitReport` exits 1 — **goes red on the
criterion ladder's own top rung under BOTH aggregations.** And the bind-time floor's refusal message
says *"A top review must be unreachable while any need is unmet"* — **the graded score falsifies
that sentence**, leaving a refusal enforcing a property the scorer no longer has.

**The plan enumerated the six properties `recordNeedsAtDeparture` asserts and concluded only one
moves. The properties that break are in `report.ts` and `content.ts`.**

> **Enumerating a list is not enumerating a class** — ADR-0031's closing line, one goal old, turned
> on the plan that cited it. **An ADR-0027 accounting scoped to one function is a list.**

Worst-need-decides **restores law A by construction**, which is the second reason to prefer it.

### 3. TWO CORRECTIONS TO MY OWN AMENDMENT, AND THE SECOND IS WORSE

**(a) "The phase spread goes to zero" is a CLAMP, not a measurement.** The score reads 500 / 500 /
500 / 500 because **every guest is inside the top band** — the run sits at 5.3 % of a 20 %-wide
band. **You cannot measure noise at a saturated point.** At the unsaturated 12 rooms / 1 amenity the
graded score's spread is **0.19 band against the snapshot's 0.10 — noisier.** The 16.5× survives as
1.82/0.11 off a different rung; the sentence beside it does not.

**(b) The graded score is an occupancy statistic.** To within **0.02 band at every rung** it is
`3 + 2 × (checked-out share)`; the distributions are two-point and **the two points are the
departure reasons.** Drop the lodging need from numerator and denominator and **the axis inverts at
rung 2.**

And the part that indicts my amendment directly: I called the scaled ladder *"the control that says
the score is not merely counting guests."* **It cannot be — occupancy share is size-invariant, so a
pure occupancy statistic reads flat on that control too.** ADR-0007's shape, **in the control**.

The control that *does* discriminate holds occupancy at 100 % and varies provisioning: **415 / 500 /
500 / 500.** Above the derived provisioning point **the score is blind**, which is the saturation
the plan parked — and it collides with G-028's own *"the distribution is not a point mass"*
criterion, which the plan did not name.

### 4. The money loop is a cliff, and the dominant strategy is DO NOT BUILD

Measured at 1000 days: **revenue is exactly 0p at 3, 6, 12, 30 and 60 rooms** below the amenity
cliff, with balance falling monotonically to **−154,000,000p**. `payForStay` is reached only from
the `checkedOut` branch and dissatisfaction ends a stay at 431 ticks, so **an under-provisioned
guest pays nothing rather than less** — building bedrooms has **negative marginal revenue at every
room count below the cliff**, and the runner can only build bedrooms.

**And ADR-0033's derived rule PREDICTS the cliff**: 45 lodgers ⇒ M = 6, and **6 is exactly where
balance turns positive** (+146M against 2 amenities' −158.5M). That is independent validation of a
derivation made for another purpose. **Parked for M4 with its arithmetic; it is not G-028's.**

### 5. My digest was stale in the sentence my own amendment repaired

The amendment corrected the measure golden in that line, wrote *"Corrected in both digests"*, **and
left `save v14` and I2 `21938e08d179c60c` standing beside it** — against a tree at v15 and
`a37d293a4c052e5e`. **In the same paragraph that names the schema version as the thing which "did
the same thing two goals earlier."**

> **ADR-0027, by the author who ruled it, on the third consecutive occasion, inside the correction
> of the second.** A repair correct about its subject that leaves what is beside it — and the
> improvement is the camouflage.

Corrected against the tree, not against memory.

## ADR-0029 AMENDMENT — the ruling's own qualifier inspects nothing

**Date**: 2026-08-14 · **Amends**: ADR-0029 §3 · **Raised by**: `economy-engineer` at G-028a plan
revision 2, and it survived two proposed fixes before anyone noticed the shape.

ADR-0029 (human) ruled that a sleeping guest is never idle, an awake guest idle **in its own room**
is acceptable, and **only a guest stranded in public with needs it cannot get met** is a defect.
The plan's first discharge was found vacuous at its leading arm — zero stranded guest-ticks at 12
rooms / 2 amenities, because every guest holds a room. **The suggested repair — use 6 rooms / 5
amenities instead — is also zero.** Measured:

| configuration | public guest-ticks | stranded guest-ticks |
|---|---|---|
| 12 rooms / 2 amenities | **0** | 0 |
| 6 rooms / 5 amenities | **0** | 0 |
| 6 rooms / 2 amenities | 93 | **93** |
| 3 rooms / 1 amenity | 8,230 | **8,230** |

**The two columns are identical in every configuration, and that is the finding.**

> **A roomless, unengaged guest ALWAYS has an unmet need — its own lodging need — by construction.
> So "with needs it cannot get met" is true of every member of the population it is supposed to
> narrow. The qualifier inspects nothing.** ADR-0007's shape, inside a ruling's predicate rather
> than inside a check.

**The ruling's substance is untouched and correct**: sleeping is not idleness, at-home-awake is not
a defect, and the third population is the one that matters. **What fails is the attempt to define
that population by what its members want**, when wanting is what makes them members.

**Repair, and it is simpler than what it replaces**: the measurable quantity is **public-and-
unengaged guest-ticks**, in absolute counts, two-sided — **zero in a hotel provisioned to the
derived rule at full occupancy, non-zero in a starved one**, with the starved arm carrying
ADR-0007's obligation to prove the instrument can fire. **No share, no denominator, no chosen
constant.** The old `X = 2,500` basis-point ceiling does not return: a run over this population is
bounded by `toleranceTicks`, so a run-length ceiling would be near-vacuous by arithmetic.

**Worth recording about how it was found**: two people proposed a better *arm* before anyone asked
whether the *predicate* could ever separate. **When a criterion is vacuous at two independently
chosen configurations, the next question is about the predicate, not the third configuration.**

## ADR-0034 AMENDMENT — worst-need-decides INVERTS on the amenity axis, and G-028b must confront it before the scorer ships

**Date**: 2026-08-14 · **Amends**: ADR-0034 §1 · **Raised by**: `balance-critic` at G-028a sweep 2.

### The measurement

ADR-0034 ruled the review onto **worst need decides**, on the strength of a ladder that moves rooms
and amenities **together**. On the **amenity axis alone**, the worst-need statistic **gets worse when
a player builds an amenity** — at four of six room counts:

**The figures are NOT reproduced here (ADR-0032 §1), and that is a correction.** They were first
written into this ADR as a table, and `balance-critic` found at G-028a's closing verification that
**seven of its eight cells no longer matched the tree** — signs all surviving, magnitudes drifted
(the twelve-room lean maximum read 807 where the tree says 818, and the orchestrator's own brief
quoted 818 while pointing G-028b at a ledger saying 807).

**That happened ONE ROUND after amendment 2 was written for exactly this failure** — and the
diagnosis is the sharp part: **§4's cliff was re-measured and reproduces to the penny, while this
table had its slots RESTORED WITHOUT BEING RE-RUN.** Restoring a citation is not re-taking a
measurement, and the two look identical in a diff.

> **A figure in an ADR is a claim with no pin. The obligation belongs in the ledger; the numbers
> belong in the arm that computes them.**

**The measurement now lives in `tools/headless/src/unserved.report.test.ts`'s golden**, which folds
it from the shipped table on every run and **cannot go stale**. It asserts the worst engagement need
rises, the engagement sum and mean fall, the six-room pair has no confound, and — the claim this
amendment exists for — **the row that improves is the one that was already best served.**

**What G-028b owes is unchanged and is stated without a number**: *why does worst-need-decides
survive a player who builds an amenity, when the extra provider goes where there was no shortage?*
**Run the golden; it prints the current answer.**

**The six-room pair has no confound**: departures are **6,540 / 5,453 / 0 in both arms** and mean
stay is **867.1 ticks in both**. The hotel gained strictly more capacity and the statistic got
strictly worse.

**The mechanism is visible in the rows**: comfort **477 → 18** while nourishment **1,229 → 1,500**.
**A guest holds one provider at a time**, so serving one need better spends the ticks it was
spending on another. **The SUM falls (2,251 → 2,222) and the MAX rises.**

### Why this is not simply a defect in the ruling

**It is the same shape ADR-0033 found in the snapshot** — *more provision, worse review* — arriving
in the replacement through a different mechanism. But there is a reading on which it is **correct
feedback**: at six rooms, comfort was already fine at 477 and the player added *more comfort*, while
the actual bottleneck was nourishment. **A score that falls is saying "you built the wrong thing."**

The objection is that it says so **by punishing investment**, and a build loop that can make your
score drop when you spend money is a loop players stop trusting.

### The ruling: NOT re-decided here, and G-028b cannot land without answering it

**I am not re-ruling the scorer on one sweep's data**, and I am not deferring it either. **The
inversion ships as a known-shape golden in G-028a** — a pinned record of what the statistic does on
the amenity axis, so it is in the tree, in front of the goal that builds the scorer.

**G-028b's plan must answer one question with a measurement**: *why does worst-need-decides survive
a player who builds an amenity?* Acceptable answers include that the inversion is correct feedback
and should be visible; that the statistic needs the provisioning rule as context; or that a third
aggregation beats both. **What is not acceptable is discovering it after the scorer lands** — which
is the expensive order, and the whole reason this is being pinned now.

> **The ladder that made the ruling moved two axes together. The axis a PLAYER moves is one at a
> time.** A criterion swept along a diagonal is not evidence about the moves the game actually
> offers.

### And the arm's title overclaims

`unserved.report.test.ts`'s describe generalises a diagonal result to *"a better-provisioned hotel
leaves less unserved"*. **Re-title it to what it tests** — monotone along the derived provisioning
diagonal — and let the golden carry the rest. ADR-0032's class: a claim wider than its predicate.

## ADR-0034 AMENDMENT 2 — the cliff and the inversion tables were UNRUNNABLE, and both are obligations somebody else has to answer

**Date**: 2026-08-14 · **Amends**: ADR-0034 §4 and its first amendment · **Raised by**:
`balance-critic` at G-028a sweep 3.

### §4's cliff does not reproduce from what is written

§4 states: *"Measured at 1000 days: revenue is exactly 0p at 3, 6, 12, 30 and 60 rooms below the
amenity cliff, with balance falling monotonically to −154,000,000p."* Re-measured at 1000 days on
the **shipped default cadence**: revenue is 0p **only at zero amenities**; at one amenity it is
27,795,000p / 44,761,000p / 19,584,000p / 19,584,000p for 3 / 6 / 12 / 30 rooms, and the most
negative balance in the grid is **−74,500,000p**.

**The original figures were not wrong. They were taken at the 45-lodger cadence — which §4's own
next paragraph names, and which the citation does not.** So a reader who re-runs the sentence gets
different numbers and cannot tell whether the claim, the tree or their invocation has moved.

**The same gap is in the first amendment's inversion table**: no days, no seed, no cadence, and **no
statement of the fold** — which is precisely what MAJOR 2 below turns on, because ratio-of-sums and
mean-of-ratios give different answers over the same rows.

> **Both of these are numbers a LATER GOAL is contractually obliged to answer** — §4 *"parked for M4
> with its arithmetic"*, the amendment *"G-028b's plan must answer"* — **and neither can be re-run
> from what is written. An obligation whose evidence cannot be reproduced is not an obligation; it
> is a rumour with a due date.**

**Slots, restored**: §4's cliff — `--days 1000`, seed 42, **`--arrivals 32` (the 45-lodger
cadence)**, shipped content, one deterministic run per cell, balance and revenue in pennies, quiet
12-core Windows 11 box. The amendment's table — `--days 30 --seed 7 --arrivals 120`, shipped
content, one run per cell, **per-need share as ratio-of-sums**, and **the mean column is the
ENGAGEMENT mean, not the all-rows mean**.

### And the fold matters more than the workload here

The amendment's `mean` column reads 750 → 741 and 709 → 453. Those are the **engagement** means. The
all-rows mean over the same runs reads 984 → 976 and 529 → 340. **Both fall, so the sign survived —
but only because the lodging row happens to be constant in both pairs.** A table that names neither
the fold nor the row set was one content change away from being cited for a statistic it never
measured.

### The rule this earns

> **A number parked as an obligation carries its invocation, not just its slots.** The five slots
> tell a reader what a figure means; **an obligation needs the command that regenerates it**,
> because the person who must answer it was not there when it was taken.

## ADR-0035 — AN ASSERTION MUST NAME A STATE ITS NEIGHBOURS PERMIT AND IT FORBIDS

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: ADR-0007, ADR-0027, ADR-0032 ·
**Raised by**: `ai-engineer` **against itself**, at G-028a's closing pass, after the third instance
in three rounds.

### The evidence

G-028a produced an assertion that cannot fail **in three consecutive rounds, and in two of them the
new one arrived inside the fix for its predecessor.**

| round | the assertion | why it could not fail |
|---|---|---|
| sweep 1 | `stranded <= public` | both counters incremented in the same branch |
| sweep 3 | a golden's fourth clause, added *"so it cannot pass for the wrong reason"* | entailed by clauses 1 and 2 |
| verification | three constants asserted against **the same pure expression that defines them** | falsifiable only by a typo in its own copy |

The last is the sharpest: the fix pass **deleted one member of a four-member family and left three**
— one of them the arm carrying the derivation that fix had just added — **five lines above an
epitaph describing the deleted one in exactly those terms.**

### The rule

> **For each assertion, name a state its neighbours permit and it forbids. If you cannot, it is
> decoration and it comes out.**

Cheap, mechanical, and it catches every instance above without measuring anything.

### The failure mode, which is the part worth transferring

The builder's own account, and it is exact:

> *"I applied it to my own new clauses last round and it found three; I did not apply it to the
> lines I was leaving in place."*

**The check gets applied to what a diff ADDS and not to what a diff LEAVES.** That is ADR-0027 in a
new costume — a repair correct about its subject that inherits the assumptions of its neighbours —
and it explains why the class survived three rounds of people actively hunting it.

**So the rule has a scope clause**: when a fix touches an assertion, **the whole `it()` block is in
scope**, not the line being repaired. An entailed sibling is not a pre-existing condition; it is the
same defect one line over.

### Why an entailed assertion is worse than no assertion

**It reads as rigour.** A reviewer counting checks sees four and infers four properties are pinned.
`ADR-0007`'s class is a check that inspects nothing; **this is the sub-class where the check was
added on purpose, by someone who knew the rule, to close a gap a critic had just named.** Every
instance above was written in the fix for a finding about vacuity.

> **The instinct that adds an assertion to look thorough is the same instinct that should notice it
> forbids nothing. It fires once.**

### What it does not mean

**Redundancy for readability is fine where it is stated.** What is forbidden is an assertion whose
*docblock claims a property it cannot enforce* — every instance here carried a sentence explaining
what it guarded against, and in each case that sentence was arithmetically impossible.

## ADR-0036 — THE INVERSION IS IN THE REPORT ROW, NOT IN THE SCORE. And the bind-time floor keeps its number as a labelled dial.

> **STRUCK — SUPERSEDED BY [ADR-0044]. DO NOT CITE THIS BLOCK.** Reached a second amendment;
> ADR-0043 §3 rules that such an ADR was wrong rather than incomplete, and is replaced by a single
> restated ADR. Kept unedited as history. **Read ADR-0044 instead.**

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: ADR-0034 (+ amendments), ADR-0035 ·
**Raised by**: `economy-engineer` at G-028b PLAN, answering the question ADR-0034's amendment pinned.

### 1. The question is answered, and the answer is that two different objects were being compared

> *Why does worst-need-decides survive a player who builds an amenity, when the extra provider goes
> where there was no shortage?*

**Because the statistic that inverts is not the statistic the scorer computes.**

The golden folds `max_i ( Σ_g u_{g,i} / Σ_g T_g )` — **ratio of sums per need, then a max across
needs.** The ruled scorer computes `mean_g band( max_i u_{g,i} / T_g )` — **a max within one guest,
then a mean over guests.** **`max` does not commute with a population average**, and here the two
disagree in sign.

Measured on the amenity axis, every pair confound-free (identical departure table, identical
`instanceTicks` per row):

| | |
|---|---|
| the **report row** | **inverts at every room count** — the golden is right about itself |
| the **guest-level** statistic | **never rises**; falls or flat at all five |
| the **ruled score** | **never falls anywhere on the amenity axis** |
| the **shipped scorer** | **falls at three of five room counts** |

> **The scorer being replaced is the one that punishes investment. The replacement is not.**

**The mechanism is ADR-0034's own, one level over**: a third café moves *which row* carries the
aggregate (comfort down, nourishment up) **without any individual guest's personal worst need
getting worse.** *"A guest holds one provider at a time"* moves ticks between rows; **it does not
move a guest's own maximum upward.**

**And the player-facing half, which the amendment demanded**: on the binding axis the score moves
hard — six rooms to twelve at fixed amenities takes it **318 → 500**. On the non-binding axis it is
**flat.** **It says "that was not your bottleneck" by not moving, never by dropping.** A player who
spends and sees the number stand still learns something; one who sees it fall learns to stop
spending — which is what ships today.

**The single-axis reading the amendment required**: non-decreasing on the amenity axis at every room
count, and the one fall on the room axis is at **one amenity**, where doubling rooms builds a
*worse-provisioned* hotel — **ADR-0030 §1 reproducing itself, and the shipped scorer moves the wrong
way on the same pair.**

**The golden stays green and stays true. What changes is the sentence a reader takes from it** — its
describe block must stop reading as a claim about the score.

### 2. The bind-time floor: number KEPT, warrant RE-STATED, and labelled a dial

The builder applied ADR-0035 to a line it was **not** rewriting and reported that **it cannot name a
state the floor forbids that its neighbours permit** — under worst-need-decides the "top review
unreachable while any need is unmet" property holds **at any scale of two or more bands**, so the
*"only when"* in the refusal message is **false**, not merely weakened.

**Ruled: keep the number, restate the warrant, and label what it now is.** The available warrant is
**resolution** — with `B` bands, *met* means *unserved for less than `T/B` of the stay*, so **the
band count sets the tolerance inside the definition of met.** That is a **content dial, not a
derivation**, and ADR-0013 §4 forbids manufacturing one, so **it ships labelled as a dial.**

**Why not delete it**, given ADR-0035: deleting a bind-time refusal lets content ship below it
**silently and permanently**, and the resolution argument is real even though it is not a
derivation. **Keeping a check whose warrant changed is legitimate; keeping a message that states a
false necessity is not.** That distinction is the ruling.

### 3. Three more things this plan got right, recorded because they are the method working

**ADR-0027 counted as a class: 47 sites in 12 files, where the brief recalled 8 in 4.** The
ADR-0024 growth pattern, and **the ratio is the finding.** It also surfaced a site nobody had named
— `report.ts`'s attribution laws are keyed on `met`, so redefining `met` moves `metByItem`.

**The law-A coupling is now executed, not argued: 11 of 30 grid cells go RED if `reviewOf` moves
alone, 0 with `met` on the same band** — and the 11 include **criterion 9's own control** and **the
criterion ladder's top rung.**

**And the occupancy degeneracy ADR-0034 §3(b) predicted is measured**: the ruled score equals
`min + (bands−1) × checkedOutShare` **at 26 of 30 cells**, the exceptions being exactly the
under-provisioned ones. **Met with an arm rather than a paragraph** — engagement-only, lodging
dropped from both sides, where the score reads 227 against occupancy's prediction of 136.

### 4. What is owed and must not be deferred

**The visitor population may be structurally incapable of a good review.** A visit is short and
service is serial, so a perfectly-served visitor accumulates let-down over a large fraction of it —
**the same arithmetic ADR-0028's amendment used for the dissatisfaction floor now sets a ceiling on
the review.** **This is measured in G-028b even though the fix may be parked**: a content set where
nobody can ever score well is the losing tail, and it is not recoverable once shipped.

## ADR-0036 AMENDMENT — §1'S ANSWER IS WITHDRAWN. The ruled score is the checked-out share rescaled.

> **STRUCK — SUPERSEDED BY [ADR-0044]. DO NOT CITE THIS BLOCK.** (ADR-0043 §3.) Kept unedited as
> history; its finding is carried forward in ADR-0044 §3.

**Date**: 2026-08-14 · **Amends**: ADR-0036 §1 · **Raised by**: `balance-critic` at G-028b plan
review, **before a line of code**.

### The measurement that overturns it

I accepted that the score is **flat on the amenity axis because it correctly reports "that was not
your bottleneck."** It is flat because **it carries no amenity information at all.**

`mean_g( min + band( max_i u_i / T_g ) )` equals `min + (bands−1) × checkedOut/departures`
**exactly at 27 of 30 grid cells.** The three exceptions are the one-amenity rungs.

**The sharpest pair — identical departures, identical stays, identical `instanceTicks`:**

| 3 rooms, 1 → 2 amenities | |
|---|---|
| comfort's unserved share | **1,768 → 15 bp — a 118× improvement** |
| guests whose worst engagement need improves | **305 of 356. Zero worsen.** |
| **the ruled score** | **2.0787 → 2.0787** — four decimal places, distribution identical |

**The mechanism is structural, not content luck.** A lobby give-up ends at `tick − arrivedTick >=
tolerance` with lodging unserved, so **every give-up has `u_lodging == T` exactly → band 0 → the
floor, whatever amenities it used.** And a checked-out guest's tolerance for *met* is `T/bands` =
288 ticks of 1,440, so nearly everything qualifies → the top.

> **The score is a threshold test on "did you get a bed." It moves on the amenity axis if and only
> if the departure table moves.**

### What I got wrong, and it is a specific failure not a vague one

The plan offered three acceptable answers and I accepted *"the inversion is correct feedback."* **I
checked that the score does not FALL and never checked whether it MOVES.** A statistic that is
constant across a 118× improvement is not reporting "no bottleneck" — it is reporting nothing.

**"It does not punish investment" and "it responds to investment" are different claims, and only the
first was measured.** I had the second in my hands — the plan's own table showed 136/136, 208/208,
318/318, 500/500 down the amenity axis — **and read flatness as evidence of correctness because the
answer I was being offered said it was.**

### Consequences, none of which are cosmetic

**Two of this goal's own inherited exit criteria become unmeetable**: *"the review responds to the
stay, not only to lodging"* and *"the distribution is not a point mass"* — 13 of 30 cells are
single-valued and criterion 9's control is `{1:161, 5:192}`. **And it hands M4 a reputation term
that is occupancy**, which is the trap M2's exit recorded, arriving through the replacement instead
of the snapshot.

**AXIS 2's ladder passes anyway, for the wrong reason** — dropping to zero amenities destroys the
checkouts, so the ladder moves occupancy too. **ADR-0007's shape inside the criterion.**

### The ruling: the aggregation is RE-OPENED and settled at PLAN, not at sweep 1

**The candidate direction, to be measured and not assumed: a per-need denominator — what the guest
could have had, rather than how long it stayed.** Lodging is scored against **`toleranceTicks`**
(did a bed arrive in time), engagement needs against **the stay**. That removes the term which
saturates the max for exactly the give-up population, and it is derivable from content rather than
chosen.

**It must be measured on the confound-free pairs before BUILD** — the 3-room 1→2 pair above is the
test, because a 118× improvement with zero guests worsening is the strongest available signal and
any aggregation that does not move there is not measuring service.

**Settle it now, where it costs no round.** The critic's scope finding is the reason: **the answer
determines the definition of `met`, the band edges, and therefore what all 47 sites are rewritten to
say.** Settled at sweep 1 instead, the 47 sites get written twice inside a three-sweep budget that
is the milestone's last.

### And the visitor ceiling is a CONSTANT, not a ceiling

Measured on lodging-free content at five provisioning levels including 4× over-provisioned: **every
one of 359 visitors has a worst-need share of exactly 6,201 basis points, and every one scores 2 —
invariant to everything a player can build.** *"Nobody can ever score well is not the tail; it is
the whole population."* The build-loop signal for a lodging-free content set is **exactly zero.**

## ADR-0037 — THE REVIEW IS THE MEAN OF PER-NEED BANDS. My per-need denominator was falsified; the trade is named.

> **STRUCK — SUPERSEDED BY [ADR-0045]. DO NOT CITE THIS BLOCK.** Reached a second amendment;
> ADR-0043 §3 rules that such an ADR was wrong rather than incomplete, and is replaced by a single
> restated ADR. Kept unedited as history. **Read ADR-0045 instead.**

**Date**: 2026-08-14 · **Status**: accepted · **Supersedes**: ADR-0034 §1's *worst need decides* ·
**Relates to**: ADR-0036 (+ amendment), ADR-0035 · **Raised by**: `economy-engineer` at G-028b plan
revision 2, with eight candidates measured.

### 1. My ruling was wrong, and no denominator could have saved it

I ruled **lodging against `toleranceTicks`, engagement against the stay.** Measured at its own named
test — 3 rooms, 1→2 amenities — it is **flat: 129 → 129**, identical distribution, still flat at
twenty bands. **And it introduces a fall the ruled score did not have**, going 180 → 159 on the
amenity axis at six rooms. **It punishes investment, which is the defect being replaced.**

The reason is structural, and it kills the whole direction:

> **Every give-up has `u_lodging == T` exactly, and a give-up departs at `tick − arrivedTick >=
> toleranceTicks` — so stay, tolerance and wanted-ticks are THE SAME NUMBER for the term that
> saturates. A guest that never got a bed was failed on lodging for 100 % of every window you can
> measure it against. The saturation is not a denominator artefact; it is the truth about that
> guest.**

The third denominator the direction implies — **ticks the need was wanted** — was built and measured
too: it rescales the engagement terms into a full range and does nothing for lodging, reading
**101 / 102 / 103** across the low-room grid. **Deader than what it replaces.**

### 2. The reframing, which is the actual finding

At three rooms, **260 of 356 guests never get a bed.** A third café improves *their* engagement
bands. The 96 who do get beds are already at the top.

> **At low room counts the amenity signal lives entirely in the lobby population — so every
> aggregation that lets one starved need pin that population at the floor is blind to amenities
> exactly where amenities are cheapest.**

That turns the question from arithmetic into design: **does a guest that never got a room get
reviewed on what it DID receive?** Worst-need-decides answers *no*, and pays for it with **27 of 30
cells of occupancy**.

### 3. The ruling: `score = min + floor( Σ_i band_i / N )`

**Per-need band first, then the MEAN of the bands.** Five bands, denominator the stay.

**It is not the pooled score ADR-0034 §1 rejected, and the difference is precisely the double
rounding.** Pooling sums *unserved ticks* and bands once — the falsification vector (one need
starved 80 % of a stay, three perfect) scores **top**. Banding per need *first* and then averaging,
the same vector scores **4**. **The per-need floor is what costs the starved need its band, and
removing it IS the rejected score.**

**Kept by construction, not by measurement:**
- **Law A** — `floor(mean) = bands−1` **iff every band is top** ⟺ every need met. Measured **0 red
  of 30**, with the 11-cell red result under the old `met` unchanged, so the coupling still binds.
- **A guest that never got a bed can never leave a top review** — lodging band 0 forces the mean to
  at most 3, so the score is at most 4. **Structural**, where two other candidates got the same
  outcome only by content luck.

**Responds on both axes**: non-decreasing on each single axis at every fixed value of the other,
**zero falls**, and **12.5 % of scale** at the test my candidate read flat.

### 4. THE TRADE, NAMED, because it is a design call and it is real

**A guest whose one need is starved for its entire stay still scores 4 of 5** — no stronger than the
shipped snapshot on that vector, and much weaker than worst-need-decides' 2.

> ***"One starved need must cost nearly everything"* and *"the score must respond to what a player
> builds"* are in DIRECT MEASURED TENSION, and no candidate of eight satisfies both.**

**I rule for responsiveness, and the reason is the loop rather than the vector.** The review's job is
to feed reputation, and a score that is occupancy at 27 of 30 configurations tells a player only
whether people got rooms — **which is the broken build loop G-028 exists to repair.** The severity
of a single starved need is a **tuning** concern with a dial; the blindness is **structural** and
cannot be tuned out — the band-count sweep buys at most **3 % of scale**, and **above ten bands the
top band becomes unreachable on every need at once, so `topReviews` is always 0 and review law A
inspects nothing.** ADR-0007's class arriving through a content dial.

**This is a game-feel decision and the human may overturn it.** The runner-up is stated and costed:
**the ruled aggregation with eight bands** — *one starved need costs everything*, a content-only
edit, 3 % of scale, law A still biting. **If the human prefers severity to responsiveness, that is
the build.**

### 5. And the builder diagnosed my error better than I did

> *"I answered 'does it fall' and reported it as 'does it respond', and my own table contained the
> refutation — which I read as the answer rather than as data."*

**ADR-0035's shape one level up: I named a state the score forbids and never named one it permits.**
The rule was written for assertions; it applies to rulings.

## ADR-0037 AMENDMENT — the cap's exception is the WRONG one, and it holds where I said it did not

> **STRUCK — SUPERSEDED BY [ADR-0045]. DO NOT CITE THIS BLOCK.** (ADR-0043 §3.) Kept unedited as
> history; its finding is carried forward in ADR-0045 §1.

**Date**: 2026-08-14 · **Amends**: ADR-0037 §3 · **Raised by**: `balance-critic` at G-028b sweep 1.

ADR-0037 ruled that *a guest that never got a bed can never leave a top review*, **qualified "for any
need count above one"** — and the build shipped an arm advertising itself as *naming its own bound*.

**The qualifier is unnecessary and the named exception is not the exception.** Measured:

| vector | score |
|---|---|
| one need, lodging, unserved for the whole stay | **1 — the floor** |
| one need, lodging, fully served | 5 |

**The cap holds at one need**, and the arm's own second assertion proves it.

**The real exception is untested**: a **v5-migrated guest carrying no lodging need at all**, under
content that defines one. It never got a bed and **reaches the top** — measured at 5 for both a
one-need and a two-need engagement-only vector. **And `reviews.ts` describes exactly that guest
three paragraphs later** — *"a guest migrated from v5 carrying one well-served need scores the
maximum"* — **without connecting it to the cap.**

> **The property is about the vector CONTAINING the lodging need, not about how many needs it has.
> I bounded it on the wrong variable, and the arm that advertised itself as naming its own bound
> demonstrated the opposite of its title.**

Corrected: the cap is stated over *a vector containing the lodging need*, the need-count qualifier
is dropped, and the migrated-guest case becomes the tested exception rather than a paragraph two
screens away from the claim it falsifies.

**ADR-0035 again, and on a ruling rather than an assertion**: I named a state the property forbids
and never checked the boundary I had written into it.

---

## ADR-0036 AMENDMENT 2 — the false necessity claim survived one file over

> **STRUCK — SUPERSEDED BY [ADR-0044]. DO NOT CITE THIS BLOCK.** This is the *second* amendment that
> triggered ADR-0043 §3. Kept unedited as history; its finding is carried forward in ADR-0044 §2.

`report.ts`'s review-law-A violation message still tells a reader a top review is *"unreachable while
any need is unmet — that is what this scale is sized for."* **ADR-0036 §2 ruled that necessity false,
the diff removed it from the bind-time refusal, and `review.scale.test.ts` now asserts against it by
name.** The identical sentence is live one file over, and the new arm that checks the message
matches only its count clause.

**`content.ts` states the rule the diff was written to** — *"keeping a check whose warrant changed is
legitimate; keeping a message that states a false necessity is not."* **ADR-0035's scope clause
verbatim: the check was applied to what the diff ADDS and not to what it LEAVES**, which is now the
fourth instance of that shape in two goals.

## ADR-0037 AMENDMENT 2 — "never falls on either axis" is a claim about ONE CADENCE, and the mirror of ADR-0036's error

> **STRUCK — SUPERSEDED BY [ADR-0045]. DO NOT CITE THIS BLOCK.** This is the *second* amendment that
> triggered ADR-0043 §3. Kept unedited as history; its finding is carried forward in ADR-0045 §4.

**Date**: 2026-08-14 · **Amends**: ADR-0037 §3 · **Raised by**: `balance-critic` at G-028b sweep 3.

ADR-0037 §3 states the ruled score **"responds on both axes … zero falls"**, with no cadence
qualifier, and `reviews.ts` rests the whole ruling on it. **It is measured at one cadence.**

**Both axes fall over a contiguous cadence band** — `--days 1000 --seed 7`, arrivals 65 through 85:

| | 1 → 2 amenities, 12 rooms | 6 → 12 rooms, 2 amenities |
|---|---|---|
| arrivals 70 | 3.4642 → **3.3604** | 3.6314 → **3.3604** |
| arrivals 75 | 3.6441 → **3.4962** | 3.7058 → **3.4962** |
| arrivals 80 | 3.6808 → **3.5962** | 3.7497 → **3.5962** |

**And it is not the parked knife-edge.** `PARKING.md`'s own ±1-tick discriminator returns **"not a
confound"**: at 69 / 70 / 71 the room-axis pair falls at all three, and the fall (0.15–0.27 of a
band) exceeds the ±1 movement of its sign, which is **zero**. The 422-run sweep that closed the
cadence question was **`--rooms 6` only**; both arms here are smooth across the band.

> **This is the exact mirror of ADR-0036's amendment. That finding was: the critic checked one
> statistic and never checked the other. This one is: the arm checks both axes at one cadence.**
> **A property quantified over one dimension is a claim about the dimension you swept and a guess
> about the one you did not.**

**Ruled**: the claim is **scoped to the cadence it is measured at**, in ADR-0037 §3 and in the arm's
title, **or the arm sweeps cadences** the way the point-mass arm beside it already sweeps its
neighbours. **The scoped version is still the finding** — the build-loop inversion is repaired at
the shipped cadence, verified 40/40 grid cells and 9/9 cadences there — **but "zero falls" as an
unqualified property is withdrawn.**

**What this does not change**: the relocated point-mass criterion, which the same critic re-folded
and found **stable across every cadence from 114 to 130, always the same three bands**, weakest
margin 2.77× the derived floor. That one was checked against this class before it was pinned.

## ADR-0038 — A FIX PASS NEEDS THE SAME SWEEP DISCIPLINE AS A DIFF, APPLIED TO THE FIX'S OWN NEIGHBOURS

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: ADR-0027, ADR-0035 · **Raised by**:
`ai-engineer` **against itself**, at G-028b's closing pass, after the pattern became unarguable.

### The evidence, and it is the same shape every time

Across G-028a and G-028b, **a fix pass introduced the very class it was fixing, repeatedly** — and
in the sharpest cases inside the repair for that class:

| the fix | what it introduced |
|---|---|
| removing a derived figure from prose | **a derived figure**, in the sentence saying no figure is spelled here — and it was unreproducible |
| an epitaph for an assertion withdrawn as a **cadence knife-edge** | an assertion **resting on that same knife-edge** (`0 × 4 < 192`) |
| deleting one entailed assertion from a block | **another entailed assertion**, 23 lines above the epitaph for the first |
| rewriting a comment for a redefined term | **the comment two lines below it**, left standing and false |
| ruling one bound's warrant | **the ceiling beside it**, resting on the same deleted premise |

**Seven instances across two goals**, by an author who wrote the rules' evidence.

### The mechanism, and it is not carelessness

The builder's own account, which is better than any framing I had:

> **"The repair and the defect share a subject, so the fix gets the attention and the line beside it
> inherits the assumption."**

A fix is *aimed*. Aiming is what makes it correct about its target and blind to its neighbours —
and a reviewer verifying a fix reads it **against the finding**, where the neighbour was not either.
**That is why this class survives rounds of people actively hunting it.**

### The rule

> **A fix pass is swept like a diff. The unit is the enclosing block — the `it()`, the docblock, the
> function — not the line that was wrong.**

Concretely, and each of these would have caught instances above:
1. **After editing an assertion, ask of every sibling in that block: what state does it forbid that
   its neighbours permit?** (ADR-0035, scoped to the block rather than the line.)
2. **After removing a figure from prose, grep the paragraph you wrote for figures.**
3. **After correcting a claim, read the two comments either side of it** — that is where the same
   claim lives, because a claim worth stating twice was stated twice.

### Why this is a separate ADR and not a footnote to ADR-0027

ADR-0027 governs **what a replacement inherits from the thing it replaces**. This governs **what a
repair leaves standing beside it**. They are adjacent and they are not the same failure: the first
is about *time* (a property the old code carried), the second about *space* (a line the fix did not
look at). **Both exist because attention follows the subject, and the subject is never the whole
unit that has to be true.**

## ADR-0039 — `check:stamp` GETS A PREDICATE OVER THE DIGEST'S BODY; and G-032's seam is taken

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: §4.1, ADR-0021, ADR-0038 ·
**Raised by**: `sim-engineer` at G-032 PLAN, having measured the tree rather than quoted the ledger.

### 1. The digest body has now gone stale FOUR TIMES and the gate has been green every time

At G-032's plan the four digests read summary schema **3**, measure golden **`b42ccbb81e1539c4`**
and I2 **`2568fb4336c95267`**, while the tree read **4**, **`ebb9c3924e373c1e`** and
**`8a83acaf7f81edeb`**. **`check:stamp` was green throughout, because it compares the as-of LINE
and never reads the body beneath it.**

**That is the failure the digest itself records having had at v12-against-v14, recurred** — and the
orchestrator has now caused it four times in one session, each time by updating the stamp and not
the facts under it.

**Ruled**: `stamp.mjs` gains a predicate that **reads the schema/hash line and compares it against
the shipped constants**. `SUMMARY_SCHEMA_VERSION`, `SAVE_SCHEMA_VERSION`, the measure golden and the
I2 hash are all readable from the tree. **One predicate closes the machine-readable half of a class
that four human corrections did not.**

> **A gate that checks a document's header certifies nothing about its body — and the body is where
> every reader gets the numbers.** Fourth statement of this, first time it becomes executable.

### 2. THE `rooms` ROTATION'S CAMPAIGN IS AS STALE AS THE `needs` ONE, AND THE GATE CANNOT SEE IT

**`check:scaling` refuses at the first rotation and never reaches the second — and had it reached
it, it would have PASSED.** The `rooms` fingerprint is **byte-identical** to its campaign's, while
ADR-0017 **tripled the stay length** and changed every one of those arms' occupancy.

**The fingerprint is spelled in FLAGS. The flags did not move; the hotel did.** ADR-0021's
blind-guard defect, **still live, in the rotation nobody had looked at** — and the gate even *prints*
`an arrival every 32 ticks` while the instrument runs 96.

**Ruled**: the fingerprint gains **`stayDurationTicks` from the bound content** — a content
constant, exact, free, no stopwatch — and `scaling.mjs` gains the arrival-cadence cross-check
`tripwire.mjs` has and it lacks. **All four axes are re-taken, not the two the gate can see**:
refusing to re-take an axis because its fingerprint still matches **is** the green gate that has
stopped being evidence.

### 3. THE BENCHMARK CONSTANTS SIT AT LOCAL MINIMA OF THE AXIS THEY MEASURE

Measured: **±1 arrival tick moves occupancy by +3.2 % and +2.1 % at the shipped cadence — against a
tripwire noise ceiling of 2.38 %.** One arrival tick moves the workload's own cost driver by more
than the instrument's entire noise budget. And **122 → 123 is +26 % in one tick.**

**Three of the four `rooms`-rotation arms sit at a local minimum against both neighbours**, and
20, 60, 15 and 96 **all divide 1,440**.

> **This project chooses round cadences. Round cadences phase-lock. The chosen ones are extrema
> rather than typical points.**

Parked with its falsification test — 120 is a divisor and is *not* a minimum, so the rule is not
universal and the sweep decides it.

### 4. ADR-0015's OWN PRE-REGISTERED TRIGGER HAS FIRED

ADR-0015 justifies the tripwire's blind spot on one empirical claim: *"every performance defect in
twenty goals was 2.07×, 3.9× or 6.6×, and not one was a 10 % creep. **If this project ever produces
a drift-scale regression, this rule is the thing that has to change** — not the bound inside it."*

**G-028a produced 1.135× / 1.158× / 1.161×, three independent paired campaigns, distributions
non-overlapping in every one.** The plan pre-registers **both branches before the measurement**: if
the merge removes it, the premise survives; **if it does not, the class the gate declines to catch
is a class this project demonstrably produces, and that is an `ESCALATIONS.md` entry — a human
decision, not a diff.** That is the right shape and it is accepted as written.

### 5. The seam is TAKEN

G-032 as written is **six subjects with six failure modes**: an enumeration over the whole test
surface · two measurement campaigns with derived bounds · a `packages/sim` hot-path change · a
change to what an **invariant** gate means · a render-adjacent measurement · a stamp repair.
**ADR-0038's class produced seven instances across the last two goals on smaller diffs.**

**Taken as offered**: **G-032a** (the enumeration, both campaigns, the fingerprint pin, the
`TARGET` re-freeze) → **G-032b** (the merge, which *must* follow because it needs Campaign A alive
to be measured) → **G-032c** (I3's unquoted-key hole, which changes what an invariant means).
**The needs-history interval is deferred** — it is not a gate, not in `pnpm verify`, buys no row,
and is the most expensive item in the list. The reserved-hue measurement and the stamp predicate
are cheap and ride along.

**And the census method is the plan's best idea**: perturb **one line** — `report.ts`'s arrival
loop — and run the suite. It reaches every consumer *including tests that pass their own cadence
literal*, which a constant-perturbation would miss. **Whole census ≈3.5 minutes**, with the
permitted set **pre-registered so the count cannot be padded.**

## ADR-0039 AMENDMENT — §3's headline comparison was a SLOT-ONE ERROR, and the gate it accused was the one telling the truth

**Date**: 2026-08-14 · **Amends**: ADR-0039 §3 · **Raised by**: `sim-engineer` at G-032a's build,
**against its own plan's headline number.**

§3 recorded: *"±1 arrival tick moves occupancy by +3.2 % — against a tripwire noise ceiling of
2.38 %. One arrival tick moves the workload's own cost driver by more than the instrument's entire
noise budget."*

**The 2.38 % was the cadence-32 campaign's ceiling** — the stale one, the reason the row was red.
**Comparing it against a reading taken at cadence 96 compares a property of the WORKLOAD against a
property of a retired INSTRUMENT.** CLAUDE.md rule 4, slot one, **made in the plan that was
executing the REPLACE half of the rule it broke.**

**Re-taken at the shipped workload the ceiling is 3.55 %, and 3.21 % is below it.** The assertion
built on the comparison **went red exactly as pre-registered and is withdrawn, not widened** — the
epitaph is in the test.

> **The sentence was "the workload is noisier than the instrument can see." The measurement says the
> instrument, once it is looking at the right hotel, sees it fine.**

**What survives, and it is still the finding**: **±1 tick moves occupancy by 3.2 %, and 122 → 123
moves it 26 %.** A single-cadence reading is a single-cadence claim. **What does not survive is the
comparison to a number belonging to a campaign that had already been retired for being stale.**

**And the ordering hazard was answered by measurement rather than argument.** The same null at
95 / 96 / 97 reads **0.9896 / 1.0355 / 1.0044** — **the shipped cadence is the noisiest of its own
neighbourhood**, so the ceiling taken there is the conservative one. Recorded as observations
against which the bound is checked, **not pooled into it**: a different cadence is a different
configuration (ADR-0015's REPLACE half).

---

## ADR-0040 — A GATE THAT IS KNOWN RED HIDES ITS OWN DEFECTS. The cost is now collected, not predicted.

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: §9, ADR-0007, ADR-0015 · **Raised by**:
`sim-engineer` at G-032a, by fixing the row and finding what was behind it.

§9 warns that *a gate that is known red teaches people to skim the summary.* **That was a
prediction. It is now an observation, and the defect it hid is worse than the debt that hid it.**

`check-tripwire.mjs`'s `GUEST_LOOP` mutation pattern was **LF-only**. `materialise` reads a git
revision from the blob (**LF**) and the working tree from disk (**CRLF**), and `--null` measures head
against head — so **on a dirty tree, which is every moment an agent is mid-goal, every mutation
probe was inert.** The proof-of-bite row was proving nothing.

**Nobody could see it because the row was already red for an unrelated reason.** Three ruled-red
rows had been read as *"one ADR-0015 configuration debt, human-accepted"* for an entire session —
**and one of them was carrying a second, real defect the whole time.**

> **A ruled-red row is a place where a new defect arrives silently. The ruling explains the colour,
> so nobody asks what else is in it.**

**Repaired** with `\r?\n` built from a normal string and **compiled out of the shipped bytes** — the
old literal matched the CRLF tree `false`. **The proof now bites: both mutations red, the control green.** *(The three ratios first
recorded here — 2.27× / 1.69× / 1.00× — are **WITHDRAWN**. `sim-critic` re-ran them and read
2.14× / 2.09× / 1.03×; the constant arm differs by 24 %. They were three absolutes carrying **no
sample count, no aggregation and no regime** — three of rule 4's five slots — written into a ledger
a future reader would compare against, **by the orchestrator, from an agent's report, in the ADR
about a check that had stopped checking.** The claim that survives needs no stopwatch: both
mutations red, control green. **A ratio here was never the finding — the finding is that the
probe fires at all.**)*

**The rule this earns**: **when a gate is ruled red, the ruling names WHICH failure is accepted, and
the goal that repairs it must report what else was in the row.** An accepted red is a suspended
check, not a silent one — and this project ran for a session with three of them.

**And it is the argument for G-032's ordering, now evidenced rather than reasoned**: the
instrument-debt goal went before the circulation goals because the gates had stopped being evidence.
**They had stopped being evidence in a way nobody had guessed.**

## ADR-0041 — A GOAL'S DELIVERABLE MUST SHIP IN THE GOAL'S OWN COMMIT

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: §5 COMMIT, ADR-0038 · **Raised by**:
`sim-critic` at G-032a sweep 2.

**`check:stamp`'s body predicate is a scoped G-032a deliverable** (ADR-0039 §1, and named in the
goal block). **It shipped inside commit `55ca957`** — 196 lines of `stamp.mjs` and 153 of
`ledger-stamp.test.ts` — **whose subject line is *"M2.5 signed off, and WATCH #11 discharges three
goals in one look"* and whose body never mentions G-032a, `check:stamp` or ADR-0039.**

**The orchestrator bundled it while committing the human's sign-off**, because both were in the
working tree at the same moment and `git add -A` does not ask which goal a file belongs to.

### Why this is more than untidy history

**A critic sweeps the goal's diff.** A deliverable committed under another goal's message **is not
in that diff**, so it is not swept — and `sim-critic` correctly declined to count it as unswept
surface, because it could not have known to look. **The goal's own block lists it as in scope while
its critics were never shown it.**

> **A commit message is the boundary a reviewer's attention is drawn around. Work outside it is work
> nobody was asked to look at.**

### The rule

**Commit a goal's deliverables under that goal.** Where an unrelated commit must go out mid-goal —
a human sign-off, a hotfix — **stage explicitly rather than with `-A`**, and if something is swept
up anyway, **say so in the commit that closes the goal** so the reviewer knows where to look.

**This one is now recorded rather than rewritten**: `55ca957` is pushed, and rewriting shared
history to tidy an attribution would cost more than the defect. **G-032a's REFLECT names the two
files and the commit they are actually in**, which is the cheapest honest repair.

### And the ledger already had the general form of this

ADR-0038 says a fix pass is swept like a diff, and the unit is the enclosing block. **This is the
same rule one level up: the unit of a COMMIT is the goal, and a reviewer's unit is the commit.**
Both exist because **attention is drawn around a boundary, and work that crosses the boundary
silently is work that is not looked at.**

## ADR-0042 — THE ORCHESTRATOR RELAYS BUILDER CLAIMS AS FINDINGS, AND THE CRITIC KEEPS CATCHING THEM

**Date**: 2026-08-14 · **Status**: accepted · **Relates to**: CLAUDE.md rule 4, §5 VERIFY
(*"an agent's report that tests pass is not evidence"*) · **Raised by**: `sim-critic` at G-032a
sweep 3, where **four of five MAJORs were claims the orchestrator had already repeated to the
human as established.**

### The four

| what I relayed | what the tree says |
|---|---|
| *"the 0.9732 is not pooled, because folding it in would move the median and therefore the bound"* | **it would not.** Median at n=12 is index 6 = 1.1454; inserting it to make n=13 leaves index 6 = 1.1454. Bound unchanged either way — **and `PARKING.md`, in the same commit, states the correct arithmetic** |
| *"the anchor parse was LF-only, in the goal that wrote ADR-0040"* | **in JavaScript CR is itself a LineTerminator**, so multiline `$` matches before `\r`. The pre-fix spelling worked, and **the claim inflates ADR-0040's instance count** |
| *"14 tests time out across 10 files under load — pre-existing"* | **5 failures, not 14**, at the stated invocation — and *"pre-existing"* rests on **no paired HEAD arm at all** |
| *"the cross-file agreement check was removed because there is one copy now"* | **there are two.** `measure-arm.mjs` carries the same four numbers, **and the surviving copy is the unfenced one** |

### The mechanism, and it is not credulity

**§5 VERIFY already says an agent's report that tests pass is not evidence, and I have been running
every gate myself all session.** What I did not re-derive is the **reasoning attached to the
numbers** — the *why* rather than the *what*. A builder that has just measured something carefully
sounds most authoritative exactly where it is explaining what the measurement means, and **the
explanation is the part no gate checks.**

> **I verify the readings and relay the reasons. The reasons are where the errors are.**

Each of the four is *adjacent to* something true: a reading really was excluded, a regex really was
changed, the suite really does fail under load, a copy really was deleted. **The claim that failed
was the sentence about why.**

### The rule

**Before relaying a builder's REASON to the human, ask what would be true if it were false.** Three
of these four take one line of arithmetic or one grep to check:

```
node -e "..."                       # does inserting the value move the median?
grep -rn "0\.9268" --include=*.mjs  # is there really one copy?
node -e "/…$/m.exec(crlfText)"      # does the old pattern really fail on CRLF?
```

**And where the reason cannot be checked in a line — "pre-existing", "the same class as", "this is
why it happened" — relay it as the builder's account rather than as a finding**, which costs one
word and is the difference between a report and a claim.

### Why this ADR rather than a note

**Nine goals this session recorded slot-one errors, six of them mine.** This names the specific
route: **not measuring badly, but transmitting an explanation I did not test with the confidence of
a number I did.** The human has been reading those explanations as verified because I presented
them that way.

## ADR-0041 AMENDMENT — the bundled deliverable broke CI, and nobody looked for three commits

**Date**: 2026-08-14 · **Amends**: ADR-0041 · **Raised by**: the orchestrator, checking CI before
stopping for the week.

ADR-0041 recorded that `check:stamp`'s body predicate — a scoped G-032a deliverable — **shipped
inside `55ca957` under the human's sign-off message**, so its critics were never shown it. The
argument was about **review attention.** The cost turned out to be larger and simpler.

**CI on `55ca957` failed, and one of its failures is `tools/headless typecheck: Failed` on all three
platforms.** The three red gate rows in that run are expected — they were red at that commit — but
**the typecheck failure is not, and it was introduced by the bundled files.** Local `typecheck` is
green now, so it was repaired somewhere inside G-032a's diff **without anyone knowing they were
repairing it.**

> **A deliverable committed under another goal's message is not reviewed, not verified against that
> goal's exit criteria, and — as it turns out — not noticed when it breaks the build.** Three
> commits passed before anybody looked.

**What made it invisible**: `pnpm verify` runs typecheck first and I ran it repeatedly — but always
on a **working tree**, never on `55ca957` as committed. **The tree was ahead of the commit the whole
time.** CI is the only instrument that tests what was actually pushed, and CI was not read for
three commits.

**The rule ADR-0041 already states is sufficient** — commit a goal's deliverables under that goal,
stage explicitly rather than with `-A`. **What this amendment adds is the reason it is not
bookkeeping**: the unreviewed file was also the unbuilt one.

**And it names a gap in this project's own loop.** §5's COMMIT step has no "read CI" clause, and
`GOALS.md` requires *"CI green on three platforms"* as an M3 exit criterion **per goal** — but
nothing prompts anyone to look between goals. **Three of today's commits went out unchecked.**
Whoever resumes M3 should read CI **before** starting the next goal, not at its exit.

### ADR-0041 amendment — the CI reading, completed

**Checked again before stopping**: **two completed runs, both RED — `55ca957` and `40ddd36`, both
predating G-032a** — and **three still in progress** (`16ef890`, `ba9f09a`, `da0a94f`), which are
the commits carrying G-032a's repairs and the only ones that could show thirteen green on a remote.

**So the last confirmed CI state of this project is RED**, on two commits whose failures are
explained — the three ruled-red gates, which were genuinely red at those commits, plus the
typecheck defect this amendment records. **Nothing yet confirms the repair on any platform but
this one.**

**Recorded this way deliberately.** `pnpm verify` is thirteen green *locally*, and every reading in
today's ledger is a reading from one machine. **I2's whole point is that a hash must be identical on
every platform, and that clause has only ever been executed by CI** — twice, at G-022 and at run
number 8. **A green local verify is a claim about a developer box.**

## ADR-0043 — THE LOOP'S OUTPUT SHIFTED FROM THE GAME TO THE LOOP. Human ruling, 2026-08-14.

**Status**: accepted · **HUMAN RULING** · **Supersedes**: ADR-0032 §4's notice (called) ·
**Relates to**: ADR-0022, ADR-0040, §7.1, §8.

### 0. The diagnosis, recorded rather than inferred

ADR-0032 opened with the human's ruling of 2026-08-13 — *we should be past M3 by now*. **The
diagnosis was right and the four changes were right.** What the record shows since:

**M3 has one goal done and it is an instrument goal. The next two named are also instrument goals.
ADR-0040, ADR-0041 and ADR-0042 were all written on 2026-08-14. Every one is a real finding. None
of them is circulation.**

> **The finding is not that any goal was wrong. It is that the loop's output has shifted from the
> game to the loop, and no rule currently notices that, because every individual step is
> justified.**

**The instrument work is not disowned.** ADR-0040 is the argument in its strongest form: the CRLF
mutation defect was hiding inside a ruled-red row and nothing else would have found it. **That
argument has now won three times — G-022, G-032, and ADR-0040's retrospective — and each time it
wins, the game work waits.**

### 1. THE SWEEP-3 NOTICE IS CALLED. Sweep 3 becomes a scanner.

ADR-0032 §4 put sweep 3 on notice with a stated condition. **That condition has been met three
times: G-028a, G-028b and G-032a each closed on verifications returning UNPINNED-CLAIM findings
only.**

**Ruled**: build the scanner; **sweep 3 drops to a scanner pass by default.**

- **Sweeps 1 and 2 are untouched. The plan review is untouched** — ADR-0032 §4 is right that it is
  the cheapest round in the loop, and it has killed two designs before code.
- **The scanner owes a proof-of-bite** like every other scanner (M2 exit ruling), **in ADR-0040's
  shape: built from a normal string, not a literal, and shown to bite on a CRLF tree.** The last
  three scanner defects here were all predicate errors nobody could see.
- **An agent sweep 3 remains available on request**: a critic that says at sweep 2 that it has diff
  left gets its third sweep. **What is dropped is the automatic third pass.**

**Scored prediction (the human's, recorded so it is falsifiable)**: *if the scanner lands and goals
still close on agent-found unpinned claims at the same rate, the class was not scanner-shaped and
the notice was wrong.* **Score it at the third goal after it lands.**

### 2. THE INSTRUMENT TRACK IS CAPPED. M3 does circulation.

**G-032b and G-032c finish. Then M3 runs circulation goals only, to G-026.**

**Any instrument debt discovered between here and M3 exit is written to an M3-EXIT goal in G-022's
shape — not built when found.** G-022's precedent stands; **what moves is where it sits: at the
exit, not the entrance.**

**THE EXCEPTION, STATED BACK SO IT IS BOUNDED**: *an instrument debt that makes a gate stop being
evidence is not deferrable.* **ADR-0040 is exactly that case — a ruled-red row carrying a second,
silent defect.** If that shape recurs, **escalate rather than defer, and say which of the two it
is**: a gate that has stopped being evidence (not deferrable), or a debt that merely makes an
instrument less good (deferred to the exit goal). **The burden is to name which, in the escalation,
before any work starts.**

### 3. AN ADR AMENDED TWICE WAS WRONG, NOT INCOMPLETE.

`DECISIONS.md` carries four ADRs with two amendments each. **An amendment to an amendment is a
decision nobody can hold in one piece, and this project already applies the correct rule to code:
repair the class, not the instance.**

**Ruled**: an ADR reaching a **second** amendment is **superseded by a single restated ADR** saying
what is true now, **with the originals struck and pointing forward — not edited. Struck**, per the
file's own rule.

**ADR-0036 and ADR-0037 are done now**, both being live and load-bearing on the review scorer.
**ADR-0025 and ADR-0028 are closed subjects; strike-and-restate only if a goal needs to cite them
again.**

### 4. WHAT THIS RULING DOES NOT DO — stated back so the bounds are recorded

1. **It does not weaken any invariant, and it does not touch §2.**
2. **It does not cut the plan review, or sweeps 1 and 2.**
3. **It does not defer an instrument debt that has stopped a gate being evidence.**
4. **It does not reopen any sign-off.**
5. **It does not permit a goal to close on an unswept diff. §7.1's three states are unchanged** —
   DRY, OPEN, UNSWEPT, and **UNSWEPT at round 3 still escalates and splits the goal.**

### 5. Two corrections to the ruling's own premises, checked against the tree

**G-028 IS ALREADY DONE.** §4 says it *"goes before the M3 circulation goals if it is not already
done"* — the conditional does not fire. **G-028a closed at `81676e5` and G-028b at `e1623b4`**, both
in ADR-0033's re-aimed shape (the one-tick snapshot, not the scorer's arithmetic), and **M2.5 was
signed off by the human at `55ca957`.** The build loop's review signal is repaired and asserted.

**AND THE THREE-OS CI REQUIREMENT IS CURRENTLY UNMET.** *"Every M3 goal still needs a green three-OS
CI run. That stands."* — **the last completed CI run is RED**, on two commits predating G-032a, with
three runs pending. **G-032b cannot close on that criterion until CI is read and green**, which
makes reading it the first act of the next goal rather than a courtesy.

## ADR-0044 — WHERE THE AMENITY INVERSION LIVES, AND WHAT THE BIND-TIME FLOOR IS

**Date**: 2026-08-14 · **Status**: accepted · **SUPERSEDES ADR-0036 and its two amendments**
(ADR-0043 §3: an ADR reaching a second amendment is restated, not amended again). **Read this
instead of them.**

### 1. The inversion is in the REPORT ROW, not in the score

Adding an amenity makes the **report's worst engagement row** rise — at four of six room counts,
with no confound at six rooms (identical departure table, identical `instanceTicks`, capacity
demonstrably gained). **It does not make any guest's own worst need worse.**

The two statistics are different objects, and `max` does not commute with a population average:

| | fold |
|---|---|
| the golden's row | ratio of sums per need, **then max across needs** |
| the scorer | a per-need band **within a guest**, then a mean over guests |

**The mechanism**: a guest holds one provider at a time, so serving one need better spends the ticks
it was spending on another. **Ticks move between rows; a guest's personal maximum does not rise.**

**The golden stays green and stays true — it measures a report row.** Its describe must not read as
a claim about the score.

### 2. The bind-time floor: NUMBER KEPT, WARRANT RESTATED, LABELLED A DIAL

The refusal said a top review must be unreachable while any need is unmet, *"which holds **only
when** the scale has more scores than there are needs"* — **that necessity is FALSE** under the
shipped scorer; the property holds at any scale of two or more bands.

**Kept, because deleting a bind-time refusal lets content ship below it silently and permanently.**
The available warrant is **resolution** — with `B` bands, *met* means *unserved for less than `T/B`
of the stay* — **which is a content dial, not a derivation (ADR-0013 §4), and it ships labelled as
one.**

> **Keeping a check whose warrant changed is legitimate. Keeping a message that states a false
> necessity is not.**

**And that false sentence outlived its own correction**: removed from the refusal and asserted
against by name, while **the identical claim stayed live in the law-A violation message one file
over** — ADR-0038's scope clause, which is why the restatement says it once, here.

### 3. What ADR-0036 got wrong, kept because the error is the reusable part

**Its §1 answered that the score is flat on the amenity axis "because that was not your bottleneck."
That was true and irrelevant.** The score equalled `min + (bands−1) × checkedOutShare` at **27 of 30
cells** — a threshold test on *did you get a bed*. At one configuration comfort's unserved share fell
**118×**, with **305 of 356 guests improving and zero worsening**, and the score moved
**2.0787 → 2.0787**.

> **I checked that it did not FALL and never checked whether it MOVED.** *"It does not punish
> investment"* and *"it responds to investment"* are different claims, and only the first was
> measured.

---

## ADR-0045 — THE REVIEW IS THE MEAN OF PER-NEED BANDS

**Date**: 2026-08-14 · **Status**: accepted, **human-confirmed** · **SUPERSEDES ADR-0037 and its
two amendments** (ADR-0043 §3). **Read this instead of them.**

### 1. The rule

```
score  = min + floor( sum of band_i over needs / N )
band_i = min(bands-1, floor((T - u_i) * bands / T))
```

**Per-need band FIRST, then the mean. The double rounding is the design**, and it is what separates
this from the pooled score that was rejected: pooling sums *unserved ticks* and bands once, and the
falsification vector — one need starved 80 % of a stay, three perfect — scores **top**. Banding per
need first, the same vector scores **4**. **The per-need floor is what costs the starved need its
band, and removing it IS the rejected score.**

**`met_i` is that need's band being top**, which restores review law A **by construction**:
`floor(mean) = bands-1` **iff** every band is top. Measured **0 red of 30 cells**, against **11 of
30 red** if the scorer moves alone — that coupling is why the four things move together.

**A guest that never got a bed can never leave a top review** — lodging band 0 caps the mean.
**Structural, not content luck.** The bounded exception is a **vector that does not contain the
lodging need at all** — a v5-migrated guest — **and that is the tested case.** *(The original ADR
bounded this on need COUNT, which was the wrong variable: at one need the guest scores the FLOOR,
which is stronger.)*

### 2. THE TRADE, NAMED — human-confirmed, and reversible

> ***"One starved need must cost nearly everything"* and *"the score must respond to what a player
> builds"* are in DIRECT MEASURED TENSION, and none of eight candidates satisfied both.**

**A guest with one need starved for its whole stay scores 4 of 5.** The runner-up — worst-need-
decides at eight bands — costs it nearly everything and responds to about **3 % of scale**, and
above ten bands the top band becomes unreachable so **law A inspects nothing**.

**Ruled for responsiveness, on the loop rather than the vector**, and **confirmed by the human on
2026-08-14**: a score that is occupancy at 27 of 30 configurations tells a player only whether
people got rooms. **Severity is a dial; blindness is structural.**

### 3. Why the per-need DENOMINATOR was falsified, since it will be proposed again

Lodging scored against `toleranceTicks` and engagement against the stay reads **flat at its own
named test**, and **introduces a fall the ruled score does not have.**

> **Every give-up has lodging unserved for exactly its stay, and a give-up departs AT the tolerance
> — so stay, tolerance and wanted-ticks are the same number for the term that saturates. A guest
> that never got a bed was failed on lodging for 100 % of every window you can measure it against.
> The saturation is not a denominator artefact; it is the truth about that guest.**

The third candidate the direction implies — **ticks the need was wanted** — was built and measured
too, and is deader still.

### 4. What is measured at ONE CADENCE and must be quoted that way

**"The score never falls on either single axis" is scoped to the cadence it was measured at.** Both
axes fall over a contiguous band of cadences, and the ±1-tick discriminator returns *not a
confound*. **The repair is real at the shipped cadence — 40/40 grid cells, 9/9 cadences there — and
"zero falls" unqualified is withdrawn.**

> **A property quantified over one dimension is a claim about the dimension you swept and a guess
> about the one you did not.**

### 5. Known limits, carried forward rather than buried

**The score saturates above the derived provisioning point** — no quality axis exists in content
yet · **the visitor population is structurally capped**: on lodging-free content every visitor
scores the same value at every provisioning level, so **the build-loop signal for a food court is
exactly zero** · both are parked with their falsification tests.


## ADR-0046 — THE GAME IS AN ISOMETRIC FLOORPLAN SIM, AND ROOMS ARE DESIGNED BY THE PLAYER

**Date**: 2026-08-16 · **Status**: accepted · **HUMAN RULING**, and the largest in the project.
**Supersedes** `HOTELSIM.md` §1's *"Side-on cross-section view (think SimTower / Project
Highrise), not isometric"* and every criterion, ADR and goal resting on it.

### 0. The decision

**The game is an isometric floorplan sim in the Theme Hospital / RollerCoaster Tycoon tradition.**
Multi-floor, **one floor rendered at a time**, floors switchable, cityscape behind and below.
**The nostalgic register is the point, not a side effect.**

**And rooms are designed by the player, not placed from a catalogue.** The player draws a room's
footprint, places items inside it, and the room is scored on what it contains — **function from
required equipment, quality from size and decor**, in the shape Two Point Hospital uses.

### 1. THE FINDING THAT MATTERS MORE THAN THE DECISION

> **This project has verified everything except whether it was building the right game.**

Six invariants. Thirteen gates. Fifty-seven ADRs. Determinism proved byte-identical on three
platforms, twice. Nineteen goals of instrument discipline. **And the thing that turned out to be
wrong was a projection choice made before the first line of code, which nothing in the loop was
ever pointed at.**

ADR-0013 established that a perceptual criterion needs a perceptual check. **The gap one level up
is that a design decision had no check at all — not a weak one, NONE.** §1 named the view in its
second paragraph and no goal, gate, critic or WATCH has ever been able to question it, **because
every one of them takes the charter as given.**

**THE RULE THIS EARNS, AND IT GOES IN §9 RATHER THAN BEING RECORDED AS AN APOLOGY:**

> **A charter decision that no goal can question is not settled — it is UNEXAMINED. At each
> milestone exit, the human is asked one question that is not about the code: DOES THE THING ON
> SCREEN STILL LOOK LIKE THE GAME WE MEANT TO BUILD?**

Cheap, a human call by construction, and **it would have caught this at M2.5's sign-off instead
of four goals into M3.** It is the ADR-0013 argument applied to the charter rather than to a
criterion. **It must not become a large mechanism: one question, at exit, answered by the human.
If it grows a scanner, it has been misunderstood.**

### 2. WHAT SURVIVES — MOST OF IT, and the temptation is to over-estimate the damage

**`packages/sim` largely survives, and that is I1 doing exactly the job it was written for.**
Needs, utility scoring, the provider registry, satisfaction and patience, the append-only ledger,
reviews and the scorer, save/migration machinery, determinism, the tick scheduler, the outcome
tables — **none of it knows what a camera is. Nineteen goals of simulation work is not lost.**

**`packages/content` survives structurally** — the Zod schemas, injection (ADR-0001), integer
pence (ADR-0002), snake_case IDs (ADR-0003) all stand. What changes is **what a room type is**.

**The loop, the gates and the ledgers are untouched.** All six invariants stand exactly as
written. ADR-0007's six amendments, §5.5–5.8, §7.1's three states, ADR-0015/0016, ADR-0024,
ADR-0027, ADR-0040/0041/0042 — **none of that was about the projection.**

### 3. WHAT DIES, stated plainly so it is not mourned twice

- **`apps/game` is a write-off.** G-030 and G-031a are lost **as code**. **Their DESIGNS are
  not**: the queued-command ghosts, the recorded-refusal flash, the transport strip reading the
  content ladder, the HUD's `last`/`refused` fields, and **the deliberate choice not to grey out
  illegal moves** are all good and all portable. **Rebuild them; do not redesign them.**
- **The computed palette is superseded in its current form** — see §6.
- **`tools/viewer`** was already disposable by ADR-0013's own terms and its drawing is already
  known stale. **It costs nothing.**
- **M3 as currently planned is VOID.** G-023b, G-024, G-025 and G-026 all assume a
  one-dimensional floor. **They are rewritten, not amended.**

**M0, M1, M1.5, M2 and M2.5 sign-offs are NOT reopened.**

### 4. THE TWO REAL MODEL CHANGES — done together, because splitting pays the migration twice

> **SUPERSEDED IN PART BY ADR-0048 §3 — the "done together" clause only.** The accepted plan
> splits the grid change (G-034) from the room model (G-036), with **G-035 between them**,
> because **§7's instrument requirement outranks the shared-migration argument: the view cannot
> wait on the room model.** The axis/validity/migration content of this section stands.

**4.1 The grid gains an axis.** `(floor, x)` becomes `(floor, x, y)`. **A floor is a plan, not a
strip.** Build validity is reworked — supported, enclosed, has a door, holds required items —
**the rules surviving and their implementation changing.** This is a save migration. **ADR-0006
holds: the v1 fixture is permanent and is not regenerated.** Seventeen migrations deep is not a
reason to break the chain; **it is the reason the chain is worth something.**

**4.2 A room becomes an INSTANCE, not a definition.**

- A **room type** becomes a **constraint set**: min/max footprint, required items, forbidden
  adjacencies, what need it can serve.
- A **room instance** carries its own player-drawn footprint, its own placed items, and a
  **derived quality score folded from what is inside it.**

**I3 is not weakened and ADR-0003 stands.** Types and constraints stay in `packages/content` as
JSON. **The instance — the player's drawing — is world state, and has always belonged there.**

**The scoring formula is CONTENT, not code.** Weights, thresholds and band boundaries go in JSON
like every other balance number. **This is I3's whole point and the first mechanic where a
designer will want to tune without a rebuild.**

**`placeItem` is promoted out of M6 to the CENTRE of this work.** It stops being a late
convenience and becomes **the primary player verb.**

**4.3 What this buys.** The room scorer feeds the guest loop **through machinery that already
exists**: providers sit inside rooms as items, reviews already read per-need satisfaction
(ADR-0034/0037), room quality is already a concept. **Two Point's scoring is a formula over
placed items, and the provider registry is already the right substrate. This is less new
mechanism than it looks.**

### 5. CIRCULATION, RE-SCOPED

Pathfinding stops being trivial, **and that was the honest cost of the original choice.** It is
now **A\* over a single floor's tile grid, plus stair and lift nodes joining floors** — a
well-understood problem, **per-floor rather than volumetric.**

**Multi-floor is kept and lifts stay meaningful**, because guests genuinely cross floors even
though only one is drawn at a time. **M3's STATEMENT is unchanged** — stairs and lifts as queued
shared resources, wait time a first-class satisfaction input. **Its GOALS are not.** Everything
M3 already learned is retained: ADR-0017/0018's feel work, the dwell term, G-023a's *"a guest is
somewhere"*. **The grid underneath changes; the findings do not.**

### 6. ART DIRECTION, decided now rather than at the milestone

ADR-0014 still holds — placeholder art, real art a separate track, M5 waits on neither. **What
changes is the projection.**

- **2:1 isometric tiles. Pick the dimensions ONCE, before any asset exists.**
- **Placeholder art is flat coloured isometric prisms** — the same discipline as the current
  rectangles, in the new projection.
- **The computed contrast ladder survives as the FALLBACK, not the rule.** Content gains an
  optional sprite reference; the renderer prefers a sprite and falls back to the computed colour.
  **This keeps ADR-0014's "real art is a separate track" true IN CODE rather than only in prose**
  — the game can ship with half the room types drawn and half as prisms and nothing breaks.
  `palette.contrast.test.ts` continues to assert over everything still using the fallback.
- **Guests are drawn GREYSCALE with strong silhouettes and tinted at runtime.** The renderer
  encodes guest state in colour, and **a sprite with baked colour destroys that.** Pixi's `tint`
  does it for free.
- Floors switchable, drawn one at a time, cityscape parallax behind and below.
- **Sprites packed into a texture atlas.** One GPU texture, not a hotel full of PNGs.

**Do not buy or commission anything yet** — art bought against the current build is art bought
against the wrong spec.

### 7. THE INSTRUMENT PROBLEM THIS CREATES

**Both WATCH surfaces are about to be invalid.** ADR-0023 made `apps/game` the surface of record
and it is being written off; `tools/viewer` is already stale. **So the next behavioural goal has
no instrument, which is precisely the state ADR-0013 was written to end.**

> **RULED: the isometric floorplan view is restored EARLY, as its own goal, BEFORE the room model
> work lands.** Not a polished renderer — **the WATCH surface, in G-030's shape**, which proved
> it can be done in one goal. Coloured prisms, floor switching, guests, the HUD fields worth
> keeping.
>
> **A behavioural goal that ships with no instrument to watch it is an ESCALATION, not a recorded
> debt.**

### 8. Ordering constraints the plan must satisfy

1. **G-032c lands FIRST.** I3's unquoted-key hole is a known gap in an invariant gate, and **the
   content schema is about to be rewritten** — the moment when the most new content surface in
   the project's history gets written. **Repairing a content gate after rewriting the content
   model is the wrong order.**
2. **G-032b stands** (a `packages/sim` hot-path merge; the sim survives). **Take it or park it
   explicitly with a reason — do not let it drift.**
3. **G-028** is game work whose subject survives. **Rule on before-or-after the grid change and
   say why.**
4. Then: **grid depth and build validity → isometric view restored (§7) → room drawing and item
   placement → room scoring → circulation.**
5. **M4 stays blocked on scenario capital.**

**The measurement campaigns need re-taking again** — the grid change and pathfinding alter what
the workload means, which is **ADR-0015's REPLACE-on-configuration-change case**, already ruled
and precedented at G-032a. **Schedule it at the EXIT in G-022's shape; do not let it become the
entrance.** ADR-0043 §2 stands, with its exception for a gate that has stopped being evidence.

**Every goal still needs a green three-OS CI run. The I2 hash will move with the migration —
expected; what is not acceptable is it moving UNVERIFIED.**

### 9. WHAT THIS RULING DOES NOT DO — stated back so the bounds are recorded

- **It does not weaken any invariant.** All six stand exactly as written.
- **It does not reopen M0, M1, M1.5, M2 or M2.5 sign-off.**
- **It does not change the loop, the critic protocol, the gates or any process ADR.**
- **It does not discard `packages/sim`.**
- **It does not permit new scope beyond what is written here.** Anything else surfaced goes to
  `PARKING.md`.
- **It does not make §1's new milestone question into a mechanism.** One question, at exit,
  answered by the human.

### 10. Two premise checks against the tree, recorded rather than quietly satisfied

- **The ruling is right that G-031a shipped, and `GOALS.md` is WRONG about it.** My first reading
  of the tree said G-031a did not exist, because the only block is `## G-031 — The player acts`
  and **it still reads `Status: pending`**. The commit history says otherwise: `7f0be45` —
  *"needs are stocks (G-027b θ-a) + the playable surface (G-031a)"* — and `GOALS.md:47` records
  WATCH #11 closing against θ-a **and G-031a** by name. **A goal shipped, was watched, and its
  block was never updated; the ledger has been carrying it as unstarted ever since.** That is the
  seam-not-recorded failure of this session in its most consequential form yet — **this ruling's
  own damage assessment was nearly mis-scoped by it**, in both directions. Repaired as part of
  the write-off rather than left, since the block is about to be rewritten anyway.
- **`apps/game` is not empty** — G-030 shipped it and `check:ladder` scans it. **Writing it off
  therefore removes a `verify` row's subject**, and the row must be re-pointed or re-derived
  rather than left scanning a deleted directory. Tracked in the plan below, not assumed.

---

## ADR-0047 — THE DECISION REGISTER, RULED. The blocking set, and what is parked.

**Date**: 2026-08-16 · **Status**: **PROPOSED — awaiting the human's accept/overrule.**
**Companion to ADR-0046**, which carries the ruling itself. The human wrote the register *before*
the ruling *"so the ruling is made once"* and asked for recommendations to accept or overrule.

**THE ORGANISING PRINCIPLE IS THE HUMAN'S AND IT IS RIGHT**: a decision blocks if it constrains
**the save schema, the grid, or the art pipeline**. Everything else is a balance number and
belongs in content, where it moves at any time. **The blocking set is decided here; the rest is
parked with a falsification test.**

### A — GRAPHICS PIPELINE

**A1 — authoring route. ACCEPTED: 3D-rendered sprites for the real track, procedural coloured
prisms as placeholder (no assets at all).** It is the only route where camera rotation and walk
cycles are **additive rather than multiplicative**, and A5/A6 both depend on that being true.
*Not blocking today* because the placeholder track needs no assets — but it constrains A5, so it
is settled now rather than discovered.

**A2 — tile dimensions. ACCEPTED with the derivation the ruling demands, since §2.1 forbids a
number nobody can source.**

- **2:1 ratio, 128×64 logical, authored at 2× (256×128) for high-DPI.**
- **Wall height 64px** — *derived, not chosen*: at 2:1, a tile's 64px height is the projection of
  one grid unit, so a one-unit wall is 64px and **a wall is exactly as tall as its tile is deep.**
  That makes the floor band `64 × (rows) + 64` and keeps every vertical rhythm an integer
  multiple of one number. **The alternative — a "looks right" wall height — is the superstition
  §2.1 names.**
- **This is unrecoverable if wrong, so it ships as pinned constants with the derivation beside
  them and a test that asserts the ratio**, in the shape `speed-ladder` uses for the play speeds.

**A3 — depth sorting. ACCEPTED, and it gets a test rather than a debugging session.** Sort by
`(x + y)` per floor with an **explicit within-tile layer index: floor → wall → item → guest →
overlay**. **Multi-tile items are FORBIDDEN until a goal handles them properly**, and that
prohibition is a check, not a comment — otherwise the first bed that spans two tiles is a visual
bug nobody can reproduce from a save. *This is the one Part A item I would most expect to bite
late, which is the argument for pinning it before any sprite exists.*

**A4 — seeing into a room. ACCEPTED: draw the two far walls (north and west), leave south and
east open.** Free, it is the nostalgic register the ruling asks for, and **it removes the problem
rather than managing it.** Noted interaction with A5: if the camera rotates, *"far"* rotates too,
which is why the wall-drawing rule is written as a function of orientation from the start even
while only one orientation ships.

**A5 — camera rotation. ACCEPTED: build rotation-capable, ship ONE orientation.** Tile addressing
stays rotation-agnostic so rotation is a later **feature, not a rewrite**. Decided now because it
constrains A1 and A4, **not because it needs to exist at launch.**

**A6 — guest sprites. ACCEPTED, and one half of it is load-bearing rather than aesthetic.**
**Greyscale with strong silhouettes, tinted at runtime** — the renderer encodes guest state in
colour, and **a sprite with baked colour destroys a visual language the sim already feeds.**
**Four facings ship; eight is a render setting, not a redraw**, which is A1 paying for itself
immediately. Walk cycles land with movement, not before.

**A7 — zoom/resolution. PARKED**, with the ruling's own reason: decide when the renderer is
rebuilt. *Falsification test: if the atlas has to be re-packed to add a zoom level, it should
have been decided at A2.*

### B — WORLD MODEL (all blocking; these set the save schema)

**B1 — footprints. ACCEPTED: rectangles first, stored as a shape that could generalise.** Two
corners in the save; **the storage shape is a polygon-capable representation holding a rectangle**,
so arbitrary shapes are a later goal rather than a later migration. *Arbitrary polyominoes
multiply validity, scoring, pathing and rendering cost simultaneously — four subsystems, one
mechanic.*

**B2 — corridors. ACCEPTED: EXPLICIT.** The human calls this the most consequential entry in the
register and **that is correct**. It is what makes the building loop a spatial puzzle rather than
a menu, **and the room-design mechanic needs a reason for space to be scarce** — without scarcity,
"bigger is better" has no counterweight and B7's pricing has nothing to trade against. It also
makes pathing well-defined, which §5 now needs.

**B3 — plot. ACCEPTED: fixed plot, expandable upward, BOUNDS STORED rather than constant.**
Storing them is the whole decision — buying land becomes an M4 economy feature instead of a
migration. *(`grid.ts` already stores bounds rather than hardcoding them, so this is continuity.)*

**B4 — editable rooms. ACCEPTED: yes, mutable.** Central to a design-and-score loop, and
**retrofitting mutability into a write-once schema is the painful direction.**

**B5 — condition / cleanliness. ACCEPTED: reserve the field now, build at M4.** *This is the one
place I would push back slightly on scope and the ruling already anticipates it* — reserving a
field is free, building housekeeping is a milestone. **Reserved, not built.**

**B6 — access rule. ACCEPTED: rooms carry public / guests-of-this-room / staff-only, content-
defined per room type.** This was already parked from the current build as an edge case; **player-
designed rooms turn it into a certainty** — someone will put a vending machine in a bedroom on
purpose.

**B7 — pricing granularity. ACCEPTED: per room INSTANCE.** The natural consequence of bespoke
rooms, **it is what makes the scoring mechanic pay off directly**, and it is a schema change so it
is decided now. *Note it lands on `packages/sim`'s existing per-stay charge, which already prices
from a room — so this is a field moving, not a mechanism arriving.*

**B8 — multi-floor. ACCEPTED in all three parts**: adding a floor costs money (**the build loop
needs a large sink**); stairs cheap/slow/unbounded vs lifts expensive/fast/queued, **already M3's
scoped difficulty**; and **a floor-count patience input** that makes lifts necessary rather than
optional. The third is a **content number** and ships as one.

### C — GAMEPLAY

**C1 — sandbox or scenarios. RULED NOW, BUILT AT M6: SCENARIOS.** The ruling is right that this is
not deferrable, and there is a second reason it should be settled today: **it resolves the
`--rooms N` contamination this project has carried since M1.** Starting capital and starting
provisioning become **scenario fields, which are content (I3)** — so the harness stops injecting
world shape through a CLI flag and starts declaring it as data. **M4's "blocked on scenario
capital" stops being a blocker and becomes a dependency with a known shape.**

**C2 — scoring inputs. SHAPE PINNED NOW, NUMBERS AT M4.** The fields that must exist: **function**
(binary gate on required items), **size** (diminishing returns, with an upkeep cost so bigger is a
trade), **decor** (attractiveness-carrying optional items), **condition** (B5, reserved),
**adjacency** (penalties and bonuses). **Every weight, threshold and band boundary is content
(I3)** — and ADR-0045's per-need banding is the precedent for how such a fold is written and
falsified.

**C3 — what the score DOES. ACCEPTED all three, and the ruling asks which is PRIMARY.**
**Recommendation: SATISFACTION is primary**, with price ceiling and reputation secondary. Reason,
and it is mechanical rather than taste: **satisfaction is the one the existing sim can already
consume** — reviews read per-need satisfaction today (ADR-0034/0045) — so it is the shortest path
from a room score to an observable consequence, **and it makes the build loop about throughput,
which is what a hotel with scarce corridors and queued lifts is already about.** Price-primary
would make the game about margin and would lean on an economy that is M4's, not M3's.

**C4 — staff roles. NAMED, NOT BUILT**: housekeeping (B5), reception (C5), maintenance, porters.
Named because **each is a room requirement and a pathing consumer**, so M3's circulation must be
able to carry them.

**C5 — reception as a queue point. PARKED with its test**, but flagged: it is a queue, and M3 is
the milestone that builds queues. *Falsification test: if M3's queue machinery cannot express a
check-in desk without changing shape, it was scoped too narrowly and this should have been in it.*

**C6, C7 — PARKED** (archetypes M6, already parked; bookings / day-night / seasons all balance-
shaped, M4 or later).

### The bound this ADR puts on itself

**Everything above that is not in the blocking set is a `PARKING.md` entry with a falsification
test, not a plan.** ADR-0046 §9 says this ruling permits no new scope, and **a register is not a
backlog**: nothing here is scheduled by being written down. The blocking set exists because the
save schema, the grid and the art pipeline are expensive to change afterwards — **that is the
whole reason any of it is being decided today rather than when it is built.**

---

## ADR-0047 AMENDMENT — ACCEPTED, wall height stays provisional, and three fixes to the plan

**Date**: 2026-08-16 · **Status**: **ACCEPTED** (was PROPOSED) · **HUMAN RULING.**

### 1. Wall height is PERCEPTUAL and is not locked yet

The derivation stands and is the right *form* — at 2:1 a tile's screen height is one grid unit, so
a one-unit wall is 64px. **But wall height is a perceptual property with a mathematical
derivation, and ADR-0013 says a perceptual criterion needs a perceptual check.**

> **The human's own recent record is the argument**: *"I predicted 48s/day would read sluggish,
> you watched it, it read brisk. The arithmetic was fine and the inference from arithmetic to
> feel was wrong."*

**Ruled**: derive it as proposed, **ship G-035 with it, LOOK at it, then lock it.** Tile
dimensions **stay locked now** — the atlas depends on them. **Wall height is one constant in the
renderer and costs nothing to leave provisional for one goal.**

**A DERIVATION IS NOT A PERCEPTUAL CHECK, EVEN WHEN IT IS CORRECT.** §2.1 demands a number be
sourceable; ADR-0013 demands a *perceptual* number be seen. **Those are two requirements and
satisfying the first has twice now been mistaken for satisfying the second.**

### 2. G-028 was ruled in prose and absent from the table — my own defect class, one message on

The placement (after G-035) is accepted. **But the numbered plan ran G-032c → G-032b → G-034 →
G-035 → G-036 → G-037 → G-038 → G-039 and G-028 was not in it.**

> **That is the G-031a defect class — a decision that exists in one record and not the other —
> committed ONE MESSAGE AFTER catching G-031a, in the write-up of the catch.** §5.8 applies to a
> repair as much as to a diff: **a fix on a known class must state where else that class lives**,
> and the first place to look is the document making the fix.

**And a substantive consequence to state in the block rather than discover**: C3 makes
satisfaction primary, so **room score → satisfaction rate → reviews**. That puts **G-028 upstream
of its own new input.** Landing it before G-037 is fine; **it will need a re-sweep when scoring
lands, and the block says so up front.**

### 3. `check:ladder` is re-pointed in the SAME COMMIT that empties `apps/game`

**Not at the exit.** If `apps/game` empties at G-034 and the gate is not re-pointed until G-039,
then **for five goals `check:ladder` scans an empty directory and reports green** — a gate that
passes while inspecting nothing, which is **ADR-0007's founding case, carried deliberately through
the largest rebuild in the project.**

**AND THE RULE THAT GENERALISES, WHICH IS THE POINT**: 

> **A SCANNER GATE THAT INSPECTS ZERO FILES FAILS.**
>
> **Every scanner here has a proof-of-BITE; none has a proof-of-SUBJECT.** One line per gate, and
> it closes the class rather than this instance.
>
> **CORRECTION, FOUND WHILE BUILDING IT: "none" WAS WRONG. `check:ladder` HAS HAD ONE SINCE
> G-030**, with a registered test — *"THE DEAD ROOT — a scan with nothing to scan must not
> report a clean tree"* — and its guard is **stronger than the shared one**, because it counts
> PER ROOT: *"a single total stays comfortably non-zero while one root is misspelt and
> contributes nothing."* The shared helper wrapped it, pre-empted its message and turned that
> test RED, which is how this was found. **`check:ladder` keeps its own; the shared guard goes
> to the gates that had nothing.**
>
> **AND THE CORRECTION IS THE MORE USEFUL FINDING.** The rule was already discovered in this
> project, written inside one gate, given a test — **and never generalised to the other five.**
> That is not a missing rule; it is **a rule found once and left where it was found.**
> `check:ladder` is the model the shared guard was generalised FROM, not the gap it fills.

### 4. The gap that let G-031a drift

`check:stamp` verifies the four digests agree **with each other**. **Nothing verifies a goal
block's status against what is in git** — which is how a shipped, watched goal sat at `pending`
and nearly mis-scoped a ruling in both directions.

**Mechanically checkable**: a commit referencing a goal ID implies its block is not `pending`.
**A line in G-039, not a goal of its own.**

### 5. Scope

**G-032c plus a realistic G-034 plan.** Nothing further this sitting.

---

## ADR-0048 — A SOLVED PROBLEM THAT NEVER PROPAGATED, and G-034 takes its seam

**Date**: 2026-08-16 · **Status**: accepted · **HUMAN RULING.** Three parts, all consequences of
building ADR-0047's amendment.

### 1. THE STANDING QUESTION AT REFLECT — §5.8 pointed SIDEWAYS

**The human owns the error and states it as one**: *"I asserted 'every scanner here has a
proof-of-bite; none has a proof-of-subject.' I didn't check. `check:ladder` had one since G-030,
with a registered test, and its per-root counting is stronger than the helper I ordered — which is
why wrapping it turned its own test red. I made a claim about the state of the repo FROM MEMORY
and shipped it as a finding."*

> **Rule 4's referent problem again, and this time THE REFERENT WAS THE TREE ITSELF.**

**But the correction names a class the register does not have**, and that is the part worth
keeping:

> **A RULE DISCOVERED INSIDE ONE GATE AND LEFT WHERE IT WAS FOUND. Not a missing rule — a SOLVED
> PROBLEM THAT NEVER PROPAGATED.**

**RULED: one standing question at REFLECT, one line — *does anything else here have this
problem?*** It is **§5.8 pointed sideways rather than backwards**: §5.8 asks where else the defect
just fixed lives; this asks where else the fix just written is *already needed*. **G-030 solving
it silently for eight goals is the evidence the question is needed**, and the cost is a sentence.

*Not a mechanism. It does not get a scanner — that would be the ADR-0046 §1 mistake in miniature.*

### 2. G-034 TAKES ITS SEAM — G-034a / G-034b

**The builder flagged it, so it gets TAKEN rather than declined in one line. G-013 is the
precedent and it is not being repeated** (§5.5: a builder that offers a seam at PLAN gets it taken,
or gets a written prediction of what declining it will cost, scored at REFLECT).

- **G-034a** — the grid gains an axis; build validity reworked; migration to **v17**;
  **`check:ladder` re-pointed in the commit that empties `apps/game`.**
  **AMENDED 2026-08-16, at BUILD: the ladder re-point belongs to G-035, not here.** The rule is
  the human's and is unchanged — *re-point it in the same commit that EMPTIES the directory* —
  but **`apps/game` is emptied at G-035**, and this clause would have aimed a gate away from a
  tree still holding 16 live files. **Caught by `sim-engineer` at BUILD, against its own
  instructions, rather than silently obeyed.**
- **G-034b** — corridors: the cell type, connectivity as a validity rule, migration to **v18**.

**WHY THE SEAM IS CLEAN — the dependency runs ONE WAY.** *"Corridors need the y-axis; the y-axis
does not need corridors."*

**AND THEY ARE DIFFERENT RULE SYSTEMS.** *"Supported, enclosed, doored, holds required items"* is a
property of **a room in isolation**. *"Connects to circulation"* is a property of **a room in a
building**. **Sweeping both in one diff asks a critic to hold two rule systems and a migration at
once.**

**TWO MIGRATIONS RATHER THAN ONE IS THE RIGHT TRADE HERE, and the human supersedes their own
argument to say so**: ADR-0046 §4's case for combining was that grid depth and room-as-instance
**touch the same fields**. **Corridors touch a DIFFERENT one — cell walkability — so the doubled
cost does not apply.** *"Sixteen clean migrations say the chain is cheap; an unsweepable diff
isn't."*

**ONE CONSTRAINT ON G-034a: the cell representation MUST NOT PRECLUDE CORRIDORS. Reserve the
concept, do not build it.**

### 3. ADR-0046 §4 IS SUPERSEDED ON ITS "DONE TOGETHER" CLAUSE, and the human caught it themselves

§4 said the grid change and the room model are **done together, because splitting pays the
migration twice.** **The accepted plan splits them** — G-034, then **G-035 between**, then G-036.

**The plan is right and §4 was wrong**, because **§7's instrument requirement OUTRANKS the
shared-migration argument: the view cannot wait on the room model.**

> **AND THE HUMAN APPROVED THE PLAN WITHOUT MARKING §4 SUPERSEDED — "a small instance of the same
> class", recorded rather than left to sit there contradicting the plan.** A decision that exists
> in one record and not the other, which is the G-031a class, now caught three times in three
> messages by three different readings. **§4 points forward from here.**
