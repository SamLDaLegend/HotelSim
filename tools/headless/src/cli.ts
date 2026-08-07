// Headless CLI runner (I5).
//
//   pnpm sim:run --days 365 --seed 42
//   pnpm --silent sim:run --days 30 --seed 42 --json        (machine-readable summary)
//   pnpm --silent sim:run --ticks 100000 --seed 7 --quiet   (prints only the state hash)
//   pnpm sim:run --days 30 --rooms 5 --arrivals 60          (workload flags for sweeps)
//   pnpm sim:run --days 1 --content ./my-content            (alternative content directory)
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
import { buildSummary, emitReport, parseArgs, schedule } from './report.js';

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Content is loaded and validated BEFORE the world exists. A content file that does
  // not parse therefore exits non-zero having simulated nothing — and, per the
  // contract in report.ts, with an EMPTY stdout, so a consumer never sees half a
  // document. The catch below prints the message alone — ContentError's message is
  // already formatted for a human.
  const content = loadContent(options.contentDir);
  const world = run(
    createWorld(options.seed, content),
    content,
    options.ticks,
    schedule(options.ticks, content, options.rooms, options.arrivalEveryTicks),
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
