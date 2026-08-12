# GOALS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-12, G-023a done. M2.5: 1 of 4 goals (G-030 awaiting WATCH). Unreliable: 0 gates, 0 defects.*

- **Schemas**: save **v11** (G-023a) · summary **v2** · I2 gate hash **`0da3bbefd62bc863`** · bare
  `sim:run --ticks 100000 --seed 42 --quiet` **`5ea79c98e4c7868c`**. Both measured at G-023a's
  commit, both moved because `Guest.at` is hashed state. **The cross-platform clause was executed
  for the first time at G-022** (one hash on linux, win32 and darwin) and **has not been re-run
  since these moved** — owed by G-023a's CI run.
- **`verify` runs TWELVE rows**: six invariants plus six `—` rows that are **not** invariants
  (`typecheck`, `check:measure`, **`check:tickcost`**, `check:tickcost:proof`,
  **`check:scaling`**, **`check:stamp`**). Twelve green on one **quiet** run, `win32/12cpu`,
  2026-08-12. **The ladder is CONTENT**; `budget.mjs` derives I5 from it.
- **Unreliable: 0 gates / 0 defects — the first zero since G-016.** I4's defect A left the
  parallel runner for `check:scaling` (G-020c); **defect B is repaired by vitest `^4.1.10`**,
  whose `createRuntimeRpc` passes `timeout: -1` where 3.2.7 armed a 60s birpc timer (G-022).
  **`maxWorkers`, `pool: 'forks'` and an RPC-timeout option are all FALSIFIED remedies** —
  recorded in `vitest.config.ts` so nobody retries them. §2.0: a **THIRD** unreliable gate is
  a stop condition.
- **Tripwire** `BOUND 1.4557`, ADR-0015; a SIGNAL bound is pinned to its own derivation and
  refused beneath the worst observed reading, ADR-0016.
- **Order**: **M3 PAUSED after G-023a** for **M2.5 — Feel** (ADR-0017/0018, human). Two parallel
  tracks: **A** G-030 → G-031 (`apps/game`), **B** G-027 → G-028 (`packages/sim`). M3 then resumes
  at G-023b → G-024/G-025 → G-026, G-026 last in milestone, two critics.
- **Owed by the human**: **G-030's WATCH** — legibility passed at WATCH #6, the need vector
  regressed and is being restored · M2.5 exit · M3 exit.
