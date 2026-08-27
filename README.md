# HotelSim

A casual, cartoon-styled hotel building and management sim. **Isometric floorplan view**
(Theme Hospital / RollerCoaster Tycoon) — multi-floor, **one floor drawn at a time**, floors
switchable. *(Ruled 2026-08-16, ADR-0046: this line read "side-on cross-section, not
isometric" from before the first line of code until goal 33.)*

`HOTELSIM.md` is the source of truth for how this project is built and what may not change.
`CLAUDE.md` is the short form. This file is the commands.

## Run it

```bash
pnpm install
pnpm dev            # opens the game in a browser: http://localhost:5180
```

`pnpm dev` starts Vite on `apps/game` and opens a window showing the shipped hotel running
in real time. **Placeholder art** — flat coloured isometric prisms with clear silhouettes
(ADR-0014, ADR-0046 §6); real art is a separate track and nothing waits on it.

**Tiles are 2:1, 128x64 logical, authored at 2x** (ADR-0047 A2 — locked). **Wall height is
64px and is PROVISIONAL**: the derivation is sound, but wall height is a *perceptual*
property and ADR-0013 says a perceptual criterion needs a perceptual check. It ships to be
looked at (ADR-0047 amendment §1, human ruling).

What you can do in it today (G-031a, rebuilt in isometric at G-035): **watch, choose a
speed, switch floors, and build.** The transport strip carries one button per rung of the
play-speed ladder, labelled by content, plus pause (`space`).

**Only one floor is drawn at a time.** Guests on other floors are not on screen, so the
floor strip carries a per-floor guest count and the HUD says how many are elsewhere — a
state the simulation can reach must be a state the UI can express.

### Recording a run

```bash
pnpm --filter @hotelsim/game record -- --ticks 2880 --every 480 --out ./recording
```

Steps the shipped scenario headlessly, builds **the same frames the browser builds**
(`view/scene.ts` returns primitives; `view/paint.ts` draws them with Pixi and
`scripts/svg.ts` draws them as SVG), and writes one `.svg` per floor per sampled tick plus a
`contact-sheet.html`. **It is off by default, on nobody's path, and no gate runs it.** It is
not a viewer and must not grow into one — the browser is the viewer.

### Playing

| | |
|---|---|
| pick a room from the **build** strip | one button per room type the content defines, with what it costs |
| click a cell | queues a `buildRoom` there — including a bad cell, on purpose |
| **demolish**, then click a room | queues a `demolishRoom` and refunds part of what it cost |
| `Escape`, or **none** | put the tool down. No tool is held at start, so a stray click does nothing |
| **export session** | downloads the seed, the command log and the state hash |
| the **floor** strip, or the up/down arrows | switches which floor is drawn. The number beside a floor is how many guests are standing on it |

**Every player action is one of the simulation's existing commands**, and the speed control
is deliberately not among them: changing speed changes how many ticks are run, never what a
tick does, and it never enters the command log.

**A click is spent by the next tick, not immediately.** A queued command is drawn as a
numbered blue ghost on its cell, so at pause — where no tick runs — you can see the moves
standing in line. One build or demolish is spent per tick, in the order you clicked.

**The game does not stop you making a bad move, and this is the point.** Build in mid-air,
seal a room between its neighbours, or spend down to nothing: nothing is greyed out and
nothing is silently corrected, because the rule about what is legal belongs to the
simulation. Note that building **above** the hotel is a legal move on a plot that runs to
floor 20 — it gets you a real room holding nothing up, not a refusal. The two places that
are genuinely off the plot are the **left gutter** and the strip **below the basement**. What comes back is a **recorded refusal** — the cell flashes red with the
reason, the `last` field in the HUD says which move and where, and the `refused` tally
counts every one by reason for the whole session. A green flash means the simulation took
the move.

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
| a blue outline under the pointer | where your next click lands, and what it will ask for. It is recomputed every frame against the same view the click resolves against, so it follows the picture when your own building changes it |
| a numbered blue cell | a command you have clicked and the simulation has not been given yet — the number is its place in the queue |
| a green outline and a word | the simulation took that move |
| a red outline and a word | the simulation refused it, and the word is its own reason |

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
pnpm verify         # every §2 invariant gate and check, fourteen rows
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
| — | `check:unpinned` | no claim in the tree quotes a figure nothing pins |

**Never edit a gate to make a build pass.** Changing an invariant is a human decision (§9).

## The rest

```bash
pnpm sim:run --days 30 --seed 7 --rooms 6      # headless, prints a report
pnpm sim:run --days 30 --seed 7 --rooms 6 --demand   # the HOTEL earns its guests (G-051b)
pnpm sim:run --days 30 --seed 7 --rooms 6 --record run.ndjson --record-every 10
pnpm viewer                                     # watch a recording (tools/viewer, disposable)
pnpm --filter @hotelsim/game build              # bundle the render layer, as CI does
```

**`--arrivals` is a CLAMP, not the world, and it is the DEFAULT.** Without `--demand` the host
issues one arrival every `--arrivals` ticks and the simulation is handed no demand curve, which is
what every measured arm in this repository is defined by — a clamped run is byte-identical to the run
it was before demand existed. **`--demand` hands the decision to the hotel**: `runDemand` derives its
star rating and puts the parties that rating earns in the lobby, which is what `apps/game` does
unconditionally. The two flags are refused together, because a run with both sources firing is a
measurement of neither.

## Layout

```
packages/sim       headless simulation. Zero runtime deps. No DOM types in tsconfig.
packages/content   JSON definitions + Zod schemas.
apps/game          Pixi.js render layer and UI.
tools/headless     CLI runner, determinism harness.
tools/gates        the invariant gates. Plain Node ESM, no build step.
tools/viewer       disposable replay viewer. Not the renderer, not a deliverable.
```
