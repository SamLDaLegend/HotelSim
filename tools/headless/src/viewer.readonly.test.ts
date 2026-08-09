// G-017 — "IT CANNOT ACT", MADE MECHANICAL RATHER THAN PROMISED.
//
// ADR-0013 §1 makes the viewer a REPLAY viewer so that read-only is STRUCTURAL: it
// consumes frames from a completed run and there is no simulation to send a command to.
// A structural argument still has to be checkable, because the structure is only one
// careless import away from being untrue. So:
//
//   1. nothing under tools/viewer imports the simulation, or anything outside its own
//      directory;
//   2. nothing under tools/viewer constructs a `Command` — no command-kind literal, and
//      no reference to the functions that would run one;
//   3. and the scanner is shown to BITE, against a synthetic file carrying both
//      violations, and shown NOT to fire on the sentences describing them.
//
// (3) is the part that matters most. A scan with a wrong root directory finds nothing,
// reports nothing, and passes forever — ADR-0007's named defect, and this file would be
// exactly the shape of it. Hence the positive control and the visited-file assertion.
//
// The scanner is written out here rather than imported from tools/gates/lib/scan.mjs
// because tools/headless's tsconfig includes only `src/**/*.ts` and has no allowJs, so a
// .mjs import would fail typecheck. `migration-scan.*.test.ts` sets the same precedent.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const VIEWER = join(ROOT, 'tools/viewer');