- **Owed by goals**: **G-023a's CI run — the cross-platform hashes moved and have not been
  re-checked on three platforms** · M3 exit runs the **running-product falsification test**
  (`PARKING.md` parked it *"after three M3 goals"*; G-023a's ~1.05× is its first measured input)
  · every M3 goal needs a green three-OS CI run · every parked item naming M3 answered or
  re-parked · **M4 blocked on scenario capital** (ADR-0013 §5) · **the M3 instrument-debt goal**
  now carries I3's unquoted-key hole, the tripwire's unrecharacterised regime, and the 0.05°
  reserved-hue margin.
- **Open contradictions**: G-012's criterion pins a content property any provider can flip ·
  `--rooms N` contaminates every balance sweep · seeds inert until M4. **Not the ladder, not
  I4 — both settled.**

---

The goal ledger. One block per goal, worked one at a time, top unblocked goal first.
Exit criteria are commands, not adjectives. Rules in `HOTELSIM.md` §4 and §5.

**Exactly one goal is `in-progress` at a time.** Anything discovered mid-goal that is
not in the goal goes to `PARKING.md`.

**Write test criteria as `pnpm exec vitest run <filter>`, never `pnpm test -- <filter>`.**
The latter is not one command: PowerShell binds the filter, Git Bash forwards a literal
`--` and vitest discards all positional filters, so `pnpm test -- zzznotafile` runs the
whole suite green. A criterion that passes on a filter matching nothing is not a
measurement. Found during G-001; applied to every goal below.

---

## Closed milestones — M0, M1, M1.5, M2

**G-001 to G-021 are `done` and live in [`GOALS-ARCHIVE.md`](GOALS-ARCHIVE.md).** Moved
2026-08-12, unedited. The digest above carries what is still load-bearing; the archive
carries the verification evidence, the criteria as amended, and the exit sign-offs.

---

# M3 — Circulation

**Stairs and lifts as queued shared resources. Vertical pathing. Wait time as a first-class
satisfaction input.** §8: *"where the genre's difficulty actually lives."*

**M3 DOES NOT OPEN UNTIL G-022 IS DONE** (`HOTELSIM.md` §8, human 2026-08-10). Both of its
prerequisites are instrument debts, and the second is the largest unverified claim in the project.

## G-022 — The instrument debts M2 left, before circulation touches anything
Status: **done, DRY at 2/3.** 2 sweeps (1 BLOCKER-class CI failure + 6 MAJOR + 6 MINOR)
  plus five verification passes, two of which converted. **THE UNRELIABLE COUNT REACHES 0
  GATES / 0 DEFECTS, THE FIRST ZERO SINCE G-016**, and CI is green on three platforms.
  **FOUR OF THE DEFECTS THIS GOAL FOUND WERE IN TESTS WRITTEN TO PROVE SOMETHING.**
Milestone: M3 (gate goal)
Owner pair: sim-engineer / sim-critic
Statement: I4's defect B is repaired and the `--maxWorkers` stopgap is gone; the as-of stamp is
  checked mechanically and owned; every scanner gate has a proof-of-bite test; and **CI has
  actually run green on a real remote across three operating systems.**
Exit criteria:
  - **CI GREEN ON A REAL REMOTE, THREE OS, INCLUDING `compare-hashes`.** A run URL in
    `JOURNAL.md`. **This cannot be satisfied locally and it is the point.** `JOURNAL.md`'s
    bootstrap entry has recorded the three-OS matrix as wired since G-001; **it has never
    executed**, so that claim has sat in the permanent record for nineteen goals having
    inspected nothing — ADR-0007 at the infrastructure layer. **I2 says byte-identical on every
    platform and has only ever been tested on one**, and it is the tripwire the whole design
    rests on. *(Audited 2026-08-10: the workflow is well-formed, `fetch-depth: 0` is pinned by
    `check-measure.mjs`, and `sim:run --ticks 100000 --seed 42 --quiet` was verified to return a
    hash. What is untested is every platform but this one.)*
  - **I4's DEFECT B REPAIRED**, with the rate measured by the shipped signature classifier under
    the loaded arm that produced 10 of 10 at G-020c — **not by a quiet run.** `--maxWorkers`
    leaves `vitest.config.ts` entirely. **The unreliable count reaches 0 and the digest says so
    with its noun.**
  - **THE AS-OF STAMP IS MECHANICAL AND OWNED.** One source, four files; REFLECT fails if they
    disagree. **The fifteen-line cap is NOT reinstated and NOT automated** — see §4.1.
  - **EVERY SCANNER GATE HAS A PROOF-OF-BITE TEST**, each shown to fail for the RIGHT reason.
    G-019 shipped one that removed the scanned subject rather than the mention, so a predicate
    hard-coded to `false` satisfied it — **that shape is the thing to avoid, and it is the
    acceptance bar.** Inventory the scanners first and state the list; `check-purity.mjs`,
    `check-content.mjs`, `determinism.mjs`, `speed-ladder.scan.test.ts`,
    `stopwatch.scan.test.ts`, `review.boundary.test.ts` and `viewer.readonly.test.ts` are the
    ones known at PLAN.
  - all §2 invariant gates green (`pnpm verify`, **TWELVE rows** — the stamp check landed as
    the twelfth `—` row, ruled at PLAN), **plus the same twelve green in CI on all three
    platforms**
Out of scope: any circulation behaviour; anything in `packages/sim` beyond what repairing B
  requires (expected: nothing).
Critique rounds used: 0/3

  **WHY THIS IS ONE GOAL AND NOT FOUR.** All four are instrument debts, none touches the
  simulation, and three of them are the same shape — **a check that nobody owns, or that nobody
  has watched fail.** Splitting them would give each a ceremony larger than its diff. If
  `sim-critic` disagrees at §5.6, the seam is CI (which needs a human action) against the three
  local repairs.

  **THE SEQUENCING ARGUMENT, WHICH IS THE HUMAN'S AND IS THE REASON THIS BLOCKS M3.** Defect B
  is a **load-sensitive** flake, and M3 is pathfinding and queued shared resources — the
  milestone most likely to add load. **Carrying a load-sensitive unreliable gate into the
  milestone that stresses it is bad sequencing rather than acceptable risk.** And a
  timing-derived bound now ships inside `pnpm verify`, calibrated on one machine; M3 would be
  the first milestone where a cross-platform surprise costs real rework.


---

## G-023 — SPLIT at PLAN, 2026-08-12. The seam was offered by the builder and taken (§5.5).

The builder offered the seam and it is the goal's own title. **G-023a moves no outcome — only
hashes. G-023b moves no shapes — only counts.** Run as one goal, both classes of golden move in
one commit and no moved number is attributable to either cause without an intermediate state
nobody committed, which is `CLAUDE.md`'s measuring rule exactly. The precedent is exact: G-007
put `Entity.at` in hashed state and gave it no meaning; G-009 gave it meaning.

**The split also re-sorted the owners cleanly, which is further evidence it is cut in the right
place**: G-023a is save schema and world model (`sim-engineer`), G-023b is guest behaviour
(`ai-engineer`).

## G-023a — A guest is somewhere
Status: **done, DRY at 1/3.**
Milestone: M3
Owner pair: **sim-engineer / sim-critic** (reassigned at the split; `ai-critic` did the §5.6 pass)
Statement: A guest occupies a floor and a cell; that position is part of hashed, saved state and
  survives a round trip. **Nothing moves yet**, and no outcome changes.
Exit criteria:
  - `pnpm exec vitest run travel` (all green)
  - **A GUEST'S POSITION IS IN THE HASHED STATE**, asserted through `hashState` on two worlds
    differing only in a guest's cell — not by asserting the field exists
  - Save **v11** with a real 10→11 migration; the permanent v1 fixture a **zero-line diff**
    walking 1→11; `SAVE_V1_CONTENT_FINGERPRINT` `8e09fe4f0fa162a3` unmoved
  - **NO OUTCOME CHANGES.** Arrivals, satisfied, unsatisfied, needs met/unmet/abandoned, revenue
    and balance identical to HEAD on every existing golden. A moved *hash* is expected and gets a
    one-line argument; **a moved *count* is a defect in this goal.**
  - all §2 gates green (`pnpm verify`, **THIRTEEN rows** — amended at VERIFY, see below)
Out of scope: travel, movement, circulation content, any counter — all G-023b's.
Critique rounds used: **1/3 — DRY.** 1 sweep (2 MAJOR + 3 MINOR, all fixed) + 1 verification
  pass that did **not** convert. Verified by the orchestrator, every exit command run rather
  than reported: `vitest run travel` 3 files / 63 tests · **counts byte-identical to a baseline
  the orchestrator measured BEFORE the diff existed** (arrived 360, satisfied 356, all four need
  rows 356 met / 0 unmet, nourishment 356 abandoned) · `git status packages/sim/src/fixtures/`
  empty · `SAVE_SCHEMA_VERSION = 11` · thirteen rows green, exit 0.

  **THE ROW COUNT WAS VERIFIED BOTH WAYS, AND BOTH ARE RECORDED BECAUSE BOTH WERE RUN.**
  **THIRTEEN green** on the joined tree while G-030 was in the working tree beside it, and
  **TWELVE green** on the isolated tree this commit actually contains. Two full runs, exit 0
  each. **The row count is a property of the tree, not of the goal** — which is ADR-0019's join
  stated as a number, and it is stronger evidence than either reading alone: the goal holds with
  and without a parallel track's gate present.

  **WHY IT WAS COMMITTED IN ISOLATION, WHICH IS NOT THE PLANNED PATH.** ADR-0019 says tracks join
  at VERIFY, and they did. But track A's agent was then killed **twice by API 529s** mid-refactor,
  leaving `apps/game/src/view/guest.ts` half-written and the shared `typecheck` row red — so a
  goal that was DRY, verified and finished sat uncommitted, hostage to an outage on a track it
  shares no file with. Track A was isolated with **`git stash push -u`** (the recoverable
  mechanism `CLAUDE.md` mandates, never `git checkout --`), **111 files sha256'd before and
  compared after**, and this goal verified and committed alone.
  **The cost of the parallelism ruling, stated rather than absorbed**: "tracks join at VERIFY"
  means **any** failure on either track blocks both, including failures that are nobody's code.
  Scored at REFLECT rather than described as free.

  **RULINGS TAKEN AT PLAN, both from `ai-critic`'s §5.6 pass:**
  - **`Guest.at` is NON-NULLABLE and the migration derives the cell.** `at: null` plus lazy
    placement is not a statement about history, it is **deferred invention** — and arrivals are
    appended *after* the existing-guest loop, so every guest would end its arrival tick unplaced,
    forever. Worse, the invention would happen in the tick, where G-024/G-025 later change the
    placement rule, so the same v10 bytes would produce a different world one tick after loading.
    That is ADR-0008's drift laundered through a tick boundary.
  - **The entrance is a TOTAL function of the world's own `GridBounds`**, clamped — `assertGridBounds`
    requires only min<=max per axis, so **floor 0 is not guaranteed to be on the plot**. Not a
    frozen literal, and pinned by a case whose bounds exclude floor 0.

  **A KNOWN OBSERVATION FOR THE WATCH, NOT A DEFECT OF THIS GOAL.** Rest is served by *holding* a
  room, not by standing in it, so once positions exist the viewer draws a guest asleep in the
  basement café while also drawing it as the bedroom's occupant. Pre-existing behaviour that this
  goal makes **visible**. ADR-0017 is what fixes it.

## G-023b — Going somewhere takes time
Status: **pending — RE-PLAN REQUIRED after ADR-0017.** Blocked on G-023a and on M2.5.
Milestone: M3
Owner pair: ai-engineer / ai-critic
Statement: Moving to a provider takes ticks proportional to the distance.

  **THE PLAN THIS GOAL HAD WAS FALSIFIED AT §5.6 BY A BLOCKER, AND THE BLOCKER IS WHY ADR-0017
  EXISTS.** The builder derived `guestCellsPerTick = 12` from ~30 ticks of patience slack. The
  arithmetic was internally correct and **the model was wrong**: the binding constraint is that
  the three engagement needs sum to **exactly** the 480-tick lodging window, and rest runs on
  every tick a guest holds a room — so **the travel budget is ZERO**, at every speed short of
  crossing the plot in one tick.

  **Measured by the orchestrator, both directions, `--days 30 --seed 7 --rooms 6 --amenities 5`:**
  shipped content → `guest_nourishment` 356 met / 0 unmet · `satisfyTicks` 180→181 → **0 met /
  356 unmet** · `night_rest.satisfyTicks` 480→479 → **0 met / 356 unmet**. A cliff, not a
  knife-edge, and the fourth appearance of the hypothesis G-013 parked with its experiment.

  **ADR-0017 dissolves it** — with no completion deadline, travel is time not spent doing
  something else. **This goal is re-planned from scratch after M2.5**, and the seam `ai-critic`
  offered (simulation vs instrument, keeping the second save migration out of the same diff) is
  provisionally accepted and re-assessed at that re-plan.

  **CARRIED FORWARD, so the re-plan does not re-derive them:** `check:tickcost`'s acceptance bar
  is **`verdict=MEASURED`** — `INCOMPARABLE` passes and would satisfy the criterion vacuously ·
  `optional('circulation.json')` must be taught to `tools/gates/arm/measure-arm.mjs` or
  `check:measure` goes red, the G-014b precedent being in that same file · and the far/near
  differential **may not be able to hold `journeys` equal**, because spreading providers lengthens
  every hold and changes contention, so it may have to normalise per journey and say so.

---

# M2.5 — Feel: a playable surface, and the need model

> **Inserted 2026-08-12 by human ruling (ADR-0017, ADR-0018), mid-M3.** A bridge milestone, in
> the idiom G-011 established at M1.5. **M3 pauses after G-023a and resumes at G-023b.**

**Why it exists, and it is evidence rather than preference.** Twenty-two goals in, nobody has
played this game. **ADR-0017 — the largest design change in the project — came from the human's
intuition about how the game should feel, not from any test**, and it arrived at goal 23 and
re-opened behaviour in four M2 goals. Design feedback is the scarce input here, not agent hours,
and playing is how it is generated. **The surface comes first so the need model's four content
numbers can be chosen by playing rather than by arguing** — ADR-0017 warns they have no old
baseline to inherit, because the model they were fitted to will not exist.

**WORKED IN TWO PARALLEL TRACKS** (human ruling 2026-08-12, under ADR-0018 §4). Numbering is not
worked order in this project and has not been since G-019 landed last in M2.

| track | goals | owns |
|---|---|---|
| **A — render** | G-030 → G-031 | `apps/game`, the speed-ladder scan in `tools/gates` |
| **B — sim** | G-027 → G-028 → *(M3)* G-023b → G-024/G-025 → G-026 | `packages/sim`, `packages/content`, `tools/headless` |

**THE AXIS THAT PARALLELISES IS RENDER-AGAINST-SIM, NOT SIM-AGAINST-SIM, AND THE REASON IS
STRUCTURAL RATHER THAN CULTURAL.** Two goals touching hashed state serialise on **two global
sequences that a worktree does not duplicate**: `SAVE_SCHEMA_VERSION`, where both would bump to
the same number, and the I2 state hash, where either moving it invalidates the other's goldens
and every re-pinned figure in its diff. Track B is therefore serial internally, and that is a
fact about the invariants rather than a scheduling preference.

**The one cross-track coupling, named now so it is not discovered at VERIFY**: G-031's criterion
that a UI-driven session and a headless session on the same command log produce the same state
hash. That golden is only stable between track-B schema changes — so G-031 either lands in such
a window or re-takes it, and whichever happens is stated in its block rather than done quietly.

**The ledgers serialise on the orchestrator.** `GOALS.md` and `JOURNAL.md` are written at REFLECT
by one writer, so parallel tracks never contend for them.

**G-029 is RESERVED AND DEFERRED TO M6** (ADR-0018 §6) — "a guest need not lodge", with the rest
of the archetype work. **The structural admission is not deferred**: G-027 must leave lodging
optional and tolerance a parameter the model reads, which costs a paragraph rather than a goal.

## G-030 — The hotel is on screen
Status: pending — **opens `apps/game`, superseding `HOTELSIM.md:66` (ADR-0018)**
Milestone: M2.5
Owner pair: render-engineer / render-critic
Statement: A live simulation is drawn as a side-on cross-section — rooms, items and guests as
  flat coloured shapes with clear silhouettes — advancing in real time at a speed the player
  chooses from the content ladder. It reads state and dispatches nothing.
Exit criteria:
  - `pnpm dev` (or the documented invocation) opens a window showing the shipped hotel running,
    and the invocation is in `README`/`HOTELSIM.md` rather than in someone's memory
  - **THE SPEED CONTROL READS THE CONTENT LADDER AND DOES NO ARITHMETIC ON IT** — see the
    obligation below, which is a criterion and not a note
  - **A GUEST IS DRAWN AT `guest.at`**, so this goal depends on G-023a and on nothing else
  - **I1 IS UNTOUCHED**: `pnpm check:purity` green with `apps/game` populated — the render layer
    imports the sim, never the reverse
  - placeholder art only (ADR-0014); **no art track opens and none is waited on**
  - all §2 gates green, **THIRTEEN rows** (amended at PLAN — see F2), and CI green on three
    platforms, plus a `pnpm --filter @hotelsim/game build` step in the existing `verify` job
  - **LEGIBILITY — ADDED AT WATCH, 2026-08-12, BECAUSE THE OTHER SIX ALL PASS ON AN UNREADABLE
    SCREEN.** Two halves, and the wording of the first is deliberately narrow:
    - **MECHANICAL**: *the specific failure measured on the rejected build has not returned* —
      every colour the shipped content actually receives clears a stated minimum contrast
      against every other **in its role**, and 3:1 against the page, computed by a test whose
      subject is the real `createPalette` output rather than a fixture, with an arm that feeds
      it the twelve rejected colours and requires them to FAIL.
    - **PERCEPTUAL**: the human watches it and says whether it reads. **This half cannot be
      discharged by an agent** (ADR-0013), and a green mechanical half does not imply it.
    **Three things this wording deliberately does NOT say**, each corrected by `render-engineer`
    against my first draft: not *"distinguishable at the size it is drawn"* — contrast is
    size-independent and greyscale separation is a **proxy** for legibility at size, so the
    criterion claims the proxy · not *"from every other"* without qualification — the ceiling is
    `span^(1/(N-1))`, which becomes unmeetable around **eight room types**, at which point the
    honest answer is *"colour alone can no longer do this job and content needs a colour field"*,
    not *"the goal cannot close"* · and it does not claim to certify legibility, because **two of
    the human's three complaints were not about colour at all** — a correct palette with an
    illegible layout passes the mechanical half. That residual is why outline, plate, band,
    gutter, grade and silhouette were fixed **independently of the palette**.
Out of scope: input, commands, building, any player action (G-031); sound; real art; camera
  pan/zoom (parked — input lives in G-031); tween/interpolation (nothing moves until G-023b).
Critique rounds used: 0/3

  **TWO MECHANICAL FINDINGS AT PLAN, both of which would have cost a round at VERIFY.**
  **F1**: `scanner.census.test.ts:355` derives the scanner register by walking `tools/` and
  `packages/` for `readdirSync(`-shaped calls, so **a new tree-walking gate is auto-derived,
  unregistered, and reddens I4 by name** — and `:383` requires its proof to be a `.test.ts`
  vitest runs, which lives in `tools/headless/src`, a **track B** directory. **F2**: this goal
  ships a thirteenth `verify` row, so its own "twelve rows" criterion was **arithmetically
  stale on arrival**. Neither is a defect; both are the instruments working.

  **RULINGS TAKEN AT PLAN:**
  - **F1 GRANTED as option (a)** — track A owns `tools/gates/check-ladder.mjs`,
    `tools/headless/src/ladder-arithmetic.test.ts` and a one-line `REGISTER` insertion.
    Folding the arm into `check-content.mjs` with the proof embedded **refused**: it puts the
    proof inside the thing it proves, ADR-0007's shape one level up, and the census's own rule
    is that a proof runs by a different mechanism than the gate.
    *Disjointness, stated before starting as ADR-0018 §4 requires*: G-027/G-028 change
    `NeedState`, content numbers and departure; they add no scanner and touch neither file.
  - **F2 AMENDED to thirteen rows**, the thirteenth a `—` row. **No seventh invariant is
    minted** — that is a human decision. **OWED: the row count in every other pending goal
    block is propagated at this goal's REFLECT.**
  - **`MAX_BACKLOG_SECONDS` is a transport policy constant, NOT a §2.1 threshold** — §2.1
    governs numbers a *gate compares against* and none does. It carries a stated policy in
    prose and **may never be quoted as a measured or derived number**. Settled at PLAN so the
    builder and critic do not spend two rounds on it (§5.3).

  **THE SEAM WAS OFFERED, THE BUILDER RECOMMENDED DECLINING, AND I DECLINED IT — AGAINST THE
  ONE PRECEDENT THAT SAYS NOT TO.** G-022's most expensive error was this exact shape: a seam
  offered, declining recommended, agreed, and falsified within the hour because the declined
  half held **open-ended discovery wearing a bounded criterion**. The accepted argument is that
  a static hotel generates almost no design feedback and `tools/viewer` already shows one with
  a scrubber, so G-030a alone would ship a *worse* instrument than the tree already has.
  **The seam does not isolate the open-ended risk — both halves need the bundler — which is the
  real reason it does not help.** Mitigation instead: **the bundler/depcruise spike runs FIRST
  and reports before any drawing code**, which is the bounded checkpoint the split would have
  bought.

  **§5.5 PREDICTION, the builder's own words, to be scored at REFLECT:** declining costs
  (i) at least one BLOCKER or MAJOR **in the timing class** — render-held authoritative state,
  frame-rate-dependent advance, or wall-clock reaching `stepTick`; (ii) the goal does **not**
  close DRY at 1/3; (iii) the diff **exceeds ~1,200 added lines**. *If it closes DRY at 1/3
  under 1,200 lines with no timing-class finding, the prediction was wrong and one goal was
  right.*

  **AN OBLIGATION FALLS DUE THE MOMENT THIS GOAL OPENS `apps/game`, AND IT SHIPS HERE RATHER
  THAN AFTER.** `HOTELSIM.md:66` records that nothing in `packages/content` can stop render code
  computing `ladder[i] / ladder[0]` and reintroducing the speed-ladder-as-multiplier defect
  G-021 deleted. The instrument is **a source scan over `apps/game`**, parked with its
  falsification test **because the directory was shut**. It is no longer shut. A parked
  instrument whose precondition has expired is ADR-0007's class waiting to happen.

  **`tools/viewer` IS NOT PROMOTED AND IS NOT EXTENDED.** It is a replay viewer whose
  "it cannot act" is structural and gated by `viewer.readonly.test.ts`. §9 says delete it rather
  than defend it if it grows features. This goal is the renderer; the viewer stays disposable.

## G-031 — The player acts
Status: pending
Milestone: M2.5
Owner pair: render-engineer / render-critic
Statement: The player builds a room, demolishes one, and changes speed, through the existing
  command path. Input maps to commands; nothing new is simulated.
Exit criteria:
  - **EVERY PLAYER ACTION IS AN EXISTING COMMAND.** This goal adds no simulation behaviour; if
    it needs one, that is a defect in the goal and it stops.
  - **A REFUSAL IS VISIBLE.** G-008 made refusal a recorded outcome rather than a throw; the
    player must be able to see that a build was refused and why — the reasons already exist.
  - **I2 SURVIVES THE UI**: a session driven through the UI and one driven by the same command
    log headless produce the same state hash. **This is the criterion that makes the render
    layer prove it is a view.**
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), and CI green on three platforms
Out of scope: item placement (M6); pricing (M4); save/load UI (M5).
Critique rounds used: 0/3

