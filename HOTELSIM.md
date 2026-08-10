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
I5	Headless. pnpm sim:run --days 365 --seed 42 completes in Node with no window and no renderer, inside the budget. **The budget is DERIVED, not chosen** — 389,333ms, from a 60-room hotel at 30x sustaining real time; the arithmetic is in §2.1.2 and tools/gates/budget.mjs executes it. The 30x is the TOP RUNG of the content ladder — packages/content/data/speed-ladder.json, validated by a schema and read by tools/gates/budget.mjs (G-021) — and this budget is INVERSELY PROPORTIONAL to it, so retuning the ladder in JSON RE-DERIVES this number — with no edit to the DERIVATION, which is the part that could go wrong silently; the derived figure is also quoted in four places that bench.budget.test.ts pins, and a retune updates those with it (§2.1.2). What holds across a ladder change within ~12x is the conclusion, not the constant. The original "under 10 seconds" was invented at bootstrap with no basis and was replaced at G-018 (ADR-0013 §4). The word doing the work is HEADLESS; the time bound is a sanity ceiling, not a regression tripwire (§2.1.3).	pnpm sim:bench
I6	Save round-trip. Serialise then deserialise then re-hash produces an identical state hash. Save files carry a schema version and a migration path.	pnpm test:save

2.0 RED MEANS REPRODUCIBLE. AN INTERMITTENT GATE IS NOT RED, IT IS UNRELIABLE.

(Added 2026-08-09 by human ruling, after I4 began failing intermittently and the loop deadlocked on "no goal is done while any gate is red".)

The deadlock came from treating "red" and "unreliable" as the same state. THEY ARE NOT, AND THE DIFFERENCE IS THE WAY OUT.

A gate that fails REPRODUCIBLY is red. It is reporting a fact, and it blocks.

A gate that fails INTERMITTENTLY is not reporting anything. It has stopped being an instrument. YOU CANNOT ROUTE AROUND A RED GATE, BUT YOU ALSO CANNOT TAKE A RESULT FROM A BROKEN ONE — IN EITHER DIRECTION. "Green on the run I took" is unsafe for exactly the same reason "red on the run I took" is: neither reading carries information.

So: §2's "red" means a reproducible failure. AN INTERMITTENT GATE IS ITS OWN ESCALATION WITH ITS OWN REMEDY — REPAIR THE INSTRUMENT, NEVER REINTERPRET THE RESULT.

THE GUARD THAT KEEPS THIS FROM BECOMING AN UNBOUNDED EXEMPTION, and it is load-bearing rather than tidy: THE COUNT OF UNRELIABLE GATES IS CARRIED IN THE DIGEST, BESIDE THE GATE READINGS (§4.1). Two as of 2026-08-09. A THIRD IS A STOP CONDITION, not a third defensible decision — each one is defensible alone, which is exactly how a suite stops being evidence.

I2 is load-bearing beyond determinism. If someone leaks render state or wall-clock time into the simulation, the determinism test breaks immediately. It is the tripwire for the whole design. Do not weaken it, do not add tolerance, do not skip it "just for this goal".

2.1 A gate threshold must be derivable from a stated requirement

(Added 2026-08-08 by human ruling — ADR-0013 §4, generalising ADR-0007.)

Every number a gate compares against must trace to a requirement someone wrote down. A number nobody can source is not a gate, it is a superstition with CI access. It will still fail builds, still promote goals, and still be defended — with nothing behind it.

I5's ten seconds was invented at bootstrap and then promoted G-016 into existence. Its replacement is derived below (G-018) from what the game needs: a 60-room hotel at the fastest intended play speed sustaining real-time on a mid-range laptop, times a stated headroom multiple for the systems M3, M4 and M6 will add. Every recorded I5 figure has been re-baselined against it or struck.

This applies to every bound in the repo, not just I5 — scaling ratios, patience caps, review means. G-010's "measured × 1.5, then held at or below" is the right shape. A round number is not.

