// I4 — NO TEST IN `pnpm test` READS A CLOCK (G-020c).
//
//   pnpm exec vitest run stopwatch
//
// THE CLAIM THIS FILE TURNS INTO A MEASUREMENT. G-020c moved three timing bounds out of the
// unit-test suite and into `pnpm check:scaling`, because §2.0 says an intermittent gate is not
// red, it is UNRELIABLE — and I4 had been unreliable since G-016. "The bounds are out of
// `pnpm test`" is a claim about today's tree; without something that bites, the next goal that
// wants a quick timing assertion puts one back and nothing says so. ADR-0007: prefer making a
// fact checkable over documenting it.
//
// WHAT IT SCANS IS WHAT VITEST RUNS, DERIVED FROM `vitest.config.ts` RATHER THAN RESTATED.
// A hand-copied glob list is the duplicated-constant defect G-018 removed from the bench's
// golden: the scan and the runner would drift, and the scan would report "clean" about a set
// of files nobody runs. The config's own `include` and `exclude` are parsed out of it, and the
// parse throws rather than returning nothing when the config's shape changes.
//
// THE EXEMPTIONS ARE MATCHED TEXTS, NEVER FILENAMES — and that distinction is the whole
// design. A filename exemption rots: `bench.budget.test.ts` is exempt today for three specific
// lines, and a filename exemption would silently cover a genuine `process.hrtime.bigint()`
// added to it tomorrow. Each exempt TEXT is listed below with why it cannot flake.
//
// AND THE STATED REASON FOR THAT FILE'S EXEMPTION IS NOT "it only pins source text", WHICH IS
// MEASURABLY WRONG: `bench.budget.test.ts:289-299` copies `bench.mjs` and `budget.mjs` into a
// temp directory with `BUDGET_MS = 0` and SPAWNS IT, asserting exit 1. It executes a gate. The
// exemption is still right, for a different reason — a budget of zero is exceeded at any
// elapsed time, so no machine speed can change the verdict — and a maintainer reasoning from
// the wrong reason would exempt the wrong thing.
//
// WHAT IT CANNOT SEE, stated rather than implied: a clock reached through an import. A test
// that imported `scaling-harness.ts` would run a stopwatch with nothing here matching, so that
// specific back door is closed by an explicit assertion below. The general case — an arbitrary
// module in the import graph reading a clock — is parked with its falsification test.
//
// The scanner is written out here rather than imported from `tools/gates/lib/scan.mjs` because
// `tools/headless`'s tsconfig is `src/**/*.ts` with no `allowJs`. Precedent:
// `speed-ladder.scan.test.ts`, whose per-root counting and bites-on-synthetic shape this file
// follows deliberately rather than re-deriving.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CONFIG = readFileSync(join(ROOT, 'vitest.config.ts'), 'utf8');

/**
 * Read one glob array out of `vitest.config.ts`.
 *
 * Throws rather than returning `[]` when the shape changes: an empty include list would make
 * every assertion below pass while inspecting nothing, which is the exact ADR-0007 shape this
 * file exists to close one level down.
 */
function globs(key: string): readonly string[] {
  const found = new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(CONFIG);
  if (found?.[1] === undefined) {
    throw new Error(`cannot read \`${key}\` out of vitest.config.ts — its shape has changed`);
  }
  // BUILT FROM A STRING RATHER THAN WRITTEN AS A REGEX LITERAL, AND THAT IS NOT STYLE — IT IS
  // THE SECOND MEASURED INSTANCE OF A BLIND SPOT THIS REPO HAS ALREADY RECORDED.
  // `stripComments` below (`speed-ladder.scan.test.ts`'s, and `tools/gates/lib/scan.mjs`'s,
  // which sits behind I1, I2 and I3) has no regex-literal handling, so a quote inside a regex
  // literal opens a string span that never closes. Written as `/'([^']+)'/g`, the two quotes on
  // THIS line swallowed the next several comment blocks, and the scan then reported its own
  // prose as a violation of itself. Observed here, in the file built to hunt exactly that
  // class, one goal after `speed-ladder.scan.test.ts` observed it and parked it.
  const quoted = new RegExp(`${String.fromCharCode(39)}([^${String.fromCharCode(39)}]+)${String.fromCharCode(39)}`, 'g');
  const values = [...found[1].matchAll(quoted)].map((match) => match[1] as string);
  if (values.length === 0) throw new Error(`\`${key}\` in vitest.config.ts parsed to nothing`);
  return values;
}

