# Replay viewer (G-017)

Record a run, then watch it:

    pnpm sim:run --days 30 --seed 7 --rooms 6 --record run.ndjson
    pnpm viewer            # then open http://127.0.0.1:8171/ and pick run.ndjson

**DO NOT PASS `--record-every N` WHEN YOU ARE WATCHING MOVEMENT.** The default is 1 and that
is the only value that samples every tick. `guestCellsPerTick` is **3**, so `--record-every N`
shows a guest **up to `3N` cells further along** than the frame before: at the `10` this example
used to carry, **thirty cells of travel between frames.** A guest that walked a corridor appears
once at each end and never in it.

> **That is UNDERSAMPLING, not the simulation, and not the renderer.** It is the first of three
> distinct causes of "guests teleport" (ADR-0095); the other two are render interpolation
> (G-047) and the fact that **a tick genuinely moves up to three cells by design** — see
> `guests.ts`, *"why the choice is over landings and not over every cell crossed"*.

`--record-every N` is for LONG runs where the subject is a trend and not a walk. **Say which
you are doing when you quote a frame.**

Sizes are quadratic in run length: the above is 4,321 frames and 55.7 MB. Never point
`--record` at the I5 workload — `--days 365` at the same sampling is roughly 8 GB.

**Delete this directory rather than defend it** (`HOTELSIM.md` §9). Removing
`tools/viewer/`, the `viewer` script in `package.json`, `tools/headless/src/record.ts`,
its two tests and the `--record` flag removes all of it.
