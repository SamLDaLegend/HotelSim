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
command directly. All six §2 gates green: I2 `f8e9e51864851494`, I5 **37.4%** of budget
at a **60-room** hotel (it was 28% at three rooms before G-010's optimisation), 672 tests
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
fixture into a husk) · a busy 60-room hotel does not fit the 10s budget at realistic
occupancy, and the bench can no longer be sized by room count because tick cost is now
O(guests) · `missingItem` is not player-reachable until M6 gives items their own commands.

**Trigger:** §5.4 — a milestone's exit criteria are met and need human sign-off.

**State:** All six M0 goals done (G-001..G-006), each verified by the orchestrator
running every exit command directly. All six §2 invariant gates green: I2 hash
`be508c487d49fd6c` across 3 processes, I5 at 12.5% of budget, 361 tests across 18
files. The M0 statement is met end to end, headless: one room type, one guest, one
need, one day cycle, money in and money out — `pnpm sim:run --days 30 --seed 42`
reports 360 arrived / 267 satisfied / 89 unsatisfied / 0 stuck / 0 orphans, revenue
2,269,500p against upkeep 225,000p, byte-identical across runs, machine-readable via
`pnpm --silent sim:run --json`. Saves round-trip at schema v2 with a real migration
behind them and a permanent v1 fixture. Total: 8 commits, 12 critique rounds used of
18 budgeted, 6 MAJOR + 3 MINOR findings, zero BLOCKERs, zero round budgets exceeded.

**Known debts, deliberately carried and recorded:** free-room lookup breaks I5 above
~50 rooms (-> M1, measured, in PARKING.md) · ledger append-copy breaks past ~15k
appends/run (-> M4, measured) · seed does not influence guest behaviour until M4
demand (the seed-honesty test retires by design) · balance-critic's seed-sweep
mandate is vacuous until M4.

**Asked of the human:** Sign off M0. On sign-off the loop selects the first M1 goal
(structure: multi-floor grid, build/demolish, room validity, construction cost). Per
§9, no render work starts before this sign-off; M5 remains shut regardless until its
own milestone.