const INCLUDE = globs('include');
const EXCLUDE = globs('exclude');

/**
 * The subset of glob syntax these patterns use: `**` across directories, `*` within a name.
 *
 * THE FIRST VERSION ONLY UNDERSTOOD A DOUBLE STAR WITH A SLASH AFTER IT, so `apps/**` and the
 * tail of the node_modules pattern each matched a SINGLE SEGMENT and excluded nothing. It was
 * harmless only by accident — `everyFile()` hard-skips `node_modules` and no include glob
 * reaches `apps/` — and that is worse than a bug: the derivation was INERT, so the next real
 * `exclude` added to `vitest.config.ts` would silently not apply while this file claimed to
 * honour it.
 *
 * `sim-critic` found it together with the assertion written to catch it, which COULD NOT FAIL:
 * "no scanned path starts with apps/" is true because `packages/**` and `tools/**` never match
 * `apps/` in the first place, with EXCLUDE ignored entirely. ADR-0007's class, one level inside
 * the file built to close ADR-0007's class one level down.
 *
 * Written as an explicit tokeniser rather than a chain of `split`/`join` sentinels, because
 * the sentinel version is what hid the omission: a reader could not see which forms it handled.
 */
const globToRegExp = (glob: string): RegExp => {
  let out = '';
  for (let i = 0; i < glob.length; i += 1) {
    if (glob.startsWith('**/', i)) {
      // Zero or more leading directories, so `a/**/b.ts` also matches `a/b.ts`.
      out += '(?:[^/]+/)*';
      i += 2;
      continue;
    }
    if (glob.startsWith('**', i)) {
      // Everything below, including nothing: `apps/**` matches `apps/x` and `apps/x/y`.
      out += '.*';
      i += 1;
      continue;
    }
    const character = glob[i] as string;
    if (character === '*') {
      out += '[^/]*';
      continue;
    }
    out += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character;
  }
  return new RegExp(`^${out}$`);
};

const INCLUDE_PATTERNS = INCLUDE.map(globToRegExp);
const EXCLUDE_PATTERNS = EXCLUDE.map(globToRegExp);

function everyFile(): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(ROOT, full).split('\\').join('/'));
    }
  };
  walk(ROOT);
  return out;
}

const ALL_FILES = everyFile();

/**
 * The files one include glob contributes, after the exclude list.
 *
 * IT TAKES ITS FILE LIST SO THAT THE EXCLUDE STEP CAN BE WITNESSED. In the real tree nothing
 * observable is excluded — `everyFile()` hard-skips `node_modules` and no include glob reaches
 * `apps/` — so `sim-critic`'s probe held: delete the exclude clause and the suite stayed green.
 * Testing the PATTERNS is not testing that they are APPLIED, and the second is the claim this
 * file makes. With the list injectable, one synthetic call sees the clause and reddens without
 * it.
 */
const suiteFiles = (pattern: RegExp, files: readonly string[] = ALL_FILES): readonly string[] =>
  files.filter((path) => pattern.test(path) && !EXCLUDE_PATTERNS.some((skip) => skip.test(path)));

/**
 * READING A CLOCK. Assembled from pieces so that this file's own text carries no match: it is
 * itself inside the suite it scans, and a contiguous copy of the thing it bans would make the
 * check fire on the test that proves it fires. That is not an exclusion — this file IS
 * scanned, and it is clean.
 *
 * The list is `tools/gates/determinism.mjs`'s, minus the sim-only entries: the question here
 * is not "is this deterministic" (I2 answers that for `packages/sim`) but "can this assertion's
 * outcome depend on how fast the machine is".
 */
const CLOCK_SOURCE = [
  ['process', '\\s*\\.\\s*', 'hrtime'].join(''),
  ['Date', '\\s*\\.\\s*', 'now'].join(''),
  ['performance', '\\s*\\.\\s*', 'now'].join(''),
  ['new\\s+', 'Date', '\\s*\\('].join(''),
].join('|');

const clock = (): RegExp => new RegExp(`(${CLOCK_SOURCE})`, 'g');

/**
 * THE EXEMPT TEXTS, EACH WITH WHY IT CANNOT FLAKE. Exact source lines, trimmed — not files,
 * not directories, not line numbers. A new clock call anywhere, including on the next line of
 * the same file, is a new unexempted match.
 */

