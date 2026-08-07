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

## How work happens

`GOALS.md` is the ledger. **Exactly one goal is `in-progress` at a time.** Exit
criteria are commands, not adjectives.

The loop (§5): SELECT → PLAN → BUILD → CRITIQUE → RESPOND → VERIFY → COMMIT → REFLECT.

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

## The other ledgers

`DECISIONS.md` settled calls · `JOURNAL.md` what happened, per goal ·
`PARKING.md` deferred, deliberately · `ESCALATIONS.md` open human calls, loop stopped
