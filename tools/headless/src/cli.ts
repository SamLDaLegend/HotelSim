// Headless CLI runner (I5).
//
//   pnpm sim:run --days 365 --seed 42
//   pnpm sim:run --ticks 100000 --seed 7 --quiet   (prints only the state hash)
//
// Runs in plain Node with no window and no renderer. This is also the process the
// determinism gate spawns, so its output must be a pure function of its arguments:
// no timestamps, no durations, nothing wall-clock on stdout.

import { createWorld, dayOf, entityCount, hashState, run, TICKS_PER_DAY } from '@hotelsim/sim';
import type { BoundContent, World } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';

type Options = {
  readonly seed: number;
  readonly ticks: number;
  readonly quiet: boolean;
};

function parseArgs(argv: readonly string[]): Options {
  let seed = 42;
  let ticks: number | undefined;
  let quiet = false;

  const requireNumber = (flag: string, raw: string | undefined): number => {
    if (raw === undefined) throw new Error(`${flag} requires a value`);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${flag} requires a non-negative integer, got "${raw}"`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    switch (flag) {
      case '--seed':
        seed = requireNumber('--seed', argv[i + 1]);
        i += 1;
        break;
      case '--days':
        ticks = requireNumber('--days', argv[i + 1]) * TICKS_PER_DAY;
        i += 1;
        break;
      case '--ticks':
        ticks = requireNumber('--ticks', argv[i + 1]);
        i += 1;
        break;
      case '--quiet':
        quiet = true;
        break;
      default:
        throw new Error(`Unknown argument "${String(flag)}"`);
    }
  }

  if (ticks === undefined) throw new Error('Pass either --days or --ticks');
  return { seed, ticks, quiet };
}

function report(world: World, content: BoundContent, options: Options): string {
  if (options.quiet) return hashState(world);
  return [
    `seed        ${options.seed}`,
    `ticks       ${world.tick}`,
    `days        ${dayOf(world)}`,
    `room types  ${content.content.roomTypes.length}`,
    `entities    ${entityCount(world.entities)}`,
    `ledger      ${world.ledger.length} transactions`,
    `state hash  ${hashState(world)}`,
  ].join('\n');
}

function main(): void {
  const options = parseArgs(process.argv.slice(2));
  // Content is loaded and validated BEFORE the world exists. A content file that does
  // not parse therefore exits non-zero having simulated nothing, rather than starting
  // a run against a half-loaded registry. The catch below prints the message alone —
  // ContentError's message is already formatted for a human.
  const content = loadContent();
  const world = run(createWorld(options.seed, content), content, options.ticks);
  process.stdout.write(`${report(world, content, options)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