/**
 * `process.hrtime`, assembled — this file is inside the suite it scans, so it may not contain
 * the thing it bans in one piece. The exempt texts below are built from it, which also means
 * an exemption cannot drift into naming a clock this file would otherwise have to report.
 */
const HRTIME = ['process', '.', 'hrtime'].join('');

const EXEMPT: readonly { readonly text: string; readonly why: string }[] = [
  {
    text: `/const elapsedMs = Number\\(${HRTIME.split('.').join('\\.')}\\.bigint\\(\\) - started\\) \\/ 1e6;/,`,
    why: "bench.budget.test.ts:231 — a REGEX over bench.mjs's source text: /1e9 for /1e6 is a 1000x looser gate. It reads a file, not a clock.",
  },
  {
    text: `const started = BENCH.indexOf('const started = ${HRTIME}.bigint();');`,
    why: 'bench.budget.test.ts:239 — a string SEARCH over the same source, asserting the clock starts before the run. Its result is a character offset.',
  },
];

type Match = { readonly where: string; readonly line: string; readonly text: string };

/** Blank comments, keep strings and byte offsets — `speed-ladder.scan.test.ts`'s, and it
 *  carries that file's recorded blind spot: a quote inside a REGEX literal is not handled. */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (t: string): string => t.replace(/[^\n]/g, ' ');
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

export function scanSource(where: string, raw: string): readonly Match[] {
  const source = stripComments(raw);
  const lines = source.split('\n');
  const found: Match[] = [];
  const pattern = clock();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const number = source.slice(0, match.index).split('\n').length;
    const line = (lines[number - 1] ?? '').trim();
    if (EXEMPT.some((exempt) => exempt.text === line)) continue;
    found.push({ where: `${where}:${number}`, line, text: match[0] });
  }
  return found;
}

/**
 * Does this source IMPORT the stopwatch-bearing harness? Static or dynamic; the module
 * specifier is assembled so this file does not match itself.
 */
export function importsHarness(source: string): boolean {
  const needle = ['scaling', '-', 'harness'].join('');
  return new RegExp(`(?:^import[^;]*|import\\s*\\(\\s*['"\`]|require\\s*\\(\\s*['"\`])[^;]*${needle}`, 'm').test(source);
}

const scanned = INCLUDE.map((glob, index) => {
  const files = suiteFiles(INCLUDE_PATTERNS[index] as RegExp);
  const matches = files.flatMap((file) => scanSource(file, readFileSync(join(ROOT, file), 'utf8')));
  return { glob, count: files.length, matches, files };
});

