// THE DEFECT ONLY macOS COULD SHOW, STAGED SO IT BITES ON EVERY PLATFORM (G-022).
//
//   pnpm exec vitest run tempdir.symlink
//
// WHAT HAPPENED. The first CI matrix this project ever ran went green on Linux and Windows and
// red on macOS, three runs out of three, on exactly two rows: `check:measure` and
// `check:tickcost:proof`. Both are instruments that materialise an arm in a temporary directory
// and then ASSERT that the simulation the arm imported came from inside that directory —
// `measure.mjs:269` and `needs-history.mjs:180`, the guard against G-018's leak.
//
// On macOS `os.tmpdir()` is `/var/folders/…`, and `/var` is a symlink to `/private/var`. Node's
// ESM loader canonicalises symlinks when it resolves a module, so the arm's own file comes back
// as `/private/var/folders/…` while the directory string says `/var/folders/…`. The prefix test
// fails, the instrument correctly concludes it cannot attest which copy of the simulation ran,
// and it refuses to report. CORRECT BEHAVIOUR ON A WRONG PREMISE — which is why both rows failed
// FASTER than the other platforms passed, and why no timing bound was involved.
//
// WHY NO EXISTING PROOF-OF-BITE TEST COULD HAVE CAUGHT IT: every gate harness in this repository
// runs on the machine that wrote it, and on that machine the raw temp path is ALREADY canonical,
// so the defect is unreachable. G-022 built two new harnesses, for I1 and I2, and neither would
// have found this. It took a second operating system — the argument for the matrix, made concrete
// on its first run.
//
// AND THE FIRST DRAFT OF THIS FILE HAD THE SAME DISEASE, WHICH IS WHY IT IS WORTH READING.
// It asserted `realpathSync(makeTempDir(…)) === makeTempDir(…)` and claimed to fail everywhere
// without the fix. It does not: on Windows and Linux that assertion passes against the RAW
// `mkdtempSync` too, because the raw path is already canonical there. A proof of a cross-platform
// fix that can only fail on the platform that already failed is not a proof — it is the same
// vacuity one level up, in the goal whose subject is vacuous checks.
//
// SO THE ALIAS IS PUT WHERE macOS PUTS IT: IN `os.tmpdir()` ITSELF. A child process runs with
// `TMPDIR`/`TEMP`/`TMP` pointed at a symlink to a real directory — a junction on Windows, a
// symlink elsewhere, one call either way. Then `os.tmpdir()` returns an aliased path on EVERY
// platform, exactly as it does on macOS, and the two arms below are the fix and its absence
// measured in the same conditions.

import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const HELPER = pathToFileURL(join(ROOT, 'tools/gates/lib/tempdir.mjs')).href;

const made: string[] = [];

/** A real directory plus an aliased path that reaches it through a symlink. */
function aliasedDir(): { readonly real: string; readonly alias: string } {
  const real = realpathSync(mkdtempSync(join(tmpdir(), 'hotelsim-alias-real-')));
  const alias = `${real}-alias`;
  // The type argument is Windows-only and ignored elsewhere: a junction needs no privilege on
  // Windows, where a true symlink does. One call covers all three CI platforms.
  symlinkSync(real, alias, 'junction');
  made.push(alias, real);
  return { real, alias };
}

/**
 * Run `program` in a child whose temp directory is `alias`, and return its stdout.
 *
 * A child rather than this process, because `os.tmpdir()` is read from the environment at call
 * time and mutating it in the test runner would leak into every other file sharing the worker.
 */
function inAliasedTmp(alias: string, program: string): string {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', program], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: alias, TEMP: alias, TMP: alias, NODE_NO_WARNINGS: '1' },
  });
  if (result.status !== 0) throw new Error(`probe failed: ${result.stderr}`);
  return result.stdout.trim();
}

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true });
});

describe('THE STAGED CONDITION — os.tmpdir() reaches a real directory through a symlink', () => {
  it('the alias really is an alias, or every arm below is vacuous', () => {
    // THE CONTROL THAT MAKES THE REST MEAN ANYTHING. If pointing the environment at a symlink did
    // not take — a platform that ignores TMPDIR, a junction that silently resolved at creation —
    // then the raw path would be canonical, the "without the fix" arm would pass, and this file
    // would report a working fix while testing nothing. So the aliasing is asserted first.
    const { real, alias } = aliasedDir();
    expect(alias).not.toBe(real);
    expect(realpathSync(alias)).toBe(real);

    const seen = inAliasedTmp(alias, 'import { tmpdir } from "node:os"; process.stdout.write(tmpdir());');
    expect(seen).toBe(alias);
  });

  it('AND WITHOUT THE FIX THE PATH IS NOT CANONICAL — the macOS condition, on this machine', () => {
    // The raw call the four gate call sites used to make. On macOS this is what shipped; here it
    // is staged. Either way the string names a directory the loader will report differently.
    const { real, alias } = aliasedDir();
    const out = inAliasedTmp(
      alias,
      'import { mkdtempSync, realpathSync } from "node:fs";' +
        'import { tmpdir } from "node:os";' +
        'import { join } from "node:path";' +
        'const dir = mkdtempSync(join(tmpdir(), "probe-"));' +
        'process.stdout.write(JSON.stringify([dir, realpathSync(dir)]));',
    );
    const [raw, canonical] = JSON.parse(out) as [string, string];

    expect(raw).not.toBe(canonical);
    expect(raw.startsWith(alias + sep)).toBe(true);
    expect(canonical.startsWith(real + sep)).toBe(true);

    // And this is `measure.mjs:269` evaluated against that raw path: the containment check the
    // instruments make, returning false for a module that IS inside the arm.
    const moduleInside = join(canonical, 'packages/sim/src/index.ts');
    expect(moduleInside.startsWith(raw + sep)).toBe(false);
  });

  it('AND WITH THE FIX IT IS CANONICAL, so the same containment check holds', () => {
    const { alias } = aliasedDir();
    const out = inAliasedTmp(
      alias,
      `import { makeTempDir } from ${JSON.stringify(HELPER)};` +
        'import { realpathSync } from "node:fs";' +
        'const dir = makeTempDir("probe-");' +
        'process.stdout.write(JSON.stringify([dir, realpathSync(dir)]));',
    );
    const [dir, canonical] = JSON.parse(out) as [string, string];

    expect(dir).toBe(canonical);
    const moduleInside = join(canonical, 'packages/sim/src/index.ts');
    expect(moduleInside.startsWith(dir + sep)).toBe(true);
  });
});

describe('the mechanism itself, asserted rather than described', () => {
  it('the ESM loader canonicalises a module reached through an alias', async () => {
    // `recorder-hooks.mjs` logs the url `next()` returned — "a specifier is what someone wrote;
    // a url is what node loaded" — so what the instrument compares against is always canonical,
    // whatever string the arm directory was built from.
    const { real, alias } = aliasedDir();
    writeFileSync(join(real, 'module.mjs'), 'export const self = import.meta.url;\n', 'utf8');

    const viaAlias = pathToFileURL(join(alias, 'module.mjs')).href;
    const loaded = (await import(viaAlias)) as { readonly self: string };

    expect(loaded.self).not.toBe(viaAlias);
    expect(loaded.self).toBe(pathToFileURL(join(real, 'module.mjs')).href);
  });
});
