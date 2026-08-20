// THE THREE VIEW MODULES `tools/` MAY IMPORT ARE STILL PURE (G-035).
//
//   pnpm exec vitest run view-fence
//
// ============================================================================
// A PATH LIST SAYS WHICH FILES ARE ALLOWED. IT CANNOT SAY THEY ARE STILL WHAT THEY WERE.
//
// `.dependency-cruiser.cjs` carries a fence: only `apps/game/src/view/palette.ts`, `iso.ts`
// and `depth.ts` may be imported from `tools/`. It was one file at G-030 and it is three at
// G-035. The fence's own stated reason is NOT "these three are special" — it is:
//
//   "The next test to reach into the render layer would import `view/scene.ts`, which pulls
//    Pixi — and therefore a WebGL renderer and a DOM — into the test tree that
//    `packages/sim` shares."
//
// THAT PROPERTY IS ABOUT WHAT THE ALLOWED FILES IMPORT, AND THE PATH LIST CANNOT SEE IT. Add
// `import { Graphics } from 'pixi.js'` to `iso.ts` tomorrow and every gate stays green while
// a WebGL context appears in the simulation's own test run. So the property is asserted here,
// against the bytes on disk.
//
// WIDENING A FENCE WITHOUT CHECKING WHAT IT NOW ADMITS IS HOW A FENCE STOPS BEING ONE. This
// file is the price of the widening, and it is deliberately cheap.
//
// IT READS THREE NAMED FILES AND WALKS NO TREE. `scanner.census.test.ts` draws the scanner
// line at tree-walking, because a walker whose predicate decays reports a clean tree forever;
// a check that reads one named file throws at the read when its subject moves. Everything
// below is `readFileSync` on a path written out in full.
//
// PROOF OF BITE, because a predicate nobody has watched fail is a predicate nobody should
// trust (M2 exit ruling): the last `describe` drives the same predicate over synthetic
// sources — one clean, one importing Pixi, one importing a DOM type — and requires it to
// separate them. The pattern is built from a NORMAL STRING with its backslashes doubled and
// is then compiled and checked, because `CLAUDE.md` records three goals lost to a backslash a
// template literal ate.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * THE THREE FILES THE FENCE ADMITS, spelled exactly as `.dependency-cruiser.cjs` spells them.
 *
 * The tie between this list and the fence is BY EYE and is said so rather than implied — the
 * same honesty `stock.census.test.ts` applies to its own block-versus-list tie. What executes
 * is list-versus-disk: a file that moves throws at the read.
 */
const ALLOWED = [
  'apps/game/src/view/palette.ts',
  'apps/game/src/view/iso.ts',
  'apps/game/src/view/depth.ts',
];

/**
 * WHAT AN ALLOWED MODULE MAY IMPORT.
 *
 * `@hotelsim/sim` is on the list because `palette.ts` has always imported it — the sim is the
 * thing `tools/` is already full of, and it drags in no browser. A RELATIVE import is allowed
 * only if it resolves to another file on `ALLOWED`, which is what stops the fence being
 * defeated one hop out.
 */
const ALLOWED_PACKAGES = ['@hotelsim/sim'];

/** Every module specifier in a source file — `import … from 'x'` and `export … from 'x'`. */
const SPECIFIER_SOURCE = '\\bfrom\\s*[\'"]([^\'"]+)[\'"]';

export function specifiersIn(source: string): readonly string[] {
  const pattern = new RegExp(SPECIFIER_SOURCE, 'g');
  const found: string[] = [];
  let match = pattern.exec(source);
  while (match !== null) {
    const specifier = match[1];
    if (specifier !== undefined) found.push(specifier);
    match = pattern.exec(source);
  }
  return found;
}

