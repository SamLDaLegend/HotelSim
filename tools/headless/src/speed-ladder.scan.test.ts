// I3, G-021 — THE PLAY SPEED IS CONTENT, AND NO SOURCE FILE MAY HOLD ONE.
//
//   pnpm exec vitest run speed-ladder
//
// The ladder lives in `packages/content/data/speed-ladder.json`. That is worth nothing on
// its own: a JSON file can sit beside a constant that nobody deleted, and every gate stays
// green. `check:content` cannot see this — it hunts snake_case string literals and cannot
// tell a play speed from any other `30`.
//
// SO THE CHECK IS NAMED RATHER THAN NUMERIC. A ticks-per-second figure is unrecognisable as
// a bare number, but it is entirely recognisable when it is BOUND TO AN IDENTIFIER THAT SAYS
// WHAT IT IS. `const SPEEDS = [...]` and `let ticksPerSecond = 30` are exactly that, and
// both were live in `tools/viewer/viewer.js` when this file was written.
//
// WHAT IT FOUND AT HEAD, recorded because "RED at HEAD" is itself a claim that needs
// evidence (the goal's own criterion 1, and the reason the criterion was rewritten):
//
//   tools/gates/budget.mjs:39   export const TOP_SPEED_TICKS_PER_SECOND = 30;
//   tools/viewer/viewer.js:551  const SPEEDS = [1, 5, 30, 120];
//   tools/viewer/viewer.js:552  let ticksPerSecond = 30;
//
// Three bindings in two files — the gate's copy of the provisional figure, the viewer's
// whole hardcoded ladder (containing the dead 1x the human killed), and the viewer's
// default rung ONE LINE BELOW it, which the goal block did not name and which a builder
// implementing to the block would have left behind.
//
// WHAT THIS SCAN DOES NOT REACH, stated rather than implied, and MEASURED rather than
// guessed — both limits below were observed during this goal's mutation probe.
//
//   1. IT CANNOT SEE A LITERAL BURIED IN AN EXPRESSION. `budget.mjs` was mutated to
//      `= SPEED_LADDER.length > 0 ? 30 : 30` — the whole defect, wearing a reference to the
//      content it ignores — and this scan stayed silent, because nothing is BOUND to the
//      identifier. `speed-ladder.budget.test.ts` caught it in two arms (FASTER and SLOWER),
//      which is the division of labour: this file hunts the declaration, that one hunts the
//      behaviour, and neither is sufficient alone.
//   2. IT CANNOT SEE ARITHMETIC BETWEEN RUNGS. `ladder[i].ticksPerRealSecond /
//      ladder[0].ticksPerRealSecond` binds nothing and matches nothing here. That is the
//      failure the human's ruling actually names ("M5 hardcodes 1x/2x/3x"), it is a
//      property of `apps/game` source at M5, and it is parked with its falsification test
//      in `PARKING.md`. `apps/game/src` is in the root set below so that the day it grows a
//      speed constant, this fires — reading that directory is not working in it
//      (HOTELSIM.md §9).
//
// -----------------------------------------------------------------------------------
// §5.8 — WHERE ELSE "A CONSTANT THAT SHOULD BE CONTENT" LIVES, CHECKED, WITH LOCATIONS.
//
// The rule's guard is that "checked, clean" is itself a claim: NAME WHERE WAS CHECKED, not
// only that it was, because a location can be re-inspected and an assurance cannot
// (`HOTELSIM.md`:268). Eight sites, one of which carried the class:
//
//   tools/viewer/viewer.js:551-552   CARRIED IT — the whole hardcoded ladder plus its
//                                    default rung. Fixed by this goal; the scan below is
//                                    what stops it coming back.
//   packages/sim/src/world.ts:33     TICKS_PER_DAY. Clean: a UNIT of simulated time, not a
//                                    designer's dial. It is the denominator of every hash,
//                                    and it is already pinned across the package boundary
//                                    by `bench.budget.test.ts`.
//   packages/sim/src/grid.ts:85-88   plot bounds. Clean, and previously RULED — see the
//                                    `economySchema` note in `packages/content/src/schema.ts`
//                                    ("the board, not a piece"), whose decisive argument is
//                                    that bounds cannot be optional, so making them content
//                                    would leave the permanent v1 fixture a husk that loads
//                                    and cannot tick.
//   packages/sim/src/content.ts:1408,1420 and utility.ts:141   ONE_WHOLE_BASIS_POINTS and
//                                    its derivatives. Clean: a definition of what "whole"
//                                    means, not a tunable. Every dial expressed IN them is
//                                    already content.
//   tools/gates/workload.mjs:26,29,32,114   ROOMS, ARRIVAL_EVERY_TICKS, SEED, MEASURE_DAYS.
//                                    Clean: they describe the MEASUREMENT, not the game. I3
//                                    names room types, items, staff roles and archetypes.
//   tools/gates/budget.mjs:S,H       Clean: labelled assumptions about unbuilt systems
//                                    inside a derivation, decomposed in HOTELSIM.md §2.1.2.
//                                    No designer will ever open them.
//   packages/sim/src/save.ts:25,28   schema versions. Clean: protocol, not content.
//   packages/content/data/*.json     prices, upkeep, refunds, capacities, refill rates, want
//                                    lines, stay durations, tolerances, fit, abandon margin —
//                                    ALREADY content. (It listed "patience, satisfy ticks"
//                                    until θ-a sweep 3; ADR-0017 §1 deleted both from the
//                                    shipped tables, so the inventory named two fields no
//                                    designer can open those files and find.)
// -----------------------------------------------------------------------------------
//
// THE SCANNER IS WRITTEN OUT HERE rather than imported from `tools/gates/lib/scan.mjs`,
// because `tools/headless`'s tsconfig is `src/**/*.ts` with no `allowJs`. Precedent:
// `viewer.readonly.test.ts` and `migration-scan.*.test.ts` do the same for the same reason.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * Every place a play speed could hide, one root at a time.
 *
 * COUNTED PER ROOT, NOT GLOBALLY, and that is the difference between a scan and a
 * decoration. `tools/` alone contributes ~40 files, so a single total of "60 files visited"
 * stays comfortably non-zero while `packages/sim/src` is misspelt and contributes nothing.
 * A dead root is exactly the ADR-0007 shape this file exists to hunt, and only a per-root
 * count can see it.
 */
