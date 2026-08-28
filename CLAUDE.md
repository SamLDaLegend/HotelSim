# CLAUDE.md — HotelSim

**`HOTELSIM.md` is the source of truth. Read it.** This file is the short form that
survives context compaction; where the two disagree, `HOTELSIM.md` wins.

## What this is

A casual, cartoon-styled hotel building and management sim. **Isometric floorplan**
(Theme Hospital / RollerCoaster Tycoon), multi-floor, **one floor rendered at a time**,
cityscape behind. **Rooms are designed by the player**: draw a footprint, place items,
and the room is scored on what it contains.

> **RULED 2026-08-16 by the human (ADR-0046).** This paragraph read *"Side-on
> cross-section view (SimTower / Project Highrise), not isometric"* from before the first
> line of code until goal 33 — **and it was still reading that here on 2026-08-23**, seven
> days and forty goals after the ruling, in the one document whose stated purpose is
> surviving compaction. `HOTELSIM.md` §1 was corrected on the day; this short form was not.
> **A ruling is not landed until every copy of the sentence it reverses is dead.**

Three nested feedback loops. Every design and code decision traces to one of them:

**THESE ARE SPECIFICATIONS, NOT DESCRIPTIONS** (RULED 2026-08-24, human — ADR-0081), so
**every term carries a mark and a term without one is a claim nobody has checked**.
`HOTELSIM.md` §1.1 carries the evidence for each; these are the marks alone.

- **Guest loop** — guest arrives [E], forms needs [E], gets them met or doesn't [E],
  pays [E], reviews [E]. *All five exist; it is the only loop that runs on all of its terms.*
  **`reviews` RE-MARKED 2026-08-28 (G-059) WITHOUT THE MARK MOVING, and it is re-marked HERE because
  the rule is BOTH FILES IN THE SAME COMMIT and the banner above records what it cost the last time
  only one moved.** The term has read EXISTS since G-019; what was false is the qualification
  `HOTELSIM.md` §1.1 carried beside it — *"it carries almost no information, measured one bit above
  the bottleneck; a tuning finding owned by G-050/G-051"*. **G-050a/b were BLOCKED ON it, and what
  landed it was the human's ruling on E-014** (ADR-0104): *the review is a measurement of the WHOLE
  STAY, INCLUDING FACILITIES*. `reviewOf` folds the hotel's star rating in as one more unweighted
  band and `isCutShort` floors every stay that did not run its course. Measured, `--days 30 --seed 42
  --rooms 12 --demand`: eleven of the fifteen facilities×amenities cells were byte-identical `5:all`
  and the facilities column now reads `4:232` against `5:464`, with the mean spanning 1.00 to 5.00.
  **The honest half: the shipped arms occupy {1, 4, 5} and never 2 or 3** — a middle score needs a
  stay that ran its course and was badly served, and the mood ceiling ejects that guest first. That
  is content, it is parked with its falsification test, and G-019's criterion 2 is asserted FAILING.
- **Money loop** — room revenue [E] against wages [E] and upkeep [E], settled
  nightly [E]. *All four exist since G-052a: `TransactionReason` has TEN members and the tenth
  is `wages`, settled nightly before upkeep, folded over `World.staff` at a rate that is content.
  The mechanism is live and the shipped scenario employs NOBODY — a compulsory payroll breaks
  G-011's criterion B (441 builds against 23, measured — on an arm that EARNS NOTHING; a trading
  hotel absorbs it, 25.56M -> 19.56M over 1,000 days) because the player has no hire and no fire
  until G-052b, which also still owes staff OCCUPYING ROOMS. The rate is one SINGLY-OCCUPIED
  room-night's margin: `nightlyRatePence` is charged per GUEST-night, `nightlyUpkeepPence` per
  ROOM-night, and the bound built on them is conservative rather than tight.*
