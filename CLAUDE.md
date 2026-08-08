# CLAUDE.md — HotelSim

**`HOTELSIM.md` is the source of truth. Read it.** This file is the short form that
survives context compaction; where the two disagree, `HOTELSIM.md` wins.

## What this is

A casual, cartoon-styled hotel building and management sim. Side-on cross-section
view (SimTower / Project Highrise), not isometric.

Three nested feedback loops. Every design and code decision traces to one of them:

- **Guest loop** — guest arrives, forms needs, gets them met or doesn't, pays, reviews.
- **Money loop** — room revenue against wages and upkeep, settled nightly.
- **Build loop** — spend cash, add capacity and quality, raise reputation, raise
  demand, back to the guest loop.

If a feature does not feed one of these three, it goes in `PARKING.md`.

## The six invariants — CI gates, not guidance

Run all of them with **`pnpm verify`**. No goal is done while any is red.

| | Invariant | Gate |
|---|---|---|
| **I1** | `packages/sim` imports nothing from the render layer, no DOM, no engine API, no filesystem, no network. Zero runtime dependencies. | `pnpm check:purity` |
| **I2** | Same seed + same command log ⇒ byte-identical state hash after 100,000 ticks, every run, every platform. No `Math.random`, no `Date.now`, no Set/Map iteration-order dependence in `packages/sim`. All randomness from the injected seeded PRNG. | `pnpm test:determinism` |
| **I3** | No room type, item, staff role or guest archetype defined in code. All of it is JSON in `packages/content`, validated by a schema. | `pnpm check:content` |
| **I4** | Ledger is append-only. Cash balance is derived by folding transactions, never stored and mutated. | `pnpm test` |
| **I5** | `pnpm sim:run --days 365 --seed 42` completes in Node with no window and no renderer, under 10s. | `pnpm sim:bench` |
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
4. **Cite the workload with the number.** A figure without its workload is not a
   measurement — two parked figures have been corrected for exactly that (G-009's
   scaling reading, G-010's ledger trigger).
5. **A number you cannot re-measure paired is withdrawn, not restated.** If the change
   still stands on an argument that needs no stopwatch, say that instead.

## How many critique rounds

**One by default**, but a goal may only close on a **DRY** report (§7.1, ADR-0013). Every
critic ends with exactly one of:

- **DRY** — "I have no further findings at any severity in this diff."
- **FIXED** — "My findings are resolved; I have not exhausted this diff."

A FIXED close **consumes a round and the critic goes again**. This costs rounds and is
meant to: thirteen goals ran mostly at 1/3 with zero BLOCKERs, and the one goal that ran
to 3/3 produced the best critique in the project.

A second critic from a **different pair** is required in the final round of the **last
goal in a milestone** (G-008's precedent: the second pass found the 107M-penny sweep).
Do not skip the first round — the two times it was nearly skipped, at G-010 and G-016, it
found MAJORs that were defects in the *evidence* rather than the code.

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

## The other ledgers

`DECISIONS.md` settled calls · `JOURNAL.md` what happened, per goal ·
`PARKING.md` deferred, deliberately · `ESCALATIONS.md` open human calls, loop stopped

**Read the digest first.** Each of the four carries a rolling digest at the top under a
fixed heading — schema versions, gate readings, obligations owed by future goals, open
contradictions. Fifteen lines, **rewritten every REFLECT, never appended to** (§4.1). The
append-only history lives beneath it. The four ledgers passed 2,800 lines, and an ADR
amendment has already spent a day filed under the wrong ADR.
