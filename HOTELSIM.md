1. Mission

Build a casual, cartoon-styled hotel building and management simulator. Side-on cross-section view (think SimTower / Project Highrise), not isometric.

The game is three nested feedback loops. Every design and code decision should be traceable to one of them:

Guest loop — guest arrives, forms needs, gets them met or doesn't, pays, leaves a review.
Money loop — room revenue against wages and upkeep, settled nightly.
Build loop — spend cash, add capacity and quality, raise reputation, raise demand, back to the guest loop.

If a proposed feature does not feed one of these three loops, it goes in PARKING.md, not in the sprint.

2. Invariants — non-negotiable, machine-checkable

These are the architecture. They are not guidance, they are CI gates. Every one must be enforced by a command that exits non-zero on violation. No goal is done while any of these is red.

ID	Invariant	Gate
I1	Sim purity. packages/sim imports nothing from the render layer, no DOM, no engine API, no filesystem, no network.	pnpm check:purity — dependency-cruiser rule plus an import scan.
I2	Determinism. Same seed plus same command log produces a byte-identical state hash after 100,000 ticks, on every run and every platform. No Math.random, no Date.now, no Set/Map iteration-order dependence inside packages/sim. All randomness comes from an injected seeded PRNG.	pnpm test:determinism
I3	Content is data. No room type, item, staff role or guest archetype defined in code. All of it lives in packages/content as JSON validated against a schema.	pnpm check:content — fails if a new type literal appears outside packages/content.
I4	Ledger is append-only. Cash balance is derived by folding transactions, never stored and mutated.	pnpm test — unit test asserts balance is a pure function of the transaction log.
I5	Headless. pnpm sim:run --days 365 --seed 42 completes in Node with no window and no renderer, inside the budget. **The budget is DERIVED, not chosen** — see §2.1. The original "under 10 seconds" was invented at bootstrap with no basis and is being replaced at G-018 (ADR-0013 §4).	pnpm sim:bench
I6	Save round-trip. Serialise then deserialise then re-hash produces an identical state hash. Save files carry a schema version and a migration path.	pnpm test:save

I2 is load-bearing beyond determinism. If someone leaks render state or wall-clock time into the simulation, the determinism test breaks immediately. It is the tripwire for the whole design. Do not weaken it, do not add tolerance, do not skip it "just for this goal".

2.1 A gate threshold must be derivable from a stated requirement

(Added 2026-08-08 by human ruling — ADR-0013 §4, generalising ADR-0007.)

Every number a gate compares against must trace to a requirement someone wrote down. A number nobody can source is not a gate, it is a superstition with CI access. It will still fail builds, still promote goals, and still be defended — with nothing behind it.

I5's ten seconds was invented at bootstrap and then promoted G-016 into existence. Its replacement is derived from what the game needs: a 60-room hotel at the fastest intended play speed sustaining real-time on a mid-range laptop, times a stated headroom multiple for the systems M3, M4 and M6 will add. The derivation is written down and every recorded I5 figure is re-baselined against it.

This applies to every bound in the repo, not just I5 — scaling ratios, patience caps, review means. G-010's "measured × 1.5, then held at or below" is the right shape. A round number is not.

3. Stack — fixed, do not relitigate
Language: TypeScript, strict mode, noUncheckedIndexedAccess on.
Monorepo: pnpm workspaces.
packages/sim — the headless simulation. Zero runtime dependencies. No DOM types in tsconfig.
packages/content — JSON definitions plus Zod schemas.
apps/game — Pixi.js render layer and UI. Reads sim state, dispatches commands.
tools/headless — CLI runner, determinism harness, balance simulator.
tools/viewer — (added 2026-08-08, ADR-0013 §1) disposable replay viewer. Consumes recorded frames from a completed run. Not the renderer, not apps/game, not a deliverable. May be thrown away at M5 and should be deleted rather than defended if it starts growing features.
Tests: Vitest. Sim package targets high coverage; render layer is not unit tested, it is playtested.
Persistence: JSON save blobs, versioned, with migrations from v1 onward.

Rationale, so you don't second-guess it: a headless TypeScript sim package is trivially unit-testable and fast to simulate at scale, which is exactly what the critic loop needs to function. A game engine would make the render layer nicer and the feedback loop far worse.