- **Build loop** — spend cash [E], add capacity [E] and quality [**OWED — G-037a, NO MILESTONE**], raise
  reputation [**OWED — POST-PLAYTEST, NO MILESTONE**], raise demand [E], back to the guest loop [E].
  *(Both read **OWED M4** until 2026-08-28. **ADR-0105 re-scoped M4 to settlement, wages and demand** —
  what it turned out to be — so a mark naming M4 named a milestone that no longer contains it. **A
  destination that is an EVENT survives a re-scope; one that is a milestone does not.** Re-marked in
  `HOTELSIM.md` §1 and §1.1 in the same commit, which is the rule the banner above exists for.)* ***FOUR OF SIX, AND
  THE LOOP CLOSES* (G-051b).** `runDemand` (tick.ts, phase 2 of 6) derives the hotel's STAR
  RATING every demand slot and puts the parties that rating earns into the same doorway a
  `guestArrives` fills; `partiesArrivingAt` (demand.ts) is the arithmetic and it draws NO
  randomness, so the seed still has no economic effect — measured, three seeds, 365 days,
  byte-identical economics. **The chain, three arms one change apart: build three facility
  rooms -> 3 stars becomes 4 -> 240 arrivals become 480 -> 1,972,000p of revenue becomes
  3,944,000p.** The middle arm builds the same rooms with arrivals PINNED and its revenue does
  not move a penny, which is what makes the gain the RATING's. *THE CURVE IS CONTENT
  (`demand.json`) AND IT IS **DERIVED**, not a design statement — the one table in this project
  that is: `partiesPerDaySchema` carries the requirement it comes from.* **THE HARNESS STILL
  CLAMPS BY DEFAULT**: `--arrivals` supplies arrivals and withholds the curve, because every arm
  this project has measured is defined by a fixed stream and a clamped run is byte-identical to
  the run it always was; `--demand` is the game's mode and `apps/game` takes it unconditionally.
  *Still owed, and neither is a hole in the loop: `quality` (G-037a) and `raise reputation` —
  ADR-0082 rules the star rating a SECOND system beside reputation, not the reputation term, and
  reputation judged on guest satisfaction is unbuilt. `HOTELSIM.md` §1.1 carries the evidence.*

**This copy is marked because this file is the one that survives compaction** — and the
banner above it records what it cost the last time a ruling landed in `HOTELSIM.md` and
not here. **A goal that lands a term re-marks it in both files, in the same commit.**

If a feature does not feed one of these three, it goes in `PARKING.md`.

## The six invariants — CI gates, not guidance

Run all of them with **`pnpm verify`**. No goal is done while any is red.

| | Invariant | Gate |
|---|---|---|
| **I1** | `packages/sim` imports nothing from the render layer, no DOM, no engine API, no filesystem, no network. Zero runtime dependencies. | `pnpm check:purity` |
| **I2** | Same seed + same command log ⇒ byte-identical state hash after 100,000 ticks, every run, every platform. No `Math.random`, no `Date.now`, no Set/Map iteration-order dependence in `packages/sim`. All randomness from the injected seeded PRNG. | `pnpm test:determinism` |
| **I3** | No room type, item, staff role or guest archetype defined in code. All of it is JSON in `packages/content`, validated by a schema. | `pnpm check:content` |
| **I4** | Ledger is append-only. Cash balance is derived by folding transactions, never stored and mutated. | `pnpm test` |
| **I5** | `pnpm sim:run --days 365 --seed 42` completes in Node with no window and no renderer, **inside a DERIVED budget** — 389,333ms, from a 60-room hotel at top speed sustaining real time (`HOTELSIM.md` §2.1.2). The word doing the work is **headless**; the time bound is a sanity ceiling, **not** a regression tripwire — that is G-020. | `pnpm sim:bench` |
| **I6** | Serialise → deserialise → re-hash is identical. Saves carry a schema version and a migration path. | `pnpm test:save` |

**I2 is load-bearing beyond determinism.** It is the tripwire for the whole design: if
anyone leaks render state or wall-clock time into the sim, it breaks immediately. Do
not weaken it, do not add tolerance, do not skip it "just for this goal".

**Never edit a gate to make a build pass.** Changing an invariant is a human decision,
always. If an invariant cannot be satisfied, that is an `ESCALATIONS.md` entry.

## Layout

```
packages/sim       headless simulation. Zero runtime deps. No DOM types in tsconfig.
packages/content   JSON definitions + Zod schemas.
apps/game          Pixi.js render layer and UI. M5 — do not open before M0 sign-off.
tools/headless     CLI runner, determinism harness.
tools/gates        the six invariant gates. Plain Node ESM, no build step.
```

