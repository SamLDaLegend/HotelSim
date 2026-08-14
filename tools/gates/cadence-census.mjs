// THE CADENCE CENSUS — WHICH OF THIS REPOSITORY'S READINGS ARE CLAIMS ABOUT A CADENCE (G-032a).
//
//   node tools/gates/cadence-census.mjs --delta +1
//   node tools/gates/cadence-census.mjs --delta -1 --json
//
// NOT A GATE. It renders no verdict about the build, it is not in `pnpm verify`, and it has no
// bound — the same standing as `needs-history.mjs`. It costs a full `pnpm test` run per arm, so
// making it a per-commit row would double I4's gate to re-derive a number that moves only when
// somebody adds a reading. `tools/headless/src/cadence.census.test.ts` holds the RESULT and
// checks the things that can be checked in milliseconds; this is what regenerates it.
//
// ---------------------------------------------------------------------------------------------
// WHY A PERTURBATION AND NOT A GREP (ADR-0024).
//
// The question is "which live readings are claims about a cadence rather than about a hotel", and
// that is a CLASS. Sweeping finds instances and hides the size; only an enumeration produces a
// number that can be driven anywhere. **A grep cannot answer it at all**: the files that MENTION a
// cadence and the readings that would MOVE if the cadence did are different populations, and no
// spelling of the search distinguishes them.
//
// (A figure stood here for how many files a grep returns. It was unsourceable — no spelling of
// the search reproduced it — **in the paragraph arguing that counts must be sourceable.** Removed
// rather than re-derived: the argument never needed it, and the honest version is that a mention
// is not a dependency.)
//
// So the needle is derived from the change itself, and it is ONE LINE: every consumer of
// `schedule()` reaches its cadence through `report.ts`'s arrival loop. Perturbing that reaches
// the CLI, the scaling harness, the concurrency pin and every report test — INCLUDING the tests
// that pass their own `--arrivals` literal, which a perturbation of `ARRIVAL_EVERY_TICKS` would
// miss entirely. One line, whole surface.
//
// ---------------------------------------------------------------------------------------------
// THE TREE IS MUTATED IN PLACE AND RESTORED UNDER A sha256, AND THAT IS THE RECIPE'S STATED
// FALLBACK RATHER THAN A SHORTCUT.
//
// `CLAUDE.md` prefers copying to a scratch directory over mutating the repository at all, and
// ADR-0022 requires a comparison ARM to be materialised rather than stashed. Neither is available
// here: a full-suite arm needs `node_modules`, and pnpm's workspace links are ABSOLUTE — a copied
// tree would resolve `@hotelsim/sim` back into this one and quietly measure the unperturbed
// simulation. So the recipe's third option is used, in full: capture the hash first, restore in a
// `finally`, and REFUSE to report if the restore did not reproduce it byte for byte.
//
// **NEVER `git checkout --`** — it is unrecoverable, and four agents have reached for it.
// **NEVER `git worktree remove` over a junction** — it recurses into the shared pnpm store.
// ---------------------------------------------------------------------------------------------

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SUBJECT = join(ROOT, 'tools/headless/src/report.ts');

/**
 * THE ANCHOR — the single line every scheduled arrival passes through.
 *
 * Exported so `cadence.census.test.ts` can assert it is still IN the tree without running
 * anything: if this loop is rewritten, the census's command stops being runnable and the recorded
 * count stops describing anything. A recorded number whose procedure no longer executes is the
 * failure mode this whole file exists to avoid, so it reddens by name in milliseconds.
 */
export const ARRIVAL_LOOP = '  for (let tick = 1; tick < ticks; tick += arrivalEveryTicks) {';

/**
 * The perturbed spelling, DERIVED FROM `ARRIVAL_LOOP` rather than retyped (sweep 3).
 *
 * It was a second full copy of the line, in a file whose docblock says the anchor is read out of
 * one place — and the refusal above told a maintainer to "re-point ARRIVAL_LOOP", which would
 * have left this copy writing the OLD line while the guard checked the NEW one: the census would
 * perturb a line that no longer exists and report a clean tree. Three retyped copies of one
 * string, under a sentence claiming there was one.
 *
 * The replacement keeps BOTH closing parens — `arrivalEveryTicks)` becomes
 * `arrivalEveryTicks + (delta))` — which is the sort of detail a hand-written second copy gets
 * right and a derived one gets wrong. It is checked against the shipped line rather than trusted:
 * see `cadence.census.test.ts`, which reconstructs it and asserts the file contains it.
 */
