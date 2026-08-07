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
I5	Headless. pnpm sim:run --days 365 --seed 42 completes in Node with no window and no renderer, in under 10 seconds.	pnpm sim:bench
I6	Save round-trip. Serialise then deserialise then re-hash produces an identical state hash. Save files carry a schema version and a migration path.	pnpm test:save

I2 is load-bearing beyond determinism. If someone leaks render state or wall-clock time into the simulation, the determinism test breaks immediately. It is the tripwire for the whole design. Do not weaken it, do not add tolerance, do not skip it "just for this goal".

3. Stack — fixed, do not relitigate
Language: TypeScript, strict mode, noUncheckedIndexedAccess on.
Monorepo: pnpm workspaces.
packages/sim — the headless simulation. Zero runtime dependencies. No DOM types in tsconfig.
packages/content — JSON definitions plus Zod schemas.
apps/game — Pixi.js render layer and UI. Reads sim state, dispatches commands.
tools/headless — CLI runner, determinism harness, balance simulator.
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
5. The goal loop
5.1 State machine
SELECT -> PLAN -> BUILD -> CRITIQUE -> RESPOND -> VERIFY -> COMMIT -> REFLECT -> SELECT
                    ^                                 |
                    +------------ (failures) ---------+

SELECT — Take the top unblocked goal from GOALS.md. Restate it in one sentence and name its exit commands.

PLAN — Spawn the matching builder agent in plan mode. It produces a short plan: files to touch, data shapes, tests it will write first. You review the plan against §2 and the goal's out-of-scope list. Reject and re-plan if it exceeds scope.

BUILD — Builder implements. Tests first where practical. Builder runs the gates itself before declaring ready.

CRITIQUE — Spawn the matched critic agent (§6) with: the goal, the diff, and read-only tool access. It returns findings in the §7 format. It cannot edit anything.

RESPOND — Builder receives the findings and must answer every BLOCKER and MAJOR, either fixed with a reference to the change, or rejected with a reason. Rejections are appended to DECISIONS.md with the reasoning. MINOR and NIT are optional; log them and move on.

VERIFY — You, the orchestrator, run every exit command and every §2 gate yourself. You do not accept an agent's report that tests pass. Run them.

COMMIT — Conventional commit referencing the goal ID. One goal, one commit (or one squashed branch).

REFLECT — Append to JOURNAL.md: what changed, what the critic caught, what got parked, whether any invariant nearly broke. Two or three lines. Then update GOALS.md and select the next goal.

5.2 Round budget

Maximum 3 critique rounds per goal. If a BLOCKER survives round 3, stop. Do not keep grinding.

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

8. Milestones

Do not start a milestone until the previous one's gates are green and the human has signed off.

M0 — Walking skeleton. One room type, one guest, one need, one day cycle, money in and money out. Headless only, no renderer at all. All six invariant gates green and wired into CI. This is the most important milestone and the one most likely to be rushed. It should be playable-but-boring, and it should be finished before anything is drawn on screen.

M1 — Structure. Multi-floor grid, build and demolish commands, room validity rules (enclosed, has a door, has required items), construction cost.

M2 — Needs. Full need vector, item-based provider registry, utility scoring, satisfaction over ticks, patience drain, reviews. Guests visibly succeed and fail.

M3 — Circulation. Stairs and lifts as queued shared resources. Vertical pathing. Wait time as a first-class satisfaction input. This is where the genre's difficulty actually lives.

M4 — Economy. Nightly settlement, staff hiring and wages, upkeep and decay, reputation feeding demand, room pricing. Balance critic runs long simulations and the results are reviewed.

M5 — Render. Pixi cross-section view, camera, build tools, HUD, speed controls, save/load UI. Coloured rectangles are an acceptable shipping state for this milestone. Art is a separate concern.

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
10. Bootstrap

First session, in order:

Scaffold the pnpm workspace per §3. Strict TypeScript. Vitest configured.
Write the six invariant gates from §2 before any game code exists. They should all pass trivially against an empty sim. Wire them into a single pnpm verify command and into CI.
Write .claude/agents/ for the eight agents in §6, each with its failure catalogue and the finding format.
Create GOALS.md seeded with the M0 goals, DECISIONS.md, JOURNAL.md, PARKING.md, ESCALATIONS.md — all with a one-line header explaining what they are for.
Write a CLAUDE.md that points at this file and states the invariants in short form, so they survive context compaction.
Commit. Then enter the loop at §5 SELECT.

Do not write a single line of simulation logic until steps 1 and 2 are done and pnpm verify is green.