TypeScript strict, `noUncheckedIndexedAccess` on. pnpm workspaces. Vitest. The sim
targets high coverage; the render layer is playtested, not unit tested.

The stack is fixed. Do not relitigate it. If the human later wants Godot, only
`apps/game` is thrown away — that is the point of I1.

## Settled decisions (see `DECISIONS.md`)

- Content is **injected**, not imported: `packages/sim` may `import type` from
  `@hotelsim/content` but never value-imports it (ADR-0001).
- Money is **integer minor units** (pennies). Never a float (ADR-0002).
- A **snake_case string literal is a content ID**, and must not appear in
  `packages/sim` or `apps/game` (ADR-0003).
- **A NAME IS NOT EVIDENCE** (ADR-0086). **A gate's name is a CLAIM, and a claim names the
  symbol that makes it true.** Every scanner carries a **one-line predicate statement** — what it
  checks, stated narrowly enough that a reader can tell **what it does NOT check**. `check:status`
  is *"asserts no goal referenced by a commit reads `pending`"*, which visibly says nothing about
  `Milestone`. *Third instance of one move in three days: perceptual criteria (ADR-0013), the
  charter's loop terms (ADR-0081), gate names (this one). **Read as a description a name claims
  the class; read as a specification it claims one clause.***
- **An ADR is a DECISION, not a live reading of the tree** (ADR-0084). A correctly-quoted ADR
  is evidence of what was RULED, never of what is TRUE NOW. **A new ADR that cites tree state
  names the symbol, so the citation can be re-run; an existing one is re-verified AT THE POINT
  OF CITATION, not proactively.** This generalises ADR-0007's fifth amendment — *a comment
  offered as evidence may not carry a figure no test pins* — from comments to the file where
  decisions live. *Found because every false clause in a week of briefs was a correct quotation:
  ADR-0053 said "exactly one reader, and it is a test" and the grep now returns three.*
- **A perceptual criterion needs a perceptual check, or the word comes out** (ADR-0013,
  human). See "Watching the game" below — this one changed the loop.
- **A gate threshold must be derivable from a stated requirement.** A number nobody can
  source is not a gate, it is a superstition with CI access (ADR-0013 §4, §2.1).
- The first playable build ships **placeholder art** — flat coloured shapes, clear
  silhouettes. Real art is a separate track. M5 does not wait on it (ADR-0014, human).

## How work happens

`GOALS.md` is the ledger. **Exactly one goal is `in-progress` at a time.** Exit
criteria are commands, not adjectives.

The loop (§5): SELECT → PLAN → BUILD → CRITIQUE → RESPOND → VERIFY → **WATCH** → COMMIT
→ REFLECT.

- Feature code is written by the `.claude/agents/` builder agents, matched to a critic.
  **Critics have no write tools** — that is the enforcement mechanism, not decoration.
- At VERIFY, the orchestrator **runs every exit command and every gate itself**. An
  agent's report that tests pass is not evidence.
- Max **3 critique rounds** per goal. If a BLOCKER survives round 3, stop and escalate.
- Builder and critic disagreeing twice on one point is a design question: the
  orchestrator adjudicates once into `DECISIONS.md` and both treat it as settled.

## Stop conditions (§9) — halt and escalate

- The orchestrator is writing feature code instead of orchestrating.
- A critic has produced a MINOR-only report three goals running (its prompt is too weak).
- An invariant gate was modified to make a test pass.
- Coverage is being added to satisfy a number rather than to pin behaviour.
- `PARKING.md` has stopped growing (scope is leaking into goals).
- Work has started on the render layer before M0 is signed off.
- A goal has exceeded its round budget twice under different framings — the goal is
  wrong, not the implementation.

## Measuring performance — read before quoting any number

**G-016 burned roughly three goals' budget on numbers that were wrong**, because the
machine changed speed mid-session and every absolute taken against a baseline from
another moment was inflated. The same build measured 3,087ms early and 1,740ms later.
Two claims had to be publicly retracted, one of them after the orchestrator had already
ruled on it, and the retraction itself then had to be swept a second time because it
stopped at the test files.