const perturbed = (delta) => ARRIVAL_LOOP.replace('arrivalEveryTicks)', `arrivalEveryTicks + (${delta}))`);

function parseArguments(argv) {
  const options = { delta: '+1', json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--delta') {
      options.delta = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--json') {
      options.json = true;
    } else {
      process.stderr.write(`\ncadence-census: unknown option ${argv[i]}\n\n`);
      process.exit(2);
    }
  }
  if (!/^[+-]\d+$/.test(options.delta ?? '')) {
    process.stderr.write('\ncadence-census: --delta takes a signed integer, e.g. +1 or -1\n\n');
    process.exit(2);
  }
  return options;
}

const options = parseArguments(process.argv.slice(2));

const before = readFileSync(SUBJECT);
const beforeHash = createHash('sha256').update(before).digest('hex');
const text = before.toString('utf8');

if (!text.includes(ARRIVAL_LOOP)) {
  process.stderr.write(
    '\ncadence-census: the arrival loop this census perturbs is not in report.ts.\n' +
      '  The subject moved. Re-point ARRIVAL_LOOP at it and nothing else — `perturbed()` derives\n' +
      '  from it — and do NOT relax the match: a perturbation that lands nowhere reports a clean\n' +
      '  tree and looks like good news.\n\n',
  );
  process.exit(1);
}
// A second occurrence would mean the perturbation lands on one of two loops and the census
// silently measures half of what it claims.
if (text.split(ARRIVAL_LOOP).length !== 2) {
  process.stderr.write('\ncadence-census: the arrival loop appears more than once in report.ts\n\n');
  process.exit(1);
}

/**
 * RESTORE ON A SIGNAL, NOT ONLY ON AN EXCEPTION (sweep 2).
 *
 * `finally` covers a throw and a normal exit. It does NOT cover SIGINT — and this is a
 * two-and-a-half-minute FOREGROUND run that prints nothing until it finishes, which makes it the
 * likeliest Ctrl-C in the repository. Interrupted without this, the tree is left holding a
 * perturbed simulation, every subsequent test is measuring the wrong hotel, and the only clue is
 * a one-character diff in a loop header.
 *
 * Registered BEFORE the file is written, so the window in which the handler does not yet exist
 * is a window in which there is nothing to undo.
 */
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  writeFileSync(SUBJECT, before);
};
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(signal, () => {
    restore();
    process.stderr.write(`\ncadence-census: ${signal} — report.ts restored before exiting.\n\n`);
    process.exit(130);
  });
}

