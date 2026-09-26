# CLAUDE.md — HotelSim

**What we're making, and the one milestone: `HOTELSIM.md`. What to do now: `GOALS.md`.**
Everything else from before September 2026 is in `archive/`; don't read it by default.

## The six invariants — `pnpm verify` runs them (11 rows)

| | Invariant | Gate |
|---|---|---|
| I1 | `packages/sim` imports no render layer, DOM, engine, filesystem or network. Zero runtime deps. | `pnpm check:purity` |
| I2 | Same seed + same commands ⇒ byte-identical state hash after 100k ticks, every platform. No `Math.random`, `Date.now`, or Set/Map iteration-order dependence in the sim. | `pnpm test:determinism` |
| I3 | Room types, items, staff roles and guest archetypes are JSON in `packages/content`, never code. | `pnpm check:content` |
| I4 | The ledger is append-only; cash is a fold over transactions. | `pnpm test` |
| I5 | `pnpm sim:run --days 365 --seed 42` runs headless inside its budget (389,333ms). | `pnpm sim:bench` |
| I6 | Save → load → re-hash is identical; saves are versioned and migrate. | `pnpm test:save` |

The other rows are `typecheck`, the tick-cost tripwire (`check:tickcost` and its proof), the
instrument check (`check:measure`) and `check:ladder`. CI runs `pnpm verify` on Linux, Windows
and macOS.

**Never edit a gate to make a build pass.** If an invariant can't be met, say so to Sam.

## Layout and commands

```
packages/sim       headless simulation, zero runtime deps
packages/content   JSON content + Zod schemas
apps/game          Pixi.js isometric renderer and UI
tools/headless     CLI runner, reports, most tests
tools/gates        the gates (plain Node ESM)
tools/viewer       replay viewer for recorded runs
```

`pnpm dev` (game at http://localhost:5180) · `pnpm verify` · `pnpm test` ·
`pnpm sim:run --days 30 --seed 42` · `pnpm --filter @hotelsim/game record -- --ticks 2880 --every 480 --out ./recording` (SVG frames of a run) · `pnpm viewer`

TypeScript strict. Content is injected into the sim, never value-imported. Money is integer
pence. A snake_case string literal is a content ID and must not appear in `packages/sim` or
`apps/game`.

## Working rules

- One goal in progress at a time, from `GOALS.md`. Update it when a goal lands.
- **Done** means `pnpm verify` green **and** the change seen on screen: play it and capture a
  screenshot, or a short clip when it happens over time.
- New behaviour gets a test. Tuning numbers are round guesses, then played — no derivations.
- Comments: a one-line why where the code can't say it. No goal numbers, no history.
- ADRs only for hard-to-reverse decisions, one paragraph, in `DECISIONS.md`.
- Don't stop to ask Sam between weekly play sessions: take the reversible option and note it
  under **Notes for Sam** in `GOALS.md`.

## Two recipes that saved real work

- **Reverting an experiment:** `git stash push -u -m probe`, mutate, check, `git stash pop`.
  Never `git checkout --` on work that isn't committed — it's unrecoverable.
- **Regex in a template literal:** `` `(?<![\w$])${x}` `` loses its backslash and becomes
  `(?<![w$])`. Write `\\w`, or build the pattern from a normal string.

## Measuring performance

Compare two builds in one sitting, interleaved, medians of five or more. Quote the **ratio**,
not the absolute, and say what machine and load it was taken on.
