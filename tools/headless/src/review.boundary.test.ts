// G-019 — "NOTHING READS IT", MADE MECHANICAL RATHER THAN DOCUMENTED.
//
//   pnpm exec vitest run review
//
// The goal's statement ends "the review is recorded and reported; NOTHING READS IT". The
// reasons to read one are M4's — reputation, demand, pricing — and a field that becomes an
// input before anyone decides what it means is how a balance system acquires a dependency
// nobody chose. So the boundary is checked, twice, from directions that fail differently:
//
//   1. STRUCTURALLY — a source scan over `packages/sim/src`. It derives its token list from
//      `reviews.ts`'s OWN export statements, so a new export is fenced without an edit here,
//      and it holds the READ ACCESSORS tighter than the rest.
//   2. BEHAVIOURALLY — two runs of the same seed and flags whose content differs ONLY in the
//      review scale. Every guest, need, ledger and build number must be identical. A source
//      scan can be evaded by renaming; this cannot.
//
// AND BOTH ARE SHOWN TO BITE (ADR-0007), against a synthetic reader for the scan and — for
// the behavioural half — against the one thing that is genuinely allowed to differ.
//
// A NOTE ON WHERE THIS FILE LIVES. It cannot be in `packages/sim`: I1 bans `node:fs` there,
// including in its tests, and `check:purity` says so by name. `viewer.readonly.test.ts`,
// `speed-ladder.scan.test.ts` and the migration scans set the precedent, and the scanner is
// written out here rather than imported from `tools/gates/lib/scan.mjs` because this
// package's tsconfig has no `allowJs`.
//
// AND WHY THIS IS NOT A `pnpm verify` ROW. `pnpm test` is already an invariant gate (I4), so
// this runs on the gate path as it stands. A twelfth row would be a new gate for one goal's
// boundary, and `HOTELSIM.md` §9's warning about instruments acquiring defenders applies to
// gates before it applies to viewers.

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  loadContent,
  ECONOMY_PATH,
  GUEST_RULES_PATH,
  ITEM_TYPES_PATH,
  NEED_TYPES_PATH,
  ROOM_TYPES_PATH,
} from './content-loader.js';
import type { RunSummary } from './report.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SIM_SRC = join(ROOT, 'packages/sim/src');
const CLI = join(ROOT, 'tools/headless/src/cli.ts');

const tempDirs: string[] = [];
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/** Blank comments, keeping byte offsets, so the scan does not fire on this file's prose. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (t: string) => t.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else {
      const ch = source[i] as string;
      if (ch === '"' || ch === "'" || ch === '`') {
        const start = i;
        i += 1;
        while (i < source.length) {
          if (source[i] === '\\') {
            i += 2;
            continue;
          }
          if (source[i] === ch) {
            i += 1;
            break;
          }
          i += 1;
        }
        out += source.slice(start, i);
      } else {
        out += ch;
        i += 1;
      }
    }
  }
  return out;
}

/** Every non-test `.ts` file under `packages/sim/src`, relative to the repo root. */
function simSources(): readonly string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      found.push(full);
    }
  };
  walk(SIM_SRC);
  return found;
}

/**
 * Every name `reviews.ts` exports, read from its own source.
 *
 * NOT A HAND-COPIED LIST, and that is the difference between a fence and a decoration. A
 * literal list here would go quietly out of date the first time an export is added, and the
 * scan would stop covering the new name — silently, which is the failure mode this file
 * exists to avoid. `commandKinds` in `viewer.readonly.test.ts` sets the precedent.
 */
function reviewExports(): readonly string[] {
  const source = stripComments(readFileSync(join(SIM_SRC, 'reviews.ts'), 'utf8'));
  const names = [...source.matchAll(/export\s+(?:function|const|type)\s+([A-Za-z][A-Za-z0-9_]*)/g)].map(
    (m) => m[1] as string,
  );
  return [...new Set(names)];
}