## G-027 — Needs are stocks, and a stay ends by checkout or by dissatisfaction
Status: pending — **the largest behaviour change since M2.** ADR-0017.
Milestone: M2.5
Owner pair: ai-engineer / ai-critic
Statement: A need is a level that decays over time and is refilled by being served; it is never
  "done". Activity draws a stock down. Rest refills only in the guest's own room. A stay ends
  two ways and only two: checkout after the stay duration, or the guest giving up.
Exit criteria:
  - `pnpm exec vitest run stock` (all green)
  - **NO NEED IS TERMINAL.** `progressRemaining`'s zero-is-terminal semantics are gone, asserted
    by a case that serves a need to full and then watches it decay again.
  - **BOTH TERMINATORS FIRE IN ONE RUN, AND NEITHER IS THE ONLY ONE** — a run reporting
    non-zero checkouts AND non-zero give-ups, computed by the test. A build in which one is
    always zero has not implemented two terminators.
  - **THE FOUR NUMBERS ARE DERIVED, NOT TUNED** — decay rate, refill rate, dissatisfaction
    threshold, stay duration. Each traces to a stated requirement (§2.1) and the derivation is
    **executed**, not prose. **This is the goal's real risk**: the old values were fitted to a
    model that will no longer exist, so there is no baseline to inherit and every number is a
    fresh invention unless it is sourced.
  - **THE MODEL ADMITS WHAT IT DOES NOT YET CONTAIN**: lodging is optional and tolerance is a
    parameter read from content, both asserted by a test, **with no archetype content shipped**.
  - a WATCH entry — and by then there is a playable surface to watch it in
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), and CI green on three platforms
Out of scope: archetypes and their content (M6); per-night charging (M4); reviews (G-028).
Critique rounds used: 0/3

  **WHY THE TERMINATOR CANNOT BE A SEPARATE GOAL.** If a need never completes and departure
  still keys off completion, no guest ever leaves, guests accumulate without bound and the
  simulation does not run. The terminator must land in the goal that removes completion.

