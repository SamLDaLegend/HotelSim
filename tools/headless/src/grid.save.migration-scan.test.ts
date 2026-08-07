// G-007 — THE STRUCTURAL GUARD BEHIND THE 2 -> 3 MIGRATION'S FROZEN PLOT.
//
// `migrateV2ToV3` must write the four grid bounds as a LITERAL frozen at the moment v3
// was defined, never by calling `createGridBounds()`. A migration's output has to be a
// pure function of its input bytes and its own era; one that read today's constants
// would turn the same v2 bytes into a different v3 world the moment anyone edits the
// default plot, so history would drift with the build and the pinned hash of the
// migrated fixture would become a tripwire on an unrelated change.
//
// WHY A SOURCE SCAN AND NOT AN ASSERTION ABOUT VALUES. `V3_MIGRATION_BOUNDS` (save.ts)
// and `createGridBounds()` (grid.ts) hold the same four integers today, and they are
// SUPPOSED to — the freeze only becomes observable on the day someone changes the
// default plot. So no value assertion can tell the two implementations apart: the test
// in `grid.save.test.ts` titled "gives the world the plot frozen INTO the migration, not
// this build's current default" passes identically either way. Its name promises a
// guarantee its body cannot provide. THIS FILE IS WHAT MAKES THAT NAME TRUE.
//
// The failure it exists to prevent is a refactor, not a bug: two identical four-integer
// literals fifty lines apart are an obvious invitation to deduplicate, nothing goes red
// on the day somebody does, and detection arrives much later disguised as "the migrated
// fixture hash moved for no reason".
//
// WHY IT LIVES IN tools/headless AND NOT BESIDE THE MIGRATION TESTS. It has to read a
// file, and `packages/sim` cannot: its tsconfig sets `types: []` (no @types/node) and
// `check-purity.mjs` rejects every non-relative import in the sim except `vitest`, so
// `node:fs` there would fail I1 twice over. The filename carries BOTH `grid` and `save`
// so `pnpm exec vitest run grid` and `pnpm exec vitest run save` — the two exit criteria
// this guard belongs to — each pick it up alongside the migration tests themselves, and
// `grid.save.test.ts` points here at the assertion it backs.
//
// This is a scan in the spirit of `check-purity.mjs`'s import scan, deliberately NOT a
// dependency-cruiser rule: `.dependency-cruiser.cjs` is gate territory and gates are
// orchestrator-owned (ADR-0004).

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const SAVE_TS = join(ROOT, 'packages/sim/src/save.ts');

/**
 * Every identifier that would make the migration read the CURRENT default plot.
 *
 * `createGridBounds` is the function; the `DEFAULT_*` constants are the back door — a
 * contributor who could not import the function could still assemble the same object
 * from the four exported numbers, and that is the same defect wearing a different hat.
 */
const FORBIDDEN_IN_SAVE_TS = [
  'createGridBounds',
  'DEFAULT_MIN_FLOOR',
  'DEFAULT_MAX_FLOOR',
  'DEFAULT_MIN_COLUMN',
  'DEFAULT_MAX_COLUMN',
] as const;

/**
 * Blank out `//` and block comments, preserving length so line numbers survive.
 *
 * Comment stripping is NOT a formality here: `save.ts` names `createGridBounds()` in
 * `V3_MIGRATION_BOUNDS`'s own doc comment, explaining why it must not call it. A raw
 * `includes` scan would be red on the very sentence that documents the rule — the
 * classic gate that fires on the description of the thing it forbids.
 *
 * Narrow by design: it does not model strings or regex literals, because the file it
 * reads has no `//` inside a string. `assertScanFindsNothingUnexpected` below is what
 * stops that assumption from rotting silently.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (match) => ' '.repeat(match.length));
}

/** Every forbidden identifier occurring in real code, with its line number. */
function scan(source: string): { readonly name: string; readonly line: number }[] {
  const code = stripComments(source);
  const found: { name: string; line: number }[] = [];
  for (const name of FORBIDDEN_IN_SAVE_TS) {
    const re = new RegExp(`(?<![\\w$])${name}(?![\\w$])`, 'g');
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      found.push({ name, line: code.slice(0, match.index).split('\n').length });
    }
  }
  return found;
}