2.1.1 The play-speed ladder — CONTENT, and settled by watching (G-021)

A tick is one in-game minute and 1440 ticks make a day (packages/sim/src/world.ts:33). THE LADDER IS NOW CONTENT — packages/content/data/speed-ladder.json, three rungs, each carrying its own label and its own absolute speed:

  Fast     30 ticks per real second — a simulated day in 48 REAL SECONDS. THE TOP
           RUNG, which is what §2.1.2 below derives I5's budget from.
  Working  12 ticks per real second.
  Careful   5 ticks per real second.
  Pause is BENEATH the ladder and is NOT a rung: it is a transport state, not a rate.
           M5 must not read this table as the complete set of transport states.

30 IS THE ANCHOR, NOT THE CEILING. The rungs below it are spaced by what is playable, not by round multipliers, and 1x is deliberately absent — see the diagnostic below.

TWO FORMAT RULES, MINTED WITH THE FILE. (1) A rung carries its own name, so labels travel with values. (2) THERE IS NO IMPLIED ARITHMETIC BETWEEN RUNGS — they are not multiples of each other and nothing may compute one from another. Otherwise M5 hardcodes "1x/2x/3x" against content that does not mean that, and the first rebalance produces a UI that lies about itself.

WHAT ENFORCES RULE 2, AND WHAT DOES NOT. The schema is a strictObject with exactly {id, name, ticksPerRealSecond}, so no multiplier, base or ratio field survives parsing; a label that IS a multiple ("2x") is refused, which stops a DESIGNER encoding a relation in a name — it is leaky as a regex and that is stated at the point of use. The only gate consumer takes max, proved by an arm with the fastest rung in the MIDDLE. NONE OF THIS REACHES ARITHMETIC IN RENDER CODE: nothing in packages/content can stop M5 computing ladder[i] / ladder[0]. That instrument is a source scan over apps/game and it is parked with its falsification test, because apps/game may not be opened before M5.

A NEAR-MISS WORTH KEEPING. The obvious enforcement — "no rung may be an integer multiple of another" — WOULD REJECT THIS LADDER: 30 = 6 x 5. Enforcement has to constrain the FORMAT and the CONSUMERS, never the designer's values.

HOW IT GOT SETTLED, kept because the reasoning is reusable. G-018 proposed 30x as a design fact and the human declined to ratify it (2026-08-08). THE TELL WAS NOT THE TOP SPEED, WHICH IS PLAUSIBLE; IT IS THE BOTTOM. Twenty-four real minutes per simulated day at 1x means **nobody will ever play at 1x**, and a ladder whose lowest rung is dead is not a ladder — it is a single speed with decoration below it. That is the kind of defect discovered the first time a human uses the viewer, which is exactly where it is sent.

WHY IT LOOKED SOUND AND WAS NOT, because the error is reusable. "One tick is one in-game minute" is a charter decision and it is sound. Mapping that minute 1:1 onto a real SECOND is a SEPARATE choice, and at G-018 it inherited its justification from the first one by adjacency: it is aesthetic tidiness, not a design finding. Two decisions that look like one because they share a unit is a shape worth recognising elsewhere.

WHAT THE LADDER SHOULD ACTUALLY BE ANCHORED ON: NIGHTLY SETTLEMENT, because that is when the money loop resolves. A management sim wants the player to watch several settlements land while turning over one decision. At 48s per simulated day that is a couple of minutes per decision cycle — on the sluggish side of the genre without being absurd, which is why the figure is usable as a working number and still wrong to mint.

ITS HOME IS CONTENT (I3), AND THAT IS WHERE IT NOW LIVES. A set of ticks-per-second figures is a balance number, and I3 says balance numbers are data rather than code. Built at **G-021**; not at G-018, whose exit criterion forbade touching packages/ and whose teeth were the point.