## G-028 — Outcomes and reviews are stock-shaped
Status: pending
Milestone: M2.5
Owner pair: ai-engineer / **balance-critic** · second critic `ai-critic` (last in milestone)
Statement: The outcome table and the review function describe a stock rather than a task. "Met"
  and "unmet" are task-shaped and stop meaning anything once needs oscillate; the natural
  replacement is time spent below a threshold.
Exit criteria:
  - `pnpm exec vitest run review` and `pnpm exec vitest run outcome` (all green)
  - **THE REVIEW RESPONDS TO THE STAY, NOT ONLY TO LODGING** — G-019's two axes survive the
    re-expression, including AXIS 2's three-point amenity ladder, recomputed rather than copied
  - **THE DISTRIBUTION IS NOT A POINT MASS**: a stated minimum share per named score, which is
    the form G-019 had to be rewritten into after its original was discharged by two guests
  - summary schema bump if the shape changes, with the migration ADR-0006 requires
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), and CI green on three platforms
Out of scope: reputation and demand reading the review (M4).
Critique rounds used: 0/3

---

# M3 — Circulation, resumed

## G-024 — Stairs are a shared resource, and sharing means queueing
Status: pending — **MAY MERGE WITH G-025; the question goes to the builder at PLAN (ADR-0018 §5)**
Milestone: M3
Owner pair: ai-engineer / ai-critic
Statement: A staircase has capacity. When more guests want it than it holds, they queue, and
  the queue is FIFO and deterministic.