**The rule, and it is cheap:**

1. **Measure paired and interleaved, in one sitting.** Arms alternated, warm-up
   discarded, medians of ≥5. Never arm A now and arm B an hour later.
2. **The ratio is the finding. The absolute is not.** Three independent measurements of
   G-012 against HEAD — 2.41×, 2.37×, 2.32× — agreed within noise across hours in which
   absolutes moved by nearly 2×.
3. **Never compare an absolute against a figure recorded in another session**, including
   ones in `GOALS.md`, `PARKING.md` or a code comment. If you need to, re-measure both.
4. **A number carries FIVE slots, and a citation missing one is unpinned:**
   **what it measured · over what workload · at what sample count · aggregated how ·
   under what REGIME.**

   *Grew twice in one day, both human rulings, both after the rule failed on the slot it
   did not name.* It began as *"cite the workload with the number"* — and **workload is
   one referent among several**, so it pointed at the slot already understood. **Three
   referent errors in G-020a alone, across two people, one enforcing the rule outward and
   one who wrote it**: ±10% read as a single-reading absolute when it was a ratio spread;
   2.41/2.37/2.32× cited as a commit pair when it measured a state never committed; and
   that ±2% compared against a six-sample invocation when it came from three campaigns
   resolving a 2.3× effect. **All three were about what the number is a measurement OF.**

   *Then* **regime** caused three more in G-020b: `needs.scaling`'s "eaten margin" was
   contention and was withdrawn; a `--null` campaign claimed all four slots and gave no
   load condition; and a claim about `verify.mjs` running gates sequentially stood in for
   a claim about the machine, on a CI matrix nobody has measured. **In every case the
   number was wrong because nobody said which machine state produced it.**

   **Regime is quiet vs loaded, AND the machine** — a 12-core developer box and a shared
   2-vCPU runner are different regimes, and a ratio taken on one does not transfer.

5. **A number you cannot re-measure paired is withdrawn, not restated.** If the change
   still stands on an argument that needs no stopwatch, say that instead.

## How many critique rounds

**A goal closes only on DRY** (§7.1). Every critic ends with exactly one of:

- **DRY** — diff swept, no findings at any severity.
- **OPEN** — diff swept, findings outstanding.
- **UNSWEPT** — the critic has not exhausted the diff.

**Sweeps are budgeted (three). Verifications are not.** A verification pass asks whether a
specific fix discharges a specific finding and looks at the fix's own diff. **UNSWEPT at
round 3 escalates and the goal gets split.** The guard against an unbounded verify loop: a
verification that produces a **new** finding converts to a sweep and consumes budget.

Why three states and not two: thirteen goals ran mostly at 1/3 with zero BLOCKERs, and the
one goal that ran to 3/3 produced the best critique in the project. Then G-013 showed that
*"there are findings left"* and *"there is diff left"* are also different claims.

