# GOALS

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-14, M2.5 COMPLETE AND SIGNED OFF; M3 under way with G-032a done — pnpm verify THIRTEEN GREEN locally. CI: two completed runs RED (both pre-G-032a), three pending — read it before the next goal. Unreliable: 0 gates, 0 defects.*

- **Schemas**: save **v16** (G-028a; summary 4 at G-028b) · summary **4** (G-027a, and θ-b1's sixth departure row did
  **not** bump it — additive, per `report.ts`'s published policy) · I2 gate hash
  `8a83acaf7f81edeb` · measure golden `ebb9c3924e373c1e`. *(Re-verified by the orchestrator 2026-08-14. **This line read `save v12` and `452920cbe5ded417` while the tree was at v14** —
  two schema generations, through two goals, with `check:stamp` green the whole time, because
  **that gate compares the as-of LINE and never reads the body beneath it.**)*
  **DISCHARGED 2026-08-12 by CI run #8** (`31638930195`, `81961fc..ab2991c`): `compare-hashes`
  **SUCCESS**, bare-run hash **`a15d1a9bce32d38f` identical on ubuntu, macOS and Windows**. I2's
  byte-identical-on-every-platform clause — the tripwire the whole design rests on — has now been
  executed **twice**, and ADR-0002's integer-pence decision is paid off in evidence a second time.
  **All six invariants green on all three platforms.** The only reds are the three ruled ADR-0015
  refusals, **identical on every platform, with no fourth row and nothing platform-specific** —
  against G-022's precedent of six runs and two real cross-platform defects.
- **`verify` runs THIRTEEN rows** (G-030 added `check:ladder`). **TEN GREEN, THREE RED.**
  The three are `check:tickcost`, its proof row, and `check:scaling` — **three rows, TWO causes,
  both ADR-0015 configuration refusals, human-ruled and accepted.** Each declines to compare a
  campaign taken at `arrivalEveryTicks: 32` against a workload now at 96. **No bound was touched.
  NO INVARIANT IS RED.**
- **STATE EVERY VERIFY AS "ten green, three ruled red" — NEVER AS A GREEN COUNT ALONE.** §9's
  shape is *a gate that flakes red teaches people to re-run it*; a gate that is **known** red
  teaches people to skim the summary. The exception becomes the habit the first time it is not
  named out loud.
- **Unreliable: 0 gates / 0 defects** — §2.0's sense, which is flakiness, **not** the ruled reds.
  §2.0: a **THIRD** unreliable gate is a stop condition. **Tripwire** `BOUND 1.4557` (ADR-0015),
  bounds pinned to their derivation (ADR-0016). **The SPEED ladder is CONTENT** — *(corrected
  2026-08-13, ADR-0033: this line read "the ladder is CONTENT" and was being taken as covering
  AXIS 1's ladder too. **AXIS 1's ladder is four CLI flag strings in a test file**, provisioned by
  `schedule()`'s defaults, and no gate reads it. Two different objects, similar names, one
  sentence.)*
- **The re-take goal carries THREE campaigns**: tickcost, scaling, and `PARKING.md`'s
  needs-history interval (1.1071..1.2534, n=25) whose two arms are no longer poolable. Sized by
  `ai-critic`, which checked four other candidates and found none implied.
- **Order**: **M3 PAUSED after G-023a** for **M2.5 — Feel** (ADR-0017/0018). **M2.5 IS NOW EIGHT
  GOALS, NOT FOUR** — it grew through three seams taken in one session (G-023, G-027 ε, G-027 θ),
  each argued on evidence and each having paid, because **ADR-0017 turned out roughly twice the
  size the estimate implied and the seams REVEALED that rather than causing it.**
  **AND NINE AFTER θ-b SPLIT AGAIN** (ADR-0025, seam taken at PLAN on an enumeration finding **25
  lodging-assumption sites where the block named 4** — the third mispricing of that one sub-goal,
  each by someone reading a list instead of counting a population).
  **Done (5)**: G-030 ✓ · G-027a ✓ · **θ-a ✓** (`7f0be45`) · **θ-b1 ✓** (`d6abef6`) ·
  **θ-b2 ✓** (`88dc25e`, save v15). **All pushed through `88dc25e`.**
  **CLOSED 2026-08-14 by WATCH #11**: θ-a and G-031a — `apps/game` is the WATCH surface (ADR-0023) and it
  will not composite while the browser pane is hidden. **θ-b1's and θ-b2's WATCHes are discharged**
  from scrubbed recordings; **neither cites the viewer's drawing**, which is known stale.
  **Not started (1)**: **G-028**, and ADR-0033 re-aimed it — **the review signal is ABSENT, not
  inverted**, so the job is the one-tick snapshot, not the scorer's arithmetic.
  **STRUCK — NAMES ONLY, NEVER GOALS (ADR-0032 §2)**: ~~G-027c~~ · ~~G-031b~~. **Each occurred
  exactly once in the whole ledger — in this list.** No statement, no criteria, no owner, and both
  were being counted in "M2.5 is nine goals" and in every estimate of what remained. **A goal with
  no block is not counted.** M2.5 is **SEVEN goals, four done**. If a statement can be written for
  either, it gets a block and rejoins; if not, the slot is closed and was always empty.
  **THEN M3 RESUMES at G-023b — UNBLOCKED** (960 ticks of slack where its plan pass measured zero)
  → G-024/G-025 → G-026, last in milestone, two critics. **Four M3 goals of its own remain.**
- **Owed by the human**: M3 exit. *(**M2.5 EXIT: SIGNED OFF 2026-08-14.** And **WATCH #11 discharged
  all three owed WATCHes in one look** — napping reads as resting, the departure distinction **IS**
  visible via the lobby fuse, and the needs-met bar survives its redefinition. **ADR-0037's scoring
  ruling is human-confirmed**: responsiveness over severity. **ADR-0015's blind-spot call is
  delegated to the orchestrator** — *"whatever is best for the progress of the project"*.)* *(The push was DISCHARGED
  2026-08-13: `ab2991c..9f89c31`.)*
- **Owed by goals**: **G-027b derives N and X at PLAN, before BUILD** — the idle-run bound and
  idle-share ceiling that G-028's criterion and `PARKING.md`'s hypothesis both rest on; baseline
  **61.9% of room-holding guest-frames idle, longest run 96 frames = 960 of 1,440 ticks** · **the
  M3 instrument-debt goal** carries the three campaigns, I3's unquoted-key hole and the 0.05°
  reserved-hue margin · M3 exit runs the **running-product falsification test** · every M3 goal
  needs a green three-OS CI run · **M4 blocked on scenario capital** (ADR-0013 §5).
- **THE DEFECT THIS PROJECT PRODUCED FOUR TIMES IN ONE GOAL: the prose claimed more than the
  predicate** — and every instance was written by someone who had just demonstrated they
  understood the rule; the last acquired its overclaim **while being repaired for the opposite
  one**. **Repair by assertion, never by a better sentence.**
- **Open contradictions**: G-012's criterion pins a content property any provider can flip ·
  `--rooms N` contaminates every balance sweep · seeds inert until M4.

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
Status: **done, DRY at 3/3.** *(Marked done 2026-08-13, late — the block still read "awaiting the
ADR-0019 join before commit" after the join had happened, the commit had landed at `ab2991c`, and
the human had returned **three** WATCH verdicts. **Found by `check:stamp` refusing a stamp that
named G-030 as done**, not by anyone noticing: the gate that keeps four ledgers agreeing is also
the only thing that reads a goal block against reality. Its REFLECT entry has said DONE since it
was written.)* 3 sweeps (**9 findings**:
  4 MAJOR + 4 MINOR + 3 NIT) plus 1 verification that did **not** convert. **WATCH passed at
  the third asking** (#5 failed, #6 partial, #7 *"It reads"*). Opens `apps/game` after 23
  goals, superseding `HOTELSIM.md:66` (ADR-0018).

  **THE §5.5 PREDICTION, SCORED — AND THE HONEST SCORE IS NOT THE FLATTERING ONE.**
  The builder offered a seam (drawing / timing), recommended declining, and I declined with
  its prediction recorded. Outcome:
  - **(i) at least one BLOCKER or MAJOR in the timing class — WRONG.** None at any sweep, held
    on **reconstruction rather than reading**: `render-critic` added the reference arm the
    builder's measurement lacked (three drivers agreeing cannot detect an offset shared by all
    three) and drove seven arms — 30/60/144/61.7fps, a jittered profile, a 10-minute stall
    exercising the backlog clamp, and headless `run()` — all to one hash. One wall-clock read
    exists in the whole layer; no assignment into sim state exists anywhere in `apps/game`.
  - **(ii) does not close DRY at 1/3 — CONFIRMED, at full cost.** 3/3 sweeps, closing on a
    ninth finding.
  - **(iii) diff exceeds ~1,200 lines — CONFIRMED** at 2,105+.

  **AND THE SEAM THAT WOULD HAVE PAID WAS NOT THE ONE ON THE TABLE. FIVE OF THE NINE FINDINGS
  CAME FROM `check:ladder` AND ITS PROSE** — the parked instrument this goal absorbed as an
  obligation falling due — and they consumed most of three sweeps. That seam existed,
  **gate-versus-renderer, and nobody offered it, me included.** The builder's generalisation is
  the durable output of this goal and is recorded in its own words:

  > **"A builder proposing a seam should ask what the goal is CARRYING, not only what it is
  > BUILDING. The parked instrument was named in the goal block from the start and I read it as
  > a task rather than as a seam."**

  §5.5 currently asks a builder what it is *building*. This says the question must also be
  asked of everything the goal *inherits*.

  **THE DEFECT CLASS THIS GOAL PRODUCED THREE TIMES, IN THREE DIFFERENT CLOTHES**: the gate's
  prose claiming more than its predicate · three escapes claimed parked when one was not · and
  the retracted phrase *"conservative in the safe direction"* surviving in `HOTELSIM.md:70`,
  **nineteen words from the sentence retracting it**, where `CLAUDE.md`'s precedence rule would
  have resolved the disagreement **in favour of the retracted reading**. Each time the general
  rule was written down correctly and the instance beside it was missed. The builder's account,
  quoted because it is exact: *"I wrote the correction into the gate, wrote the general lesson
  into the charter paragraph, and left the specific instance of that lesson standing in the
  same paragraph."* **It is a reading failure, not a writing one** — the paragraph was edited by
  someone who had just proved they understood the rule.

  **THE GATE WAS BLIND TO ITS OWN SUBJECT WHEN THE EXPRESSION WRAPPED.**
  `STATEMENT_BREAK_SOURCE` counted a newline as a statement boundary, so `ladder[i] / ladder[0]`
  split across two lines — this repo's house style, with no formatter to prevent it — reported
  clean. Demonstrated `wrapped 0 · oneline 1`. **The failure the human's M2-exit ruling names,
  in the gate shipped to close a parked instrument**, and it shipped because the proof had no
  multi-line arm.

  **AND THE FIX WAS DECLINED IN THE RIGHT DIRECTION.** Both available tightenings of the alias
  predicate buy a **silent miss** to remove a **loud report** — one of them killing the exact
  ternary at `main.ts:135` that sweep 1 raised. The predicate stays wide, the false positives
  are executable arms, and the ordering is now stated in the gate: *a false report costs a
  reader five minutes and arrives with a file, a line and a message; a silent miss certifies a
  clean tree forever and nobody looks, because nothing asked them to.*
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

## G-027 — SPLIT at PLAN, 2026-08-12. Seam ε, offered by the builder and taken (§5.5).

Cut at **the stay clock** against **the need's shape**. Each half owns **exactly one
`SAVE_SCHEMA_VERSION` bump and touches the other's tables not at all** — the property that made
G-023's split right. The numbers split the same way, into two independently-sourced groups, so a
critic sweeping the derivations never has to hold both frames at once.

**And G-027a alone unblocked G-023b**: a 1,440-tick stay against 480 ticks of engagement work is
**960 ticks of slack**, which is the quantity ADR-0017 exists to create and the reason M3 stopped.

## G-027a — A stay has a duration, and nothing ends because a need finished
Status: **done, DRY at 3/3.** 3 sweeps (**1 BLOCKER + 3 MAJOR + 7 MINOR at plan pass and sweeps**)
  plus 1 verification that did not convert. Save **v12**, summary **3**.
Milestone: M2.5
Owner pair: ai-engineer / ai-critic
Statement: Departure stops reading need state and reads `arrivedTick + stayDurationTicks`.
  `NeedState` is unchanged — needs are still countdowns.
Exit criteria: *(as amended at PLAN — four of the original five were vacuous or wrong)*
  - `pnpm exec vitest run stay` — **not `stock`**; nothing stock-shaped ships here, and **no file
    matched `stock`, so the original criterion passed green against ZERO tests.** One test asserts
    the file count.
  - **NO DEPARTURE READS NEED STATE TO DECIDE THE STAY IS OVER** — source scan over the branch.
  - **FOUR ARMS, computed**: well-provisioned → `checkedOut > 0`, `gaveUp` **0** · starved of rooms
    → `checkedOut` **0**, `gaveUp > 0` · contended → both · **rooms and no amenities → `gaveUp` 0**.
    That last arm exists to record that **ADR-0017 4(b) is NOT implemented here.**
  - **`stayDurationTicks = 1440` derived and EXECUTED** — spans exactly one settlement boundary,
    counted by stepping a world rather than asserted against `TICKS_PER_DAY`.
  - **`room-types.json` and `economy.json` byte-identical**, asserted from the shipped bytes.
  - Save **v12**, v1 fixture zero-line diff walking 1→12, `SAVE_V1_CONTENT_FINGERPRINT` unmoved.
    **Summary 3** — the reason strings are what a consumer matches on, so the rename bumps it.
  - the Era-A reservation-leak coverage **re-provided by a named test** (retirement conditional).
Out of scope: the stock model, `NeedState`, optional lodging, ADR-0017 4(b), per-need numbers.
Critique rounds used: 3/3 — DRY.

  **THE GOAL'S DEFINING DEFECT CLASS, FOUR TIMES IN ONE GOAL: THE PROSE CLAIMED MORE THAN THE
  PREDICATE.** `countStuckGuests`'s new paragraph named as its motivating mutation the one case
  its predicate could not see · an exemption "checked rather than asserted" whose two reads were
  satisfied by **a block comment and a `node:fs` import** · a tautology (`Object.keys(...).filter`
  can only be 0 or 1) placed as the closer of the argument it was meant to close · and ADR-0020's
  sentence, **which acquired an overclaim while being repaired for the opposite one.**
  **Every one was written by someone who had just demonstrated they understood the rule.** Each
  was repaired by an assertion rather than by a better sentence, which is the only repair that
  cannot repeat the class.

  **THE ECONOMY MOVED AS A SIDE EFFECT AND NO PRICE WAS TOUCHED.** Margin 10.2:1 → **3.63:1**
  realised (not the ~2.38:1 the orchestrator predicted — the stay clock runs from **arrival**, so
  a queued guest holds its room for less than the full duration and a busy hotel fits up to 1.14
  stays per room-day). **The cheapest green was raising `nightlyRatePence`, which is M4's and is
  §9's stop condition**, so the byte-identical guard is the goal's most important criterion —
  and it now pins construction cost and demolition refund too, both **named levers** in
  `PARKING.md`, proved to bite by mutation including a **sum-preserving reshuffle** the positional
  assertions catch and a multiset pin would wave through.

## G-027b — A need is a stock
Status: **SPLIT into θ-a and θ-b** (ADR-0019), and **θ-b split again into θ-b1 / θ-b2** (ADR-0025,
  seam taken at PLAN on an enumeration finding 25 sites where this block named 4).
  **θ-a: DONE, DRY at 3/3** — committed `7f0be45`, **owes a human WATCH**.
  **θ-b1: DONE** — 3 sweeps (7 + 8 + 6 MAJOR, no BLOCKER) + 2 verifications, closing on an
  unpinned-claim escalation that consumed no round. Save **v14**. Exit criteria verified by the
  orchestrator: ten green / three ruled red · `vitest run dissatisfaction` **4 files / 45** ·
  `vitest run stay` 4/50 · **criterion 9's control unmoved at 192/161/0, revenue 1,632,000p**.
  **θ-b2 (optional lodging): NOT STARTED.**
Milestone: M2.5
Owner pair: ai-engineer / ai-critic
Statement: A need is a level that decays over time and is refilled by being served; it is never
  "done". Activity draws a stock down. Rest refills only in the guest's own room. **Lodging
  becomes structurally optional and tolerance a parameter the model reads.**

  **WHICH TRACK OWNS WHICH CRITERION — written 2026-08-13, MID-θ-a, which is late.** The split was
  made when the tracks were dispatched and **never written down here**, so this block spent the
  whole of θ-a presenting VERIFY with a criterion θ-a's own code deliberately refuses to meet:
  `guests.ts:1572-1576` says in as many words that the resident give-up *"is the next goal's"*,
  and confirmed at `pnpm sim:run --days 30 --seed 7 --rooms 6 --amenities 0` — **`left gaveUp 161`,
  every one a roomless waiter, not one a resident.** Found by `ai-critic`, not by the orchestrator
  who made the split. **Only the digest recorded that θ-b exists.** A goal that is split in
  dispatch and whole in the ledger will be verified against the whole.

Exit criteria: *(**θ-a** = the stock model, its content and its documentation. **θ-b** = departure
  and optional lodging. A criterion tagged θ-b is NOT owed at θ-a's VERIFY.)*
  - `pnpm exec vitest run stock` — **and the files it matches are named in this block before
    BUILD**, because the identical criterion on G-027a passed green against zero tests.
    **The six, named 2026-08-13 by the orchestrator after `ai-critic` found the criterion still
    undischarged**: θ-a's list-asserting test cited this block, and this block named nothing, so
    the test compared **the disk against itself**. The clause that says *before BUILD* — the whole
    content of the repair — was the part left undone.
    ```
    packages/sim/src/needs.stock.test.ts
    packages/sim/src/needs.stock.save.test.ts
    packages/sim/src/utility.stock.pressure.test.ts
    tools/headless/src/stock.content.test.ts
    tools/headless/src/stock.idle.test.ts
    tools/headless/src/stock.census.test.ts
    ```
    **The block↔list tie is by eye; nothing executes it. What executes is list↔disk.** That is now
    stated in `stock.census.test.ts` rather than implied — the honest form of a criterion whose
    other half is a human comparing two lists. A reader of this block is that half.
  - **[θ-a] NO NEED IS TERMINAL**, asserted by a case that serves a need to full then watches it
    decay.
  - **[θ-b] ADR-0017 4(b) — the RESIDENT guest that leaves because it is dissatisfied**, with the
    arm that proves it: the "rooms, no amenities" configuration that reports **zero** resident
    give-ups at θ-a must report **non-zero** here. **θ-a ships the tolerance parameter the rule
    will read and stops there, on purpose.**
  - **[θ-b] LODGING IS OPTIONAL**, and it is **four guards, not a paragraph** (ADR-0018 §6 mispriced
    it): `countStuckGuests` (`guests.ts:587`), `applyCommand` (`tick.ts:422`), `stepGuests`
    (`guests.ts:1426`), `lodgingRoomTypeOf` (`report.ts:427`). **G-015's one-row law becomes
    content-conditioned**: `lodgingNeedOf(content) !== undefined ⇒ revenue === checkedOut`,
    else `revenue === 0`.
  - **[θ-a] EVERY CONTENT NUMBER THE STOCK MODEL READS traces to a stated requirement or lies inside
    an executed box** — there are `2 × needTypes + 2`, **not four**, so a criterion naming four
    can be satisfied while an eighth number nobody counted is invented.
  - **[θ-a] N AND X ARE DERIVED AT THIS GOAL'S PLAN AND STATED BEFORE BUILD** — the idle-run bound and
    the idle-share ceiling that G-028's criterion and `PARKING.md`'s hypothesis both depend on.
    **A need that decays back into wanting every `d` ticks bounds the longest idle run at roughly
    `d`**, so both are derivable from the decay rate this goal ships. **Neither may be chosen.**
    *(Routed here at G-027a REFLECT: they were undischargeable at the point of discharge and not
    yet owed at the point of derivation, so the failure mode was late discovery at G-028.)*
  - **[θ-a] the baseline to beat, measured at G-027a: 61.9% of room-holding guest-frames idle**
    (2,083 of 3,366), longest run **96 consecutive frames = 960 of one guest's 1,440 ticks**.
    **READ THE SLOT-1 WARNING WITH IT** (`JOURNAL.md`, WATCH #8): ADR-0017 changed the model
    underneath this pair, so the *share* is not like-for-like across the arms — reclassifying
    "standing in your room" as resting moves it without moving what a watcher sees. **The
    LONGEST RUN is the term that survives the model change; compare that.**
  - a WATCH entry · **ten green rows and three ruled red** (`check:tickcost`,
    `check:tickcost:proof`, `check:scaling` — ADR-0015 configuration refusals, human-accepted;
    "thirteen rows" was written into this block *after* that rule was established) · CI green on
    three platforms
Out of scope: archetypes (M6); per-night charging (M4); reviews and the outcome table (G-028).
Critique rounds used: 0/3

  **WHY THE TERMINATOR COULD NOT WAIT FOR THIS GOAL.** If a need never completes and departure
  still keys off completion, no guest ever leaves. That is why G-027a went first.

  **AND WHY THIS ONE IS STILL THE HARDER HALF**: `R1` lands here in full — `hysteresis.bound.test.ts`
  computes the abandon margin's bound from `patienceTicks` and `satisfyTicks` as a **countdown**
  model, and **will keep passing while both fields have changed meaning.** Re-derive it here.

## G-028a — The instrument: time unserved is recorded
Status: **done.** 3 sweeps + a plan review (2 BLOCKERs pre-code) + a verification closing on four UNPINNED-CLAIM findings — no round, no split. **The seam was taken at ADR-0033 §3 and this block is late** —
  `balance-critic` found at sweep 1 that no `G-028a` existed anywhere in `GOALS.md`, so **no goal
  was `in-progress`, the sweep was charging a budget nothing recorded, and VERIFY had no criteria
  to run.** That is the failure this ledger priced in its own words one goal ago (G-027b's block):
  *"A goal that is split in dispatch and whole in the ledger will be verified against the whole."*
  **Second instance, same session, same orchestrator.** ADR-0032 §2 struck two goals for existing
  only as names; this one existed only as an ADR.
Milestone: M2.5
Owner pair: economy-engineer / balance-critic · **second critic from a different pair in the final
  round** (§7.1 — G-028 is the last goal in M2.5)
Statement: A per-need counter records **how long a need went wanted and unserved**, and the report
  carries it. **Nothing reads it to decide anything** — `met`, `unmet`, `reviewOf`, review law A and
  the bind-time floor are untouched, because law A **couples** them to the score and they move
  together in G-028b.
Exit criteria:
  - `pnpm exec vitest run unserved` — **3 files, named before BUILD**: `packages/sim/src/
    needs.unserved.test.ts`, `packages/sim/src/needs.unserved.save.test.ts`,
    `tools/headless/src/unserved.report.test.ts`. The filter matched **nothing** at HEAD.
  - **THE WRITE-ONLY FENCE, AND IT IS THE PROPERTY THIS SEAM IS JUDGED ON.** No branch in
    `packages/sim` decides anything from the counter. **The fence is the BEHAVIOURAL control, not a
    token scan**: criterion 9's arm reads **192 / 161 / 0**, revenue **1,632,000p**, review
    distribution unchanged. Proved to bite by mutation — a branch reading the counter turns the
    departure split to `0 / 0 / 357` and revenue to `0`.
  - **THE LODGING-DROPPED FALSIFICATION SHIPS AS AN ARM**, on the mean **and on the worst-served
    need**: the ladder must still fall with lodging removed from both sides. **This is the check
    that would have caught the pooled score the first plan carried** (ADR-0034).
  - **ADR-0029's amendment, executed**: `strandedTicks === publicTicks`, two-sided in **absolute
    guest-ticks** — zero in a hotel provisioned to the derived rule at full occupancy, non-zero in
    a starved one, with the starved arm proving the instrument can fire.
  - **Save v15 → v16**, migration driven by a **synthetic** v15 world carrying guests — mandatory,
    not stylistic: the permanent v1 fixture's guest list is empty.
  - `pnpm verify` — **ten green, three ruled red** · CI green on three platforms.
Out of scope: `reviewOf`, `met`/`unmet`, law A, the bind-time floor — **all four coupled, all four
  G-028b's** · the money-loop cliff (M4) · the merged-walk optimisation (**parked with its
  measurement, which has now fired**).
Critique rounds used: **3/3**

## G-028b — The scorer reads the integral
Status: **done.** 3 sweeps (1 BLOCKER + 12 MAJOR, two critics) + two plan reviews + a verification closing on six UNPINNED-CLAIM findings — no round, no split. **M2.5 IS COMPLETE, 7 of 7.** *(This block was written late — the **THIRD INSTANCE of
  a goal split in dispatch and whole in the ledger** — `balance-critic` found at sweep 3 that no
  `G-028b` block existed, so three sweeps were charged against a block reading `0/3` and **VERIFY
  had only G-028's UN-SPLIT criteria to run**, one of which this build deliberately relocated and
  one of which another goal discharged. G-028a's own block priced this in its own words and called
  itself the second instance. **The orchestrator has now done it three times in one session.**
Milestone: M2.5 — **LAST GOAL IN THE MILESTONE**, so §7.1's second critic from a different pair
  joined the final round (`sim-critic`, world-and-persistence frame — it found the save-layer MAJOR
  the matched pair had not been looking for, which is G-008's precedent repeating).
Owner pair: economy-engineer / balance-critic
Statement: The review reads the integral instead of a departure-instant snapshot.
  `score = min + floor(Σ band_i / N)`, `met` redefined on the same per-need band — **and the four
  coupled things move together, because review law A binds them: 11 of 30 grid cells go RED if
  `reviewOf` moves alone.**
Exit criteria:
  - `pnpm exec vitest run scorer` — **3 files, named before BUILD**: `packages/sim/src/
    review.scorer.test.ts`, `packages/sim/src/needs.scorer.test.ts`, `tools/headless/src/
    scorer.report.test.ts`. Matched nothing at HEAD.
  - **AXIS 1'S REVERSAL IS REPAIRED** — G-019's original claim restored word for word, clearing the
    one-step floor **on the provisioned ladder and not on the un-provisioned one** (ADR-0030 §1
    executed), both readings asserted side by side. *Scoped to the shipped cadence*, ADR-0037
    amendment 2.
  - **THE DISTRIBUTION IS NOT A POINT MASS**, at `--rooms 3 --amenities 1` — the hotel a player
    starts in — with **three bands clearing the derived floor** (one guest per simulated day),
    **stable across every cadence from 114 to 130**, always the same three. *Relocated from a
    configuration where the criterion's own named failure — a band carried by two guests —
    reproduced literally.*
  - **THE CONTROL IS TWO CLAIMS**: departures **192 / 161 / 0** and revenue **1,632,000p** hold;
    the review distribution **moves**, `4:353` → `3:161, 5:192`. Asserted in three places.
  - **Summary schema 3 → 4** (meaning breaks; `met` keeps its name, type and arithmetic law and
    answers a different question). **Save stays v16.**
  - `pnpm verify` — **ten green, three ruled red** · CI green on three platforms · **a human WATCH**,
    owed on `hud.ts`'s "needs met" bar, which changes MEANING rather than value.
Out of scope: the money-loop cliff (M4) · the merged-walk optimisation · the cadence confound (the
  instrument-debt goal) · `apps/game`.
Critique rounds used: **3/3**

## G-028 — Outcomes and reviews are stock-shaped
Status: pending
Milestone: M2.5
Owner pair: ai-engineer / **balance-critic** · second critic `ai-critic` (last in milestone)
Statement: The outcome table and the review function describe a stock rather than a task. "Met"
  and "unmet" are task-shaped and stop meaning anything once needs oscillate; the natural
  replacement is time spent below a threshold.
Exit criteria:
  - `pnpm exec vitest run review` and `pnpm exec vitest run outcome` (all green)
  - **AXIS 1 HAS REVERSED AND REPAIRING IT IS THIS GOAL'S FIRST JOB** (human ruling, 2026-08-13:
    *θ-a records it, G-028 fixes it*). Measured at θ-a, `--days 30 --seed 7`:

    | arm | mean review |
    |---|---|
    | `--rooms 1` | **3.90** |
    | `--rooms 12` | **3.58** |

    G-019 requires 12 rooms to beat 1 by **more than one whole step**; it is now **lower**. The
    mechanism, measured: at one room **326 of 358 guests never get a bed**, wander uncontended
    amenities, and **261 leave 4-star reviews**. **Fewer rooms → more engagement satisfaction →
    better reviews.**
    **THE CONSEQUENCE IS BIGGER THAN THE TEST, AND IT IS WHY THIS IS FIRST.** M2's exit recorded
    *"at M4 a reputation term reading the mean is safe; one reading share-of-top-reviews inverts
    the build loop."* **The stock model has now inverted the MEAN as well** — so at M4 a
    reputation term reading **anything here** rewards not building rooms. **The build loop's
    signal is inverted until this goal repairs it.**
    **θ-a's re-expression is a GOLDEN, not a criterion** — it asserts what the model now does so
    I4 could go green, with the reversal named in the file. **Replacing it with a criterion is
    the deliverable**, and the replacement must be something the build loop can rest on.
  - **CRITERION 2's NAMED INVOCATION NO LONGER SPREADS** (θ-a): `--rooms 6 --arrivals 60` clears
    the one-guest-per-day floor on **two** bands, not the four it did. Other invocations still
    clear three or four, so this is about **the invocation the criterion names**, not the scale.
  - **AXIS 2's CONTROL IS NOW INEXACT** (θ-a): *"room count held fixed ⇒ lodging met identical"*
    reads **192 / 188 / 192** across `amen0/1/5` — the same departure-snapshot effect as
    `needs.report`, and it weakens the argument that axis 2 is not lodging in disguise. **Axis 2
    itself still holds strongly** (1.54 → 3.41 → 4.00), so this is the control, not the claim.
  - **`--amenities 5` IS NOW A PURE POINT MASS, WHICH VIOLATES THIS GOAL'S OWN CRITERION BELOW.**
    All **353** reviews land on score **4**, mean exactly **4.00**, because every guest meets
    exactly three of four needs — 192 with a room meet lodging plus two engagement, 161 without a
    room meet three engagement. **This is the sharpest instance in the file of the thing the
    "not a point mass" criterion forbids**, and it is a *well-provisioned* hotel producing it.
    Found by the agent re-expressing the other three, not by anyone looking for it.
  - **TWO MEASUREMENT NOTES CARRIED SO NOBODY RECONCILES THEM TWICE**: `rooms1` is **391**
    hundredths, not 390 — `meanReviewHundredths` rounds (1399/358 = 3.9078) where this block
    truncated · and `rooms12`'s distribution carries a **`5:1`** omitted from the first list,
    which matters because the top-band share reads **29 basis points off that single guest** and
    **the share peak has moved back to THREE rooms — where G-019 originally found it.**
  - **THE REVIEW RESPONDS TO THE STAY, NOT ONLY TO LODGING** — G-019's two axes survive the
    re-expression, including AXIS 2's three-point amenity ladder, recomputed rather than copied
  - **THE DISTRIBUTION IS NOT A POINT MASS**: a stated minimum share per named score, which is
    the form G-019 had to be rewritten into after its original was discharged by two guests
  - **THE IDLE GUEST IS MEASURED AGAINST G-027a's OWN RECORDING — TWO NUMBERS, BOTH DERIVED
    BEFORE BUILD.** Carried here from `PARKING.md` rather than left to be rediscovered at WATCH.
    G-027a landed ADR-0017 §4 without §1/§2, so **2,083 of 3,366 room-holding guest-frames —
    61.9% — have no pending need at all**, and **the longest idle RUN is 96 consecutive frames**
    (guest 1, ticks 490–1441 = 960 of its 1,440, byte-identical throughout). A guest finishes
    its amenities and becomes furniture for the rest of its stay. **This is the larger of the
    two limits G-027a ships and it is what a watcher sees first.**

    Re-record `--days 4 --seed 7 --rooms 6 --amenities 2 --arrivals 60 --record-every 10` and
    recompute both the same way. **REFUTED WHEN the longest idle run exceeds N frames, OR the
    idle share is at or above X.**

    **N AND X ARE AN OBLIGATION ON THE PLAN THAT SHIPS THE STOCK MODEL (G-027b), DERIVED FROM
    THE DECAY RATE IT ACTUALLY SHIPS AND STATED BEFORE BUILD.** They are deliberately not
    chosen here: this criterion first read *"if it does not fall substantially"*, which is an
    adjective in a pass/fail slot (`CLAUDE.md`: exit criteria are commands, not adjectives) and
    could not fail where it matters — a model re-opening one need per stay moves 61.9% to about
    55% and somebody calls that substantial. **THE LONGEST RUN IS THE SHARPER AND MORE
    PERCEPTUAL OF THE TWO**: a share can fall while every guest still freezes for hundreds of
    ticks mid-stay, and a watcher sees the freeze rather than the average. **This criterion is
    not dischargeable until N and X exist.**
  - summary schema bump if the shape changes, with the migration ADR-0006 requires
  - all §2 gates green, THIRTEEN rows (G-030 added `check:ladder`), and CI green on three platforms
Out of scope: reputation and demand reading the review (M4).
Critique rounds used: 0/3

---

# M3 — Circulation, resumed

## G-032a — The campaigns, and the defect the red rows were hiding
Status: **done.** 3 sweeps (1 BLOCKER + 16 MAJOR) + a verification closing on UNPINNED-CLAIM
  findings only — no round, no split. **`pnpm verify` returns THIRTEEN GREEN**, first time this
  session. Commit `16ef890`.
Milestone: M3 (gate goal)
Owner pair: sim-engineer / sim-critic
Statement: Both measurement campaigns re-taken at the shipped workload, the cadence census
  published and runnable, and the three ruled-red rows returned to green — **with what one of them
  was hiding recorded rather than repaired quietly.**
Exit criteria — all met and re-run by the orchestrator:
  - `pnpm verify` **THIRTEEN GREEN**, stated as a count · suite **121 files / 2,124 tests**.
  - **Bounds DERIVED, never moved**: `BOUND = trunc(sqrt(1.0355 × 2.07), 4)`, all four scaling
    bounds exactly `trunc(quiet median × 1.5, 4dp)` — checked independently by the critic.
  - **The census published IN THE TREE with its command**: `+1` → 13/50/2 · `−1` → 14/53/5 ·
    union **14 / 58 / 6**, five of them **inequalities that reverse one arrival tick away**.
  - The control run standing in for a WATCH: **192 / 161 / 0**, revenue **1,632,000p**,
    distribution **`3:161, 5:192`** — byte-identical.
  - **`check:stamp`'s body predicate** — shipped in `55ca957` under the human's sign-off message
    rather than under this goal (ADR-0041), swept at round 3.
Out of scope: the merge (**G-032b**) · I3's unquoted-key hole (**G-032c**) · the needs-history
  interval (deferred — not a gate, buys no row).
Critique rounds used: **3/3**

  **AND THE BLOCK ITSELF WAS THE FIFTH INSTANCE.** G-032a was written as a bullet INSIDE G-032's
  block rather than as a block of its own, so **`check:stamp` refused to name it done because it
  could not see a goal there at all.** The four earlier instances were seams taken and not
  recorded; this one was recorded and **not in a shape the ledger's own gate reads.** The gate
  caught it, which is the argument for the gate.

## G-032 — The instrument debts M2.5 left, before circulation touches anything
Status: **SPLIT at PLAN into G-032a / G-032b / G-032c** (ADR-0039 §5, seam offered by the builder
  with a scored prediction and taken). **THIS BLOCK WAS NOT SPLIT WHEN THE SEAM WAS TAKEN — FOURTH
  INSTANCE IN ONE SESSION**, found by `sim-critic` at G-032a sweep 1, and the third one is recorded
  two blocks above in the words *"the orchestrator has now done it three times in one session."*
  **This block was written specifically because of the first three, and then a seam was taken
  against it without updating it.** The failure is not forgetting the rule; it is that **taking a
  seam and recording a seam are two acts and only the first has a natural moment.**

  **G-032a — the campaigns.** In: the cadence census and its shipped test · Campaign A
  (`check:tickcost`) · Campaign B (`check:scaling`, **all four axes, both rotations**) · the
  `stayDurationTicks` fingerprint term and the cadence cross-check · the `TARGET_CONCURRENT_*`
  re-freeze · the reserved-hue measurement · `check:stamp`'s body predicate.
  **Out: everything in G-032b and G-032c below, and the needs-history interval — DEFERRED**, since
  it is not a gate, is not in `pnpm verify`, and buys no row.
  **Exit criteria**: `pnpm verify` **THIRTEEN GREEN, stated as a count** *(met — verified by the
  orchestrator)* · both campaigns re-taken at the shipped workload with **bounds DERIVED from the
  new readings, never moved by hand** *(met: `BOUND = trunc(sqrt(1.0355 × 2.07), 4) = 1.4640`, and
  all four scaling bounds exactly `trunc(quiet median × 1.5, 4dp)` — checked by the critic)* ·
  **the census count PUBLISHED IN THE TREE with its command and its pre-registered permitted set**
  *(the RUNNER landed at sweep 1 — `tools/gates/cadence-census.mjs` and `cadence.census.test.ts`.
  **The COUNT is NOT MET at sweep 2**: the published figures were taken on a tree that did not yet
  contain the file publishing them, so the census's own anchor guard — which necessarily reddens
  while the census is running, because the census has replaced the line it guards — is missing from
  every arm. **The same defect sweep 1 caught, inside the repair for it.**)* · the control run
  standing in for a WATCH *(met, byte-identical)*.
  **NOTE — `check:stamp`'s body predicate is IN SCOPE and shipped in commit `55ca957`**, under the
  human's sign-off message rather than under this goal (ADR-0041). Its critics were never shown it.
  Status: **DONE.** 3 sweeps + a verification closing on UNPINNED-CLAIM findings only. **Thirteen green.**

  **G-032b — the merge.** The `packages/sim` hot-path change removing G-028a's second walk.
  **Must follow G-032a**, because it needs Campaign A alive to be the instrument that measures it.
  **Carries ADR-0015's pre-registered escalation**: if the merge does not remove the 1.135×–1.161×
  drift, the empirical claim that rule rests on has been falsified by this project's own output,
  and that is an `ESCALATIONS.md` entry rather than a wider bound.

  **G-032c — I3's unquoted-key hole.** Changes what an invariant means, so it gets a sweep that is
  not competing with campaign arithmetic. The repair is **additive** — keeping the shape rule over
  string literals and adding a declared-id rule over identifiers and unquoted keys — because keying
  to declared ids alone would NARROW the invariant.

*(Original G-032 statement and rationale follow.)*
Status: **superseded by the split above.** M2.5's exit sign-off is owed by the human and does not block this goal:
  it repairs instruments rather than adding behaviour, and **every M3 goal needs a green three-OS CI
  run that three red rows currently prevent being clean.**
Milestone: M3 (gate goal, the same shape as G-022)
Owner pair: sim-engineer / sim-critic
Statement: `pnpm verify` returns to **thirteen green**, and the four measurement debts M2.5
  accumulated are discharged **with campaigns, not with adjustments**.
Exit criteria:
  - **THE THREE RULED-RED ROWS GO GREEN OR THEIR REFUSAL IS RE-DERIVED.** `check:tickcost`,
    `check:tickcost:proof` and `check:scaling` have declined to compare since the workload moved to
    `arrivalEveryTicks: 96` — **three rows, two causes, human-accepted, and red for this entire
    session.** ADR-0015's rule is POOL within a configuration, REPLACE on a configuration change:
    **the campaigns are re-taken at the shipped workload, not re-pointed at the old one.**
  - **THE CADENCE CONFOUND IS THE LARGEST ITEM AND IT COMES FIRST**, because every other campaign
    here is read on the workload it questions. **Six rooms is this project's default balance
    workload**, and 422 runs found the amenity axis falls at two cadences with adjacent-cadence
    jumps larger than the one anybody had measured. **It does not question one instrument — it
    questions the workload every instrument is read on.** Falsification test is in `PARKING.md`:
    re-take any relied-on reading at ±1 arrival tick.
  - **THE TICK-COST REGRESSION IS PRICED**, not assumed: three independent paired campaigns put
    G-028a's second walk at **1.135× / 1.158× / 1.161×**, distributions non-overlapping in every
    one. **The merge into `advanceNeeds` is the candidate; the identity it rests on is already
    swept.** And note the irony recorded at G-028a: **the gate that would have caught it is one of
    the three that are red.**
  - **`PARKING.md`'s needs-history interval** (two arms no longer poolable) — the third campaign,
    sized by `ai-critic` at G-022.
  - **I3's unquoted-key hole** and the **0.05° reserved-hue margin**, both owed since G-030.
  - `pnpm verify` — **thirteen green, and the count stated as a count** · CI green on three
    platforms · **a WATCH is NOT owed**: this goal changes no guest, room or economy behaviour, and
    that claim gets a control run rather than a sentence.
Out of scope: the money-loop cliff (M4) · the visitor ceiling (M6) · the scoring trade (a human
  call, costed at ADR-0037 §4) · `apps/game`.
Critique rounds used: 0/3

  **WHY IT GOES BEFORE G-023b.** G-022's precedent: M3's prerequisites were instrument debts, and
  taking them first found **two real cross-platform defects no work on this machine could have
  surfaced.** M2.5 has left four debts and a red `verify` row that has been red long enough to stop
  being read — **which is §9's own stop condition about a known-red gate teaching people to skim.**

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