Exit criteria:
  - `pnpm exec vitest run queue` (all green)
  - **THE QUEUE IS DETERMINISTIC UNDER I2** — no Set or Map iteration order, ties broken by a
    stated rule, asserted on TWO insertion orders (G-014a's precedent).
  - **A CONTENDED INVOCATION PRODUCES A NON-ZERO QUEUE AND A NON-ZERO WAIT**, and an
    uncontended one produces zero of both — the two-sided form, so it cannot be met by never
    queueing anyone.
  - **NO GUEST WAITS FOREVER**: a liveness assertion over a long run, stated as a bound
    derived from capacity and arrival rate rather than chosen.
  - **`check:tickcost` inside its bound.** A queue is where a quadratic appears; this is the
    goal G-020 was made a prerequisite for.
  - a WATCH entry with a frame reference showing a queue forming and draining
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), **and CI green on three platforms**
Out of scope: lifts (G-025); travel time in the score (G-026)
Critique rounds used: 0/3

  **DISCHARGES**: "M3's statement is literally queued shared resources" and "a provider is a
  queue with capacity", both parked since M2.

## G-025 — Lifts: capacity, direction, and a call queue
Status: pending
Milestone: M3
Owner pair: ai-engineer / ai-critic
Statement: A lift carries a bounded number of guests, moves in a direction, and serves calls
  in an order that is stated and deterministic.