const ROOTS = [
  'packages/sim/src',
  'apps/game/src',
  'tools/gates',
  'tools/headless/src',
  'tools/viewer',
] as const;

/**
 * Identifiers that MEAN a play speed, bound to a literal.
 *
 * `SPEEDS` and `ticksPerSecond` are here because the viewer used both; the
 * `TICKS_PER_SECOND` family because that is what the gate constant was called. An array
 * literal counts as much as a number: a ladder is the whole defect, not one rung of it.
 *
 * `ticksPerRealSecond` — the CONTENT field name — is included deliberately. It is legal in
 * `packages/content/data/*.json`, which is not source and is not scanned; it appearing in a
 * `.ts` or `.js` file under a root below means a rung has been written into code.
 */
const SPEED_BINDING_SOURCE =
  '\\b(SPEEDS?|TICKS_PER_SECOND|TICKS_PER_REAL_SECOND|TOP_SPEED[A-Z_]*|ticksPerSecond|ticksPerRealSecond)' +
  '\\b["\']?\\s*[:=]\\s*(\\[[^\\]]*\\]|-?\\d[\\d_.]*)';

/**
 * Fresh each call — no `lastIndex` leaks between files.
 *
 * BUILT FROM A STRING RATHER THAN WRITTEN AS A REGEX LITERAL, and the reason is a defect
 * this file found in itself. `stripComments` below has no regex-literal handling, so the
 * `'` inside a character class opened a string it never closed, and every comment for the
 * next several dozen lines survived stripping — including the two paragraphs that talk
 * about `ticksPerSecond`, which the scan then reported as violations of itself. A quote
 * inside a normal string literal is handled correctly; inside a regex literal it is not.
 *
 * WHERE ELSE THIS BLIND SPOT LIVES — §5.8, AND THE FIRST SWEEP OF IT STOPPED AT THE TEST
 * FILES, which is verbatim the shape `CLAUDE.md` records for G-016's retraction. Named so
 * the next reader reaches the copies rather than the report:
 *
 *   tools/gates/lib/scan.mjs:41       THE SAME FUNCTION WITH THE SAME OMISSION, and it sits
 *                                     behind THREE INVARIANT GATES: `check-purity.mjs:19`
 *                                     (I1), `check-content.mjs:28` (I3) and
 *                                     `determinism.mjs:22` (I2) all import `stripComments`
 *                                     from it. (`check-measure.mjs:75` and
 *                                     `check-tripwire.mjs:68` import only `finish`, so they
 *                                     do not carry it.)
 *   tools/headless/src/viewer.readonly.test.ts   its own copy, same omission.
 *   this file                         fixed, by not writing the literal.
 *
 * NOT A BLOCKER, AND THE REASON IS THE FAILURE DIRECTION: an unterminated span is emitted
 * VERBATIM rather than blanked, so comments survive and a gate FALSE-POSITIVES. It fails
 * loud and safe — nothing is silently deleted from what those gates inspect, which is the
 * direction that would matter. Parked with its falsification test.
 */
