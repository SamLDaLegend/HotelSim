# DECISIONS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-09, G-020a done (instrument only; G-020b pending). M2: 8 of 12.*

- **Load-bearing everywhere**: ADR-0001 content injected, never value-imported · ADR-0002
  integer pence · ADR-0003 snake_case literal = content ID · ADR-0006 the v1 fixture is
  permanent and the next `World` field owes a migration (G-013 paid it: save **v7**).
- **The one cited most, and now five amendments deep**: **ADR-0007** — a check that can
  succeed while inspecting nothing is not a check. Vacuous ≠ unreachable · a goal promoted
  by a threshold must exit on one · a threshold must itself be derivable · **deleting a bad
  check is not evidence that no good one exists** (G-013, written by the builder that made
  the error) · **a comment offered as evidence may not carry a figure no test pins**.
- **How to read a defect count** (ADR-0007, human): a 3/3 goal is a near miss, not comfort;
  and raw counts across eras are not like-for-like, because detection sensitivity rises.
- **ADR-0013** (human) — a perceptual criterion needs a perceptual check. Viewer, WATCH,
  three-state critic close, digests, I5 re-derivation, M4 scenario-capital prerequisite.
  Bounded by its own text: no `apps/game`, no weakened invariant, no reopened sign-off.
- **ADR-0014** (human) — first playable build ships placeholder art; M5 neither waits nor
  relitigates.
- **Open contradictions**: none outstanding.

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
