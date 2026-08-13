// G-027b — THE EXIT CRITERION'S OWN FILE SET.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// WHY THIS FILE EXISTS, AND IT IS THE SHARPEST LESSON G-027a LEFT.
//
// That goal's criterion was `pnpm exec vitest run stock`, it went green, and **no file matched**
// — vitest filters on PATHS, the word appeared only inside source comments, and a criterion that
// selects nothing passes for free. So this goal's criterion names its files in the goal block,
// and this asserts the set on disk equals the list transcribed below. A file renamed, deleted,
// or added without that list being updated reddens by name. **The list and the block are tied by
// eye, not by this file** — see `CRITERION_FILES` for what that does and does not buy.
//
// IT WALKS A TREE, SO IT IS A SCANNER, SO IT IS REGISTERED (`scanner.census.test.ts`) AND OWES A
// PROOF-OF-BITE — which is below, and which fails for the RIGHT reason: it runs the predicate
// over a scratch tree of three files against a list of two and requires the report to NAME the
// third. G-019 shipped a proof that removed the scanned SUBJECT rather than the mention, so a
// predicate hard-coded to `false` satisfied it; naming the missing file is what forecloses that.
// The alternative — hard-coding both sides — compares an array with itself.
//
// `includes('stock')`, never a regex: a pattern in a template literal is how this repo has three
// times shipped `\w` as a two-letter character class, and there is nothing here a regex buys.
// ============================================================================

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** The repository root, the way `scanner.census.test.ts` finds it. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * The files `pnpm exec vitest run stock` runs.
 *
 * WHAT THIS LIST IS AND WHAT IT IS NOT, SAID EXACTLY (round 1). The criterion reads *"the files
 * it matches are named in this block BEFORE BUILD"*, and when this file shipped **the goal block
 * named none of them** — so the comment here, which read "stated in the goal block; asserted
 * here", claimed a correspondence that did not exist yet. The six names went into G-027b's block
 * at round 1.
 *
 * SO THE TIE BETWEEN THE BLOCK AND THIS LIST IS BY EYE, AND NOTHING BELOW EXECUTES IT. What the
 * assertions below execute is the tie between THIS LIST and the DISK: a file renamed, deleted or
 * added without this list being updated reddens by name. That is worth having — it is what
 * G-027a's identical criterion lacked when it passed green against zero files — and it is
 * strictly less than the criterion asks for. A list transcribed from the block and a list the
 * block was transcribed FROM look the same from in here.
 */
const CRITERION_FILES: readonly string[] = [
  'packages/sim/src/needs.stock.save.test.ts',
  'packages/sim/src/needs.stock.test.ts',
  'packages/sim/src/utility.stock.pressure.test.ts',
  'tools/headless/src/stock.census.test.ts',
  'tools/headless/src/stock.content.test.ts',
  'tools/headless/src/stock.idle.test.ts',
];

/**
 * THE SEARCH SPACE IS THE RUNNER'S, AND MAKING IT SO CLOSED THIS FILE'S OWN HOLE (sweep 2).
 *
 * It was `['packages/sim/src', 'tools/headless/src']` with a NON-RECURSIVE read, while
 * `vitest.config.ts:5` includes `packages/**` + '/' + `*.test.ts` and `tools/**` + '/' + `*.test.ts`.
 * A `*stock*.test.ts` under `packages/content/src`, `tools/gates/`, `tools/viewer/` or
 * `tools/headless/src/fixtures/` would therefore have been RUN BY THE CRITERION COMMAND and been
 * INVISIBLE TO THE CENSUS THAT CERTIFIES IT — which is the exact defect this file exists to
 * close, one directory level down. A census whose subject is narrower than the thing it
 * certifies reports full coverage of the part it can see.
 *
 * So these are the two roots the runner globs, walked recursively, and the extensions and skips
 * below are the runner's too. The equality is asserted rather than described: the first block
 * checks the roots against the shipped config file's bytes.
 */
const SEARCHED: readonly string[] = ['packages', 'tools'];

/** Not source, and not globbed by the runner either. */
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', '.tmp']);

/**
 * Every test file under `roots` whose REPO-RELATIVE PATH carries the filter word, sorted.
 *
 * RECURSIVE SINCE SWEEP 2. `withFileTypes` and a manual descent rather than `recursive: true`,
 * because the skip list has to apply at every level: a `node_modules` under any workspace would
 * otherwise put thousands of files through the predicate and could match a dependency's own test.
 *
 * PATH AND NOT BASENAME, SINCE SWEEP 3 — WHICH IS SWEEP 2'S HOLE ONE LEVEL FURTHER UP. Vitest's
 * positional filter matches the whole path, so a DIRECTORY named `*stock*` puts every test under
 * it into `pnpm exec vitest run stock` while a basename filter sees none of them. Measured on
 * this tree: `pnpm exec vitest list headless` selects 728 tests and NO file in the repository has
 * `headless` in its basename — every one of them is selected by `tools/headless/` in the path.
 * Latent rather than live, because no such directory exists today; it is the same shape as the
 * defect this file was written to close, and a census narrower than the command it certifies
 * reports full coverage of the part it can see.
 */