describe('the scan can see, and it is shown to bite (ADR-0007)', () => {
  it('finds each clock this repo has actually used to build a timing bound', () => {
    const cases = [
      ['const started = process', '.hrtime', '.bigint();'].join(''),
      ['const at = Date', '.now', '();'].join(''),
      ['const t = performance', '.now', '();'].join(''),
      ['const when = new ', 'Date', '();'].join(''),
    ];
    for (const source of cases) expect(scanSource('synthetic.test.ts', source)).toHaveLength(1);
  });

  it('does NOT fire on prose describing the ban', () => {
    const prose = ['// a test may not call process', '.hrtime', '.bigint() any more'].join('');
    expect(scanSource('synthetic.test.ts', prose)).toEqual([]);
  });

  it('exempts a text and NOT the file it lives in', () => {
    const exempt = EXEMPT[0] as { text: string };
    // The exempt line itself passes...
    expect(scanSource('bench.budget.test.ts', exempt.text)).toEqual([]);
    // ...and a genuine clock call on the next line of the same file does not.
    const withNewCall = [exempt.text, ['const started = process', '.hrtime', '.bigint();'].join('')].join('\n');
    expect(scanSource('bench.budget.test.ts', withNewCall)).toHaveLength(1);
  });

  it('the import check bites on an import and not on a file that merely reads the harness', () => {
    const path = ['./scaling', '-', 'harness.js'].join('');
    expect(importsHarness(`import { thing } from '${path}';`)).toBe(true);
    expect(importsHarness(`const mod = await import('${path}');`)).toBe(true);
    expect(importsHarness(`const SOURCE = readFileSync(join(ROOT, 'tools/headless/src/${path}'), 'utf8');`)).toBe(false);
  });

  it('parses the suite out of vitest.config.ts rather than restating it', () => {
    expect(INCLUDE).toEqual(['packages/**/*.test.ts', 'tools/**/*.test.ts']);
    expect(EXCLUDE).toContain('apps/**');
    const everything = scanned.flatMap((entry) => entry.files);
    expect(everything.every((path) => path.endsWith('.test.ts'))).toBe(true);
  });

  it('the exclude list is APPLIED, not merely parsed — the probe that caught the last version', () => {
    // `sim-critic` deleted the exclude clause from `suiteFiles` and the whole file stayed green,
    // because nothing in the real tree is both included and excluded. This call supplies a file
    // list where one path is, so the clause has to run for the assertion to hold.
    const files = [
      'packages/sim/src/save.test.ts',
      'packages/sim/node_modules/pkg/index.test.ts',
      'packages/sim/src/nested/deep/thing.test.ts',
    ];
    expect(suiteFiles(INCLUDE_PATTERNS[0] as RegExp, files)).toEqual([
      'packages/sim/src/save.test.ts',
      'packages/sim/src/nested/deep/thing.test.ts',
    ]);
  });

  it('the EXCLUDE list actually rejects, on paths only it can reject', () => {
    // THE ASSERTION THIS REPLACES COULD NOT FAIL. It checked that no scanned path starts with
    // `apps/`, which is true because the INCLUDE globs are `packages/**` and `tools/**` — the
    // exclude list could be deleted entirely and it would still pass. `sim-critic` found it in
    // the file built to hunt exactly that. These paths are matched by INCLUDE, so only EXCLUDE
    // can reject them, and both need `**` to be expanded correctly to be rejected at all.
    const excluded = (path: string): boolean => EXCLUDE_PATTERNS.some((skip) => skip.test(path));
    expect(excluded('packages/sim/node_modules/x/y.test.ts')).toBe(true);
    expect(excluded('tools/headless/node_modules/deep/er/y.test.ts')).toBe(true);
    expect(excluded('apps/game/src/x.test.ts')).toBe(true);
    expect(excluded('apps/game.test.ts')).toBe(true);
    // ...and it rejects nothing it should keep.
    expect(excluded('packages/sim/src/save.test.ts')).toBe(false);
    expect(excluded('tools/headless/src/stopwatch.scan.test.ts')).toBe(false);
  });

  it('INCLUDE spans directories, which is what `**` is for', () => {
    const included = (path: string): boolean => INCLUDE_PATTERNS.some((pattern) => pattern.test(path));
    expect(included('packages/sim/src/save.test.ts')).toBe(true);
    // One directory deep and three deep both match, or the scan would miss whole subtrees.
    expect(included('tools/x.test.ts')).toBe(true);
    expect(included('tools/headless/src/deep/er/x.test.ts')).toBe(true);
    expect(included('packages/sim/src/save.ts')).toBe(false);
    expect(included('apps/game/src/x.test.ts')).toBe(false);
  });
});

describe('every include glob is alive — a dead glob matches nothing and looks clean', () => {
  it.each(scanned)('$glob matches test files', ({ glob, count }) => {
    expect(count, `${glob} matched no files — is the pattern still right?`).toBeGreaterThan(0);
  });
});

describe('no test in `pnpm test` reads a clock (I4, §2.0, G-020c)', () => {
  it('finds zero unexempted clock reads across the whole suite', () => {
    const all = scanned.flatMap(({ matches }) => matches);
    const report = all.map((m) => `  ${m.where}  ${m.line}`).join('\n');
    expect(
      all,
      'a test in `pnpm test` reads a clock. A timing bound inside the unit-test suite is what\n' +
        'made I4 unreliable from G-016 to G-020c (HOTELSIM.md §2.0). Timing bounds live in\n' +
        `\`pnpm check:scaling\` (tools/gates/scaling.mjs).\n${report}\n`,
    ).toEqual([]);
  });

  it('and no test reaches a clock by IMPORTING the scaling instrument', () => {
    // The one back door the text scan cannot see: the harness holds the stopwatch, so a test
    // that imported it would run one with nothing above matching.
    //
    // IT MATCHES AN IMPORT AND NOT THE WORD, and that distinction was measured rather than
    // anticipated: the first version searched for the bare name and fired on
    // `scaling.bound.test.ts`, which READS the harness as text to assert it holds no bound.
    // Reading a file is not importing it, exactly as `bench.budget.test.ts` reading
    // `bench.mjs`'s source is not reading a clock — the same distinction, one clause down.
    const importers = scanned
      .flatMap((entry) => entry.files)
      .filter((file) => importsHarness(stripComments(readFileSync(join(ROOT, file), 'utf8'))));
    expect(importers).toEqual([]);
  });
});
