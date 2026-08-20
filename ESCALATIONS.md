# ESCALATIONS

Things the loop stopped for, because they are human calls and not agent calls
(`HOTELSIM.md` §5.4). When an entry is written here, the goal loop **stops** until the
human resolves it.

Escalate when any of these is true:

- A BLOCKER survives the 3-round critique budget.
- An invariant in §2 cannot be satisfied without changing the invariant.
- The goal turns out to depend on an unbuilt goal.
- A milestone's exit criteria are met and need human sign-off.
- Something is fun-critical and cannot be resolved by test.

Format: date, trigger, what was tried, what is being asked of the human. Mark entries
`RESOLVED` with the answer rather than deleting them.

---

## 2026-08-07 — RESOLVED — Bootstrap complete, awaiting sign-off

**Resolution (2026-08-07):** Human signed off. Loop entered §5 SELECT at G-001. The
three bootstrap design calls (ADR-0001 content injection, ADR-0002 integer money,
ADR-0003 snake_case content IDs) were surfaced at sign-off and stand unchallenged.


**Trigger:** Human instruction — stop after `HOTELSIM.md` §10 and show `pnpm verify`
green against the empty scaffold before any simulation logic is written.

**State:** All six invariant gates green. Each gate has also been deliberately broken
and observed red, then reverted, so none of them is passing vacuously. The agent
roster, goal ledger and CI are in place. `packages/sim` is an empty stub marked
`// SCAFFOLD`.

**Asked of the human:** Sign off the bootstrap. On sign-off the loop enters §5 SELECT
at G-001 and works M0 to completion, with the M0 exit itself returning here for a
second sign-off before M1.

---

## 2026-08-07 — RESOLVED — M0 walking skeleton complete, awaiting milestone sign-off

**Resolution (2026-08-07):** Human signed off. M1 opened; the loop selects G-007.

