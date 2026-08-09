# Replay viewer (G-017)

Record a run, then watch it:

    pnpm sim:run --days 30 --seed 7 --rooms 6 --record run.ndjson --record-every 10
    pnpm viewer            # then open http://127.0.0.1:8171/ and pick run.ndjson

Sizes are quadratic in run length: the above is 4,321 frames and 55.7 MB. Never point
`--record` at the I5 workload — `--days 365` at the same sampling is roughly 8 GB.

**Delete this directory rather than defend it** (`HOTELSIM.md` §9). Removing
`tools/viewer/`, the `viewer` script in `package.json`, `tools/headless/src/record.ts`,
its two tests and the `--record` flag removes all of it.
