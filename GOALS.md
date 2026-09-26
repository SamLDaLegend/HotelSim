# GOALS

The milestone: **a stranger enjoys 20 minutes** (`HOTELSIM.md`). Every game goal is done when
`pnpm verify` is green and the change has been played and captured on screen.

## Now

**G-079 — Dirty rooms and housekeepers.** A checkout leaves the room dirty and a dirty room
can't be let. A housekeeper walks there and cleans it. Guests who wait for a room say so.
Dirty is one more reason a room serves nobody, so it reuses validity, paths and remarks. Start
with a fixed housekeeper; hiring comes next.

## Next

**G-080 — Staff panel.** Hire and fire, wages shown in the HUD. Too few housekeepers and dirty
rooms pile up — you can watch it happen.

**G-081 — Breakdowns and handymen.** Items wear with use and break (TV, minibar, lift). A broken
item stops serving and hurts reviews until a handyman fixes it.

**G-082 — A level with an ending.** Start from a near-empty building. A target in the HUD (e.g.
3 stars and £25,000 by day 30), a win screen, and a lose condition (bankrupt, or one star for a
week). The old ruling that bankruptcy is survivable is superseded for this level.

**G-083 — Room rate lever.** One price control. Demand reads price against stars, so pricing
above your stars loses guests.

## Then

Finish room scoring (size and decor give quality; quality feeds stars and what a room can
charge). Give Spa, Theatre and Conference Hall a real job or leave them out of the first level.
Cap items per cell before players find the stacking exploit. Then the stranger playtest — the
protocol, replay and session export are already built.

In parallel, whenever there's a spare half-day: **art spike** — one bedroom, one bed and one
guest from MagicaVoxel, drawn by the real renderer at 128×64.

## Done

**G-078 — Process cut to hobby size** (2026-09-26). Ledgers archived, docs a page each, two
agents, 11 verify rows, sim comments 17,684 → 3,879 lines with no code changed.

## Later

Multi-floor polish · lift tuning · performance campaigns · reputation beyond the star rating ·
guest archetypes · sound and music.

## Notes for Sam

Decisions taken between play sessions go here, one line each, so you can overturn them.

- 2026-09-26: dropped `stash@{0}` — an accidental duplicate of `guestAccessTo` in `validity.ts`
  that would not have compiled. Patch kept outside the repo.
- 2026-09-26: `pnpm test` now takes about 5½ minutes (3,246 tests) and is the slowest part of
  every goal. Not acting on it yet; say if you want it trimmed.