The human asked directly whether anything was playable. Answer given and accepted: no —
not only is there no renderer (per M0's scope), there is **no player agency at all**,
because build and demolish are M1 and pricing is M4. §8's "playable-but-boring" is not
achievable as M0 is scoped; M0 delivered the boring half and the substrate under it.

What the sign-off attests is therefore not that the game is fun, but that the machine
under it is sound: determinism that has been attacked, saves that survive a real
migration, an economy whose arithmetic closes to the penny, and gates each seen red.

The build loop is already visible in the data even though no player can act on it — a
capacity sweep at 30 days/seed 42 shows demand saturating near 6 rooms, with 12 rooms
serving the same 356 guests for 450,000p less profit, matching the idle-room upkeep to
the penny. M1's build commands are what make that reachable by a player.

**Rejected alternative:** adding a minimal interactive harness before M1. It would be new
scope smuggled into a signed-off milestone, and it duplicates work M1's build commands
do properly.

---

## 2026-08-08 — RESOLVED — M1 Structure complete, awaiting milestone sign-off

**Resolution (2026-08-08):** Human signed off M1 and ruled on the dead state: **all three
closures are approved — starting capital, a loan, and a balanced demolition refund.** Not
one of them; all three. Recorded as ADR-0011 and scheduled as **G-011**, pulled forward
from M4 by that ruling because the dead state is a live playability defect that M2 and M3
would otherwise ship on top of.

The human added "we don't need to be deterministic", which the orchestrator read as *all
three are correct, do not agonise over choosing one* — **not** as licence to weaken I2.
All three mechanisms are deterministic anyway. Flagged back explicitly, so that if the
invariant was meant, it becomes the stated human decision §9 requires rather than an
inference.

---

## 2026-08-08 — SUPERSEDED — M1 Structure complete, awaiting milestone sign-off

**Trigger:** §5.4 — a milestone's exit criteria are met and need human sign-off.

**State.** G-007 to G-010 done, each verified by the orchestrator running every exit
command directly. All six §2 gates green: I2 `f8e9e51864851494`, I5 ~~**37.4%** of budget
at a **60-room** hotel (it was 28% at three rooms before G-010's optimisation)~~ — both
percentages withdrawn at G-018, which derived the budget they were fractions of — 672 tests
across 35 files. Saves are at schema v4 and the permanent v1 fixture walks 1->2->3->4 with
a zero-line diff.

**M1's own statement is met and the game is playable.** A host command places a room on
the grid and charges construction cost to the ledger; another removes it; builds on an
occupied cell, off the plot, or without the cash are refused as recorded outcomes rather
than throws. A room is valid only if it is supported (transitively — to the earth), has a
door, and holds its required items; an invalid room serves nobody and says why.

**Total: 6 goals in M0, 4 in M1, 14 commits, 5 gate/config defects found by agents and
fixed in their own labelled commits, 0 BLOCKERs, 0 round budgets exceeded.**

**Asked of the human — two things.**

**1. Sign off M1.** On sign-off the loop selects M2 (Needs: full need vector, item-based
provider registry, utility scoring, satisfaction over ticks, patience drain, reviews).
Per §9, `apps/game` stays shut until M5 regardless.

**2. Rule on the absorbing dead state, outstanding since G-008.** A world with zero rooms
and a zero balance cannot recover: no rooms means no revenue, no revenue means the balance
never moves, and every build is refused forever. It is reachable in three legal commands
from the shipped default — `--rooms 3 --demolish 1` scraps the inherited rooms before any
revenue arrives — and 1,000 days later the report reads 12,000 guests arrived, 11,999
unsatisfied, every player action refused, with no notification. "Starting capital is
parked to M4" and "the game has a reachable dead state with no exit" are different claims,
and the second is what shipped. Candidate closures, all M4 territory: starting capital, a
demolition refund (but note a refund above 247,500p reopens the G-005 upkeep dodge), or a
loan. **This is a design call, not a test failure**, which is why it is here rather than
in a goal.

**Known debts carried deliberately, all measured and parked.** The overbuild spiral has no
terminator, and a *slower* build cadence is worse (M4) · `nightlyRatePence` is charged per
completed stay, not per night, so the margin is 10.2:1 rather than the 3.4:1 the field
names imply (ADR-0010; documented, not renamed, because renaming would turn the permanent
fixture into a husk) · ~~a busy 60-room hotel does not fit the 10s budget at realistic
occupancy~~ — **withdrawn at G-018: false against the derived budget, which a busy 60-room
hotel fits several times over. What survives is that the bench's workload is a
quarter-occupied shell, which is a workload debt and not a performance one** — and the bench can
no longer be sized by room count because tick cost is now O(guests) · `missingItem` is not player-reachable until M6 gives items their own commands.

**Trigger:** §5.4 — a milestone's exit criteria are met and need human sign-off.

**State:** All six M0 goals done (G-001..G-006), each verified by the orchestrator
running every exit command directly. All six §2 invariant gates green: I2 hash
`be508c487d49fd6c` across 3 processes, I5 at ~~12.5% of budget~~ (withdrawn G-018), 361 tests across 18
files. The M0 statement is met end to end, headless: one room type, one guest, one
need, one day cycle, money in and money out — `pnpm sim:run --days 30 --seed 42`
reports 360 arrived / 267 satisfied / 89 unsatisfied / 0 stuck / 0 orphans, revenue
2,269,500p against upkeep 225,000p, byte-identical across runs, machine-readable via
`pnpm --silent sim:run --json`. Saves round-trip at schema v2 with a real migration
behind them and a permanent v1 fixture. Total: 8 commits, 12 critique rounds used of
18 budgeted, 6 MAJOR + 3 MINOR findings, zero BLOCKERs, zero round budgets exceeded.

**Known debts, deliberately carried and recorded:** ~~free-room lookup breaks I5 above
~50 rooms~~ (-> M1, measured, in PARKING.md; **the threshold is withdrawn at G-018 — it
described the invented budget. The superlinear shape behind it is real, was the actual
debt, and was paid at G-010**) · ledger append-copy breaks past ~15k
appends/run (-> M4, measured) · seed does not influence guest behaviour until M4
demand (the seed-honesty test retires by design) · balance-critic's seed-sweep
mandate is vacuous until M4.

**Asked of the human:** Sign off M0. On sign-off the loop selects the first M1 goal
(structure: multi-floor grid, build/demolish, room validity, construction cost). Per
§9, no render work starts before this sign-off; M5 remains shut regardless until its
own milestone.

---

## 2026-08-08 — G-013: the round budget is spent, and the rule fired on its own author

**The loop is stopped.** `HOTELSIM.md` §7.1's conversion guard — written earlier today by
human ruling — has fired for the first time, on the goal that produced it.

**Status of the work: complete and independently verified.** All six gates green
(`typecheck`, I1, I3, I4, I2 `4b8db9b1ac36cb35`, I6, I5 ~~**83.0%**~~ — withdrawn at
G-018; the same build reads **~2%** of the derived budget). 1,095 tests. Every exit
criterion run by the orchestrator, not taken on report: `vitest run provider` 102 green ·
`vitest run scaling` 10 green · criterion 2 by-item **356**, by-room **713**,
`guest_nourishment` **178/178**, and its **negative control** returns by-item 0 on every row ·
criterion 3 refuses naming `guest_comfort` with **exit 1** and its paired positive loads
with **exit 0** · criterion 4's 11 release tests green · fixture zero-line diff ·
`SAVE_V1_CONTENT` unmoved · no gate, CI or config file touched.

**What is outstanding is two numbers in one comment block.** Not the registry, which has
needed no correctness fix since before the first critique.

### Why it escalated rather than being waved through

Three sweeps were spent (3/3). Round 3 closed **OPEN** with one MAJOR: the block justifying
this goal's new I2 coverage described `hotel_lounge` / `arm_chair` / `guest_comfort` when
the code builds `games_room` / `vending_machine` / `guest_nourishment`, with stale figures
on top. The builder fixed the prose, kept the code, and **self-reported a second stale
figure nobody had caught.**

The verification pass (unbudgeted, per §7.1) found the *replacement prose* wrong twice more:

1. **Both surviving percentages use lifetime denominators that include the post-seal window
   in which engagement is impossible by construction.** Every engagement tick for both items
   lies before the seal. Pre-seal: **777 of 6,954 (11.2%)** and **38,829 of 40,002 (97.1%)** —
   not 5.5% and 49%. *The conclusion survives and widens*, so "wave 1 thin, wave 2 robust"
   is right and `itemSurvived >= 2` holds.
2. **The retraction's stated cause does not reproduce.** "It counted every entity in the
   cell" yields **5,486**, not 11,268; two other natural readings give 22,823 and 48,915.
   The qualitative half is right — the cell was busy (79%) while the item was not (11.2%),
   which is exactly what produced the round-2 belief — but the arithmetic does not stand.

**That paragraph has now been wrong three times in three different ways, and the third was
in the replacement for the second.** §7.1's guard exists for exactly that signal: *if the
builder's fixes keep spawning findings, the budget burns and it escalates properly.*

**The classification was close and the critic refused to take the cheaper side**, saying it
would not argue hard against the escalating reading and would not pick the one that costs
it less. Finding 2 is plainly a restatement. Finding 1 — "wrong denominator" against round
3's "stale figures" — is arguably new ground. The orchestrator took the escalating reading
**because the alternative is relabelling a fix-verify loop as verification in the same
session the guard against that was written.**

### Recommendation — the charter already prescribes the remedy

**Authorise the narrow fix: delete the percentages, assert the property.**

ADR-0007's newest amendment (yours, today) says a comment offered as evidence is subject to
the same rule as an assertion — *write the assertion, or do not make the claim.* Three
failed attempts at this claim is strong evidence it should not be prose. The coverage is
already asserted mechanically: `itemSurvived >= 2` at ticks 7,002 and 60,014, plus an
assertion that an item is placed, provides something, and is not providing at the horizon.
The percentages are decoration that has been wrong three times and load-bearing zero times.

`CLAUDE.md` says the same for finding 2: **a number you cannot re-measure is withdrawn, not
restated.**

If you prefer, the alternative is a 4th sweep — but the diff is otherwise swept and
verified, and a fourth pass over 27 files to re-check two sentences is the expensive way to
reach the same place.

**Not recommended: splitting.** You already ruled on that, and this is OPEN rather than
UNSWEPT — the state whose remedy is splitting.

**Asked of the human:** authorise the narrow fix (delete the two percentages and the
unreproducible causal claim; keep the mechanical assertions), or grant a 4th sweep, or
overrule the conversion and accept the verification as a verification.

### DISCHARGED 2026-08-08 — human ruling: land it, do not split

*"Escalate, and then land it. Don't split."*

The human upheld the classification — *"you took the reading that cost you more in the
session the guard was written"* — and then drew the line the orchestrator had not:

> **The guard did its job. But that is evidence about the PARAGRAPH, not about the goal.**

Splitting a goal whose code is correct and whose only defect is two numbers in a comment
block would fire the remedy at the wrong subject, and would produce the same
two-uncritiqued-commits outcome already rejected an hour earlier, for less reason.

**Resolution: the paragraph loses its numbers entirely**, and that becomes a rule rather
than a repair — now in ADR-0007: *a comment offered as evidence may not carry a figure that
no test pins. Prose that cannot be verified may describe, but it may not measure.* Three
failures, three distinct mechanisms, and **the qualitative claim survived all three** —
the numbers were the only part that kept rotting and they did no work the conclusion needed.

**Noted for the record, because it cuts against the pattern:** the denominator correction
**widened** the gap it corrected (11.2% vs 97.1%, against 5.5% vs 49%). A retraction that
strengthens what it retracts is unusual and is mild evidence the underlying reading was
sound while only the framing was broken.

**The guard is now itself on trial** (`HOTELSIM.md` §7.1). It has fired once, on the goal
that produced it, on prose rather than code. If the next several firings are also prose it
is a prose-quality instrument in a critique-budget costume and gets renamed and re-scoped.
Each firing records its subject. Written down now so it can be wrong later.

---

## 2026-08-09 — G-018: the guard fired a second time, on an orchestrator claim

**Raised and discharged in the same breath by the human — *"Go for it."*** Recorded because
§7.1's guard converting a verification into a sweep with the budget spent is a §5.4
escalation whether or not the outcome is "carry on", and a rule that only gets written down
when it stops work is a rule nobody can audit.

**What fired it.** G-018's verification pass produced a **new** MAJOR, so §7.1 converted it
to a sweep; sweeps were already 3/3.

**What the finding was, and whose.** The orchestrator rewrote a `HOTELSIM.md` §10 citation
to read *"the bootstrap proved five of the six gates bite … and I5 was the one never proven
red."* **Three contemporaneous records deny it** — `ESCALATIONS.md:30`, `JOURNAL.md:181`,
and commit `b92a815`, all saying *each* gate was deliberately broken and observed red.

The sequence is the point. The original citation invoked a §10 "break each gate" ritual
**that does not exist** (§10 says only that the gates should pass trivially against an empty
sim). Corrected — and the correction introduced **a second unsourced claim in the opposite
direction**, asserted as fact and reported to the human as this goal's headline. *A number
in prose, offered as evidence, that nothing pins* — the exact class G-018 exists to delete,
in G-018's own ledger entry, as the fix for the previous instance of itself. Fourth
count-or-attribution error in the goal.

**Resolution: drop the count rather than replace it.** No evidence exists in either
direction, and minting a second count to correct the first would be the whole failure again.
What survives without evidence, and is the claim G-020 actually needs: **no committed test
pinned I5's failing path until this one.** A one-off manual probe leaves nothing behind that
a later change can trip over.

**What the goal delivered, none of it in question.** I5's budget derived from a stated
requirement (389,333 ms; the invented ten seconds was ~39× tighter than anything the game
needs); the arithmetic executable in `budget.mjs` rather than a literal; every historical
I5 figure struck or re-baselined; **and I5's failing path witnessed by a test for the first
time** — by copying the shipped gate to a temp dir rather than making the gate configurable,
so no CI lever exists to pull.

**The technique G-020 inherits, which is worth more than the test:** a gate's failing path
can be witnessed by *copying* the gate, and *"it would take too long"* deserves one attempt
at a third option before it becomes a parked item.

**Guard scorecard** (`HOTELSIM.md` §7.1 keeps this): **two firings, two on prose.** G-013 on
a determinism-log comment, G-018 on a ledger citation. Neither has yet fired on code. If the
next several are also prose it is a prose-quality instrument in a critique-budget costume
and gets renamed and re-scoped.

---

## 2026-08-09 — STANDING AUTHORISATION: unattended run to M2 completion

**Human, 2026-08-09:** *"Proceed as far as possible to M2 completion, if escalations arise
handle them sensibly and park them as I won't be available for 10 hours."*

This suspends §5.4's "write it here and **stop**" for the duration of one unattended run.
Escalations get **decided and recorded**, not queued. Recorded here rather than assumed,
because a loop that quietly stops halting is worse than one that halts too often.

**What I will decide myself and carry on:**
- A §7.1 conversion with the sweep budget spent — decide, record, land.
- A surviving MAJOR whose fix is bounded and whose evidence I can verify myself.
- Goal sizing, seam calls (§5.5), and adjudications between builder and critic (§5.3).
- Re-scoping or splitting a goal that is going badly, rather than grinding it.

**What I will NOT decide, and will park instead — the loop continues past them:**
- **Anything that would weaken I1–I6.** ADR-0013's own bounding clause says that if a
  ruling appears to require weakening an invariant, **stop and escalate**. The standing
  authorisation does not touch that. A goal that cannot be done without it gets parked and
  the next goal is selected.
- **A fun-critical or design call** (§5.4's last clause) — the speed ladder's rung values,
  a review scale's feel, what "reads as stupid" means. These are the human's by charter.
- **Anything that reopens M0, M1 or a signed-off ruling.**
- **M2 exit itself**, which is a §5.4 sign-off and stays the human's.

**Discipline that does not relax because nobody is watching**, and is the reason to write
this down at all:
- VERIFY is still run by the orchestrator, every exit command and every gate, every goal.
- A goal still closes only on **DRY** (§7.1).
- A critic still sees the plan before BUILD (§5.6), and a declined seam is still a written
  prediction scored at REFLECT (§5.5).
- No number gets reported that was not measured in this session, paired where it is a
  comparison (`CLAUDE.md`).
- **The four count-or-attribution errors in G-018 were all mine, all made while moving
  quickly.** Unattended is exactly when that gets worse. Anything I cannot verify from the
  repo in front of me gets stated as unverified or not stated.

**On waking, the human should read:** this file's newest entries, then `JOURNAL.md`'s
digest, then `GOALS.md`'s digest. Every decision taken under this authorisation is recorded
in one of the three and marked as taken unattended.

---

## 2026-08-09 — §7.1's conversion guard: the prediction has fired. PARKED for the human.

**Decided under the standing authorisation: recorded, not acted on.** Renaming a charter
mechanism is a change to the human's own ruling, and the authorisation explicitly reserves
those. The loop continues past this.

**The prediction, written into `HOTELSIM.md` §7.1 by human instruction so it could be wrong
later:**

> It has fired exactly once — on G-013, the goal that produced it, and on **prose** rather
> than on code. **If the next several firings are also prose, then the guard is a
> prose-quality instrument wearing a critique-budget costume, and it should be RENAMED AND
> RE-SCOPED** rather than left to accumulate a reputation it did not earn. Record each
> firing with its subject: code or prose.

**The scorecard, four firings, four on prose. Not one on code.**

| goal | what converted the pass | subject |
|---|---|---|
| G-013 | a determinism-log comment describing a world the code does not build | **prose** |
| G-018 | a ledger citation asserting a count three records deny | **prose** |
| G-018 | lifetime denominators, and a retraction whose cause does not reproduce | **prose** |
| G-014a | corrections **added** above the stale paragraphs they supersede, in the same file | **prose** |

`ai-critic` raised the scoring itself: *"that is now four for four, and the prediction
recorded in `HOTELSIM.md` §7.1 about renaming and re-scoping the guard is due to be scored."*

**The honest reading, stated for the human rather than decided:**

- The guard **works** — every firing found something real, and three of the four were in
  evidence the loop was relying on.
- But it has **never once fired on code**, and its name and its home (a *critique-budget*
  rule) both imply it guards implementation quality. That is the mismatch the prediction
  anticipated.
- The pattern underneath is sharper than the guard's framing: **three of the four are the
  same file or the same class — a correction that leaves the error it corrects still
  standing.** G-014a's instance is in the paragraph headed *"READ THIS, BECAUSE AN EARLIER
  VERSION OF THIS PARAGRAPH GOT IT WRONG AND WAS BELIEVED"*, which is the third time that
  file has produced it.

**What a re-scope might look like, offered as options and not as a decision:** rename it to
name its real subject (evidence quality); or move it out of §7.1's budget mechanics into
ADR-0007, which is where the prose rules already live; or leave it exactly as it is on the
grounds that a guard which keeps finding real defects has earned its keep whatever it is
called. **The human's call.**

---

## 2026-08-09 — HANDOVER: where the unattended run stopped, and why here

**Five goals committed this run**: G-013, G-018, G-017, G-014a, G-015, plus three charter
commits. Working tree clean, all six gates green, nothing half-built.

**Stopped here deliberately rather than starting G-014b or G-019.** Both are substantial —
G-014b carries save v9, a derived hysteresis margin and two criteria that are broken as
written; G-019 is last-in-milestone and needs two critics from different pairs. Starting
either would have left a half-swept diff across the handover, and §4's one-goal-in-progress
rule exists so that does not happen. A clean stop with the next three goals fully specified
is worth more than a partial sixth.

### What is owed by the human, and by nobody else

1. **`pnpm viewer`, load a recording, scrub it.** G-017's criterion 1. It is marked **owed,
   not met**, and no agent may discharge it — the builder's harness never touches the file
   picker, the scrubber, the play loop or Canvas2D text metrics, and substituting for it
   would be §9's stop condition discharged by the very substitution ADR-0013 forbids.
2. **Rule on §7.1's conversion guard.** Four firings, **all on prose, none on code**. The
   prediction written into the charter says it should then be renamed and re-scoped. Parked
   above with the scorecard and three options.
3. **M2 exit itself**, when G-014b, G-019, G-020 and G-021 are done.

### The three things the next session should not re-derive

- **G-014b's criteria 2 and 3 are both broken.** 2 cannot fail (not implementing the
  feature reports 0, which is below every n). 3 is **inverted** — the goldens go red
  *precisely because* the margin works, so it is satisfiable only by a broken build. Both
  repairs are recorded in G-014's block.
- **Abandonment is a row on `NeedOutcome`, not in G-015's departure table.** A guest departs
  once but abandons many times; a law summing a subset of rows is the vacuity shape.
- **Seeds are inert until M4.** Six seeds give byte-identical need tables because arrivals
  are scheduled rather than drawn. Vary hotel *shape* — that is what found G-014a's result.

### What this run learned about itself, worth one line each

- **Park a hypothesis WITH ITS EXPERIMENT.** G-013 did; G-017's recording turned out to be
  that experiment; G-014a then hit the knife-edge it described. Three goals chained without
  any of them planning it.
- **The WATCH step earns its cost.** It caught a defect in G-014a's own first build — one of
  three needs never met, for every guest, with six gates green and 1,133 tests passing.
- **Every one of the orchestrator's errors this run was a number passed on without
  re-measuring**: a fabricated §10 citation, a "five of six" count three records deny, a
  12.5% cross-check that was one dataset and its own superset, and a test total that was
  arithmetic across two moments. **All four were caught by an agent, none by me.** The rule
  that would have prevented all four is already written: `CLAUDE.md` rule 5.

---

## 2026-08-09 — I4 IS INTERMITTENTLY RED, AND HAS BEEN SINCE G-016. Decided and recorded.

**A §2 invariant gate that fails about a third of the time under load is §9's shape
exactly — *"a gate that flakes red teaches people to re-run it"* — and it has been in the
suite since G-016 without anyone noticing.** Found only because G-020a's I4 failure forced
three runs instead of one.

**The culprit is not G-020a. It is `tools/headless/src/needs.scaling.test.ts`**, a paired
timing-ratio test with hard bounds (2.5×, 1.9×) living inside a parallel runner.

**Measured, and the two accounts disagree, so both are recorded:**

| | isolated | in full suite |
|---|---|---|
| `sim-engineer` | 0 fail / 3 | **2 fail / 4** |
| orchestrator | **1 fail / 9** | 0 fail / 2 |
| **combined** | **1 fail / 12 (~8%)** | **2 fail / 6 (~33%)** |

**Contention makes it worse. Contention is NOT the cause** — it fails isolated too, which
refutes the builder's "3/3 isolated, therefore contention" reading **and** my acceptance of
it. Neither of us had enough runs; the failure rate is low enough that three observations
cannot distinguish the two stories.

**THE ROOT CAUSE IS NOW MEASURABLE, AND G-020a IS WHAT MEASURED IT.** The instrument built
this goal established that **a single timing reading on this machine is worth ±10%**, and a
`--repeat 7` median is worth ~±3%. `needs.scaling.test.ts` takes **single readings** and
asserts **hard bounds**. *A gate built on one timing sample cannot be more reliable than one
timing sample.* The instrument built to guard tick cost has explained why the pre-existing
tick-cost test flakes — which is the most useful thing G-020a has produced.

**Decided under the standing authorisation, and recorded rather than acted on:**

- **Not fixed here.** `needs.scaling.test.ts` belongs to G-016's lineage and rewriting a
  §2-gate-bearing timing test is not G-020a's scope. Touching it to make my own goal's
  VERIFY green would be the §9 move.
- **`check-measure.mjs` is the pattern that fixes it** — a gate-shaped check as a standalone
  script rather than a passenger in `pnpm test` — and it now exists as precedent.
- **G-020b inherits it**, since it is the goal that owns tick-cost measurement and already
  inherits the ±10% floor. The repair is the same repair: repeat, or move the bound onto
  something a single sample can carry.

**AND A CONSEQUENCE FOR EVERY "ALL SIX GATES GREEN" IN THIS SESSION.** I reported that
phrase after single `pnpm verify` runs, repeatedly. **On a gate that flakes ~33% under load,
one green run is not evidence that the gate passes** — it is one sample of a coin. Every
such report in `JOURNAL.md` and in the commit messages of G-013, G-018, G-017, G-014a and
G-015 should be read as *"green on the run I took"*, which is weaker than it sounded.
Nothing is known to be wrong in those goals; what is wrong is the strength of the claim.

### CORRECTED 2026-08-09 — the entry above conflated TWO defects, and the fix fixed neither

**`sim-critic` found it and I verified it rather than accepting it.** The entry above says
`check-measure.mjs` is *"the pattern that fixes it"*. **It is not. Measured on this tree,
with the instrument's vitest file deleted entirely:**

```
pnpm test  run 1: exit=1   Tests 1235 passed (1235)   Errors 1 error
pnpm test  run 2: exit=1   Tests 1235 passed (1235)   Errors 1 error
pnpm test  run 3: exit=0   Tests 1235 passed (1235)
```

**Every test passes and the gate still exits 1.** So I4's failure survived removing the file
the entry blamed, and the move accommodated nothing.

**THERE ARE TWO DEFECTS AND THE ENTRY ABOVE COUNTED THEM AS ONE:**

| | signature | rate | passes at `--maxWorkers=2`? |
|---|---|---|---|
| **A** — `needs.scaling.test.ts` | **a NAMED assertion failure** against hard timing bounds (`1 failed \| 1252 passed`) | ~8% isolated, ~33% in-suite | untested |
| **B** — vitest worker starvation | **ZERO failing tests**, unhandled `[vitest-worker]: Timeout calling "onTaskUpdate"` | ~2 of 3 here, 6 of 6 for the builder | **yes, clean** |

**They are not the same failure and they do not have the same repair.** A is a timing test
that cannot be more reliable than one timing sample — G-020a's ±10% floor explains it. B is
the runner starving under parallel load and has nothing to do with timing bounds at all.

**G-020b was about to inherit the repair on the strength of that conflation**, which would
have produced a fix for A that leaves B firing and a gate still red.

**The lesson, and it is the same one this session keeps producing**: both the builder and I
diagnosed from too few observations and from the *rate* rather than the *signature*. **The
signature was the discriminator all along and neither of us looked at it** — a named test
failing and zero tests failing are different events that both read as "I4 red" in a summary
line. **The count of knowingly-unreliable tests is therefore 2, not 1**, and it is now in
`GOALS.md`'s digest beside the gate readings as the human required.

### UPDATED 2026-08-09 — both defects reassigned from G-020b to G-020c, and why

**The entry above says "G-020b inherits it". That is no longer true and the record should not
say it.** At G-020b's PLAN the orchestrator split **both** defects out into **G-020c**:

- **Defect A** (`needs.scaling.test.ts`, a named assertion failure) — the builder proposed
  relocating it inside G-020b. Declined, on a better reason than the builder's: the
  discriminating measurement is this arm's ratio at HEAD against a **pre-G-013** revision, and
  nobody has taken it.
- **Defect B** (worker RPC starvation, zero failing tests) — the builder's plan was **silent
  on `vitest.config.ts`'s `maxWorkers: 2`**, and *"silence is how a stopgap becomes policy"*,
  which that comment names about itself. Removing the cap can re-expose B, and discovering
  that inside G-020b's VERIFY costs a round.

**They are still two defects with two signatures.** What put them in one goal is that they need
**the same kind of evidence — repeated runs** — because each fires at a rate no single run can
measure. That is a scheduling reason, not a re-conflation.

**AND ONE FINDING RAISED AGAINST DEFECT A IS WITHDRAWN.** G-020b's builder measured the need
ratio at **1.723–2.263, worst at 91% of its 2.5 bound** (6 fresh processes) and reported a
possible real per-need regression sitting uncaught in the repo; the orchestrator passed it on
in those terms. `sim-critic` replicated the four arms in **quiet** processes — **1.576 · 1.658
· 1.740 · 1.759 · 1.773 · 1.782 · 1.788 · 1.790 · 1.913, median 1.77, worst at 76%, none over
2.0** — indistinguishable from G-016's recorded 1.61–1.95. Five **loaded** processes interleaved
with quiet ones gave **1.520–2.123**, bracketing the builder's readings **by contention alone**.
**The builder's figures carried no load condition** — `CLAUDE.md` rule 4's **slot 5**, which the
human ruled in during this goal, citing this withdrawal as one of the three failures behind it.

**What survives is smaller and still real**: this ratio is **not load-invariant upward**, which
falsifies `needs.scaling.test.ts`'s own guidance at `:160-162` and `:329-336` in its own words.
That is G-020c's to repair.

**G-020b therefore does NOT return the unreliable-gate count to zero.** It ships a tick-cost
tripwire that is deliberately **outside `pnpm test`**, so it adds no new timing bound to I4's
path — but the two entries above are still open, and §2.0's "a third is a stop condition"
still stands.

### RESOLVED 2026-08-10 (G-020c) — both defects, both by measurement. The entries above stand as history.

**Nothing above is edited.** ADR-0008: an artefact describing the past must not track the
present, and those paragraphs record what was believed and measured at the time. Where a figure
in them is now known unreproducible, the correction is here.

**DEFECT B — the worker RPC starvation. THE CAP IS REMOVED, AND ON THE SUITE THAT SHIPS IT
PREVENTS NOTHING.** `pnpm test` classified by SIGNATURE into a **four-cell partition** — the fourth cell
being `exit 1 / 0 failed / no such string`, which is the case the original diagnosis could not
see — arms alternated in one sitting, on the suite as it ships after the relocation (74 files,
1,426 tests), `win32/12cpu`, node 22.16:

| regime | arm | n | PASS | **B** | A | UNCLASSIFIED | wall clock median |
|---|---|---|---|---|---|---|---|
| quiet | **uncapped** | 10 | 10 | **0** | 0 | 0 | **53.9s** |
| quiet | `--maxWorkers=2` | 10 | 10 | **0** | 0 | 0 | 84.3s |
| **loaded** (12 busy processes on 12 cores) | **uncapped** | 5 | 0 | **5** | 0 | 0 | 171.4s |
| **loaded** | `--maxWorkers=2` | 5 | 0 | **5** | 0 | 0 | 343.4s |

**TEN LOADED RUNS, BOTH ARMS, EVERY ONE SIGNATURE B** — exit 1, all 1,426 tests passing. **The
discriminator is LOAD, not worker count.** Capping halves the parallelism, doubles the wall
clock, and the RPC channel starves anyway.

*"It passes clean at `--maxWorkers=2`"* — the observation this cap was ruled in on — **carried
no load condition**: `CLAUDE.md` rule 4's fifth slot, **inside a fix rather than inside a
number**. **The tax is measured too: 1.564× wall clock on every run, to prevent nothing.**

**THE SCOPE, STATED BECAUSE THE FIRST VERSION OF THIS PARAGRAPH OVERREACHED.** These readings
cover **today's 1,426-test suite**. The sitting the cap was ruled in on ran **1,235 tests**, was
never re-run, and its regime is unrecorded — so this campaign **cannot** say the cap never
worked, and inferring the old regime from the absence of a label would be rule 4 run backwards.
The rates in the entry above (2 of 3, 6 of 6, then none for a day) are consistent with an
unlabelled load condition and that remains a HYPOTHESIS; the falsification test is parked. **The
decision to remove the cap rests on the shipped configuration alone and does not need it.**

**DEFECT A — the named assertion failure. NOT a contention artefact, and the relocation alone
would NOT have fixed it.** `sim-critic` measured the shipped assertion isolated, one fresh
process per run, n=10, QUIET: **9 × exit 0, 1 × exit 1, "expected 2.653418174841722 to be less
than 2.5"**, with an independent tsx probe at 2.5903 and this goal's own campaign reading 2.5906
as its worst of twelve quiet readings. **`BOUND = 2.5` sat inside the assertion's own quiet
spread.** Moving it to a standalone check would have moved the flake into the new check and
called the count zero.

So the repair is BOTH: the three timing bounds are `pnpm check:scaling` (out of I4), and every
bound is **re-derived** — pinned to equality with `trunc(quiet median × 1.5)` and refused if it
sits at or below the worst reading observed in any measured regime (ADR-0016).

**AND ONE FIGURE IN THE ENTRY ABOVE IS WITHDRAWN.** *"A single timing reading on this machine is
worth ±10%, and a `--repeat 7` median ~±3%"* — the first carried no load condition (rule 4's
fifth slot, ruled in after it was written) and the second does not reproduce (0.9067 / 1.0501).
The **shape** of that diagnosis was right — a gate built on one timing sample cannot be more
reliable than one timing sample — and the quantity was wrong. `CLAUDE.md` rule 5: withdrawn
here, not restated, and **not** edited out of the paragraph above.

**THE UNRELIABLE-GATE COUNT (§2.0) GOES TO 1 GATE / 1 DEFECT — NOT TO ZERO — AND G-020c's
CRITERION THAT SAYS 0 IS NOT MET.** The noun is stated because §4.1 requires it: **gates**, with
the defect count beside it. Defect A is repaired; **defect B is diagnosed and unrepaired**, and
it now has a REPRODUCIBLE TRIGGER (heavy external load) rather than a rate, which under §2.0 is
the difference between an instrument that has stopped reporting and a fact.

**Reporting 0 was available and would have been wrong**: the quiet arm alone gives 20 of 20
clean, and the loaded arm in the same campaign gives 10 of 10 failing. "Green on the run I took"
is unsafe for exactly the reason "red on the run I took" is (§2.0), and choosing the arm that
suits the criterion is the same move one level up.

**WHAT IS ASKED OF THE HUMAN — a decision, not a fix.** Three candidate remedies are parked with
falsification tests (`PARKING.md`, G-020c): vitest's `pool` setting, an explicit worker-count
policy sourced to a stated requirement, and handling the RPC timeout rather than letting it
become an unhandled error. **Each is a goal, none is a comment**, and the one thing this campaign
rules out is the fourth option — putting the cap back.

---

## OPEN — G-020c's CI-regime criterion cannot be met: there is no remote (2026-08-10)

**Raised by the orchestrator at G-020c SELECT. Blocks one criterion of G-020c and one
condition of M2 exit. It does NOT block the rest of G-020c, which proceeds.**

**The finding, measured rather than assumed:**

```
$ git remote -v
(no output — no remotes configured)

$ ls .github/workflows/
verify.yml
```

**`.github/workflows/verify.yml` has existed since bootstrap and has never run.** It was
written at §10 step 2 "even though there's no remote yet", and no remote was ever added.

**Why this matters more than it looks.** G-020b shipped `check:tickcost` — a **timing-dependent
bound** — into `pnpm verify`, and `verify.yml` runs `pnpm verify` on a **three-OS hosted
matrix** where a runner is a shared 2-4 vCPU box. Every reading behind that bound was taken on
a **quiet 12-core developer machine**. ADR-0015 says a bound is not trusted until its regime is
observed, and `CLAUDE.md` rule 4's fifth slot exists because of exactly this class of error.
**So the repo currently carries a gate whose behaviour in the only regime that would ever run
it automatically is completely unknown** — and has been since G-020b, undetected, because
nothing here ever pushes.

**Two things follow, and the second is the uncomfortable one:**

1. **The CI regime reading is owed by the human**, not by an agent. It needs a remote, a push,
   and a run. Creating a remote and pushing are outward-facing actions the orchestrator will
   not take unbidden.
2. **Every "CI is green" style assurance anywhere in this repo is unearned.** No gate in this
   project has ever been observed running anywhere except this machine. The invariants are
   real and have been run thousands of times — locally, by one machine, in one regime.

**RECOMMENDATION.** Treat this as an M2-exit item for the human rather than a goal blocker:

- **G-020c proceeds without it** and delivers both I4 defects, the standalone timing check, the
  discriminating pre-G-013 measurement, and the unreliable-gate count reaching zero.
- **The CI criterion is struck from G-020c and restated as an M2-exit condition owed by the
  human**: add a remote, push, and record the first three `TICKCOST` lines and
  `check:tickcost:proof`'s three ratios from a real run. The `TICKCOST` line prints its own
  regime, so this is a copy rather than a transcription.
- **Until then `check:tickcost`'s bound is stated as observed in one regime only**, which is
  what `tripwire.mjs` already says at `LOADED_OBSERVATIONS` — that comment turns out to have
  been more right than its author knew.

**If the human would rather not have a remote at all**, that is a legitimate answer and it has
a consequence worth stating: `verify.yml` should then be **deleted** rather than left as
decoration, because a workflow nobody runs is a check that certifies nothing — which is
ADR-0007's subject, in YAML.

---

## OPEN — I4's second defect is DIAGNOSED but UNREPAIRED. The count is 1, not 0 (G-020c, 2026-08-10)

**This is G-020c's own pre-registered third branch firing, not a failure of the goal.** The
decision rule was written into the block *before any reading existed*: if both arms show
signature B, the cap is not the remedy, the defect is unrepaired, **the count does not reach 0,
and that is an escalation rather than a claimed zero.** It fired.

**WHAT WAS MEASURED.** `pnpm test` classified by **signature** — `(exit code, failed-test count,
"[vitest-worker]: Timeout calling \"onTaskUpdate\"")` — into a **four-cell** partition whose
fourth cell is `exit 1 / 0 failed / no such string`, the cell the G-016 diagnosis missed. Arms
alternated in one sitting, shipped post-relocation suite (74 files, 1,426 tests), `win32/12cpu`:

| regime | arm | n | PASS | **B** | A | UNCLASSIFIED | median wall |
|---|---|---|---|---|---|---|---|
| quiet | uncapped | 10 | 10 | **0** | 0 | 0 | 53.9s |
| quiet | `--maxWorkers=2` | 10 | 10 | **0** | 0 | 0 | 84.3s |
| **loaded** (12 busy processes on 12 cores) | uncapped | 5 | 0 | **5** | 0 | 0 | 171.4s |
| **loaded** | `--maxWorkers=2` | 5 | 0 | **5** | 0 | 0 | 343.4s |

**THE CAP WAS NOT THE REMEDY, ON THE SHIPPED CONFIGURATION.** Ten loaded runs, both arms, every
one signature B with all 1,426 tests passing. **The discriminator is load, not worker count** —
and the cap cost **1.564×** on every run to prevent nothing. It is removed.

**WHAT IS AND IS NOT CLAIMED.** This covers **today's 1,426-test suite**. The sitting the cap was
originally ruled in on ran a **1,235-test suite**, was never re-run, and **its load condition is
unrecorded** — so the broader claim *"the cap never worked"* is **withdrawn**, and is parked with
its falsification test (materialise `72ae268`, run the shipped classifier). Inferring that
sitting's regime from the absence of a label would be rule 4 run backwards, and ADR-0015's
REPLACE half says a 1,235-test and a 1,426-test suite are different configurations.

**DEFECT A IS REPAIRED.** The timing bounds left `pnpm test` for `pnpm check:scaling` — an
eleventh `verify` row — and relocation alone was **not** the repair: `sim-critic` measured the
shipped assertion isolated, quiet, n=10, and got **1 × "expected 2.653418174841722 to be less
than 2.5"**. `BOUND = 2.5` sat *inside* its own quiet spread. Bounds are re-derived by a uniform
rule, pinned to equality with `trunc(quiet median × 1.5)` and refused below the worst reading in
any observed regime, with a too-noisy brake **in code**. Two tightened, two loosened.

**WHAT THE HUMAN IS BEING ASKED.** Not to approve a repair — to accept a **diagnosis** in place
of one, and to rule on where B goes:

- **Accept 1 gate / 1 defect for M2 exit**, with B named, measured and parked; or
- **Hold M2 open** until B is repaired, which is its own goal.

**Remedy candidates are parked with a falsification test** — vitest's `pool` option, a **sourced**
worker-count policy, or handling the RPC timeout. **A cap is ruled out by measurement.**

**§2.0's guard is unchanged and worth restating: a THIRD unreliable gate is a stop condition.**
The count is 1. It has never been 0 since G-016.

---

## OPEN — M2 EXIT. All 13 goals done; §5.4 says this is yours to sign off (2026-08-10)

**G-012 to G-021 are `done`. The loop stops here.** Everything below is either a decision only
you can take, or a result you asked to be shown before signing.

### 1. What M2 was for, and whether it happened

M2's statement contains the word **"visibly"**, and ADR-0013 is the ruling that a perceptual
criterion needs a perceptual check. **It has one now**: `tools/viewer` exists, four WATCH entries
are in `JOURNAL.md`, and the last of them is a recording you can open. **That word is
discharged** — but the discharge is only as good as the instrument, which is item 4.

### 2. THE THREE THINGS YOU ASKED TO SEE BEFORE SIGNING

**(a) The digest experiment, scored both ways.** You asked for the delete case argued as well as
the automate case, and said you would rather see the argument than the defence.

*The automate case*: it caught real staleness four times, and the byte-identical `*As of…*` line
across four files makes "where are we" answerable in one grep.

***The delete case, and it is stronger.*** The mechanism has failed **four times in three days**,
every failure repaired by hand, and **the fourth was mine, one REFLECT after I recorded the third
as the argument for automating it** — all four digests over the fifteen-line cap at once, caught
only by counting lines by hand again. **`HOTELSIM.md:213` seeded a mechanical check and no goal
ever owned it.** A rule its own author breaches immediately after writing down the breach is not
being enforced by anything.

**My recommendation: automate the two mechanical parts or delete the cap.** The as-of line and
the line count are both one small test. If you do not want that test, the honest move is to drop
the cap and keep the digests as prose, because an unenforced number is a superstition with a
heading.

**(b) The unreliable-gate count, with its noun.** **One gate, one defect: I4.** Defect A (timing
bounds in a parallel runner) is repaired and moved to `pnpm check:scaling`. Defect B (worker RPC
starvation) is **diagnosed and unrepaired** — see item 3.

**(c) The bimodal recording, watched not manufactured.** `--days 3 --seed 7 --rooms 6
--arrivals 60`: **48 satisfied, 15 gave up** in one run, the middle band you asked for, and it
exists at HEAD rather than being constructed. Frame-referenced in `JOURNAL.md`. **The entry
declines to claim the perceptual half and leaves you three questions.**

### 3. THE DECISION I CANNOT TAKE FOR YOU — I4's defect B

**Measured**: ten loaded runs, both arms, **every one signature B with all 1,426 tests passing.**
The discriminator is **load, not worker count**, so `maxWorkers: 2` was removed as
measured-ineffective after costing **1.564× on every run** to prevent nothing.

**The count is 1 gate / 1 defect and G-020c refused to report 0**, which was available from its
quiet arm alone. **Your call:**

- **Accept 1 gate / 1 defect for M2 exit**, with B named, measured, and parked with a
  falsification test; or
- **Hold M2 open** until B is repaired, which is its own goal.

**§2.0's guard is unchanged: a THIRD unreliable gate is a stop condition.** The count has never
been 0 since G-016.

### 4. THE THING I WOULD RAISE EVEN IF YOU DID NOT ASK — CI HAS NEVER RUN

**There is no git remote.** `.github/workflows/verify.yml` has certified nothing since bootstrap.
It matters more now than it did: **G-020b shipped a timing-dependent bound into `pnpm verify`**,
and the workflow describes a three-OS matrix on shared 2–4 vCPU runners. **Every reading behind
that bound came from this 12-core box. No gate in this project has been observed running on any
other machine.** Adding a remote and pushing is yours; it is the single cheapest way to find out
whether eleven green rows mean anything off this desk.

### 5. WHAT M2 LEAVES M3 AND M4, AS RESULTS RATHER THAN OBLIGATIONS

- **The dwell term is falsified-positive**, not a hypothesis: **35 of 38 abandonments at the
  shipped margin leave a need past half its `satisfyTicks`**, and no non-saturating margin can
  guarantee completion.
- **The top-band review share is non-monotone in room count and peaks at the default hotel** —
  24.9% at 1 room, **41.6% at 3**, 0.28% at 12, mean rising throughout. **At M4 a reputation term
  reading the mean is safe; one reading share-of-top-reviews inverts the build loop.**
- **M4 is blocked on scenario capital** (ADR-0013 §5): `--rooms N` seeds ~75% extra opening
  capital, and every balance figure in this project was taken with it.
- **The "1.74 → 2.08 need-vector regression" was never a multiple.** The quiet interval excludes
  1.3×; there is a real ~11–25% difference and it is not the class this project produces.

### 6. THE HONEST LEDGER ON MYSELF

Three orchestrator defects this milestone, all caught by agents: I passed you a **conclusion that
had outlived its numbers** (the sittings-vs-revisions claim); I shipped a **commit message
describing six rulings its diff did not contain**, and "verified" it with a grep that matched a
different goal's block; and **three of four exit criteria in one goal, and all three in another,
were satisfiable without the feature working** — each found by a builder or critic at PLAN, which
is the cheapest moment, and each now recorded as ADR-0007's sixth amendment: **a vacuous check
fails to catch a defect; a vacuous criterion certifies the goal.**

### RESOLVED 2026-08-10 — M2 IS SIGNED OFF, with three rulings and two prerequisites

**"M2 is signed off."** One gate carrying one defect clears the stated bar, so exit was
permissible. **Neither prerequisite below holds M2 open — M2's statement is about needs, and
both are INSTRUMENT DEBTS.** They land on M3's first goal instead, in the same shape as
scenario capital for M4. Both are now in `HOTELSIM.md` §8.

**THE DIGEST — KEPT, STAMP AUTOMATED, CAP DROPPED.** The human owned the scoring of a mechanism
they proposed, and corrected my recommendation on the half I got wrong: I had offered "automate
the two mechanical parts **or** delete the cap", treating the cap as automatable. It is not.
*"Enforcing a line count is adding a check to satisfy a number rather than to pin behaviour",*
which §9 already names — and my own phrasing was turned against me correctly: **an unenforced
arbitrary number is a superstition with a heading; an ENFORCED one is a superstition with CI
access, which is worse.** The digest itself earned its place — it caught the drift it was built
for. **The as-of stamp is automated AND GETS AN OWNER**, because the version seeded at
`HOTELSIM.md`'s §4.1 foot failed for exactly one reason: no goal owned it.

**EVERY SCANNER GATE OWES A PROOF-OF-BITE TEST.** The fourth structural-not-individual finding
of the session, and the one that lands on the gates rather than the code: **the gates check
everything, and nothing checks the gates except proof-of-bite, which was done by hand at
bootstrap and never made standing.** Three goals produced the same degraded predicate inside
three different scanners.

**STILL OPEN, AND IT IS THE HUMAN'S ACTION**: there is no git remote. I cannot create one. Give
me a URL, or create the repository and I will push — the workflow is audited and ready, and the
first matrix run is the cheapest possible moment to learn it is red.

---

## RESOLVED — I4's DEFECT B: three remedies falsified, the fourth measured and adopted (G-022, 2026-08-12)

**This is G-022's pre-registered third branch firing, written into the plan before any reading
existed:** *if all candidates still produce B, the defect is in the runner rather than in its
configuration, the count does not reach 0, and that is an escalation rather than a claimed zero.*

**THE CRITERION THAT SAYS THE UNRELIABLE COUNT REACHES 0 IS NOT MET AND IS NOT CLAIMED.** A quiet
green was available and would have been worthless: §2.0 says "green on the run I took" is unsafe
for exactly the reason "red on the run I took" is.

### What was measured

`pnpm test` under `node tools/gates/arm/load.mjs --workers 12 --`, classified by the shipped
`tools/gates/arm/suite-signature.mjs`, arms **alternated in one sitting**, `win32/12cpu`, node
22.16, vitest 3.2.7, on the suite as it ships after this goal (**85 files, 1,635 tests**):

| arm | n | B_WORKER_RPC | tests failed | files failed | median wall |
|---|---|---|---|---|---|
| control (default pool) | 5 | **5** | 0 | 0 | 197.8s |
| `pool: 'forks'` | 5 | **5** | 0 | 0 | 213.3s |

Every one of the ten cells: **85 of 85 files passed, 1,635 of 1,635 tests passed, exit 1**, with
`[vitest-worker]: Timeout calling "onTaskUpdate"` as an unhandled error. Quiet, the same suite is
green (85 files, 1,635 tests, 58.8s, exit 0).

### The three candidates `PARKING.md` parked at G-020c, all three now answered

1. **`pool: 'forks'` — FALSIFIED by the table above.** 5 of 5, indistinguishable from control.
2. **A worker-count policy — ALREADY FALSIFIED at G-020c**, which measured a cap at 5 of 5 loaded
   cells and 1.564x the wall clock. "Leave one core free" is a weaker cap than the one measured.
3. **Handling the RPC timeout — NO CONFIGURATION SURFACE EXISTS.** Read out of the installed tree:
   birpc's `DEFAULT_TIMEOUT` is 60s (`vitest@3.2.7/dist/chunks/index.B521nVV-.js:3`) and the
   worker RPC is built with no timeout option reachable from `vitest.config.ts`
   (`dist/chunks/rpc.-pEldfrD.js:42`). Changing it means patching vitest.

### The mechanism, which is the useful part and is new

**Both pools starve the same consumer.** Switching from worker threads to forked processes moves
the TESTS off the main thread; it does not move the TRANSFORM, which stays on the vite server in
the main process. Under 12-way oversubscription the main thread cannot answer a worker's RPC
within 60 seconds, and vitest treats that expiry as fatal. That is why the two arms are identical
rather than merely close, and it is why no parallelism setting was ever going to move it.

### Explicitly refused, so nobody offers it as the fix

**`dangerouslyIgnoreUnhandledErrors`** turns all ten of those runs green while changing nothing
about them. §9: a gate modified to stop reporting the failure it exists to report. Not a candidate.

### What is asked of the human — a decision, not a fix

- **A fourth candidate exists and I have not tested it: a vitest upgrade.** The timeout is a
  library constant today; a later version may expose it or stop treating expiry as fatal.
  **FALSIFICATION TEST**: bump vitest, re-run this exact campaign (n>=5 per arm, alternated,
  `load.mjs --workers 12`). *If the upgraded arm is 0 of 5 where the control is 5 of 5, that is
  the remedy and it is a goal; if it is 5 of 5, the runner cannot be configured out of this and
  the question below is the only one left.* A toolchain bump mid-milestone is not an agent call.
- **Or rule on what I4 claims.** The honest alternative is that `pnpm test`'s verdict is valid on
  a machine that is not deliberately oversubscribed, stated in the charter rather than discovered.
  **That is a change to an invariant's scope and is the human's alone** (§9, `CLAUDE.md`).

**THE COUNT IS 1 GATE / 1 DEFECT. It has never been 0 since G-016.** §2.0's guard is unchanged: a
THIRD unreliable gate is a stop condition.

### One thing this campaign fixed on its way past

**The first run of this campaign was contaminated and the instrument could not see it.** A
`beforeAll` in G-022's new `determinism-gate.test.ts` — four `tsx` starts, 1.7s quiet — exceeded
vitest's **10s hook default** under load, in every cell of both arms. It failed no assertion; it
ran out of clock. The classifier read those runs as clean signature B, because it asked only for
zero failing TESTS and a hook failure produces zero failing tests. **A run with a failed FILE now
degrades to UNCLASSIFIED** (`suite-signature.mjs`, with the arm in `suite-signature.test.ts` built
from that real output), and `hookTimeout` is now 30s for the same stated reason `testTimeout` is —
"a timeout should catch a deadlock, not a busy laptop". The campaign above was re-run from scratch
after both repairs; the contaminated readings are discarded, not reported.

### CANDIDATE 4 IS THE REMEDY, MEASURED AND MECHANISM-NAMED (G-022, 2026-08-12)

**The escalation above stands as history; this is its answer.** The decision rule below was written
down before any reading existed, as the plan required.

**THE MECHANISM, ESTABLISHED BEFORE THE CAMPAIGN AND INDEPENDENT OF IT.** A version bump that works
for reasons nobody can name is a stopgap wearing a semver, so the cause was found first:

| | worker RPC construction | consequence |
|---|---|---|
| vitest **3.2.7** | `createRuntimeRpc` passes **no timeout** → birpc `DEFAULT_TIMEOUT = 60_000` | `if (timeout >= 0)` arms a 60s timer; expiry throws `[vitest-worker]: Timeout calling "onTaskUpdate"` as an UNHANDLED error, failing a run in which every test passed |
| vitest **4.1.10** | `createRuntimeRpc` passes **`timeout: -1`** (`dist/chunks/rpc.MzXet3jl.js:117`) | the same guard is false, **no timer is armed**, and a starved main thread delays the call instead of failing the run |

**THE READING.** Arms alternated in one sitting, `node tools/gates/arm/load.mjs --workers 12 --`,
classified by the shipped `tools/gates/arm/suite-signature.mjs`, `win32/12cpu`, node 22.16, both
arms at commit `dcc706d` (86 files, 1,640 tests) and differing **only** in the vitest version:

| arm | n | PASS | B_WORKER_RPC | tests passed | median wall |
|---|---|---|---|---|---|
| vitest 3.2.7 (control) | 5 | 0 | **5** | 1,640 | 189.6s |
| vitest 4.1.10 | 5 | **5** | **0** | 1,640 | 196.0s |

**CONFIRMATION, as the pre-registered rule required before any claim of zero:** vitest 4.1.10 at
**n=10 loaded — 10 of 10 PASS**, 1,640 tests every run, median 191.9s; and **n=5 quiet — 5 of 5
PASS**. No v4 log contains the RPC string at all, so this is the event not occurring rather than
the classifier failing to recognise a reworded one (the branch the rule required be checked).

**AND THE CHECK THAT DISTINGUISHES A FIX FROM SUPPRESSION**, because "vitest stopped failing runs"
would be `dangerouslyIgnoreUnhandledErrors` arriving by upstream default. A probe raising a genuine
unhandled rejection during a run was put through both versions: **3.2.7 exits 1, 4.1.10 exits 1**,
both printing "Unhandled Rejection". Error handling is intact; what changed is that the spurious
error is no longer CREATED.

**THE SUITE NEEDS NO PORTING.** Under 4.1.10, quiet: 86 files, 1,640 tests, all passing, 58.5s
against 58.8s at 3.2.7. **`pnpm verify` is TWELVE ROWS GREEN under 4.1.10**, including both gates
that materialise arms.

**WHAT WAS NOT YET TRUE WHEN THIS WAS WRITTEN — AND IS NOW.** ~~The repository still ships
3.2.7~~ and ~~the unreliable count is 1 gate / 1 defect until the bump lands~~: **the bump landed
at `4e768c9`**, `package.json` ships `^4.1.10`, and `vitest.config.ts`'s block was rewritten at
sweep 1 with the fourth row and the `rpc.MzXet3jl.js:117` mechanism, as this paragraph required.
The three falsified candidates stay recorded there so nobody retries them. **Struck rather than
deleted (ADR-0008): the obligation is what made the rewrite happen, and a reader should see that
it was owed before it was paid.**

**AND CI WAS THE DECIDING TEST — IT DECIDED AGAINST THE HYPOTHESIS.** Run #4 failed I4 on the
Windows runner and this entry called that "consistent with defect B" while stating the signature
was unverified. **It was not defect B.** Run #5 failed at 65,685ms against run #4's 65,577ms —
**108 milliseconds apart across a vitest major version change**, and under 4.1.10 the RPC timer is
not armed at all. The cause was a defect in G-022's own `tempdir.symlink.test.ts`, introduced in
`dcc706d`, which is the exact commit where Windows first went red: it compared an 8.3 short path
against the runner-canonicalised long form. **The local repair above is untouched by that** — it
rests on 5/5 against 0/5, an n=10 confirmation, the unhandled-rejection control and a library
constant, none of which came from CI.

---

## OPEN — I3's gate is blind to the natural spelling of the thing it forbids (2026-08-12)

**Found by `render-engineer` during G-030, probed rather than asserted, and NOT fixed there —
correctly, because widening an invariant gate's predicate is not a render goal's call.**

**The finding.** `tools/gates/check-content.mjs:77` walks `stringLiterals`, so:

```js
{ 'standard_room': 0x3f6fb5 }   // CAUGHT in both roots
{ standard_room:   0x3f6fb5 }   // CAUGHT IN NEITHER
```

The second is an **unquoted object key** — and it is how a person actually writes a palette
table, which is exactly the artefact ADR-0003 was written to forbid. Probed against a mirrored
tree during G-030's build, both roots, both spellings.

**Why this is worse than an ordinary gap.** I3 is one of the **six invariants**. The project has
spent twenty-three goals treating "`check:content` is green" as meaning no content definition has
leaked into code, and that claim has a hole in it shaped like the most natural way to write the
leak. It is ADR-0007's class — *a check that succeeds while inspecting nothing* — **inside an
invariant gate**, which is the one place the project has no second line of defence.

**Nothing currently leans on it.** G-030's palette is derived from content ids at runtime rather
than tabulated, and that choice was made because it beats a table, not because a gate would have
refused one. `palette.ts`'s comment was corrected during the build so it does not imply cover it
does not have.

**What is asked of the human — a scheduling decision, not a fix.** This wants its own goal, and
it is not obviously small: the honest repair probably keys the predicate to **declared content
ids** (read from `packages/content`) rather than to *snake_case shape*, which changes what the
gate means as well as what it catches. That is a design decision about an invariant.

- **Option A**: schedule it now, before M2.5's remaining goals add more `apps/game` surface.
- **Option B**: schedule it at M3 exit with the other instrument debts, as G-022 did.
- **Not an option**: leave it as a `PARKING.md` note. A known hole in an invariant gate that
  nobody has scheduled is how the three-OS CI matrix sat unrun for nineteen goals.

**The gate must also get a proof-of-bite covering the unquoted spelling**, per the human's M2
exit ruling that every scanner gate owes one — the existing proof passes today while the hole
is open, which makes it the second instance of a proof that certifies less than it appears to.

### RESOLVED 2026-08-12 — human ruling: OPTION B, schedule it with M3's instrument debts

*"I agree you should schedule I3 with M3 instrument debts."*

**Scheduled, not parked** — which was the one outcome ruled out above. It joins the M3 exit block
as a named obligation and will be the subject of an instrument-debt goal in the shape G-022 took
for M2's, rather than a `PARKING.md` line nobody owns. **G-022 exists because the same class of
debt was scheduled rather than noted**, and it found four defects in tests written to prove
something, including that `check-purity.mjs` (I1) and `determinism.mjs` (I2) had never been
executed by any committed test.

**What the goal inherits, so it does not re-derive it:** the probe already exists — both roots,
both spellings, `{ 'standard_room': … }` caught and `{ standard_room: … }` not — and the likely
repair is to key the predicate to **declared content ids** read from `packages/content` rather
than to snake_case *shape*, which changes what the gate means as well as what it catches. The
proof-of-bite must cover the unquoted spelling; today's proof passes with the hole open.

**Accepted risk of deferring, stated so it is a decision rather than an oversight**: M2.5's
remaining goals (G-031, G-027, G-028) will add `apps/game` and `packages/content` surface before
the gate is repaired. Nothing currently leans on the hole — G-030's palette is derived at runtime
rather than tabulated — but a table written in the natural spelling between now and then would
pass I3 and would have to be found by eye.

---

## RESOLVED 2026-08-12 — `check:tickcost` cannot measure a commit that redefines occupancy

**Human ruling: accept the red for G-027a, with the reason recorded, and schedule the campaign
re-take as its own goal.** The alternatives — re-taking the campaign inside G-027a, or reverting
the workload so the gate produces a number — were both offered and refused.

### What happened, in order, because the sequence is the finding

1. **G-027a tripped `check:tickcost` at 2.02× against a 1.4557 bound.** The builder did **not**
   touch the gate (§9) and escalated with a mechanism instead of a request for a wider bound.
2. **The orchestrator measured rather than accepting it.** `sim:measure --json`, paired and
   interleaved, quiet: ratio **1.9834**, head **31,959 ns/tick**, base **16,113**, **1350
   arrivals in both arms**. Population measured, not assumed: **`in hotel 45`** against 15 at
   HEAD. **Cost per guest-tick fell from ~1,074 to ~710 — about a third.** On the axis
   `workload.mjs` itself calls *"the honest axis… CONCURRENT GUESTS"*, this commit made the
   simulation **cheaper**; the gate read 2× because the population tripled.
3. **The human ruled `ARRIVAL_EVERY_TICKS` 32 → 96** to restore the calibrated 15 concurrent
   (`1440/96`), with the bound explicitly NOT moved, and the orchestrator added a mechanical pin
   so the proxy cannot silently redefine itself again.
4. **AND THAT RULING WAS INCOMPLETE — THE ORCHESTRATOR REASONED ABOUT ONE ARM.** The builder
   found that **no cadence fixes it**: the arms have different stay lengths (480 base, 1,440
   head), so nothing puts both at 15. **45-vs-15 simply became 15-vs-5** — the 3:1 gap identical
   and mirrored. The gate then **refused to run** on ADR-0015's own configuration check
   (*"campaign 32, shipped workload 96 — POOL within a configuration, REPLACE on a configuration
   change"*), and `check:tickcost:proof` cascaded from it.

### The general finding, which is worth more than this goal

> **A paired-ratio tripwire is not configuration-neutral across a content change that redefines
> occupancy.** It compares two commits at one workload; when content changes what that workload
> *means*, the two arms are running different experiments and no setting reconciles them.

**The refusal is the gate working, and is strictly better than the number it would otherwise
print**: 2.02 would assert a regression that does not exist. **A green gate measuring a different
hotel is worse than a red one, because it has stopped being evidence** (ADR-0021).

### Confirmed twice, independently configured

Per-guest-tick cost fell **−34%** at cadence 32 and **−40%** at cadence 96 — two configurations,
same direction, same order. And an independent instrument agreed: **the eviction split went
19/0 → 19/16 → back to 19/0** when occupancy was restored — a counter that moves only with
concurrent population, moving back when the population did.

### What is owed, and by whom

- **The bound campaign is RE-TAKEN at the shipped configuration**, under ADR-0015's REPLACE half
  and ADR-0016's derivation rule, **as its own goal** — it is a four-arm interleaved campaign
  plus a loaded arm, and it needs **a human decision on the new ceiling**, which is why it is not
  a fix inside G-027a.
- **It joins the M3 instrument-debt goal** beside I3's unquoted-key hole, the tripwire's
  unrecharacterised regime under parallel tracks, and the 0.05° reserved-hue margin.
- **THE RISK OF ACCEPTING A RED ROW, STATED SO IT IS A DECISION AND NOT A DRIFT**: `pnpm verify`
  exits 1 until that goal runs, so every goal in between inherits a red row. §9's shape is *"a
  gate that flakes red teaches people to re-run it"*; a gate that is **known** red teaches people
  to skim the summary. **Every VERIFY between now and the re-take must state the row count green
  AND name these two as the ruled exceptions**, or the exception has become the habit.

## 2026-08-14 — OPEN — THE TRIPWIRE'S BOUND CANNOT CATCH THE SMALLEST REGRESSION THIS PROJECT HAS SHIPPED

**Raised**: G-032b · **Asked of the human**: which of the three options below. **Do not widen or
narrow the bound to clear this — that is the decision being escalated.**

**ON WHETHER THE LOOP STOPS.** This file says a written entry stops the loop until the human
resolves it, and I am not overriding that on my own authority. But the defect is a gate that is
too **WIDE**, not code that is wrong: nothing shipped is at risk, `pnpm verify` is green on every
row, and the remaining M3 goals do not touch this bound. **My reading is that M3 continues while

**STALE AS OF 2026-08-16, and this is ADR-0048 §1's standing question firing on its first outing.**
`sim-critic`'s G-034a plan review: *"G-034a touches it materially — an extra axis in `compareCells`
(called per binary-search step in the hottest lookup in the sim), a door rule going from two
neighbour probes to four, and a footprint fold replacing `[room.at]`. The bound is 1.4640 against a
smallest-known-regression of 1.173, so `check:tickcost` green would say very little about the
largest hot-path change since G-010."* **The claim that the remaining M3 goals do not touch this
bound was true of the OLD M3 and is false of the one ADR-0046 wrote.** The decision is unchanged
and still the human's; what has changed is that it is no longer cost-free to leave open.
this stays open, and I am stating that rather than assuming it.** If that reading is wrong, say
so and I stop.

### It was pre-registered, and it fired

G-032b was written carrying ADR-0015's pre-registered escalation: *"if the merge does not remove
the 1.135×–1.161× drift, the empirical claim that rule rests on has been falsified by this
project's own output, and that is an `ESCALATIONS.md` entry rather than a wider bound."*
`PARKING.md`'s falsification test was attached at G-028a and states the alternative in advance:
*"If the ratio does not return to ~1.00, the second walk was not the cost and the cause is
elsewhere — most likely the per-tick allocation the counter forces on a need that would otherwise
identity-return."*

**The merge landed. The ratio did not return to ~1.00. The parked note's own alternative is what
is left.**

### The measurement

*What: `check:tickcost`'s paired ratio, head arm over base arm. Workload: 60 rooms, an arrival
every 96 ticks, seed 42, 30 days = 43,200 ticks. Sample count: 6 per arm per campaign, arms
interleaved and alternating, three campaigns per row. Aggregation: median of the measured ratios
within a campaign; the three campaign medians are quoted individually below. **Regime: one quiet
12-core Windows 11 developer box, `win32/12cpu`, all six campaigns in ONE SITTING.***

| arm pair | campaigns | median |
|---|---|---|
| **merged** (one walk) over **two walks** | 0.9425 · 0.9472 · 0.9674 | **0.9472** |
| **no counter at all** over **two walks** | 0.8516 · 0.8528 · 0.8778 | **0.8528** |

Both rows are against the same base arm, measured in the same sitting, so they compose:

- **The `unservedTicks` counter costs `1 / 0.8528` = 1.173× of tick time.**
- **After the merge it costs `0.9472 / 0.8528` = 1.111×.**
- **The merge removed about a THIRD of it.** The redundant predicate walk was never the bulk;
  what remains is the per-need object the counter allocates on a need that would otherwise
  identity-return — which is what the park predicted.

**Nothing here is compared against a figure from another session.** G-028a's 1.135× and 1.158×
are consistent with the 1.173× re-measured above, but the finding is the pair of ratios taken
here, not their agreement with a stored number (`CLAUDE.md` rule 3).

### What is falsified, and it is a gate threshold, so it is not mine to change

`check:tickcost`'s bound is **1.4640 = sqrt(1.035500 noise ceiling × 2.07 smallest known
regression)** — ADR-0015's rule, and the gate prints that derivation on every run.

> **`2.07` IS NO LONGER THE SMALLEST KNOWN REGRESSION. `1.173` IS, AND THIS PROJECT SHIPPED IT.**

Re-deriving on the observed value gives `sqrt(1.0355 × 1.173)` ≈ **1.102**, which is **below** the
shipped 1.4640. Stated plainly:

> **A 1.173× regression passes the tripwire comfortably. The gate whose job is to catch a
> tick-cost regression would have waved G-028a's through even if it had not been red for an
> unrelated reason** — and it *was* red, so both critics measured it by hand instead, which is
> how it was caught at all.

**ADR-0013 §4 says a threshold must be derivable from a stated requirement. It still is — the
derivation is sound and the INPUT has changed.** ADR-0015's own rule is REPLACE on a
configuration change, and "the smallest known regression" moving is a change to the derivation's
input, not to the workload.

### Why the loop did not just narrow it

Three reasons, and the third is the one that makes this a human call rather than a judgement:

1. **`CLAUDE.md`: never edit a gate to make a build pass — and never to make one fail, by the
   same argument.** Changing an invariant or a gate threshold is a human decision, always.
2. **A 1.102 bound is close to the worst recorded LOADED noise, which is 1.2461.** The gate
   prints both. A bound beneath the noise of a regime the project actually runs in (CI is a
   shared runner, not this box) is a gate that fires on weather. **The quiet-regime bound and the
   loaded-regime noise now overlap, and no ratio taken on this box transfers to a 2-vCPU runner.**
3. **The pre-registration named this outcome and said what it becomes**: an escalation, *"rather
   than a wider bound"*. It did not authorise a narrower one either.

### The options, stated so the call is cheap

- **(a) Narrow to the re-derived 1.102** and accept that CI's loaded regime may make it flap —
  which needs a LOADED noise campaign nobody has run on the runner. Currently unmeasured.
- **(b) Keep 1.4640 and record openly that the tripwire catches doublings, not the ~1.2×
  regressions this project actually produces** — honest, and makes the gate's real reach legible
  instead of implied.
- **(c) Split the bound by regime**: a tight bound where the regime is measured, the wide bound
  elsewhere. Most work, and it is the only option that makes the gate mean the same thing on both
  machines.

**Recommendation: (b) now, (c) when a runner-regime campaign exists.** (a) alone buys sensitivity
this project cannot currently verify it can afford, and an instrument that fires on weather stops
being read — which is §9's own stop condition and precisely how three rows went unread for a
session.

### What was NOT done, deliberately

The remaining 1.111× was **not** chased. Removing it means not allocating a per-need object when
the counter increments, which is a real design change to the need vector, and doing it inside the
goal that discovered the finding is how a goal becomes two. **At ~1.9 % of I5's derived budget
there is ample headroom and nothing is at risk today.** It is parked with this entry as its
falsification test.


---

## 2026-08-16 — RESOLVED — G-034b SHIPPED A BEHAVIOURAL CHANGE WITH NO WATCH SURFACE

**RESOLVED at G-035, by option (a) plus the condition ending.** The isometric view landed one
goal later and **WATCH #12 watched it in a real browser** — corridors are drawn as paving, and a
room that cannot reach one is floor-tinted alarm red, hatched and labelled `noCorridor`, **with
the tile beside it dark plot rather than paving, so the picture says WHY.** G-034b's rule is now
watchable and was watched.

**THE STANDING PRECEDENT IS (b), AS RECOMMENDED, AND IT IS NOT NARROWED.** *"The shipped default
is unchanged"* is a weaker claim than *"nothing changed"*, and §7 is not being rewritten to suit
the first goal that found it inconvenient. **The next behavioural goal without an instrument
waits for one.** The human may still overrule this reading; nothing depends on it now.

**Raised**: G-034b, by the orchestrator · **Asked of the human**: whether this stands, or whether
G-034b should have waited for G-035.

**ADR-0046 §7 is explicit and I am not arguing round it in the week it was written:**

> *"from G-034 until this lands there is NO valid WATCH surface, and a behavioural goal shipping
> without one is an ESCALATION, not a recorded debt."*

**G-034b is behavioural.** `sim-engineer` flagged it and declined to pick a side, which was right.

### What is and is not unwatched, stated precisely rather than defensively

**The shipped game is byte-identical below the hash line**: 6 valid rooms, `0/0/0/0/0` invalidity
tally, 24 arrivals, 4/16 split, 96 checkouts, 510,000p. **The new rule bites only where corridors
are DECLARED**, and today the only things that declare them are the harnesses.

**So the honest reading is narrow — and narrow is not none.** What moved: the criterion arms and
the `--build` arms, because those hotels declare corridors. **The capability is live**, and it will
bite the moment content or a player declares one.

### Why I raised it rather than reasoning my way past it

**G-034a earned its "no WATCH owed" by being genuinely behaviour-free** — the shipped plot stayed
one row deep, and *every* outcome was byte-identical. **G-034b cannot make that claim**, and the
difference is exactly one step: *"the shipped default is unchanged"* is a weaker statement than
*"nothing changed"*, and stringing weaker-but-still-defensible steps together is **§0's diagnosis
of how this project got four goals into an M3 built on the wrong projection.**

> **Every individual step is justified. That is the failure mode, not the defence.**

### The mitigations that exist, so the human is choosing with them in hand

- **`tools/viewer` now draws corridors** and is bumped to schema 18, because `viewer.readonly.test.ts`
  demands every `World` key be drawn or exempted — *and a room reported `noCorridor` looks identical
  to a working one unless the plan is on screen.* **But the viewer is written off by ADR-0046 §3 and
  draws side-on, not isometric**, so it is not the surface of record.
- **The rule was measured before it was chosen.** An unconditional connectivity rule failed **216
  tests across 33 files in `packages/sim` alone**; the shipped rule reads history instead —
  **a floor with no declared corridor is OPEN PLAN**, which is what the sim meant for thirty-three
  goals.
- **The migration provably rewrites no verdict**, structurally rather than by sampling: on an
  open-plan floor circulation reduces to *"no room stands here"*, which is the predicate the door
  walk already applies, **so `hasDoor` implies `hasCirculation` and `noCorridor` cannot fire on any
  migrated world.** Witnessed on a hand-built v17 world, then **falsified on the same world** — one
  corridor declared elsewhere changes three verdicts.

### The options

- **(a) Let it stand**, and G-035's WATCH covers corridors when the view lands. Cheapest, and the
  unwatched surface is genuinely narrow.
- **(b) Rule that G-034b should have waited**, and take it as precedent that §7 binds even when the
  shipped default is unchanged.
- **(c) Narrow §7 in writing** — a behavioural goal whose SHIPPED default is byte-identical records
  a debt rather than escalating. **This is the option I distrust**, because it is the rule bending
  to the first goal that found it inconvenient.

**Recommendation: (a) now, and (b) as the standing precedent** — let this one stand because the
surface is narrow and provably so, and treat the next such case as waiting for its instrument.
**Not (c).**

**Nothing is blocked.** Fourteen rows green, and M3 continues to G-035 — which is the goal that
ends this condition.

---

## 2026-08-16 — OPEN — AN INTERMITTENT ROW IS OBSERVED, AND THE DIGEST SAYS THERE ARE NONE

**Raised**: G-036b, by the orchestrator · **Asked of the human**: §2.0 makes an intermittent gate
its own escalation. This is that entry.

**TWO INDEPENDENT SIGHTINGS, NEITHER OF THEM CONCLUSIVE ON ITS OWN:**

- `sim-engineer` reported `tools/headless/src/scorer.report.test.ts` **failing once in four
  full-suite runs and passing in isolation** (20.6s — load-sensitive), not recurring, and **not
  caused by its diff.**
- The orchestrator ran `pnpm verify` immediately after and it went **RED**, then **GREEN on an
  immediate re-run with no change to the tree.**

**AND I DID NOT CAPTURE WHICH ROW FAILED, WHICH IS A DEFECT IN MY OWN EVIDENCE.** The command was
`pnpm verify 2>&1 | tail -3`, so all that survives is the failure footer. **The two sightings are
consistent with one load-sensitive test, but I cannot prove they are the same thing**, and saying
they are would be exactly the inference this project keeps getting wrong.

> **`CLAUDE.md` already carries the rule this broke**: *"a guard is only as good as the question it
> asks."* The `&&` chain after `verify` tested **`tail`'s** exit code, not `verify`'s — **so the
> commit went out on a red run.** Second instance of that precise defect this session, both mine.
> The tree is green now and the commit is sound, but it was sound by luck.

**THE DIGEST'S `Unreliable: 0 gates` IS THEREFORE FALSE** and is corrected to `1 gate`. §2.0 requires
the count carry its noun and be honest; **a flake that is known and uncounted is worse than one
nobody has seen, because the count is what the next reader trusts.**

**What is NOT claimed**: that the row is `scorer.report`; that it is timing rather than a real
non-determinism; or that it is new. **All three are open**, and the cheap next step is a captured-
output re-run under load rather than a re-run that only says green.

**Recommendation**: G-039 owns it — it is the instrument goal, it already owns campaign re-takes,
and this needs `verify` to keep per-row output rather than a fresh investigation today. **Nothing is
blocked**; the tree is green and every row has passed on re-run.

---

## 2026-08-16 — OPEN — CAPACITY NEEDS A PARTY MECHANIC, AND THAT IS NOT IN M3

**Raised**: G-037 plan review · **Asked of the human**: does a party / group-arrival mechanic enter
M3, or does capacity wait?

**The human's design intent is not in question and is not overruled**: *"capacity will vary based on
room size and what's inside it — a guest room with a king size bed would have a capacity of 2, a 4×4
restaurant with 4 tables would have a higher capacity."* **A bigger room holding more people is
right, and it is what makes room size mean something for occupancy rather than only for score.**

**Two facts from the tree stand between that intent and any code** (ADR-0053):

1. **`capacity` HAS NO READER.** One in the whole repository — a test re-asserting its own schema.
   **Measured: capacity 99 on every shipped room type produces a byte-identical report.** Occupancy
   is a membership set and `claimEntity` **throws** on a second holder. So making capacity mean
   anything is **multi-occupancy: a new mechanism inside a throwing store invariant.**

2. **THE SHIPPED SCHEMA FORBIDS THE MOTIVATING EXAMPLE, WITH A REASON.** *"`capacity` is the size of
   the PARTY a room holds, NOT a count of unrelated bookings… **two strangers sharing a room would
   read as stupid to a watching player (§6.1)**."* **There is no party concept anywhere in
   `packages/sim`** — guests spawn individually. So *a king bed sleeps two*, over today's guest
   model, **is two strangers in one bed.**

### The options

- **(a) Party mechanic enters M3**, as its own goal before G-037b: guests arrive as groups of 1..N,
  a room holds one party, and capacity bounds the party. **Honest, and it is a real feature** —
  arrivals, the guest store and every occupancy pin move.
- **(b) Capacity waits for M6's archetype work**, where group travel belongs anyway, and G-037b is
  struck from M3. **M3 then delivers the quality fold and pricing, and room SIZE affects score and
  price but not headcount.**
- **(c) Overturn the schema's ruling** and let strangers share. **I recommend against it**: it is a
  reasoned §6.1 call, and the thing it protects against is exactly what a watching player would
  notice first.

**Recommendation: (b).** It keeps M3 finishable, it puts the mechanic where the archetype work
already lives, and **it costs the human nothing they have asked for** — size still drives quality
and price, which is most of what "the player decides the size" was about. **(a) is defensible if
group arrivals are wanted sooner; it is a goal, not a field.**

**Nothing is blocked today.** G-037a and G-037c proceed either way; only G-037b waits on this.