/**
 * The files allowed to touch the review store, and why each one is allowed.
 *
 * ASSERTED TO BE EXACTLY THIS SET, so widening it is a visible edit in a diff rather than a
 * name quietly appearing somewhere new. The distinction it draws: the ban is on any module
 * CONSULTING A REVIEW TO DECIDE SOMETHING ABOUT THE WORLD. Producing one, carrying it
 * through a tick, serialising it and validating its shape are the store's own machinery.
 */
const ALLOWED = {
  'reviews.ts': 'the module itself',
  'guests.ts': 'produces the review, in `depart`, on the one exit path',
  'world.ts': 'holds the field and creates it empty',
  'tick.ts': 'threads it from the guest loop into the world and asserts its shape',
  'save.ts': 'serialises, migrates and validates it',
  'index.ts': 'the public surface',
} as const;

/**
 * The READ accessors, held tighter than the rest: these are the functions a decision would
 * have to call. They may appear only in the module that defines them and in the one place
 * that validates a loaded table.
 */
const READERS_ALLOWED = new Set(['reviews.ts', 'save.ts', 'index.ts']);
const READERS = ['reviewCountOf', 'totalReviews'];

/**
 * The scan's predicate: `name` as a whole word, INCLUDING AFTER A DOT.
 *
 * TWO DEFECTS LIVED IN THIS ONE LINE AND THE BITE TESTS FOUND BOTH. Recorded rather than
 * quietly fixed, because a scan is the kind of check that passes forever while inspecting
 * nothing, and these are the two ways this one nearly did.
 *
 *   1. THE DOT. The first version copied `check-purity.mjs`'s `(?<![.\\w$])` lookbehind —
 *      correct THERE, because that scan hunts GLOBALS and must not fire on `foo.process`.
 *      Here the subject is a FIELD, and `world.reviewOutcomes` is exactly the form a rogue
 *      reader takes: the borrowed pattern excluded the one spelling that matters. Caught by
 *      the synthetic reader below.
 *   2. THE ESCAPE. Written into a TEMPLATE LITERAL, `\\w` is not a regex class — a template
 *      literal turns `\\w` into a bare `w`, so the pattern became `(?<![w$])`, which blocks
 *      only the letter w and matched `cloneReviewScale` as a mention of `ReviewScale`. It
 *      failed LOUDLY, on a real file, rather than passing; a scan that erred the other way
 *      would have been green and empty.
 *
 * `\\\\w` in the template is what produces `\\w` in the regex source. The negative control
 * below is what says the pattern is still discriminating after both repairs.
 */
const mentions = (source: string, name: string): boolean =>
  new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source);

