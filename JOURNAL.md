# JOURNAL

## DIGEST — rewritten every REFLECT, never appended to (`HOTELSIM.md` §4.1)

*As of 2026-08-12, G-023a done. M2.5: 1 of 4 goals (G-030 awaiting WATCH). Unreliable: 0 gates, 0 defects.*

- **State**: save **v10** · summary **v2** · I2 `ece843af1efea843` · **unreliable 0 gates /
  0 defects, the first zero since G-016** · `pnpm verify` is **twelve** rows, six of them `—`
  and not invariants · **CI green on three platforms** (G-022, run #7).
- **I2's "byte-identical on every platform" IS EXECUTED AND HOLDS** — one hash
  `fd9dbb263f6a7e7a` across linux, win32 and darwin, two CPU architectures. **That claim sat
  in this file from bootstrap for nineteen goals having inspected nothing**, attested at a
  human sign-off: ADR-0007's class at the infrastructure layer.
- **WATCH #1–#4 exist.** The viewer found what 1,109 tests could not, caught a defect in
  G-014a's first build, and the human found G-019's criterion undetectable **before PLAN**.
- **A WATCH ENTRY IS A CRITERION AND CAN BE VACUOUS** (G-014b): its exhibit was wrong **twice
  about the same row**, both times found by *walking the recording*, not reading the table.
- **Park a hypothesis WITH its experiment**: G-013 parked, G-017 ran it unplanned, G-014a
  hit the knife-edge it described. Three goals chained; none planned the next.
- **The defect this repo produces**: checks and claims that inspect nothing. Newest forms —
  a criterion with **no subject**, **goldens that redden because the feature works**, **a
  two-halved rule with one half executed and the other admired**, and **exit criteria that
  certify rather than miss** (ADR-0007's sixth amendment: three of four, in one list).
- **IT REACHES THE TESTS WRITTEN TO PROVE SOMETHING** — four of G-022's defects were there:
  a regression test that could only fail on the platform that had already failed, a parity
  assertion comparing 1 against 1, and **two** newline guards each vacuous by an upstream
  the guard came from. **`check-purity.mjs` (I1) and `determinism.mjs` (I2) had never been
  executed by any committed test**; every scanner gate now owes a proof-of-bite.
- **Prose may describe, it may not measure**; a number you cannot re-measure is **withdrawn,
  not restated** — applied to timings, counts, test totals and test *outcomes*.
- **When several careful actors make the same error, the rule is missing** — four times.

---

Two or three lines per goal, appended at REFLECT (`HOTELSIM.md` §5): what changed,
what the critic caught, what got parked, and whether any invariant nearly broke.

This is the memory that survives context compaction. Write it for someone who was not
there.

Newest last.

---

## Bootstrap through M2 — archived

**G-001 to G-021's entries live in [`JOURNAL-ARCHIVE.md`](JOURNAL-ARCHIVE.md)**, moved
2026-08-12, unedited. The digest above carries the lessons that still bind.

---

## G-022 — The instrument debts M2 left — REFLECT

**DONE, DRY at 2/3. Both M3 prerequisites discharged. CI green on three platforms, run #7
(`c718d52`): https://github.com/SamLDaLegend/HotelSim/actions/runs/31584592314**

**THE HEADLINE IS THE ONE NUMBER: 0 GATES / 0 DEFECTS, THE FIRST ZERO SINCE G-016.** Defect A
left the parallel runner at G-020c. Defect B is repaired by **vitest 4.1.10**, whose
`createRuntimeRpc` passes `timeout: -1` where 3.2.7 passed nothing and birpc armed a 60-second
timer — **the timer that fired is the timer they removed.** A named library constant, an
alternated 5/5-against-0/5 campaign, an n=10 confirmation, and an unhandled-rejection control
proving both versions still fail a genuine error, so it is a repair rather than a suppression.
**Every reading taken under the loaded arm; a quiet green is what this goal's own criterion
forbids resting on, and it is what nearly let two defects ship.**

**I2's "byte-identical on every platform" IS TESTED FOR THE FIRST TIME AND HOLDS.**
`fd9dbb263f6a7e7a` on linux, win32, darwin and this box — **two CPU architectures, one hash.**
ADR-0002's integer-pence decision was made in G-001 precisely so float accumulation could not
break this, and it has now been paid off in evidence rather than argument.

**AND THE CLAIM THAT HAD SAT IN THIS FILE SINCE BOOTSTRAP WAS FALSE FOR NINETEEN GOALS.** The
three-OS matrix was recorded as wired and **had never executed** — ADR-0007's class at the
infrastructure layer, underneath everything the project has been rigorous about, and attested
at a human sign-off. It took six runs to go green and found **two real cross-platform defects
no work on this machine could have surfaced**: `/var` is a symlink on macOS, so the instruments
compared a canonicalised module path against an uncanonicalised temp root; and the GitHub
Windows runner's `TEMP` is an **8.3 short path**, which broke the regression test written for
the first.

**FOUR OF THE DEFECTS THIS GOAL FOUND WERE IN TESTS WRITTEN TO PROVE SOMETHING.** A regression
test that could only fail on the platform that had already failed · a parity assertion
comparing 1 against 1, which would have passed against a branch returning 0 for both · a
newline guard **vacuous by the split it came from** · and a **second** newline guard vacuous by
a `trimEnd()` upstream — **that last found only by attempting the fix the orchestrator
proposed for the first.** The rule the human ruled at M2 exit — *every scanner gate owes a
proof-of-bite test* — landed immediately on its two most important subjects: **`check-purity.mjs`
(I1) and `determinism.mjs` (I2) had never been executed by any committed test.**

**THE ORCHESTRATOR'S OWN ERRORS, WHICH COST THE MOST TIME IN THIS GOAL.**
1. **The seam.** `sim-engineer` offered exactly one at PLAN — CI against the three local
   repairs — and recommended declining. I agreed. **Events falsified both halves within the
   hour**: CI's diff was three commits, and nothing overlapped; three finished local criteria
   sat behind an open-ended CI criterion for hours. **"CI green on three platforms" is
   open-ended discovery wearing a bounded criterion**, and G-022 reached CRITIQUE only after
   the human asked what was taking so long.
2. **A number attached to the wrong referent, in the project that wrote the rule against it.**
   I read 65,577ms and 65,685ms as a *failure timeout* and built a hypothesis strong enough to
   redirect the investigation. They were the **suite duration**; the failing test took 19ms.
3. **Diagnosing without credentials.** Five commits and five CI runs to learn what one
   authenticated query answered in seconds. The workaround (annotation emitters) was good and
   is now shipped — but I should have asked once and stopped working around it.

**Scored predictions (§5.5).** The builder's ranked hypothesis for the macOS failure —
**B 45% / timing 35% / environmental 20%** — **landed in the branch it had argued against**,
and its own diagnosis of why is the useful part: *it treated "ubuntu green" as evidence about
the platform class when the discriminator was the filesystem.* My own expectation, that the
timing family would be the casualty, was **wrong in mechanism**: no timing bound was involved
anywhere in six runs.

**Owed forward.** `PARKING.md` gains the stamp's CRLF splice hazard — `findStamp` indexes by
`\n` while `replaceStamp` splices by the file's own newline, **live but dormant by where a
newline happens to fall**, in the gate whose job is keeping four ledgers agreeing — and
`hysteresis.report.test.ts`'s load sensitivity, with the wrong mechanism kept beside its
correction because the correction is the useful part.

**M3 IS SEEDED AND READY**: G-023 movement, G-024 stairs as a queued shared resource, G-025
lifts, G-026 travel time in the score with waiting as a satisfaction input — **last in
milestone, two critics** — and an exit block that finally runs the running-product
falsification test `PARKING.md` parked *"after three M3 goals"*.

---

## 2026-08-12 — WATCH #5 (human): the first watch of the GAME, and it failed

**The first WATCH in this project taken on a live renderer rather than a recording**, and the
first design feedback the surface was built to buy (ADR-0018). **It came back negative, before
any critic swept the diff.** That sequence is the whole argument for pulling the renderer
forward: the instrument found its subject on day one.

**The verdict, verbatim**, at `http://localhost:5180`, G-030 pre-critique:

> *"Reads quite difficult I would say. Lots of washout of bars and whilst I can visualise it to
> an extent, it's not easy."*

Localised on request to **all three**: the room blocks, the per-guest need bars, **and the
overall layout** — the cross-section itself does not parse, so floors, the grade line and the
building's extent are hard to pick out.

### The mechanical half, measured rather than guessed

`apps/game/src/view/palette.ts`'s `WHEEL`, twelve hues, relative luminance and WCAG ratios,
computed by the orchestrator:

| | |
|---|---|
| pairs under **1.3:1** luminance contrast | **32 of 66** |
| worst pair | **1.00:1** — `0x50907c` and `0x6f7fd0`, identical luminance, different hue |
| contrast against the background | 3.56–7.84, i.e. **fine** |

**The wheel varies HUE while holding LUMINANCE nearly constant**, so every shape separates from
the ground and none separates from its neighbours. Hue discrimination is weak at cell scale and
weaker for a colour-blind viewer. **The wheel is the defect; the FNV-1a derivation is not** —
its stability property (a room type does not change colour when a designer adds another) is
real and survives the repair.

### A PARKED FALSIFICATION TEST FIRED, AND THIS IS THE SECOND TIME IN ONE SESSION

G-030's own parked item — *"a colour field in content → M6"* — carried the test: *"put the
shipped room types side by side in the running game; if two are not distinguishable by colour
alone at cell scale, the derivation has failed and content needs the field."* **The human ran
it by looking.** Track B did the same thing an hour earlier with `check:tickcost`'s spread,
whose falsification test was also already parked with its trigger. **Twice in one session a
parked hypothesis was re-parked instead of run at the moment its trigger fired.** The parking
discipline is working; the *firing* discipline is not, and that is the lesson of the day.

### AND THE ORCHESTRATOR'S CRITERIA COULD NOT HAVE CAUGHT IT

**All six of G-030's exit criteria pass on an unreadable screen** — `pnpm dev` opens, the ladder
scan, a guest at `guest.at`, I1 green, placeholder art only, gates green. **The goal exists to
make the game watchable and nothing in its criteria tested whether it is.** ADR-0007's sixth
amendment, in the orchestrator's own goal block: *a vacuous check fails to catch a defect; a
vacuous criterion certifies the goal.* The repair pairs a mechanical half with the perceptual
one — **every content-typed thing distinguishable from every other IN GREYSCALE at drawn size,
computed by a test**, with the human's verdict recorded either way. Greyscale is the cheap
mechanical proxy for "reads at cell scale", and ADR-0013 already refused a criterion that is
only "a human says it reads".

### What was NOT in question, and is good

The builder's §4 evidence stands untouched: **frame-rate independence measured**, three drivers
at 30fps, 144fps and 61.7fps each run to tick 1440 → one identical state hash
`3d137625a086e431`; the accumulator's deficit shown to be a **boundary effect** (−1 at 30/144fps,
0 at 60/240fps, unchanged from 10s to 3600s) rather than drift; **guest #13 drawn live as the
asleep-in-the-café case**, holding room 1 upstairs while standing in a basement amenity, body
and occupancy pip both drawn rather than hidden. **The renderer is correct and illegible**,
which are different problems and only one of them is now open.

---

## 2026-08-12 — WATCH #6 (human): legibility PASSES, and one change falsified its own premise

**Verdict, verbatim**: *"Reads much better now. Though I note I can only see one need at a time,
whereas before I could see all needs."*

**Three of the four repairs are discharged by the verdict they were sent back for** — the per-role
luminance ladders, the contrast-chosen outlines and plates, and the layout work (alternating floor
bands, toned sky and earth, a gutter with bold numbers, grade as the heaviest line, and a
silhouette round the built extent, which the failed build did not have at all).

**THE PALETTE REPAIR, VERIFIED INDEPENDENTLY BY THE ORCHESTRATOR** rather than taken on report —
own luminance implementation, real shipped content, real `createPalette` output:

| role | worst pair | under threshold | vs page |
|---|---|---|---|
| room | 1.811 | 0/6 | 3.02 |
| item | 2.452 | 0/3 | 3.02 |
| need | 1.814 | 0/6 | 3.01 |

Against the rejected build: **32 of 66 under 1.3, worst pair 1.000.** And the arithmetic that
makes it a lesson rather than a fix: **no twelve-colour palette could have passed** — N colours
in a contrast band can do no better than `span^(1/(N-1))`, which for twelve is **1.184**, below
the ratio the build already washed out at. **Twelve was the mistake, not the hues.**

### THE REGRESSION, AND THE CONFOUND UNDERNEATH IT — this is the entry's real content

The need vector was reduced to one bar (most urgent unmet need), justified in the builder's own
words: *"four 3px segments above a 13px body is not four readings, it is one smudge"* — and then
decisively, ***"it was not readable from the smudge either."***

**That sentence is a claim about the human's perception, and the human has falsified it.**

**And there is a mechanism for why it was true when written and false now: the palette was
repaired in the same pass.** The need role went from a worst pair of **1.000** — identical
luminance, different hue — to **1.814 with zero pairs under threshold**. So the smudge was
plausibly a *chromatic* defect wearing a *geometric* costume, and the reduction may have been
solving a problem the other fix had already solved. **Two changes in one pass, the second
justified by the state of the first before it was repaired, and the multi-segment bar has never
been seen against the repaired palette by anyone.**

**The general form, which is worth more than this instance**: when two fixes ship together and
one of them changes the conditions the other was justified under, the second is unevidenced even
if both were reasonable when proposed. Neither the builder nor the orchestrator caught it; the
human caught it by noticing something missing.

### THE PARKED-HYPOTHESIS SCORECARD FOR TODAY: THREE FIRED, THREE WERE ALREADY WRITTEN DOWN

1. `check:tickcost`'s spread — parked with its trigger at `PARKING.md:1052`, **re-parked instead
   of run**, found by `sim-critic` who ran it. A real ~10% regression.
2. The palette's colour field — parked by G-030 with *"if two shipped ids land on colours a
   watcher cannot tell apart"*, **fired by WATCH #5**.
3. The need-bar reduction — parked by G-030 with its own test, **fired by WATCH #6**.

**The parking discipline is working and the FIRING discipline is not.** Every one of the three was
written down correctly, with its experiment, before it fired. Two were then re-parked or shipped
rather than run at the moment the trigger tripped. **`CLAUDE.md` says a parked hypothesis with its
test is a result waiting for a goal that happens to run it — today's lesson is that it is also a
result waiting for somebody to notice the trigger has already fired.**

---

## G-023a — A guest is somewhere — REFLECT

**DONE, DRY at 1/3.** 1 sweep (2 MAJOR + 3 MINOR, all fixed) plus a verification pass that did
**not** convert. Save **v11**, I2 `0da3bbefd62bc863`, bare-run `5ea79c98e4c7868c`, permanent v1
fixture a zero-line diff through eleven schema versions.

**THE SEAM WAS OFFERED AT PLAN AND TAKEN, AND IT PAID IMMEDIATELY.** The builder proposed
splitting G-023 along its own title — *a guest is somewhere* / *going somewhere takes time* — on
an argument about **evidence rather than effort**: A moves only hashes, B moves only counts, and
run together no moved golden is attributable to either without an intermediate state nobody
committed. **The split also re-sorted the owners cleanly** (save schema and world model to
`sim-engineer`, behaviour to `ai-engineer`), which is further evidence it was cut in the right
place. It then paid a second time when the B half was blocked by a BLOCKER that never touched A.

**THE §5.6 PLAN PASS PRODUCED THE BEST CRITIQUE IN THE PROJECT AND NO CODE EXISTED YET.**
`ai-critic` found that the travel budget is **exactly zero** — the three engagement needs sum to
the 480-tick lodging window and rest runs on every tick a guest holds a room — and **measured it
rather than argued it**. The orchestrator reproduced it both ways before accepting: +1 tick of
work, and −1 tick of window, each flipping `guest_nourishment` from 356 met / 0 unmet to **0 met
/ 356 unmet**. That finding produced **ADR-0017**, the largest design change in the project.

**AND THE ORCHESTRATOR VERIFIED THE WRONG THING FIRST.** I checked the builder's derivation
arithmetic against the bytes, found it internally correct, and called it sound. **The arithmetic
was right and the model was wrong** — I never asked which constraint binds. `CLAUDE.md` rule 4's
first slot, *what is this a measurement OF*, applied to a derivation rather than a number.

**TWO DEFECT CLASSES THE CRITIC CAUGHT, BOTH THE ONE THIS GOAL EXISTS TO PREVENT.** A rule stated
in one copy of the placement code and dropped in the other (the migration copies the cell object
and says so; the live path shared it by reference and said nothing), and a fixture whose banner
said *never regenerate* while its base was `createWorld` — so a future v12 field would arrive
inside it silently and that step's overwrite guard would never fire. **Both harmless today; both
exactly the ADR-0008 drift the goal's whole apparatus was built to catch, inside the goal that
built it.**

**THE TICK-COST FINDING, AND THE FIRING-DISCIPLINE LESSON.** `check:tickcost`'s spread was
reported by the builder as a probe and **parked** — but `PARKING.md:1052` already carried the
falsification test **with its trigger**, the trigger had fired, and running it cost one
invocation. The critic ran it: the fix arm (1.0333, spread 1.013–1.064) is **disjoint** from the
pre-fix arm (1.0987, 1.073–1.130), so the per-guest-per-tick array allocation was real.
**Residual ≈1.05×, recorded as an input to M3's running-product test rather than parked a second
time.** The builder then **withdrew its own attribution** of that residual to a message string,
on an argument needing no statistics: one arm differs from another by passing a single integer
and reads 5% apart, so the gap is instrument spread, not mechanism.

**Prediction scored (§5.5).** The builder predicted that declining the split would cost ≥4
instances of a "where is this guest" drift class, 3/3 sweeps, and an unattributable golden.
**Not scorable — the seam was taken**, which is the point of taking it.

**Committed in isolation, which was not the plan.** Track A's agent was killed twice by API
529s mid-refactor, leaving the shared `typecheck` row red and this goal — DRY, verified,
finished — hostage to an outage on a track it shares no file with. Isolated with
`git stash push -u`, 111 files hashed before and compared after. **ADR-0019's cost, stated:
"tracks join at VERIFY" means any failure on either track blocks both, including failures that
are nobody's code.**
