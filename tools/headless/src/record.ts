// G-017 — RECORDING A RUN SO A HUMAN CAN WATCH IT.
//
// A recording is NDJSON and nothing else: every line is exactly one `serialise(world)`,
// a v7 `SaveBlob`, written through the EXISTING save serialiser (ADR-0013 §1). There is
// no header, no manifest, no index and no second file. Each world carries its own
// `tick`, so the viewer needs nothing the frames do not already contain, and "the frame
// stream is nothing but save blobs" stays literally true rather than nearly true.
//
// (`serialise` is `JSON.stringify` of one object, which never emits a raw newline — a
// string containing one is escaped as \n — so one frame is one line by construction.)
//
// WHY THIS CHUNKS `run()` INSTEAD OF TAKING A CALLBACK. A per-tick observer hook would
// be a change to `packages/sim`, and G-017 may not make one. So the recorder calls the
// SHIPPED tick loop `recordEvery` ticks at a time and serialises between calls. Nothing
// here is a copy of the tick loop; if it were, the recording could drift from the
// simulation while every test still passed.
//
// THE ONE THING CHUNKING CHANGES, AND WHY IT IS INERT. `run` creates a `ValidityCache`
// per call and drops it at the end, so chunking gives the derived-placement index a
// shorter life. G-010 built that cache to change nothing but cost, and
// `cache.determinism.test.ts` already holds it to that over 40,000 ticks of the real
// determinism log. `record.replay.test.ts` re-proves it for THIS path in the strongest
// form available: the last frame must hash identically to the same run made in one
// unchunked `run()` call, and on a short run EVERY frame must hash identically to the
// same world reached by stepping tick by tick. A frame stream that has silently diverged
// from the simulation would show a plausible hotel that is not the hotel that ran, which
// is worse than no viewer at all.
//
// It is slower than `run()` — deliberately, and it does not matter. Recording is off
// unless a path is given, `pnpm sim:bench` never gives one, and I5 measures the
// unrecorded path.

import { closeSync, openSync, writeSync } from 'node:fs';
import { run, serialise } from '@hotelsim/sim';
import type { BoundContent, ScheduledCommand, World } from '@hotelsim/sim';

/**
 * Run `ticks` ticks, writing a frame every `everyTicks`, and return the final world.
 *
 * The return value is the SAME world an unrecorded `run(initial, content, ticks,
 * schedule)` returns, which is what makes `--record` observationally invisible to the
 * report printed afterwards.
 *
 * FRAME 0 IS THE WORLD BEFORE TICK 0, and the LAST LINE IS ALWAYS THE FINAL WORLD
 * whatever the interval, because the final chunk is clamped to what is left rather than
 * overrunning. Both halves matter: the first is the only frame showing the hotel as it
 * was seeded, and the second is what the final-state-hash exit criterion binds to.
 *
 * Synchronous writes on purpose. A stream would need backpressure handling to write 55 MB
 * without buffering the lot in memory, and this is a disposable instrument that runs
 * from a CLI — `writeSync` has neither problem and needs no lifecycle.
 *
 * The whole schedule goes to every chunk. `run` buckets it by ABSOLUTE tick and looks up
 * `world.tick`, so a chunk starting at tick 3,000 finds exactly the commands scheduled
 * for the ticks it runs. Re-bucketing per chunk is O(chunks x commands) and immaterial
 * beside serialising a world.
 */
export function recordRun(
  initial: World,
  content: BoundContent,
  ticks: number,
  schedule: readonly ScheduledCommand[],
  path: string,
  everyTicks: number,
): World {
  if (!Number.isInteger(everyTicks) || everyTicks < 1) {
    throw new Error(`recordRun: everyTicks must be a positive integer, got ${everyTicks}`);
  }
  const fd = openSync(path, 'w');
  try {
    let world = initial;
    writeSync(fd, `${serialise(world)}\n`);
    let done = 0;
    while (done < ticks) {
      const chunk = Math.min(everyTicks, ticks - done);
      world = run(world, content, chunk, schedule);
      done += chunk;
      writeSync(fd, `${serialise(world)}\n`);
    }
    return world;
  } finally {
    // A recording of a run that threw halfway is still a recording of everything up to
    // the throw, and is worth more than a zero-length file.
    closeSync(fd);
  }
}