function matching(root: string, roots: readonly string[], word: string): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) walk(`${dir}/${entry.name}`, `${prefix}${entry.name}/`);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith('.test.ts')) continue;
      // THE PATH, which is what the runner filters on. `prefix` is already built by the walk.
      const path = `${prefix}${entry.name}`;
      if (!path.includes(word)) continue;
      found.push(path);
    }
  };
  for (const dir of roots) walk(dir, `${dir}/`);
  return found.sort();
}

describe("the criterion command's file set", () => {
  it('searches exactly what the RUNNER runs — read off vitest.config.ts, not restated', () => {
    // The hole sweep 2 found: this census certifies a command it was searching a SUBSET of.
    // Asserted against the shipped config's bytes so that a widened `include` reddens here
    // rather than quietly outgrowing the census.
    const config = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');
    for (const dir of SEARCHED) expect(config).toContain(`'${dir}/**/*.test.ts'`);
    // And nothing else is globbed. If a third root appears, this line is where it is noticed.
    expect(config.match(/'[a-z]+\/\*\*\/\*\.test\.ts'/g)).toEqual(SEARCHED.map((dir) => `'${dir}/**/*.test.ts'`));
  });

  it('is exactly the list the goal block names — no more, no fewer', () => {
    expect(matching(ROOT, SEARCHED, 'stock')).toEqual([...CRITERION_FILES].sort());
  });

  it('and it is not empty, which is the way G-027a\'s identical criterion passed', () => {
    expect(CRITERION_FILES.length).toBeGreaterThan(0);
    expect(matching(ROOT, SEARCHED, 'stock').length).toBe(CRITERION_FILES.length);
  });

  it('while a word nothing is named after matches NOTHING — the control for the predicate', () => {
    // If this returned files, the filter would be matching something other than the name and
    // the assertion above would be about the wrong set.
    expect(matching(ROOT, SEARCHED, 'zzznotafile')).toEqual([]);
  });
});

describe('PROOF-OF-BITE — over a scratch tree, and it must NAME what it missed', () => {
  it('reports the file a stale list left out, rather than merely failing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-stock-census-'));
    try {
      const sub = join(dir, 'src');
      mkdirSync(sub, { recursive: true });
      for (const name of ['alpha.stock.test.ts', 'beta.stock.test.ts']) {
        writeFileSync(join(sub, name), '// scratch\n');
      }
      // THE THIRD IS NESTED, AND IT IS THE SWEEP-2 ARM. Under the non-recursive read this file
      // shipped with, `gamma` was invisible while `pnpm exec vitest run stock` would have run
      // it — a file the criterion executes and the census certifying the criterion cannot see.
      const nested = join(sub, 'fixtures');
      mkdirSync(nested, { recursive: true });
      writeFileSync(join(nested, 'gamma.stock.test.ts'), '// scratch\n');
      // And a skipped directory is still skipped at depth, so the recursion did not buy the
      // walk a dependency's test suite.
      const ignored = join(sub, 'node_modules');
      mkdirSync(ignored, { recursive: true });
      writeFileSync(join(ignored, 'delta.stock.test.ts'), '// scratch\n');
      // A decoy that must NOT be picked up: the word is in the CONTENTS, which is exactly the
      // mistake that made G-027a's criterion select nothing.
      writeFileSync(join(sub, 'decoy.test.ts'), '// this file is all about stock\n');

      const seen = matching(dir, ['src'], 'stock');
      expect(seen).toEqual([
        'src/alpha.stock.test.ts',
        'src/beta.stock.test.ts',
        'src/fixtures/gamma.stock.test.ts',
      ]);

      // The stale list: two of the three. The report must name the third.
      const stale = ['src/alpha.stock.test.ts', 'src/beta.stock.test.ts'];
      const missing = seen.filter((file) => !stale.includes(file));
      expect(missing).toEqual(['src/fixtures/gamma.stock.test.ts']);
      // And a predicate hard-coded to `false` — the shape G-019's proof let through — cannot
      // satisfy this, because an empty `seen` produces an empty `missing` and the assertion
      // above names a file.
      expect(missing.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('and a DIRECTORY carrying the word is matched, because that is what the runner matches', () => {
    // SWEEP 3'S ARM, and it is sweep 2's finding one level up: `matching` filtered on the
    // BASENAME while `pnpm exec vitest run stock` filters on the PATH. Every file below is named
    // so that no basename carries the word — only the directory does — so under the basename
    // filter this returns nothing while the criterion command would run all three.
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-stock-census-dir-'));
    try {
      const inside = join(dir, 'src', 'stock');
      mkdirSync(inside, { recursive: true });
      for (const name of ['alpha.test.ts', 'beta.test.ts']) writeFileSync(join(inside, name), '// scratch\n');
      const deeper = join(inside, 'fixtures');
      mkdirSync(deeper, { recursive: true });
      writeFileSync(join(deeper, 'gamma.test.ts'), '// scratch\n');
      // Outside the directory and not named for it: the control, so the walk is not matching all.
      writeFileSync(join(dir, 'src', 'elsewhere.test.ts'), '// scratch\n');

      expect(matching(dir, ['src'], 'stock')).toEqual([
        'src/stock/alpha.test.ts',
        'src/stock/beta.test.ts',
        'src/stock/fixtures/gamma.test.ts',
      ]);
      // And the basename reading — the one this replaced — would have returned NONE of them.
      expect(['alpha.test.ts', 'beta.test.ts', 'gamma.test.ts'].some((name) => name.includes('stock'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