DISCHARGED BY **G-017's viewer**, and the instrument corrected the person who argued for the instrument. The human predicted 48s per simulated day would read SLUGGISH, reasoned from the settlement heartbeat. Watched, it reads BRISK — a prediction scored and half wrong, recorded by the human as "I derived a feel from arithmetic rather than from watching, which is precisely the move ADR-0013 exists to forbid." **The half that held is the one that mattered: 1x is dead**, and that is what makes this ladder non-linear rather than merely re-scaled.

Speed is expressed in ticks per real SECOND and never in ticks per rendered FRAME. That part is not provisional. §6.1's render-critic catalogue already lists frame-rate-dependent advance as a defect — "animation that runs faster on a 144Hz monitor" — so a speed control defined as "N ticks per frame" IS that defect. The render-engineer craft note ("speed controls change how many ticks are run per frame") holds only in the sense that a frame consumes the ticks the wall clock has earned; the count a second earns must not depend on the refresh rate.

THE REJECTED READING, RECORDED BECAUSE IT WOULD HAVE FLATTERED THE INCUMBENT. Read "30x" as 30 ticks per rendered frame at 60fps and you get 1800 ticks/s, which yields a 365-day budget of roughly 13.5s — within a rounding error of the ten seconds this section exists to replace. It was computed, and it is refused on two grounds: it is defined per frame, which the paragraph above forbids; and it means a simulated day passes in 0.8 seconds, at which nobody can watch a guest arrive, form a need and fail it. That is a fast-forward button, not a play speed, in a game whose M5 ships a scrubber and a speed control in order to be WATCHED. A reader who wants the incumbent number back should argue with these two grounds rather than with the arithmetic below.

2.1.2 I5's budget, derived (G-018)

REQUIREMENT (the human, 2026-08-08): a 60-room hotel at the fastest intended play speed sustains real time on a mid-range laptop, times a stated headroom multiple for what M3, M4 and M6 will add.

The requirement's two halves land in different places. "60-room hotel" sizes the WORKLOAD the gate runs; "30x" sizes the BUDGET it compares against. Only the budget is derived here.

INPUTS, each with its source:

  1  a tick is one in-game minute              packages/sim/src/world.ts:32
  2  1440 ticks per simulated day              packages/sim/src/world.ts:33 TICKS_PER_DAY
  3  365 days = 525,600 ticks                  I5's own wording; tools/gates/budget.mjs
  4  fastest play speed = 30 ticks/second      the TOP RUNG of the content ladder,
                                               packages/content/data/speed-ladder.json
                                               (G-021, §2.1.1)
  5  sim's share of one core, S = 0.10         ASSUMPTION, justified below
  6  headroom for M3+M4+M6, H = 4.5            estimated below from measured ratios

S IS AN ASSUMPTION AND IS LABELLED ONE. At M5 the sim shares a thread with Pixi, the UI and the GC, and no render cost has ever been measured because M5 is unbuilt. A tenth of one core is chosen rather than a quarter because a SMALLER share makes the derived budget TIGHTER — it makes this section's conclusion harder to reach, not easier. The sensitivity table below is there so the conclusion does not rest on the choice.

