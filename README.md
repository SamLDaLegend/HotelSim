# HotelSim

A casual, cartoon-styled hotel building and management sim. **Side-on cross-section** view
(SimTower / Project Highrise), not isometric.

`HOTELSIM.md` is the source of truth for how this project is built and what may not change.
`CLAUDE.md` is the short form. This file is the commands.

## Run it

```bash
pnpm install
pnpm dev            # opens the game in a browser: http://localhost:5180
```

`pnpm dev` starts Vite on `apps/game` and opens a window showing the shipped hotel running
in real time. **Placeholder art** — flat coloured rectangles with clear silhouettes
(ADR-0014); real art is a separate track and nothing waits on it.

What you can do in it today (G-030): **watch, and choose a speed.** The transport strip
carries one button per rung of the play-speed ladder, labelled by content, plus pause
(`space`). Building, demolishing and every other player action is G-031 — this build reads
simulation state and dispatches nothing.

Reading the screen:

| what you see | what it means |
|---|---|
| alternating bands, numbered in the left gutter | floors. Warm dark tones are below street level, cool dark tones above |
| a heavy ochre line marked `street` | ground level, floor 0's ceiling |
| a pale outline around the whole building | the extent of what is built |
| a filled cell with a badge | a room. The badge is the room type's initials and the room's entity id |
| an ochre outline on one cell | the entrance — where a guest with no room stands |
| red hatching and a word on a room | the room is invalid and the word says why. It cost money, costs upkeep and serves nobody |
| white pips in a room | one per guest who has that room, whether or not they are standing in it |
| small squares on dark plates | items — the bed, the chair, the vending machine |
| a filled guest | has a bed |
| a hollow guest | has no bed |
| guest colour | what it is doing: the need being served, the lodging colour while resting, grey while idle |
| the row of columns above a guest | **one per need it carries**, in the same order for every guest. Column height is patience left, so a contented guest is a level row and a struggling one is ragged |
| a white outline on one column | the guest's **most urgent** unmet need — what to look at first |
| a red column | that need is nearly out of patience, or has run out |
| a white cap on a column | that need is met |
| a red box round a guest | a need has run out of patience |
| magenta anything | the loaded content does not define it — loud on purpose, never quiet. No room, item or need is ever drawn magenta |

**Colours are computed, not chosen.** Each of rooms, items and needs gets its own ladder of
luminances spread across the range where everything still clears 3:1 against the page, so any
two rooms differ in brightness and not only in hue — which is what makes them tell apart at
cell size, in a photograph, and for a colour-blind viewer.
`tools/headless/src/palette.contrast.test.ts` asserts it over the shipped content.

A guest whose body is in the basement café while a bedroom upstairs shows its occupancy pip
is **not a drawing bug**. Rest is served by *holding* a room rather than by standing in it,
and that is the behaviour ADR-0017 changes. The renderer shows both halves deliberately.

## The gates

```bash
pnpm verify         # every §2 invariant gate and check, thirteen rows
```

| | check | what it holds |
|---|---|---|
| — | `typecheck` | strict TypeScript across the workspace |
| I1 | `check:purity` | the sim imports no render layer, DOM, engine, filesystem or network |
| I3 | `check:content` | no content defined in code |
| I4 | `test` | unit tests, including the append-only ledger fold |
| I2 | `test:determinism` | same seed + log ⇒ identical hash after 100,000 ticks |
| I6 | `test:save` | serialise → deserialise → re-hash is identical |
| I5 | `sim:bench` | 365 days headless, inside the derived budget (§2.1.2) |
| — | `check:measure` | the tick-cost instrument's own proofs |
| — | `check:tickcost` | tick cost against the previous commit, inside a derived bound |
| — | `check:tickcost:proof` | the tripwire, watched going red under two mutations |
| — | `check:scaling` | rooms, needs and provider density scale as claimed |
| — | `check:stamp` | the four ledger digests carry one byte-identical as-of line |
| — | `check:ladder` | no render code computes one play speed from another (§2.1.1) |

**Never edit a gate to make a build pass.** Changing an invariant is a human decision (§9).

## The rest

```bash
pnpm sim:run --days 30 --seed 7 --rooms 6      # headless, prints a report
pnpm sim:run --days 30 --seed 7 --rooms 6 --record run.ndjson --record-every 10
pnpm viewer                                     # watch a recording (tools/viewer, disposable)
pnpm --filter @hotelsim/game build              # bundle the render layer, as CI does
```

## Layout

```
packages/sim       headless simulation. Zero runtime deps. No DOM types in tsconfig.
packages/content   JSON definitions + Zod schemas.
apps/game          Pixi.js render layer and UI.
tools/headless     CLI runner, determinism harness.
tools/gates        the invariant gates. Plain Node ESM, no build step.
tools/viewer       disposable replay viewer. Not the renderer, not a deliverable.
```