A second critic from a **different pair** is required in the final round of the **last
goal in a milestone** (G-008's precedent: the second pass found the 107M-penny sweep).
Do not skip the first round — the two times it was nearly skipped, at G-010 and G-016, it
found MAJORs that were defects in the *evidence* rather than the code.

## Sizing a goal (§5.5, §5.6)

- **A builder that offers a seam at PLAN gets it taken, or gets a written prediction of
  what declining it will cost — scored at REFLECT.** An unscored prediction is prose.
- **The matched critic sees the plan before BUILD** and may object on scope alone: too
  large to sweep in the budget, and here is the seam. Cheapest moment to split, and the
  agent that pays for a fat goal finally gets a voice before the code exists.
- G-013 is the case: the builder named the seam, the orchestrator declined in one line,
  and it cost nine instances of one defect class and three sweeps that reached exhaustion
  only at the last round the budget allowed.
- **Reading a defect count**: a 3/3 goal is a near miss, not comfort. And detection
  sensitivity rises over time, so a raw count across eras is not like-for-like — G-013's
  first three instances were self-caught by discipline that did not exist at G-001. The
  ratio survives; the absolutes do not.

## Watching the game (§5 WATCH, ADR-0013 — human ruling)

Nobody has seen this game run. Until 2026-08-08 the charter asked `ai-critic` to hunt
behaviour that "reads as stupid to a watching player" — for thirteen goals, with no
watching player and no way to become one. That is the ADR-0007 defect class sitting
inside the prompt meant to hunt it.

- **Any goal that changes guest, room or economy behaviour records a run and watches it**,
  then appends to `JOURNAL.md` what looked wrong, or that nothing did. No observation
  means a step was skipped.
- The instrument is **G-017's replay viewer** in `tools/viewer`. It is a **replay** viewer
  that reads recorded frames through the existing save serialiser, so "it cannot act" is
  structural. `apps/game` stays shut; **this is not the renderer**.
- **It is disposable.** Coloured rectangles, labels, a scrubber, a speed control. If it
  acquires features or defenders, delete it rather than defend it (§9).
- A "reads as stupid" finding now **requires a frame reference** — recording, tick number,
  what it shows. No frame, no finding.

## Mutation testing — the recipe, because four agents reached for the wrong tool

Mutation is a recurring technique here: proof-of-bite, deliberate gate-breaking at bootstrap,
criterion falsification. **It requires a revert mechanism, and nobody was ever told which
one**, so four independent agents reached for `git checkout --` and it silently discarded
unreviewed work each time.

**The procedure:**

```bash
git stash push -u -m "mutation probe"   # -u so untracked work is included
# mutate, run the check, assert it goes RED
git stash pop                            # restore
# run again, assert GREEN
```

**`git stash` is recoverable. `git checkout --` is not** — and that is the only property that
matters when the thing being discarded is an agent's unreviewed work. Prefer copying to a
scratch directory over mutating the repo at all; where that is impossible, capture a
`sha256` first and compare after, which is how three of the four incidents were caught.

**This is not a prohibition, it is a recipe.** When several careful actors independently make
the same error, the rule is missing rather than being broken.

## Regex in a template literal — three goals, three authors, one missing rule

**`` `(?<![\w$])${key}` `` does not do what it looks like.** In a template literal the backslash
is consumed, so `\w` compiles to a bare `w` and the pattern becomes `(?<![w$])` — a character
class of two letters instead of a word boundary. **Write `\\w`, or build the pattern from a
normal string.**

Three instances, in three goals, by three careful authors — the third **four lines below a
correct spelling in the same file**, written by someone who had just documented catching the
other two. Every one changed no answer on the day it shipped and every one sat inside a
*scanner*: the predicate a purity check, a boundary fence or a partition guard rests on. That is
the worst place for a silent near-miss, because the thing it would break is the thing that would
otherwise have caught it.

**Check it against the bytes on disk, not against a retyped copy** — read the shipped line back
out of the file and compile it. Retyping is how this survived three goals: the eye supplies the
backslash the file does not have.

*(Same route as the mutation recipe above: when several careful actors independently make one
error, the rule is missing rather than being broken.)*

## Parking (§4)

**Park a hypothesis with its falsification test attached** (human ruling, 2026-08-09). If
the parked item is a *belief* about how the sim behaves rather than a feature, write down
what would confirm or refute it — the invocation, the reading, the comparison. One extra
sentence over parking a note.

It is what let three goals chain without any of them planning it: G-013 parked "the
engagement vector sums to the lodging budget" **with its experiment**, G-017's recording
turned out to *be* that experiment and came back positive, and G-014a then hit the
knife-edge the hypothesis describes. **A parked note is a reminder; a parked hypothesis
with its test is a result waiting for a goal that happens to run it.**

## The other ledgers

`DECISIONS.md` settled calls · `JOURNAL.md` what happened, per goal ·
`PARKING.md` deferred, deliberately · `ESCALATIONS.md` open human calls, loop stopped

**Read the digest first.** Each of the four carries a rolling digest at the top under a
fixed heading — schema versions, gate readings, obligations owed by future goals, open
contradictions. Fifteen lines, **rewritten every REFLECT, never appended to** (§4.1). The
append-only history lives beneath it. The four ledgers passed 2,800 lines, and an ADR
amendment has already spent a day filed under the wrong ADR.