If the human later wants Godot, only apps/game is thrown away. That is the point of I1.

4. The goal ledger

Maintain GOALS.md at the root. One block per goal:

## G-014 — Lift queueing
Status: in-progress | blocked | done | parked
Milestone: M3
Owner pair: ai-engineer / ai-critic
Statement: Guests waiting for a lift form a queue, board in order up to car
  capacity, and the car serves calls without starving any floor.
Exit criteria:
  - pnpm test -- lift  (all green)
  - pnpm sim:run --days 30 --seed 7 reports zero guests with wait > 90 ticks
  - all §2 invariant gates green
Out of scope: express lifts, service lifts, lift upgrades  (-> PARKING.md)
Critique rounds used: 0/3

Rules:

Exit criteria must be commands, not adjectives. "Feels responsive" is not an exit criterion. "p95 lift wait under 90 ticks across 30 simulated days" is.
Exactly one goal is in-progress at a time. No parallel goals.
Anything discovered mid-goal that is not in the goal goes to PARKING.md. It does not get built now.
A criterion that uses a perceptual word — visibly, reads as, looks — needs a perceptual check, or the word must come out (ADR-0013). Since 2026-08-08 the perceptual check exists: record a run and watch it (§5 WATCH).

4.1 Ledger digests

(Added 2026-08-08 by human ruling — ADR-0013 §7.)

Each of GOALS.md, DECISIONS.md, JOURNAL.md and PARKING.md carries a rolling digest at the top under a fixed heading. Fifteen lines maximum. It is REWRITTEN at every REFLECT and never appended to. It carries: current schema version, current gate readings, live obligations owed by future goals, and open contradictions. The append-only history stays exactly as it is beneath it.

The reason: the four ledgers passed 2,800 lines and JOURNAL.md — which calls itself the memory that survives compaction — is a quarter of that. An ADR amendment has already spent a day filed under the wrong ADR.
5. The goal loop
5.1 State machine
SELECT -> PLAN -> [critic sees plan, §5.6] -> BUILD -> CRITIQUE -> RESPOND -> VERIFY -> WATCH -> COMMIT -> REFLECT -> SELECT
                    ^                                              |
                    +------------------ (failures) ----------------+

CRITIQUE is a SWEEP and is budgeted (§5.2, three). Verifying that a fix discharges a finding is NOT a sweep and is not budgeted (§7.1).

SELECT — Take the top unblocked goal from GOALS.md. Restate it in one sentence and name its exit commands.

PLAN — Spawn the matching builder agent in plan mode. It produces a short plan: files to touch, data shapes, tests it will write first. You review the plan against §2 and the goal's out-of-scope list. Reject and re-plan if it exceeds scope. Then §5.6: the matched critic sees the plan and may object to its size before a line is written.

BUILD — Builder implements. Tests first where practical. Builder runs the gates itself before declaring ready.

CRITIQUE — Spawn the matched critic agent (§6) with: the goal, the diff, and read-only tool access. It returns findings in the §7 format. It cannot edit anything.

RESPOND — Builder receives the findings and must answer every BLOCKER and MAJOR, either fixed with a reference to the change, or rejected with a reason. Rejections are appended to DECISIONS.md with the reasoning. MINOR and NIT are optional; log them and move on.

VERIFY — You, the orchestrator, run every exit command and every §2 gate yourself. You do not accept an agent's report that tests pass. Run them.

WATCH — (Added 2026-08-08 by human ruling, ADR-0013 §2.) For any goal that changes guest, room or economy behaviour, record a run and watch it. Append to JOURNAL.md what looked wrong, or that nothing did. A goal that changes behaviour and produces no visual observation has skipped a step. The instrument is the replay viewer (G-017); until it lands, a goal that owes a WATCH records the debt in its block and discharges it retroactively once the viewer exists.

COMMIT — Conventional commit referencing the goal ID. One goal, one commit (or one squashed branch).

REFLECT — Append to JOURNAL.md: what changed, what the critic caught, what got parked, whether any invariant nearly broke. Two or three lines. Score any seam prediction from §5.5. Then rewrite the digest at the top of each of the four ledgers (§4.1), update GOALS.md, and select the next goal.