/** Which specifiers in `source` are NOT permitted for a file sitting at `file`. */
export function forbiddenSpecifiers(file: string, source: string, allowed: readonly string[]): readonly string[] {
  const here = file.slice(0, file.lastIndexOf('/'));
  return specifiersIn(source).filter((specifier) => {
    if (ALLOWED_PACKAGES.includes(specifier)) return false;
    if (!specifier.startsWith('.')) return true;
    // `./iso.js` beside `apps/game/src/view/depth.ts` is `apps/game/src/view/iso.ts` — the
    // `.js` extension is what TypeScript's ESM output requires and what the source writes.
    const target = `${here}/${specifier.replace(/^\.\//u, '').replace(/\.js$/u, '.ts')}`;
    return !allowed.includes(target);
  });
}

describe('the fence admits only files that are still pure', () => {
  it('names three files, and every one of them exists', () => {
    // Vacuity first: an empty list satisfies every assertion below.
    expect(ALLOWED).toHaveLength(3);
    for (const file of ALLOWED) {
      expect(readFileSync(join(ROOT, file), 'utf8').length).toBeGreaterThan(0);
    }
  });

  it('none of them imports Pixi, the DOM, or anything outside the fence', () => {
    for (const file of ALLOWED) {
      const source = readFileSync(join(ROOT, file), 'utf8');
      expect(forbiddenSpecifiers(file, source, ALLOWED), file).toEqual([]);
    }
  });

  it('iso.ts imports nothing at all — it is arithmetic', () => {
    // The strongest form of the property, and the one the widening argument rests on. If this
    // ever needs relaxing, the widening argument needs rewriting with it.
    expect(specifiersIn(readFileSync(join(ROOT, 'apps/game/src/view/iso.ts'), 'utf8'))).toEqual([]);
  });

  it('depth.ts imports iso.ts and nothing else', () => {
    const source = readFileSync(join(ROOT, 'apps/game/src/view/depth.ts'), 'utf8');
    expect([...new Set(specifiersIn(source))]).toEqual(['./iso.js']);
  });
});

describe('PROOF OF BITE — the predicate separates the cases it claims to', () => {
  const at = 'apps/game/src/view/iso.ts';

  it('passes a module that imports only the sim', () => {
    const clean = "import type { Cell } from '@hotelsim/sim';\nexport const x: Cell | null = null;\n";
    expect(forbiddenSpecifiers(at, clean, ALLOWED)).toEqual([]);
  });

  it('FAILS a module that imports Pixi', () => {
    const dirty = "import { Graphics } from 'pixi.js';\nexport const g = Graphics;\n";
    expect(forbiddenSpecifiers(at, dirty, ALLOWED)).toEqual(['pixi.js']);
  });

  it('FAILS a module that reaches a file outside the fence', () => {
    const dirty = "import { createScene } from './scene.js';\nexport const s = createScene;\n";
    expect(forbiddenSpecifiers(at, dirty, ALLOWED)).toEqual(['./scene.js']);
  });

  it('FAILS an `export … from` re-export, which is an import wearing another word', () => {
    expect(forbiddenSpecifiers(at, "export { Sprite } from 'pixi.js';\n", ALLOWED)).toEqual(['pixi.js']);
  });

  it('passes a relative import that lands back inside the fence', () => {
    expect(forbiddenSpecifiers('apps/game/src/view/depth.ts', "import { toView } from './iso.js';\n", ALLOWED)).toEqual([]);
  });

  it('the specifier pattern compiles from the SHIPPED string, with a real word boundary', () => {
    // `CLAUDE.md`: in a template literal the backslash is consumed and `\b` becomes a bare
    // `b`. `SPECIFIER_SOURCE` is a normal string with doubled backslashes; this compiles it
    // and shows the boundary is real — a decayed one would match inside `platform 'x'`.
    const pattern = new RegExp(SPECIFIER_SOURCE, 'g');
    expect(pattern.source).toContain('\\b');
    expect(specifiersIn("const platform = 'x';\n")).toEqual([]);
    expect(specifiersIn("import a from 'b';\n")).toEqual(['b']);
  });
});
