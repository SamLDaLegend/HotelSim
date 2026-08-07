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