5.5 The seam rule — declining a split is a prediction, and it gets scored

(Added 2026-08-08 by human ruling, after G-013.)

When a builder offers a seam at PLAN — "this is a fat goal, here is where it splits" — the orchestrator either takes it, or records in the goal block what not taking it is expected to cost. A reflex is not a decision; a prediction is.

The prediction is DISCHARGED AT REFLECT: did declining the seam cost what you said it would? A prediction that is never scored is prose, and an artefact that accumulates without ever being wrong is worse than no artefact.

G-013 is the case that produced this rule. Its builder wrote "this is the fattest goal yet" and named the seam; the orchestrator ruled it whole in one line with no cost attached. The actual cost was nine instances of one defect class and three full critique rounds. Written as a prediction it would have read "expected cost: more checkable surface than one critic pass can vet" — and would have been legibly wrong.

5.6 The critic sees the plan

(Added 2026-08-08 by human ruling, after G-013.)

The agent that bears the cost of a fat goal is the CRITIC, who has to sweep it — and until now it had no voice until after the code existed. Before BUILD, the matched critic sees the plan and may raise one objection: THIS SCOPE IS TOO LARGE TO SWEEP IN THE ROUND BUDGET, and here is the seam.

Scope only. Not design, not approach, not test strategy — those are the orchestrator's at PLAN review and the critic's after BUILD. This is the cheapest possible moment to split, and it puts the objection where the incentive already is.

5.2 Round budget

Maximum 3 critique rounds per goal. If a BLOCKER survives round 3, stop. Do not keep grinding.

A goal may only close on a DRY critic report (§7). A FIXED report consumes a round and the critic goes again. This costs rounds and is meant to.

5.3 Anti-ping-pong

If builder and critic disagree twice on the same point, that is a design question, not an implementation question. You adjudicate once, record the decision in DECISIONS.md, and both agents treat it as settled.

5.4 Escalation

Write to ESCALATIONS.md and stop the loop when any of these is true:

A BLOCKER survives the round budget.
An invariant in §2 cannot be satisfied without changing the invariant.
The goal turns out to depend on an unbuilt goal.
A milestone's exit criteria are met and need human sign-off.
Something is fun-critical and cannot be resolved by test — that is a human call, not an agent call.
6. Agent roster