let output = '';
try {
  writeFileSync(SUBJECT, text.replace(ARRIVAL_LOOP, perturbed(options.delta)));
  const run = spawnSync('pnpm test', {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
} finally {
  restore();
  const afterHash = createHash('sha256').update(readFileSync(SUBJECT)).digest('hex');
  if (afterHash !== beforeHash) {
    // Louder than a failed census: the tree is not as it was found.
    process.stderr.write(
      `\ncadence-census: THE RESTORE DID NOT REPRODUCE THE FILE.\n  before ${beforeHash}\n  after  ${afterHash}\n` +
        `  ${SUBJECT} must be repaired by hand before anything else is run.\n\n`,
    );
    process.exit(1);
  }
}

/**
 * THE SHAPE OF THE ASSERTION THAT FAILED, READ OFF THE RUN RATHER THAN JUDGED BY A READER.
 *
 * The split that matters is not how many readings moved — it is **which of them were PROPERTIES**.
 * A pinned literal going red at ±1 tick says "this number is a claim about a cadence", which is
 * the census's subject and is expected. An INEQUALITY going red says something much worse: a
 * property this project relies on — monotone in room count, this need gets worse when you add an
 * amenity — **reverses** one arrival tick away.
 *
 * Classifying that by hand is an opinion. Classifying it by the matcher vitest reports is a fact,
 * and it is why the census reports the two counts separately: a reader who sees one number will
 * assume they are all numbers.
 *
 * IT READS THE ASSERTION MESSAGE AND NOTHING ELSE, WHICH IS A CORRECTION. The first version
 * tested the whole failure BLOCK, and a block includes vitest's CODE FRAME — the surrounding
 * source lines. So an equality failure inside an `it()` that happened to contain a
 * `toBeGreaterThan` on a neighbouring line was classified as a property, and the count came back
 * 12 instead of 6. **A scanner that reads more than it means to is this repository's own defect
 * class**, and it arrived here in the file built to hunt a class. The message is the one string
 * vitest emits for the matcher that ACTUALLY failed.
 */
const PROPERTY_MATCHER = /\bto be (?:greater|less) than\b|\bto be (?:true|false)\b/;

// The failing TEST lines, not the file summaries: `FAIL <file> > <describe> > <it>`, plus the
// assertion text that follows each one, up to the next failure banner.
const blocks = output.split(/^\s*FAIL\s+/m).slice(1);
const failures = [];
for (const block of blocks) {
  const header = /^(\S+\.test\.ts) > (.+)$/m.exec(block);
  if (header === null) continue;
  const body = block.slice(0, 2_000);
  const assertion = /(?:AssertionError|Error):\s*(.+)/.exec(body);
  // ==========================================================================================
  // MATCH FIRST, TRUNCATE ONLY FOR DISPLAY — SWEEP 2, AND IT UNDERCOUNTED THE HEADLINE FINDING.
  //
  // The classifier used to test the message AFTER slicing it to 160 characters. This project
  // writes long custom failure messages (`expect(x, 'three sentences about why')`), and vitest
  // prints the message BEFORE the matcher phrase — so `to be greater than` fell off the end of
  // the slice and a reversed inequality was silently counted as a moved reading. **The census's
  // one headline number was the one this could only ever understate.**
  //
  // The full message decides the shape; the slice exists so a JSON document stays readable.
  // ==========================================================================================
  const message = (assertion?.[1] ?? '(no assertion line)').trim();
  failures.push({
    file: header[1].replace(/\\/g, '/'),
    title: header[2].trim(),
    shape: PROPERTY_MATCHER.test(message) ? 'property' : 'reading',
    assertion: message.slice(0, 160),
  });
}
const files = [...new Set(failures.map((f) => f.file))].sort();
const summary = /Test Files\s+(.*)\r?\n\s*Tests\s+(.*)/.exec(output);

const census = {
  delta: options.delta,
  restored: beforeHash,
  files: files.length,
  tests: failures.length,
  summary: summary === null ? '(no summary line)' : `${summary[1].trim()} | ${summary[2].trim()}`,
  properties: failures.filter((f) => f.shape === 'property').length,
  byFile: Object.fromEntries(files.map((file) => [file, failures.filter((f) => f.file === file).length])),
  titles: failures.map((f) => `${f.file} > ${f.title}`).sort(),
  // THE PROPERTY-SHAPED ONES IN FULL, with the assertion that reversed. These are the census's
  // finding; the rest of `titles` is its size.
  propertyFailures: failures
    .filter((f) => f.shape === 'property')
    .map((f) => ({ file: f.file, title: f.title, assertion: f.assertion }))
    .sort((a, b) => (`${a.file}${a.title}` < `${b.file}${b.title}` ? -1 : 1)),
};

if (options.json) {
  process.stdout.write(`${JSON.stringify(census, null, 2)}\n`);
} else {
  process.stdout.write(`\n  cadence census — report.ts arrival loop, delta ${options.delta}\n\n`);
  process.stdout.write(`  ${census.summary}\n`);
  process.stdout.write(
    `  ${census.tests} failing tests across ${census.files} files — ${census.properties} of them PROPERTY-shaped\n\n`,
  );
  for (const [file, count] of Object.entries(census.byFile)) {
    process.stdout.write(`    ${String(count).padStart(3)}  ${file}\n`);
  }
  if (census.propertyFailures.length > 0) {
    process.stdout.write('\n  PROPERTIES THAT REVERSE ONE ARRIVAL TICK AWAY:\n');
    for (const f of census.propertyFailures) {
      process.stdout.write(`    ${f.file}\n      ${f.title}\n      ${f.assertion}\n`);
    }
  }
  process.stdout.write(`\n  report.ts restored, sha256 ${beforeHash} unchanged\n\n`);
}