describe('THE SOURCE SCAN — no sim module outside the allow-list names the review store', () => {
  it('reads the token list off `reviews.ts` itself, and the list is not empty', () => {
    const names = reviewExports();
    // A scan with an empty token list finds nothing and passes forever (ADR-0007). These
    // three must be in it or the scan below is inspecting nothing.
    expect(names).toContain('reviewOf');
    expect(names).toContain('reviewCountOf');
    expect(names).toContain('ReviewOutcomeRow');
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const reader of READERS) expect(names).toContain(reader);
  });

  it('visits every non-test file in packages/sim/src, so the scan has a subject', () => {
    // A scan rooted at the wrong directory reports nothing and is green. Pinned by name and
    // by count.
    const files = simSources().map((path) => path.split(/[\\/]/).pop()!);
    expect(files).toContain('reviews.ts');
    expect(files).toContain('guests.ts');
    expect(files).toContain('utility.ts');
    expect(files.length).toBeGreaterThan(15);
  });

  it('and no file outside the allow-list mentions any of them', () => {
    const names = reviewExports();
    const offences: string[] = [];
    for (const path of simSources()) {
      const file = path.split(/[\\/]/).pop()!;
      if (file in ALLOWED) continue;
      const source = stripComments(readFileSync(path, 'utf8'));
      for (const name of names) {
        if (mentions(source, name)) offences.push(`${file}: ${name}`);
      }
      if (mentions(source, 'reviewOutcomes')) offences.push(`${file}: reviewOutcomes`);
    }
    expect(offences).toEqual([]);
  });

  it('THE READ ACCESSORS are held tighter: only the module itself, save.ts and index.ts', () => {
    // These are the functions a decision would have to call. `guests.ts` PRODUCES a review
    // and `tick.ts` carries one, and neither may read the table back.
    const offences: string[] = [];
    for (const path of simSources()) {
      const file = path.split(/[\\/]/).pop()!;
      if (READERS_ALLOWED.has(file)) continue;
      const source = stripComments(readFileSync(path, 'utf8'));
      for (const reader of READERS) {
        if (mentions(source, reader)) offences.push(`${file}: ${reader}`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('the allow-list is EXACTLY the set of files that touch it — no more, no fewer', () => {
    // Both directions. An entry nobody uses is a licence sitting open; a file missing from
    // it would have been caught above, and this says the list is not padded either.
    const names = reviewExports();
    const touching: string[] = [];
    for (const path of simSources()) {
      const file = path.split(/[\\/]/).pop()!;
      const source = stripComments(readFileSync(path, 'utf8'));
      const touches = names.some((name) => mentions(source, name)) || mentions(source, 'reviewOutcomes');
      if (touches) touching.push(file);
    }
    expect([...touching].sort()).toEqual(Object.keys(ALLOWED).sort());
  });

  it('AND THE SCAN BITES, against a synthetic reader that is not on disk', () => {
    // ADR-0007's second half, without mutating the repo (`CLAUDE.md`'s recipe prefers a
    // scratch subject over a probe file). The scan's predicate is applied to a source string
    // standing in for `utility.ts` deciding something from the tally.
    const names = reviewExports();
    const rogue = stripComments(`
      import { reviewCountOf } from './reviews.js';
      // a comment naming reviewOf must NOT fire
      export function scoreOf(world) {
        return reviewCountOf(world.reviewOutcomes, 5) > 10 ? 1 : 0;
      }
    `);
    const hits = names.filter((name) => mentions(rogue, name));
    expect(hits).toContain('reviewCountOf');
    // THE DOTTED FORM, AND THIS ASSERTION FAILED ON THE FIRST VERSION OF THE SCAN. It is the
    // reason `mentions` exists: `world.reviewOutcomes` is how a reader would actually be
    // written, and the pattern borrowed from `check-purity.mjs` skipped exactly that spelling.
    expect(mentions(rogue, 'reviewOutcomes')).toBe(true);
    // And it does NOT fire on the prose: the comment mentioning `reviewOf` was blanked.
    expect(hits).not.toContain('reviewOf');
  });

  it('and it does not fire on this repository by accident — the negative control', () => {
    // The mirror of the case above: a file that mentions nothing must produce no hit, or the
    // predicate is matching something other than what it claims to.
    const names = reviewExports();
    const innocent = stripComments(readFileSync(join(SIM_SRC, 'rng.ts'), 'utf8'));
    expect(names.filter((name) => mentions(innocent, name))).toEqual([]);
  });
});

// ============================================================================
//  THE BEHAVIOURAL HALF. A RENAME DEFEATS A SCAN; IT DOES NOT DEFEAT THIS.
// ============================================================================

describe('THE DIFFERENTIAL — changing the review scale changes the reviews and NOTHING ELSE', () => {
  const contentWithScale = (min: number, max: number): string => {
    const dir = mkdtempSync(join(tmpdir(), 'hotelsim-boundary-'));
    tempDirs.push(dir);
    for (const path of [ROOM_TYPES_PATH, NEED_TYPES_PATH, ITEM_TYPES_PATH, ECONOMY_PATH]) {
      copyFileSync(path, join(dir, path.split(/[\\/]/).pop()!));
    }
    const rules = JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as Record<string, unknown>[];
    writeFileSync(
      join(dir, 'guest-rules.json'),
      `${JSON.stringify(
        rules.map((entry) => ({ ...entry, reviewScoreMin: min, reviewScoreMax: max })),
        null,
        2,
      )}\n`,
      'utf8',
    );
    return dir;
  };

  const run = (dir: string): RunSummary => {
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        CLI,
        ...['--days', '30', '--seed', '7', '--rooms', '6', '--arrivals', '60'],
        '--content',
        dir,
        '--json',
      ],
      { cwd: ROOT, env: { ...process.env, NODE_NO_WARNINGS: '1' }, encoding: 'utf8' },
    );
    expect(result.status, result.stderr).toBe(0);
    return JSON.parse(result.stdout) as RunSummary;
  };

  const narrow = run(contentWithScale(1, 5));
  const wide = run(contentWithScale(0, 9));

  it('the two runs really are different runs — the scale reached the simulation', () => {
    // Without this the comparison below could be two identical runs agreeing about nothing.
    expect(narrow.reviews.scoreMax).toBe(5);
    expect(wide.reviews.scoreMax).toBe(9);
    expect(narrow.reviews.distribution).not.toEqual(wide.reviews.distribution);
  });

  it('EVERY guest, need, room, money and build number is identical', () => {
    // If any decision in `packages/sim` consulted a review, this is where it would show. The
    // sim's behaviour is a function of the world and the injected content, and the review
    // scale is the one part of that content nothing may act on.
    expect(wide.guests).toEqual(narrow.guests);
    expect(wide.needs).toEqual(narrow.needs);
    expect(wide.rooms).toEqual(narrow.rooms);
    expect(wide.money).toEqual(narrow.money);
    expect(wide.build).toEqual(narrow.build);
    expect(wide.loans).toEqual(narrow.loans);
    expect(wide.world.entities).toEqual(narrow.world.entities);
    expect(wide.world.tick).toEqual(narrow.world.tick);
  });

  it('and the two things that ARE allowed to differ are named, not merely excluded', () => {
    /**
     * `stateHash` differs, and it must: the review distribution is hashed world state and
     * the content fingerprint is too, so two different content documents produce two
     * different hashes from tick 0 — loudly, which is what G-002 built it for. Excluding it
     * silently would be excluding the one field that proves the content differed at all.
     *
     * `input` differs in nothing here, because `--content` is not echoed into the summary.
     */
    expect(wide.world.stateHash).not.toBe(narrow.world.stateHash);
    expect(wide.input).toEqual(narrow.input);
    // And everything else in `world` is equal, so the hash is the only exclusion.
    const { stateHash: _wideHash, ...wideWorld } = wide.world;
    const { stateHash: _narrowHash, ...narrowWorld } = narrow.world;
    expect(wideWorld).toEqual(narrowWorld);
  });

  it('THE DIFFERENTIAL BITES: the same guests, re-expressed, are not the same reviews', () => {
    // The positive control for the comparison above. Both runs departed the same guests with
    // the same needs met, and the two distributions still differ — so "everything else is
    // equal" is a statement about a comparison that had something to find.
    const total = (s: RunSummary) => s.reviews.distribution.reduce((sum, row) => sum + row.count, 0);
    expect(total(wide)).toBe(total(narrow));
    expect(wide.reviews.distribution.filter((row) => row.count > 0).length).toBeGreaterThan(1);
    expect(narrow.reviews.distribution.filter((row) => row.count > 0).length).toBeGreaterThan(1);
  });
});

describe('and the shipped content is what the runner actually loads', () => {
  it('so the scale these tests read is the scale on disk', () => {
    const onDisk = (JSON.parse(readFileSync(GUEST_RULES_PATH, 'utf8')) as Record<string, number>[])[0]!;
    const bound = loadContent();
    expect(bound.content.guestRules?.[0]?.reviewScoreMin).toBe(onDisk['reviewScoreMin']);
    expect(bound.content.guestRules?.[0]?.reviewScoreMax).toBe(onDisk['reviewScoreMax']);
  });
});