/**
 * Blank comments, keeping string literals and byte offsets.
 *
 * Comments must go or the scan fires on the paragraph explaining why an identifier is
 * banned; strings must stay or the command-kind check has nothing to look at.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  const blank = (t: string) => t.replace(/[^\n]/g, ' ');
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
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === ch) { i += 1; break; }
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

/** Module specifiers, from `import ... from '…'`, bare/dynamic `import('…')`, and `src="…"`. */
function specifiersOf(source: string): readonly string[] {
  const found: string[] = [];
  for (const re of [
    /(?:^|[\s;}])(?:import|export)[\s\S]{0,400}?from\s*(['"])([^'"]+)\1/g,
    /(?:^|[\s;}])import\s*\(?\s*(['"])([^'"]+)\1/g,
    /\bsrc\s*=\s*(['"])([^'"]+)\1/g,
  ]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) found.push(m[2] as string);
  }
  return found;
}

function stringLiteralsOf(source: string): readonly string[] {
  const found: string[] = [];
  const re = /(['"])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) found.push(m[2] as string);
  return found;
}

/**
 * Every `Command` kind in `packages/sim/src/commands.ts`, read from the sim's own source.
 *
 * NOT A HAND-COPIED LIST. `Command` is a discriminated union of TYPES, so there is no
 * runtime value to import; a literal list here would go quietly out of date the first time
 * a command is added, and the check would stop covering the new one — silently, which is
 * the failure mode this whole file exists to avoid. Reading the union is the closest thing
 * to importing it, and the length assertion below fails loudly if the shape ever changes.
 */
function commandKinds(): readonly string[] {
  const source = readFileSync(join(ROOT, 'packages/sim/src/commands.ts'), 'utf8');
  const kinds = [...stripComments(source).matchAll(/readonly kind:\s*'([a-zA-Z]+)'/g)].map((m) => m[1] as string);
  return [...new Set(kinds)];
}

/**
 * Every VALUE the simulation exports for running a tick or making and reading a world,
 * read out of `index.ts`'s own re-export blocks.
 *
 * DERIVED, FOR THE REASON `commandKinds` IS. A hand-typed list ten lines under a function
 * that argues against hand-typed lists is a file making the case against itself — the
 * critic's finding, and it was right. The day a phase or a save entry point is added, a
 * literal list would silently stop covering it.
 *
 * WHY THESE THREE MODULES AND NOT EVERY SIM EXPORT. `tick.js` is everything that could run
 * a command, `save.js` is everything that could read or write a world, and `createWorld` is
 * the only way to make one. Banning the WHOLE export surface was tried and is wrong: the
 * viewer legitimately declares its own `NO_ENTITY` and `TICKS_PER_DAY`, which the sim also
 * exports, and a check that forced those to be renamed would be punishing the viewer for a
 * duplication it has no way to avoid — it cannot import them, which is the point. That
 * duplication is real and is recorded as a coupling in viewer.js rather than hidden.
 *
 * `type` re-exports are skipped: a type cannot run anything and is erased anyway.
 */
function simRuntimeExports(): readonly string[] {
  const source = stripComments(readFileSync(join(ROOT, 'packages/sim/src/index.ts'), 'utf8'));
  const names = new Set<string>(['createWorld']);
  for (const module of ['tick.js', 'save.js']) {
    const block = new RegExp(`export\\s*\\{([^}]*)\\}\\s*from\\s*'\\./${module.replace('.', '\\.')}'`, 'g');
    for (const match of source.matchAll(block)) {
      for (const raw of (match[1] as string).split(',')) {
        const name = raw.trim().split(/\s+as\s+/)[0]?.trim();
        if (name !== undefined && /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'type') names.add(name);
      }
    }
  }
  return [...names].sort();
}

const BANNED_IDENTIFIERS = simRuntimeExports();

type Scanned = { readonly where: string; readonly source: string };

function viewerFiles(): readonly Scanned[] {
  const out: Scanned[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(js|mjs|cjs|html|ts)$/.test(entry)) {
        out.push({ where: relative(ROOT, full).split('\\').join('/'), source: stripComments(readFileSync(full, 'utf8')) });
      }
    }
  };
  walk(VIEWER);
  return out;
}

/** The two checks, as one function, so the positive control exercises the shipped one. */
function violationsIn(file: Scanned, kinds: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const spec of specifiersOf(file.source)) {
    if (/@hotelsim|packages[/\\]sim|^\.\.[/\\]/.test(spec)) found.push(`imports "${spec}"`);
  }
  for (const literal of stringLiteralsOf(file.source)) {
    if (kinds.includes(literal)) found.push(`constructs command "${literal}"`);
  }
  for (const id of BANNED_IDENTIFIERS) {
    if (new RegExp(`(?<![.\\w$])${id}(?![\\w$])`).test(file.source)) found.push(`references \`${id}\``);
  }
  return found;
}

const files = viewerFiles();
const kinds = commandKinds();

describe('tools/viewer cannot act', () => {
  it('found the viewer to scan at all', () => {
    // A wrong root would make every assertion below pass over an empty list.
    expect(files.length).toBeGreaterThanOrEqual(3);
    expect(files.map((f) => f.where).sort()).toEqual(
      ['tools/viewer/index.html', 'tools/viewer/serve.mjs', 'tools/viewer/viewer.js'],
    );
  });

  it('read the command union out of the sim rather than guessing it', () => {
    expect(kinds).toContain('buildRoom');
    expect(kinds).toContain('guestArrives');
    expect(kinds.length).toBeGreaterThanOrEqual(7);
  });

  it('read the banned identifiers out of the sim rather than guessing them', () => {
    // A parse that quietly returned nothing would make the identifier half of this file
    // inspect nothing while still reporting green — the same failure the file-list
    // assertion above guards against for the directory walk.
    expect(BANNED_IDENTIFIERS).toEqual(expect.arrayContaining(
      ['advanceTime', 'applyCommands', 'beginTick', 'commitEntities', 'createWorld',
        'deserialise', 'run', 'runGuests', 'runSettlement', 'serialise', 'stepTick'],
    ));
    expect(BANNED_IDENTIFIERS.length).toBeGreaterThanOrEqual(15);
  });

  it('imports nothing from packages/sim and nothing outside its own directory', () => {
    const bad = files.flatMap((f) =>
      specifiersOf(f.source)
        .filter((s) => /@hotelsim|packages[/\\]sim|^\.\.[/\\]/.test(s))
        .map((s) => `${f.where}: ${s}`),
    );
    expect(bad).toEqual([]);
  });

  it('constructs no command and names no function that could run one', () => {
    const bad = files.flatMap((f) => violationsIn(f, kinds).map((v) => `${f.where}: ${v}`));
    expect(bad).toEqual([]);
  });

  it('BITES — the same scanner flags a file that does both', () => {
    const forged: Scanned = {
      where: 'forged',
      source: stripComments(
        `import { run, stepTick } from '@hotelsim/sim';\n` +
          `import { x } from '../../packages/sim/src/tick.js';\n` +
          `dispatch({ kind: 'buildRoom', at: { floor: 0, column: 0 } });\n`,
      ),
    };
    const found = violationsIn(forged, kinds);
    expect(found).toContain('imports "@hotelsim/sim"');
    expect(found).toContain('constructs command "buildRoom"');
    expect(found).toContain('references `stepTick`');
  });

  it('does not fire on prose that merely names the banned things', () => {
    const prose: Scanned = {
      where: 'prose',
      source: stripComments(
        `// It never calls stepTick and never builds { kind: 'buildRoom' }.\n` +
          `/* nor imports '@hotelsim/sim' */\n<!-- nor createWorld -->\nconst a = 1;\n`,
      ),
    };
    expect(violationsIn(prose, kinds)).toEqual([]);
  });
});

describe('tools/viewer is disposable by construction', () => {
  it('has no package.json, so it is not in the workspace and is never built', () => {
    expect(() => statSync(join(VIEWER, 'package.json'))).toThrow();
    expect(() => statSync(join(VIEWER, 'tsconfig.json'))).toThrow();
  });

  it('is plain JavaScript — no TypeScript, so there is no build step to keep alive', () => {
    expect(files.filter((f) => f.where.endsWith('.ts'))).toEqual([]);
  });
});