H IS DECOMPOSED, NOT ROUNDED. Each factor cites something this project measured:
  M3 circulation  x2.40  the only milestone-sized behaviour system ever measured here
                         is M2's need vector, at 2.41/2.37/2.32x AS FIRST IMPLEMENTED,
                         BEFORE G-016's 10.7% cut (CLAUDE.md, measuring). That state was
                         never committed, so no pair of commits reproduces it; the SHIPPED
                         pair measures 2.07x (G-016's block). Corrected at G-020a, whose
                         instrument cannot reach either. The consequence is nil and in the
                         conservative direction - sourcing this factor to 2.07 would give
                         H = 3.88 and a LOOSER budget - but a citation naming a state that
                         does not exist does not belong in the section whose point is that
                         a gate number must trace to something.
                         §8 calls M3 "where the genre's difficulty actually lives", so it
                         gets a full need-vector's worth rather than a discount.
  M4 economy      x1.50  staff are agents but fewer than guests; settlement is nightly and
                         already exists; upkeep is per-room per-night.
  M6 content      x1.25  content BREADTH is cheap here: the whole item registry measures
                         ~4-8% of the bench (1.043/1.038/1.075, interleaved, medians of 5).
                         Archetypes multiply per-guest scoring, not per-tick passes.
  product         x4.50  H is the weakest input in this derivation. Its error is absorbed
                         by the result being loose by two orders of magnitude either way.

THE ARITHMETIC, which tools/gates/budget.mjs executes rather than quotes (and which
tools/gates/bench.mjs imports rather than restates):

  real time available per tick at 30x     1s / 30            = 33,333,333 ns
  x sim's share of one core (S = 0.10)                       =  3,333,333 ns
  / headroom for M3, M4, M6 (H = 4.5)  -> per-tick budget    =    740,741 ns
  x 525,600 ticks (365 x 1440)         -> I5 BUDGET          =    389,333 ms

  = 389.3 seconds, about six and a half minutes. The measured figure includes fixed
  process startup (node, tsx, Zod, content load), which at this budget is noise.

SENSITIVITY, so the answer is not an artefact of S and H:

              H = 4.5      H = 13.8 (all three milestones as dear as M2's need vector)
  S = 0.25      973s        317s
  S = 0.10      389s        127s          <- shipped
  S = 0.02       78s         25s

Every cell is at least 2.5x the invented ten seconds and most are 10-100x. Only the reading §2.1.1 rejects lands near it.

WHAT A LADDER CHANGE DOES TO THIS BUDGET, STATED CORRECTLY. The budget is EXACTLY INVERSELY PROPORTIONAL to the top speed:

  budget_seconds = 525,600 x S / (speed x H)     check: 525,600 x 0.10 / (30 x 4.5) = 389.3

So halving the top rung doubles this constant, and doubling it halves it. **Retuning the ladder in content RE-DERIVES this budget; it does not leave it alone.** The derivation itself needs NO EDIT — tools/headless/src/speed-ladder.budget.test.ts proves that against a byte-identical copy of the gate module, sha256 asserted equal — and bench.mjs says so at the point of use.

SAY THE LIMIT OF THAT CLAIM, BECAUSE THE FIRST VERSION OF THIS PARAGRAPH OVERSTATED IT AND `sim-critic` MEASURED IT FALSE (G-021). "With no code edit" is true of the derivation and FALSE of the repository. A JSON-only retune reddens five assertions in bench.budget.test.ts, one of them budget.mjs's own summary comment — a .mjs file under tools/gates, so fixing it IS a code edit. That is the ADR-0007 machinery working as designed: every quoted copy of the number is pinned, so none of them can drift silently. The honest statement is that a retune requires no change to the ARITHMETIC and does require updating the places that quote its result, all of which a red test names.

WHAT SURVIVES IS THE CONCLUSION, AND THE FORMULA ALONE ESTABLISHES IT — no appeal to the table. Divide: a 12x faster ladder gives 389.3 / 12 = 32.4s, still 3.24x the ten seconds; the budget reaches ten seconds only at ~39x. **So the derived budget stays at least 2.5x the ten seconds for any ladder change within ~12x**, and a plausible retune moves this number without disturbing anything this section concludes about it.

TWO DRAFTS OF THIS SECTION CITED THE TABLE ABOVE AS EVIDENCE, AND BOTH WERE WRONG. The first claimed the budget "does not move materially if the ladder moves" — false, it is inversely proportional, and one division falsifies it. The second claimed S's column covers ladder moves to ~12x because it spans 12.5x end to end; but the equivalence that makes a k-fold ladder change identical to an S -> S/k change is anchored at the SHIPPED cell, S = 0.10, and the column reaches only 0.02 — **5x, not 12.5x**. The table is a sensitivity check on S and H, not on the ladder. It is recorded because the same reach-for-the-table happened twice under correction, which is worth more to a later reader than a clean paragraph.

WHAT THIS SAYS ABOUT THE TEN SECONDS — written after the constant was set, and measured afterwards as a separate step, in that order deliberately. The invented budget was roughly 39x TIGHTER than any requirement this project has stated. It failed builds the game had no need to fail, and it promoted G-016 into existence on that basis. The current build sits at about 2% of the derived budget.

2.1.3 What I5 is, now that its number is sourced

I5's load-bearing content is the word HEADLESS: the sim runs 365 days in Node with no window, no renderer and no DOM. THE TIME BOUND IS A SANITY CEILING, NOT A REGRESSION TRIPWIRE. It catches a catastrophe — an accidental quadratic, a per-tick allocation storm — and it is not meant to catch a 20% drift.

The tripwire this project has actually used for eighteen goals is a PAIRED RATIO against a same-sitting baseline (CLAUDE.md, "Measuring performance"): arms interleaved, warm-up discarded, medians of >=5, and the ratio quoted rather than the absolute. That is the instrument that found G-012's 2.4x and corrected G-016's retracted figures. G-018 added no gate; the human's consequence of widening this ceiling is that the practice becomes one — **G-020, a hard prerequisite of M3**, because M3 is the likeliest place in this project for a quadratic to appear.

Consequence, recorded rather than discovered later: any promotion trigger phrased as "sim:bench exceeds N% of the I5 budget" is now dead, because the budget can no longer be approached. That is the point. The human's complaint was that a made-up constant was promoting goals; a sourced ceiling promotes nothing. A replacement trigger must be a ratio against a paired baseline, and writing one is a goal, not a footnote.

THE GATE'S WORKLOAD DOES NOT YET MATCH THE REQUIREMENT'S, and G-018 changed no workload constant. The requirement says a 60-room hotel; the bench runs a 60-room shell at roughly a quarter occupancy (--arrivals 32, ~15 concurrent) with --amenities 1, which is four providers, while the scaling arm runs twenty. The gap is recorded in PARKING.md. It does not affect the budget derived above, which is a property of the play speed and not of the building.

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
PARK A HYPOTHESIS WITH ITS FALSIFICATION TEST ATTACHED. (Added 2026-08-09 by human ruling.) If the parked item is a guess about how the simulation behaves — not a feature, a belief — write down in the same entry what would confirm or refute it: the invocation, the reading, the comparison. It costs one extra sentence over parking a note, and it is what let G-013, G-017 and G-014a chain without any of them planning the next: G-013 parked "the engagement vector sums to the lodging budget" with its experiment, G-017's recording turned out to BE that experiment and returned positive, and G-014a then hit the knife-edge the hypothesis describes. A parked note is a reminder. A parked hypothesis with its test is a result waiting for a goal that happens to run it.
A criterion that uses a perceptual word — visibly, reads as, looks — needs a perceptual check, or the word must come out (ADR-0013). Since 2026-08-08 the perceptual check exists: record a run and watch it (§5 WATCH).

4.1 Ledger digests

(Added 2026-08-08 by human ruling — ADR-0013 §7.)

A NUMBER CARRIES FIVE SLOTS (CLAUDE.md rule 4, fifth added 2026-08-09 by human ruling): what it measured, over what workload, at what sample count, aggregated how, and UNDER WHAT REGIME. Regime caused three findings in G-020 alone and in each the number was wrong because nobody said which machine state produced it.

ANY COUNT IN A DIGEST NAMES ITS UNIT (added 2026-08-09, human). Gates, tests, files and findings are FOUR DIFFERENT DENOMINATORS and the digests have mixed them — the unreliable-gate count read 1 in one record and 2 in another purely because nobody had said which noun it counted. THIS IS THE SECOND TIME A MEASUREMENT DISAGREEMENT HERE RESOLVED TO A DEFINITION RATHER THAN A DEFECT; G-016's absolutes-versus-ratios was the first.

Each of GOALS.md, DECISIONS.md, JOURNAL.md and PARKING.md carries a rolling digest at the top under a fixed heading. Fifteen lines maximum. It is REWRITTEN at every REFLECT and never appended to. It carries: current schema version, current gate readings, live obligations owed by future goals, and open contradictions. The append-only history stays exactly as it is beneath it.

The reason: the four ledgers passed 2,800 lines and JOURNAL.md — which calls itself the memory that survives compaction — is a quarter of that. An ADR amendment has already spent a day filed under the wrong ADR.

AMENDED 2026-08-09, BECAUSE THE MECHANISM EXHIBITED THE FAILURE IT WAS BUILT TO PREVENT. At G-020a the four digests read: GOALS "G-015 done", JOURNAL "G-015 done", DECISIONS "as of 2026-08-08, after G-013" (five goals and two human ADRs stale), PARKING "G-018 in progress". THREE FILES, THREE DIFFERENT ANSWERS TO "WHERE ARE WE" — a reader scanning for live state gets a confident, wrong answer, which is the exact defect §4.1 exists to close.

The cause is precise and worth naming: §4.1 says REWRITTEN EVERY REFLECT, and what was happening was rewritten WHENEVER THAT FILE CHANGED. Those are not the same thing, and the difference is invisible until you read all four side by side.

SO: ALL FOUR DIGESTS CARRY A BYTE-IDENTICAL `*As of …*` LINE, REWRITTEN IN ONE STEP. REFLECT is not complete until they agree. A digest whose as-of line disagrees with another's is a defect of the same standing as a stale figure in a comment — and it is mechanically checkable, so it should be checked rather than trusted. Seeded as an obligation on the next goal that owns a ledger-shaped check; until then the orchestrator re-stamps all four in one edit and says so at REFLECT.

(Recorded because it is instructive: the first attempt at this re-stamp missed PARKING.md, because its as-of line wraps onto a second line and a line-anchored pattern did not match it. The mechanism needed a mechanical check within one minute of being repaired by hand.)
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

5.8 A FIX ON A KNOWN CLASS MUST STATE WHERE ELSE THAT CLASS LIVES

(Added 2026-08-09 by human ruling.)

When a fix lands on an instance of a class this project already names — a vacuous check, an unsourced number, a claim nothing pins, a criterion that cannot fail — THE SAME COMMIT MUST STATE WHERE ELSE THAT CLASS LIVES AND WHETHER IT WAS CHECKED. Not a promise to check. A STATED RESULT: "criterion 1 checked, clean" or "criterion 1 carries it, fixing".

That converts a reflex into something falsifiable at REFLECT, exactly as §5.5's seam prediction does.

THE GUARD, BECAUSE "CHECKED, CLEAN" IS ITSELF A CLAIM (human, 2026-08-09): NAME WHERE WAS CHECKED, NOT ONLY THAT IT WAS. A location can be re-inspected; an assurance cannot. If §5.8 starts producing unfalsifiable clean reports it becomes the thing it was built to catch — which is this project's most repeated failure and the reason ADR-0007 carries five amendments: each one repaired a costume rather than the thing wearing it. §5.8 is the first rule here that operates on the class rather than the instance, and that is exactly why it must not be allowed to inspect nothing.

THE CASE THAT PRODUCED IT: at G-020a the orchestrator corrected exit criterion 2 for naming an unmeetable command, and LEFT CRITERION 1 CARRYING THE IDENTICAL DEFECT EIGHT LINES AWAY. It was found two rounds later by the critic. The rule was known and was applied outward and not inward — the same shape as the orchestrator exempting itself from CLAUDE.md rule 5. This rule would have caught it for free, because the twin was eight lines from the fix.

5.7 THE ORCHESTRATOR'S OWN CLAIMS ARE IN SCOPE FOR THE GOAL'S CRITIC

(Added 2026-08-09 by human ruling.)

A goal's critic reviews the diff AND the orchestrator's statements about it: the goal block, the exit criteria, the digests, the rulings written into DECISIONS.md, and anything the orchestrator asserted while dispatching. These are not a separate courtesy pass and they are not out of bounds. They are part of the evidence the goal rests on, and a critic that finds one is doing its job rather than exceeding it.

Why it is a rule now: FIVE orchestrator-side errors have been caught by agents doing UNBUDGETED work at nobody's instruction — a fabricated section 10 citation; a "five of six" count three records deny; a 12.5% cross-check that was one dataset and its own superset; a test total that was arithmetic across two moments; and G-020 seeded with "M2 does not exit without it" while neither the exit block nor the digest carried it, found by sim-critic reading outside its assigned diff.

Five catches on goodwill is a mechanism that exists but is not acknowledged. The cheapest thing to do is stop pretending it is luck. A critic may not be blamed for spending a round on an orchestrator claim, and an orchestrator claim that turns out to be wrong is a finding of the same standing as one in the code.

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

RULED 2026-08-09 (human) — THE TRIGGER IS SPLIT BY SUBJECT, because four firings showed the two cases are not the same animal.

  A PROSE finding on re-examination -> an UNPINNED-CLAIM ESCALATION. The remedy is to pin the claim in a test or delete it. NEVER a round, NEVER a split. Four firings say this belongs in the charter as a gate in its own right, and treating it as a budget matter was a category error: a claim nothing pins is not evidence that a diff is too big, it is evidence that a claim is not evidence.

  A CODE finding on re-examination -> the budget conversion stands EXACTLY as written. That is the original signal — fixes spawning defects — and it is the one that genuinely indicates a diff nobody can hold in one head.

  THE CODE ARM IS LIVE, WITH ONE OBSERVATION — G-020a, 2026-08-09 (a workflow-slice check that failed OPEN on a renamed boundary). Five firings: four prose, one code. THE RETIREMENT CLAUSE IS DROPPED, its condition having been met. Small sample; treat the code arm as live rather than proven.

AND THE PROSE ARM WORKED EXACTLY AS RULED, WHICH IS WORTH RECORDING AS MORE THAN "DID NOT BREAK": G-020a's final pass returned a BLOCKER and five MAJORs, ALL PROSE, and the goal CLOSED WITHOUT ESCALATING AND WITHOUT CONSUMING A ROUND. Under the pre-split rule those six findings would have converted, spent the budget and escalated a goal whose code was clean.

THE ORIGINAL PREDICTION, KEPT BECAUSE IT WAS SCORED AND THAT IS THE POINT (human, 2026-08-08). It has fired exactly once — on G-013, the goal that produced it, and on PROSE rather than on code. The registry it was guarding needed no correctness fix at any point. If the next several firings are also prose, then the guard is a prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND RE-SCOPED rather than left to accumulate a reputation it did not earn. Record each firing with its subject: code or prose. This prediction is written down now so it can be wrong later — an unscored prediction is prose, which is the same rule §5.5 applies to seams.

Why the three states: thirteen goals ran mostly at 1/3 rounds with zero BLOCKERs, and the one goal that ran to 3/3 produced the best critique in the project. "I fixed what I found" and "there is nothing left to find" are different claims, and the loop had been treating them as the same one. G-013 then showed that "there are findings left" and "there is diff left" are also different claims — its round-3 critic swept the whole diff and closed with one finding open, which the two-state version could only express as FIXED, whose prescribed remedy (split the goal) would have solved a problem that did not exist.

Additionally: any goal that is the LAST IN A MILESTONE gets a second critic from a different pair in its final round. Precedent — G-008 ran sim-critic then balance-critic, and the second pass found the 107-million-penny sweep.

THE TWO CRITICS OF A FINAL ROUND ARE ONE ROUND, NOT TWO (ruled 2026-08-10, G-019). Both passes charge the budget once between them, however they are scheduled - in parallel, or one after the other, or one converting from a verification while the other sweeps fresh. The rule says a second critic is required IN the final round; a round that contains two critics is still a round. Charging two would make the safeguard cost double the budget of the goals that do not use it, which would price the rule out at exactly the boundary it exists to protect. What is NOT relaxed: a finding either of them raises is a finding, and the goal still closes only on DRY from both.


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