Exit criteria:
  - `pnpm exec vitest run lift` (all green)
  - **THE SERVICE ORDER IS A STATED RULE, NOT AN EMERGENT ONE**, pinned by a test that would
    fail if the rule changed — and the rule is in `packages/content`, not in code (I3).
  - **A DIFFERENTIAL OVER CAPACITY**: the same invocation at capacity 2 and capacity 8 reports
    strictly different wait totals, COMPUTED BY THE TEST.
  - **NO GUEST IS STRANDED** — the liveness bound from G-024, extended to a resource that
    moves.
  - `check:tickcost` and `check:scaling` inside their bounds
  - a WATCH entry: does the lift read as sensible, or as the thing §6.1 calls dithering
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), **and CI green on three platforms**
Out of scope: lift *placement* as a build decision (M5's tools); pricing or upkeep (M4)
Critique rounds used: 0/3

## G-026 — Travel time enters the score, and waiting is a satisfaction input
Status: pending — **LAST GOAL IN M3 → second critic from a different pair (§7.1)**
Milestone: M3
Owner pair: ai-engineer / **balance-critic** · second critic `ai-critic`
Statement: A guest choosing between providers accounts for how long it will take to get there
  and how long it will wait; and time spent waiting reduces satisfaction directly rather than
  only through patience running out.
Exit criteria:
  - `pnpm exec vitest run score` (all green)
  - **THE WEIGHT IS CONTENT AND ITS SIZE IS DERIVED FROM A STATED REQUIREMENT** (§2.1), not
    chosen — and `bindContent` refuses content the requirement cannot support.
  - **THE DIFFERENTIAL**: identical hotels differing only in provider distance produce
    different provider choices, COMPUTED BY THE TEST — **and a second axis holding distance
    fixed while varying queue length**, so a scorer reading only distance cannot pass.
  - **THE PARKED HYPOTHESES ARE ANSWERED, EACH WITH ITS RECORDED TEST**: whether
    provider-upgrading within a need becomes worth having once travel makes the trade real;
    whether the equidistant-provider artefact closes; and **the dwell term**, which M2 left as
    a result rather than a hypothesis.
  - a WATCH entry at the middle-band configuration, **watched not manufactured**
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), **and CI green on three platforms**
Out of scope: reputation, pricing, demand (M4)
Critique rounds used: 0/3

  **THIS IS WHERE M2's PARKED HYPOTHESES COME DUE.** `PARKING.md` carries at least four that
  name this goal by number or by subject, each with the invocation and reading that settles
  it. **A parked hypothesis with its test is a result waiting for a goal that happens to run
  it** — this is that goal, and it should report them as results rather than re-derive them.

