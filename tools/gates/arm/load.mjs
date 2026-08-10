// A LOADED REGIME, AS AN INVOCATION RATHER THAN A DESCRIPTION (G-020c).
//
//   node tools/gates/arm/load.mjs --workers 12 -- <command> [args...]
//
// `CLAUDE.md` rule 4's fifth slot is the REGIME, and "loaded" is not a slot until somebody can
// reproduce it. G-020b's loaded readings were taken under "12 busy processes on 12 cores",
// which is a sentence; this is the same thing as a command, so a later reader can re-take the
// reading instead of trusting it.
//
// WHAT IT DOES. Spawns `--workers` busy children, waits until each has confirmed it is
// spinning, runs the command with its stdio inherited, then kills the children and exits with
// the command's own status. Nothing is measured here — the command being wrapped does the
// measuring, and this file only makes the machine busy.
//
// WHY IT WAITS FOR CONFIRMATION rather than sleeping: a fixed sleep is a guess about process
// start-up that is wrong on a busy machine in the direction that matters — the load arriving
// after the measurement has started is a reading labelled "loaded" that was taken quiet.
//
// WHY THE WORKER SPINS ON ARITHMETIC AND NOT ON `while (true) {}`: an empty loop is a
// candidate for elimination and, worse, it never yields, so the confirmation message could not
// be sent. This burns a core and stays schedulable.

import { spawn, spawnSync } from 'node:child_process';
import { cpus } from 'node:os';

const WORKER = [
  '--eval',
  [
    'let x = 0;',
    'process.send?.("spinning");',
    'const spin = () => { for (let i = 0; i < 5e6; i += 1) x = (x + i) % 1e9; setImmediate(spin); };',
    'spin();',
  ].join('\n'),
];

function parseArguments(argv) {
  let workers = cpus().length;
  let i = 0;
  for (; i < argv.length; i += 1) {
    if (argv[i] === '--') {
      i += 1;
      break;
    }
    if (argv[i] === '--workers') {
      workers = Number(argv[i + 1]);
      i += 1;
      continue;
    }
    process.stderr.write(`\nload: unknown option ${argv[i]}\n\n`);
    process.exit(1);
  }
  const command = argv.slice(i);
  if (!Number.isInteger(workers) || workers < 1) {
    process.stderr.write('\nload: --workers takes a positive integer\n\n');
    process.exit(1);
  }
  if (command.length === 0) {
    process.stderr.write('\nload: nothing to run — pass the command after `--`\n\n');
    process.exit(1);
  }
  return { workers, command };
}

const { workers, command } = parseArguments(process.argv.slice(2));

const children = [];
await Promise.all(
  Array.from({ length: workers }, () =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, WORKER, { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      children.push(child);
      child.on('message', () => resolve(undefined));
    }),
  ),
);

process.stderr.write(`load: ${workers} busy processes on ${cpus().length} cores\n`);

/**
 * A SHELL FOR A BARE NAME, AND NEVER FOR A PATH — and getting this backwards made the wrapper
 * useless on the platform it was written on.
 *
 * `pnpm` on win32 is a `.cmd` shim that cannot be executed without a shell; `process.execPath`
 * is `C:\Program Files\nodejs\node.exe`, which a shell-quoted spawn splits at the space. The
 * first version passed no shell at all, so `node load.mjs --workers 12 -- pnpm test` failed
 * silently — the campaign that reversed a standing ruling had an invocation that could not run.
 * `needs-history.mjs` documents the same trap and handles it; this file did not.
 */
const bareName = !command[0].includes('/') && !command[0].includes('\\');

const result = spawnSync(command[0], command.slice(1), {
  stdio: 'inherit',
  shell: bareName,
  env: { ...process.env, NODE_NO_WARNINGS: '1' },
});

for (const child of children) child.kill();

// AND A SPAWN THAT NEVER STARTED IS NOT A RUN. `spawnSync` reports that in `error`, not in
// `status` — `status` is null and the old code turned that into a bare exit 1, indistinguishable
// from the command running and failing. A measurement wrapper that cannot tell "the load ran and
// the command failed" from "the command never started" is the fail-open shape this toolchain
// refuses everywhere else.
if (result.error !== undefined) {
  process.stderr.write(`\nload: ${command[0]} did not start — ${result.error.message}\n\n`);
  process.exit(1);
}
if (result.status === null) {
  process.stderr.write(`\nload: ${command[0]} was terminated by ${result.signal ?? 'an unknown signal'}\n\n`);
  process.exit(1);
}
process.exit(result.status);