const speedBinding = (): RegExp => new RegExp(SPEED_BINDING_SOURCE, 'g');

type Violation = { readonly where: string; readonly text: string };

/**
 * Blank comments, keep strings and byte offsets.
 *
 * Comments must go, or this fires on the paragraph above explaining what it bans. Strings
 * stay because a speed smuggled through `JSON.parse('{"ticksPerSecond":30}')` is the same
 * defect wearing quotes.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (t: string): string => t.replace(/[^\n]/g, ' ');
  while (i < source.length) {
    const four = source.slice(i, i + 4);
    const two = source.slice(i, i + 2);
    if (four === '<!--') {
      const end = source.indexOf('-->', i + 4);
      const stop = end === -1 ? source.length : end + 3;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (two === '//') {
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

/** Every speed binding in one file's text, with its line number. */
function scanSource(where: string, raw: string): readonly Violation[] {
  const source = stripComments(raw);
  const found: Violation[] = [];
  const pattern = speedBinding();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const line = source.slice(0, match.index).split('\n').length;
    found.push({ where: `${where}:${line}`, text: match[0].trim() });
  }
  return found;
}

function filesUnder(root: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|js|mjs|cjs|html)$/.test(entry)) out.push(full);
    }
  };
  walk(join(ROOT, root));
  return out;
}

const scanned = ROOTS.map((root) => {
  const files = filesUnder(root);
  const violations = files.flatMap((file) =>
    scanSource(relative(ROOT, file).split('\\').join('/'), readFileSync(file, 'utf8')),
  );
  return { root, count: files.length, violations };
});

describe('the scan can see, and it is shown to bite (ADR-0007)', () => {
  // Assembled from pieces so that this file's own text carries no speed binding — the
  // scanner covers `tools/headless/src`, so a contiguous copy of the defect here would make
  // the check fire on the test that proves it fires. That is not an exclusion: this file IS
  // scanned, and it is clean.
  const viewerAtHead = [
    ['const ', 'SPEEDS', ' = [1, 5, 30, 120];'].join(''),
    ['let ', 'ticksPerSecond', ' = 30;'].join(''),
  ].join('\n');

  it('finds both of the viewer lines that were live at HEAD', () => {
    const found = scanSource('synthetic.js', viewerAtHead);
    expect(found.map((v) => v.where)).toEqual(['synthetic.js:1', 'synthetic.js:2']);
  });

  it('finds a gate constant, an object property, a decimal and a quoted JSON key', () => {
    const cases = [
      ['export const ', 'TOP_SPEED_TICKS_PER_SECOND', ' = 30;'].join(''),
      ['{ ', 'ticksPerRealSecond', ': 12 }'].join(''),
      ['const ', 'TICKS_PER_SECOND', ' = 7.5;'].join(''),
      // The quoted form is covered because the header claims it is. It was NOT, until this
      // case was written: the pattern required the identifier to be followed directly by
      // `:`, so `JSON.parse('{"ticksPerSecond":30}')` — a speed smuggled through a string
      // literal — walked straight past a scan whose comment said it could not. Found by the
      // scan firing on this file's own sibling test and then being asked what else it missed.
      ['JSON.parse(\'{"', 'ticksPerSecond', '":30}\')'].join(''),
    ];
    for (const source of cases) expect(scanSource('synthetic.ts', source)).toHaveLength(1);
  });

  it('does NOT fire on prose describing the ban, or on a derived expression', () => {
    const prose = ['// ', 'const ', 'SPEEDS', ' = [1, 5, 30, 120]; is what this bans'].join('');
    expect(scanSource('synthetic.js', prose)).toEqual([]);
    const derived = ['const ', 'TOP_SPEED_TICKS_PER_SECOND', ' = topSpeedOf(ladder);'].join('');
    expect(scanSource('synthetic.mjs', derived)).toEqual([]);
  });
});

describe('every root is alive — a dead root reports zero and looks clean', () => {
  it.each(scanned)('$root contributes files to the scan', ({ root, count }) => {
    expect(count, `${root} matched no source files — is the path still right?`).toBeGreaterThan(0);
  });
});

describe('no play speed is defined in code (I3, G-021)', () => {
  it('finds zero speed bindings across every root', () => {
    const all = scanned.flatMap(({ violations }) => violations);
    const report = all.map((v) => `  ${v.where}  ${v.text}`).join('\n');
    expect(
      all,
      `a play speed is defined in code. The ladder is content:\n` +
        `packages/content/data/speed-ladder.json (I3, G-021).\n${report}\n`,
    ).toEqual([]);
  });
});
