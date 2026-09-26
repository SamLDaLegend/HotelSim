# DECISIONS

Hard-to-reverse decisions only, one paragraph each. Numbers carry on from the full record in
`archive/DECISIONS-2026-08.md`, which holds the reasoning if you ever need it.

**ADR-0001 — The sim never imports content at runtime.** `packages/sim` may `import type` from
`@hotelsim/content` but content is loaded and validated by the host and injected as plain data.
This keeps the sim at zero runtime dependencies (I1) and makes content swappable in tests.

**ADR-0002 — Money is integer pence.** Never a float, anywhere in the sim. Float money
accumulates differently across platforms and would break determinism (I2).

**ADR-0003 — A snake_case string literal is a content ID.** Content IDs are snake_case; code
identifiers never are. So a snake_case literal in `packages/sim` or `apps/game` is content that
leaked into code, and `check:content` fails on it.

**ADR-0014 — Placeholder art first.** The first playable build uses flat coloured shapes with
clear silhouettes. Real art is a separate track and replaces them without touching the sim.

**ADR-0046 — Isometric floorplan, player-designed rooms.** Theme Hospital / RCT view, multi-floor,
one floor drawn at a time. The player draws a room's footprint and furnishes it item by item;
rooms are scored on what they contain (the Two Point shape). Found by looking at the screen,
which is why the weekly play session exists.

**ADR-0112 — Items get a form, not just a colour.** Brightness alone can separate only about
seven kinds of thing on screen, and the game has more items than that, so items are drawn with
a shape as well as a colour — and drawn where they actually stand in the room. The seven-room-type
limit this created is temporary and lifts with the same work.

**ADR-0113 — The process is cut to hobby size (Sam, 2026-09-26).** Accepting an outside review
that the loop was built to never be wrong about the simulation and nothing in it measured fun:
226 commits and 132 ADRs in 24 days, 66% of sim lines comments, and no trouble, staff, goal or
price lever in the game. From now on: the only milestone is *a stranger enjoys 20 minutes*; a
game goal is done when `pnpm verify` is green and the change is played and captured on screen;
tuning numbers are round guesses, then played; one builder and one read-only reviewer replace
eight roles; `check:scaling`, `check:stamp` and `check:unpinned` are removed; the ledgers move
to `archive/`; a weekly 15-minute play session replaces escalations, and between sessions the
loop takes the reversible option and notes it. **Trouble comes before the stranger playtest**,
superseding the 28 August ruling that decay would wait until after it: a stranger's first
session is spent once, and spending it on a hotel where nothing goes wrong teaches nothing new.