## M3 exit — human sign-off required

When **G-022 to G-026** are `done`, that is a §5.4 escalation. Write it to `ESCALATIONS.md`
and stop.

**M3 exit additionally requires:**
- **THE INSTRUMENT DEBTS M3 LEAVES, AS THEIR OWN GOAL** — the shape G-022 took for M2's, ruled by
  the human 2026-08-12. **Known members so far:**
  - **I3's gate is blind to an unquoted object key** (`ESCALATIONS.md`, G-030): `{ 'standard_room':
    … }` is caught in both roots and `{ standard_room: … }` in neither, which is how a person
    actually writes the palette table ADR-0003 exists to forbid — ADR-0007's class **inside an
    invariant gate**. The repair likely keys the predicate to **declared content ids** rather than
    to snake_case shape, and **its proof-of-bite must cover the unquoted spelling**, because
    today's proof passes with the hole open.
  - **`tripwire.mjs`'s noise characterisation may not describe the regime the project now runs
    in** (`PARKING.md`, G-023a): ADR-0018 made parallel tracks normal, so heavy concurrent
    compilation is now the common case, and a reading of **0.7978** was observed 14% below the
    recorded campaign's floor of 0.9268. **Enabling parallelism changed the machine's regime and
    the timing gates were calibrated on a quiet one.**
  - **the reserved-hue guard is binding at 0.05° of 35°** (`PARKING.md`, G-030 VERIFY).
- **THE RUNNING-PRODUCT FALSIFICATION TEST, RUN.** `PARKING.md` parks it explicitly *"after
  three M3 goals"*: multiply the recorded per-goal `check:tickcost` ratios. **If the product
  materially exceeds the largest single reading, the per-goal gate has the compounding hole
  and the milestone-anchor version earns its cost.** This is the first milestone that can run
  it, and it was parked with that trigger.
- **EVERY M3 GOAL'S CI RUN GREEN ON THREE PLATFORMS**, not just the last — CI is now a
  standing gate rather than a one-off, and a goal that never had a green matrix run has not
  been shown to hold anywhere but this desk.
- **THE PARKED ITEMS NAMING M3 ARE EACH ANSWERED OR RE-PARKED WITH A REASON.** There are
  more than a dozen. Silence reads as coverage, which is the failure this project keeps
  paying for.
- **M4 REMAINS BLOCKED ON SCENARIO CAPITAL** (ADR-0013 §5) regardless of M3's outcome.