Define these in .claude/agents/*.md. The tool grants are the enforcement mechanism, not decoration: critics have no write tools. A critic that can edit code stops producing signal, because it silently fixes what it finds instead of reporting it.

Builder	Critic	Domain
sim-engineer	sim-critic	Tick scheduler, world model, grid, rooms, save/load, determinism
ai-engineer	ai-critic	Guest and staff agents, utility scoring, provider registry, pathing, lift queueing
economy-engineer	balance-critic	Ledger, pricing, demand, reputation, wages, upkeep
render-engineer	render-critic	Pixi layer, camera, sprites, HUD, input-to-command mapping

Builder frontmatter shape:

yaml
---
name: ai-engineer
description: Implements guest and staff behaviour in packages/sim. Use for
  needs, utility scoring, provider selection, pathfinding and lift queueing.
tools: Read, Write, Edit, Bash, Grep, Glob
---

Critic frontmatter shape — note the tool list:

yaml
---
name: ai-critic
description: Reviews agent-behaviour changes. Read-only. Produces findings,
  never edits.
tools: Read, Grep, Glob, Bash
---

(Bash stays on the critic so it can run tests and simulations. Verify the exact frontmatter keys against /agents in your installed version before writing the files.)

Each critic's system prompt must include:

The same domain knowledge as its builder. A critic that knows less than the builder produces noise.
Its specific failure catalogue (§6.1).
The finding format (§7).
This line, verbatim: "If you find no BLOCKER or MAJOR issues, say so plainly and stop. Do not manufacture MINOR findings to justify the turn."
6.1 Failure catalogues

Give each critic its own list to hunt against. These are the things that actually kill hobby sims.

sim-critic — render or engine types leaking into packages/sim; wall-clock time or unseeded randomness in tick logic; state mutated outside a tick boundary; save omitting a field that turns out to matter (check every new field is round-tripped); tick cost growing worse than linear in agent count; floating-point accumulation that will diverge across platforms.

ai-critic — needs that can never be satisfied, producing guaranteed unhappiness; agents thrashing between two providers; reservation leaks where a facility is held by a despawned guest; pathfinding that silently falls back to teleporting; livelock at lifts; behaviour that is correct but reads as stupid to a watching player, which is a real defect in this genre.

(Amended 2026-08-08, ADR-0013 §3.) The "reads as stupid to a watching player" finding now REQUIRES a frame reference: a recording, a tick number, and what it shows. From bootstrap to G-013 there was no watching player and no way to become one, so that mandate was unfalsifiable — the exact defect class ADR-0007 names, sitting inside the critic prompt meant to hunt it. From G-017 it is a finding like any other and subject to §7's citation rule. If you cannot cite a frame, you do not have this finding; say so and stop.

balance-critic — dominant strategies (one room type strictly better than all others); degenerate pricing exploits; runaway or unrecoverable economies; nothing meaningful to spend money on past hour two. This critic has a standing mandate to run pnpm sim:run --days 1000 across a spread of seeds and report the distribution of outcomes, not a single run.

render-critic — render code holding authoritative state instead of reading it; input handlers mutating the sim directly rather than dispatching commands; frame-rate-dependent movement; UI that cannot express a state the sim can reach.

7. Finding format

Critics return only this. No prose preamble, no summary paragraph.

[BLOCKER] packages/sim/src/tick.ts:84
  Guest need decay uses Date.now() as the delta source. Breaks I2 and makes
  the sim frame-rate dependent.
  Suggested direction: take dt from the tick scheduler.

[MAJOR] packages/sim/src/providers.ts:41
  Reservation is taken before the path is validated, so an unreachable
  facility is held indefinitely. Repro: pnpm test -- providers.unreachable

[MINOR] packages/content/rooms.json
  `single_room` and `standard_room` have identical stats. Probably unintended.

Severity definitions:

BLOCKER — breaks an invariant, corrupts saves, or makes the goal's exit criteria unmeetable. Must be fixed.
MAJOR — a correctness or design flaw that will be expensive to fix later. Must be answered, may be rejected with reasoning.
MINOR — a real but cheap issue. Log it.
NIT — style and naming. Do not spend a round on these.

Every finding must cite file:line and, where possible, a reproduction command. A finding without a location is not a finding.

7.1 How a critic closes — DRY, OPEN or UNSWEPT

(Added 2026-08-08 by human ruling — ADR-0013 §6. Amended the same day, also by human ruling, after the first goal to run the rule exposed the two-state version as wrong.)

Every critic's final report must close with exactly one of these three, stated explicitly:

DRY — the diff is swept and there are no findings at any severity.
OPEN — the diff is swept and findings are outstanding.
UNSWEPT — the critic has not exhausted the diff.

A goal still closes only on DRY.

UNSWEPT at round 3 escalates, and the answer is still splitting the goal. That consequence is untouched: a diff a critic cannot exhaust in three passes is too big.

SWEEPS ARE BUDGETED. VERIFICATIONS ARE NOT. The two-state version made a round do double duty — it meant both "a sweep of the diff" and "a fix-verify cycle" — and §5.2's budget of 3 was only ever meant to bound the first. A verification pass examines whether a specific fix discharges a specific finding, and looks at the fix's own diff. It does not consume budget.

The guard that stops that becoming an unbounded loop wearing a new label: a verification pass that produces a NEW finding rather than a restatement converts to a sweep and consumes budget. So if a builder's fixes keep spawning findings, the budget burns and the goal escalates properly — which is the signal you would want anyway.

THE GUARD IS ITSELF ON TRIAL, AND THIS IS THE PREDICTION TO SCORE IT AGAINST (human, 2026-08-08). It has fired exactly once — on G-013, the goal that produced it, and on PROSE rather than on code. The registry it was guarding needed no correctness fix at any point. If the next several firings are also prose, then the guard is a prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND RE-SCOPED rather than left to accumulate a reputation it did not earn. Record each firing with its subject: code or prose. This prediction is written down now so it can be wrong later — an unscored prediction is prose, which is the same rule §5.5 applies to seams.

Why the three states: thirteen goals ran mostly at 1/3 rounds with zero BLOCKERs, and the one goal that ran to 3/3 produced the best critique in the project. "I fixed what I found" and "there is nothing left to find" are different claims, and the loop had been treating them as the same one. G-013 then showed that "there are findings left" and "there is diff left" are also different claims — its round-3 critic swept the whole diff and closed with one finding open, which the two-state version could only express as FIXED, whose prescribed remedy (split the goal) would have solved a problem that did not exist.

Additionally: any goal that is the LAST IN A MILESTONE gets a second critic from a different pair in its final round. Precedent — G-008 ran sim-critic then balance-critic, and the second pass found the 107-million-penny sweep.


8. Milestones

Do not start a milestone until the previous one's gates are green and the human has signed off.

M0 — Walking skeleton. One room type, one guest, one need, one day cycle, money in and money out. Headless only, no renderer at all. All six invariant gates green and wired into CI. This is the most important milestone and the one most likely to be rushed. It should be playable-but-boring, and it should be finished before anything is drawn on screen.

M1 — Structure. Multi-floor grid, build and demolish commands, room validity rules (enclosed, has a door, has required items), construction cost.

M2 — Needs. Full need vector, item-based provider registry, utility scoring, satisfaction over ticks, patience drain, reviews. Guests visibly succeed and fail. ("Visibly" is discharged by G-017's replay viewer and a WATCH observation in JOURNAL.md, not by the review distribution alone — ADR-0013.)

M3 — Circulation. Stairs and lifts as queued shared resources. Vertical pathing. Wait time as a first-class satisfaction input. This is where the genre's difficulty actually lives.

M4 — Economy. Nightly settlement, staff hiring and wages, upkeep and decay, reputation feeding demand, room pricing. Balance critic runs long simulations and the results are reviewed.

M4 HARD PREREQUISITE (ADR-0013 §5): the scenario-capital mechanism lands before the first M4 goal starts. --rooms N seeds stock that is cash at the refund rate — --rooms 3 carries 375,000p against a 500,000p starting constant — and every balance sweep in this project used that flag. Tuning demand and pricing against a 75%-inflated opening balance is how a whole milestone's evidence base goes bad quietly.

M5 — Render. Pixi cross-section view, camera, build tools, HUD, speed controls, save/load UI. The first playable build ships PLACEHOLDER ART — flat coloured shapes with clear silhouettes — and real art is a separate track that replaces them without touching the simulation (ADR-0014, decided 2026-08-08 so M5 neither relitigates it nor waits on it).

M6 — Content and feel. Room and item variety, guest archetypes, notifications, sound hooks, tutorial. Driven by playtest findings rather than a feature list.

9. Stop conditions and anti-patterns

Halt and escalate if you catch any of these:

You are writing feature code yourself instead of orchestrating.
A critic has produced a MINOR-only report three goals running — the critic prompt is too weak, fix it before continuing.
An invariant gate has been modified to make a test pass. Changing an invariant is a human decision, always.
Test coverage is being added to satisfy a number rather than to pin behaviour.
PARKING.md has stopped growing. That means scope is leaking into goals instead of being deferred.
Work has started on the render layer before M0 is signed off.
A goal has exceeded its round budget twice under different framings — the goal is wrong, not the implementation.
A criterion is being verified by an agent's judgement of something nobody can observe. (ADR-0013.)
The replay viewer is acquiring features, a public API, or defenders. Delete it rather than defend it.
A gate threshold is being cited that nobody can trace to a stated requirement (§2.1).
10. Bootstrap

First session, in order:

Scaffold the pnpm workspace per §3. Strict TypeScript. Vitest configured.
Write the six invariant gates from §2 before any game code exists. They should all pass trivially against an empty sim. Wire them into a single pnpm verify command and into CI.
Write .claude/agents/ for the eight agents in §6, each with its failure catalogue and the finding format.
Create GOALS.md seeded with the M0 goals, DECISIONS.md, JOURNAL.md, PARKING.md, ESCALATIONS.md — all with a one-line header explaining what they are for.
Write a CLAUDE.md that points at this file and states the invariants in short form, so they survive context compaction.
Commit. Then enter the loop at §5 SELECT.

Do not write a single line of simulation logic until steps 1 and 2 are done and pnpm verify is green.