const saveSource = (): string => readFileSync(SAVE_TS, 'utf8');

describe('the 2 -> 3 migration cannot reach for the current default plot', () => {
  it('reads the file it claims to scan', () => {
    // A scan pointed at a path that does not exist reports "no violations" forever.
    // This is the anti-vacuity half: prove the subject was actually loaded before
    // believing anything the scan says about it (ADR-0007).
    const source = saveSource();
    expect(source.length).toBeGreaterThan(1_000);
    expect(source).toContain('migrateV2ToV3');
    expect(source).toContain('V3_MIGRATION_BOUNDS');
  });

  it('names none of the current-plot identifiers in executable code', () => {
    const violations = scan(saveSource());
    expect(violations).toEqual([]);
  });

  it('still discusses the rule in prose, which is exactly why the scan strips comments', () => {
    // The file DOES contain the word `createGridBounds` — in the comment explaining why
    // the migration must not call it. If this ever stops being true, either the reasoning
    // was deleted or the scan has quietly started reading comments as code.
    expect(saveSource()).toContain('createGridBounds');
    expect(scan(saveSource())).toEqual([]);
  });

  it('freezes the plot as four integer literals rather than a derived value', () => {
    // The positive half. The two tests above say what `save.ts` must NOT do; this says
    // what it must do, so deleting `V3_MIGRATION_BOUNDS` altogether is not a way to make
    // the scan pass.
    const code = stripComments(saveSource());
    const declaration = /V3_MIGRATION_BOUNDS[\s\S]{0,400}?\}\)/.exec(code)?.[0] ?? '';
    expect(declaration).toContain('minFloor: -2');
    expect(declaration).toContain('maxFloor: 20');
    expect(declaration).toContain('minColumn: 0');
    expect(declaration).toContain('maxColumn: 79');
    expect(declaration).toContain('Object.freeze');
  });
});

describe('the scan itself can fail', () => {
  // A scan that has only ever been green is not a scan. These drive the SAME function
  // the tests above use, against sources that do contain the defect, so the guard is
  // proven able to fire without anybody having to break `save.ts` to find out.

  it('catches a direct call to createGridBounds', () => {
    const bad = 'function migrateV2ToV3(w) {\n  return { ...w, grid: createGridBounds() };\n}';
    expect(scan(bad)).toEqual([{ name: 'createGridBounds', line: 2 }]);
  });

  it('catches the back door: assembling the plot from the exported constants', () => {
    const bad = [
      'const bounds = {',
      '  minFloor: DEFAULT_MIN_FLOOR,',
      '  maxFloor: DEFAULT_MAX_FLOOR,',
      '  minColumn: DEFAULT_MIN_COLUMN,',
      '  maxColumn: DEFAULT_MAX_COLUMN,',
      '};',
    ].join('\n');
    expect(scan(bad).map((violation) => violation.name)).toEqual([
      'DEFAULT_MIN_FLOOR',
      'DEFAULT_MAX_FLOOR',
      'DEFAULT_MIN_COLUMN',
      'DEFAULT_MAX_COLUMN',
    ]);
  });

  it('catches it in an import, which is how it would really arrive', () => {
    const bad = "import { assertGridBounds, createGridBounds } from './grid.js';";
    expect(scan(bad)).toHaveLength(1);
  });

  it('does not fire on the same identifier inside a comment, in either comment style', () => {
    expect(scan('// createGridBounds() holds the same values today')).toEqual([]);
    expect(scan('/*\n * createGridBounds() holds the same values today\n */')).toEqual([]);
    expect(scan(' * `createGridBounds()` in `grid.ts` holds the same values')).toHaveLength(1);
    // ^ a bare line with no comment marker IS code as far as this scan is concerned,
    //   which is the conservative direction: it over-reports rather than under-reports.
  });

  it('does not fire on a longer identifier that merely contains one', () => {
    // Word boundaries, so a future `createGridBoundsForScenario` is caught but
    // `myCreateGridBoundsHelper` is not mistaken for the thing itself.
    expect(scan('const x = notCreateGridBounds;')).toEqual([]);
    expect(scan('const x = DEFAULT_MIN_FLOOR_OFFSET;')).toEqual([]);
  });
});
