// Headless CLI runner (I5).
//
//   pnpm sim:run --days 365 --seed 42
//   pnpm --silent sim:run --days 30 --seed 42 --json        (machine-readable summary)
//   pnpm --silent sim:run --ticks 100000 --seed 7 --quiet   (prints only the state hash)
//   pnpm sim:run --days 30 --rooms 5 --arrivals 60          (workload flags for sweeps)
//   pnpm sim:run --days 30 --seed 7 --build 2880            (the player expands, G-008)
//   pnpm sim:run --days 30 --build 2880 --demolish 5760     (and knocks rooms down again)
//   pnpm sim:run --days 1 --content ./my-content            (alternative content directory)
//   pnpm sim:run --days 1000 --rooms 0 --build 1440 --loan 1440   (from nothing, G-011)
//   pnpm sim:run --days 30 --seed 7 --rooms 6 --record run.ndjson --record-every 10
//                                                           (a run a human can watch, G-017)
//
// `--record <path>` writes one `serialise(world)` per line, sampled every
// `--record-every` ticks (default 1). It is OFF unless a path is given: with no
// `--record` this program takes the same `run()` call it has always taken, so
// `pnpm sim:bench` and I5 are unaffected. Frames are read by tools/viewer, which is
// disposable and is not the renderer.
//
// TWO THINGS TO KNOW BEFORE POINTING IT AT ANYTHING, both measured rather than guessed:
//
//   1. THE FILE SIZE IS QUADRATIC IN RUN LENGTH. Every frame is a whole world and a
//      whole world carries the whole ledger. `--days 30 --rooms 6 --record-every 10` is
//      4,321 frames and 55.7 MB; the SAME SAMPLING AT `--days 365` IS ROUGHLY 8 GB.
//      **Never point --record at the I5 workload.**
//   2. MOST OF IT IS LEDGER THE VIEWER NEVER DRAWS — 19,946 of the final frame's 23,598
//      bytes, 85%. That is the price of emitting frames through the existing save
//      serialiser (ADR-0013 §1), recorded as a cost rather than routed around.
//
// `--rooms` is the hotel the scenario STARTS with, placed free through the structural
// `spawnEntity`. `--build` is the PLAYER acting, through `buildRoom`: it costs the room
// type's construction cost, and an occupied cell, a cell off the plot or an empty wallet
// is a recorded refusal rather than a crash. `--loan` is the player borrowing when it has
// neither cash nor stock (G-011); it is refused and recorded on every tick where the hotel
// does not need it, which is what makes a blind cadence safe. All three default to the
// pre-G-008 behaviour — off — so `pnpm sim:bench` measures the workload it always has.
//
// THE `--silent` ON THE MACHINE-CONSUMED MODES IS LOAD-BEARING: pnpm prints its own
// script banner to stdout before this process starts, and without `--silent` the
// "machine-readable" document is preceded by four lines of pnpm's noise and fails
// JSON.parse. The banner is pnpm's, not this program's — a direct spawn (bench.mjs,
// the determinism gate) never sees it — but the documented path must be the parseable
// one, so it is documented WITH the flag and tested through pnpm itself.
//
// Runs in plain Node with no window and no renderer. This is also the process the
// determinism gate spawns, so its output must be a pure function of its arguments:
// no timestamps, no durations, nothing wall-clock on stdout.
//
// This file is the I/O shell and nothing else: parse, load, run, build, print, exit.
// Every number lives in report.ts, computed once in `buildSummary` and rendered by
// functions that can see only the summary. The consumer contract — exit codes, what
// stdout may contain in each mode — is documented at the top of report.ts.

import { createWorld, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { recordRun } from './record.js';
import { buildSummary, emitReport, parseArgs, schedule } from './report.js';

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Content is loaded and validated BEFORE the world exists. A content file that does
  // not parse therefore exits non-zero having simulated nothing — and, per the
  // contract in report.ts, with an EMPTY stdout, so a consumer never sees half a
  // document. The catch below prints the message alone — ContentError's message is
  // already formatted for a human.
  const content = loadContent(options.contentDir);
  // The world is created BEFORE the schedule so the schedule can be laid out on that
  // world's own plot (`world.grid`). The runner must not emit a build command it can
  // already prove is off the plot, and the only way to know the plot without keeping a
  // second copy of it is to ask the world that will be asked to run the command.
  const initial = createWorld(options.seed, content);
  const commands = schedule(
    options.ticks,
    content,
    initial.grid,
    options.rooms,
    options.arrivalEveryTicks,
    options.buildEveryTicks,
    options.demolishEveryTicks,
    options.loanEveryTicks,
    options.amenities,
    options.facilities,
    options.buyFacilityEveryTicks,
  );
  // RECORDING IS OFF BY DEFAULT AND THIS BRANCH IS THE WHOLE MECHANISM (G-017). With no
  // `--record`, this is the same `run` call, with the same arguments, that shipped before
  // the flag existed — so `pnpm sim:bench` measures what it always measured and I5 does
  // not move. With one, the same simulation runs and frames fall out of it on the way
  // past; the world both branches hand to `buildSummary` is the same world, which is why
  // stdout is byte-identical either way (proved by two spawned processes in
  // record.replay.test.ts, not asserted here).
  const world =
    options.record === undefined
      ? run(initial, content, options.ticks, commands)
      : recordRun(
          initial,
          content,
          options.ticks,
          commands,
          options.record,
          options.recordEveryTicks,
        );
  // Print the report, THEN fail if the run violated an invariant. The ordering — and
  // the fact that the violations are computed from the same summary the renderers
  // print — lives in emitReport, where report.test.ts drives it with forged worlds
  // (ADR-0007: that path is unreachable through a real run today, so it is tested
  // rather than trusted).
  emitReport(buildSummary(world, content, options), options, (chunk) => process.stdout.write(chunk));
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
