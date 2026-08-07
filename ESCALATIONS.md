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

## 2026-08-07 — OPEN — M0 walking skeleton complete, awaiting milestone sign-off

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
