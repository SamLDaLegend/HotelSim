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
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const HELPER = pathToFileURL(join(ROOT, 'tools/gates/lib/tempdir.mjs')).href;

const made: string[] = [];

/**
 * A WRITABLE directory reachable through an 8.3 short alias, or `null` if this machine has none.
 *
 * THE DISCOVERY IS A MEASUREMENT, NOT A GUESS: a candidate qualifies only if `realpathSync` and
 * `realpathSync.native` DISAGREE about it, which is exactly the condition the GitHub Windows
 * runner presents and the only thing that makes the arm below meaningful.
 *
 * `Documents` is nine characters, so a profile created before 8.3 generation was switched off
 * carries `DOCUME~1` — and the temp directory does not, which is why `tmpdir()` is tried and
 * rejected rather than assumed.
 */
const CANDIDATES = process.platform === 'win32' ? [join(homedir(), 'DOCUME~1'), tmpdir()] : [];

function shortNameBase(): string | null {
  for (const candidate of CANDIDATES) {
    try {
      if (realpathSync.native(candidate) !== realpathSync(candidate)) return candidate;
    } catch {
      // Not present on this machine; try the next. The companion test re-derives this negative
      // rather than trusting the catch.
    }
  }
  return null;
}

const SHORT_NAME_BASE = shortNameBase();

/**
 * A real directory plus an aliased path that reaches it through a symlink.
 *
 * `realpathSync.NATIVE`, AND THE REASON IS THE BEST SENTENCE IN THIS GOAL: THE TEST WRITTEN TO
 * PROVE THAT COMPARING A CANONICALISED PATH AGAINST AN UNCANONICALISED ONE IS THE DEFECT DID
 * EXACTLY THAT — on a third platform, through a second canonicalisation nobody had in mind.
 *
 * The GitHub Windows runner's `TEMP` is an 8.3 SHORT PATH — `C:\Users\RUNNER~1\…`, because the
 * account name `runneradmin` is over eight characters. Plain `realpathSync` resolves symlinks and
 * junctions but does NOT expand a short name, so `real` kept the short form; the thing that loaded
 * the module returned `C:\Users\runneradmin\…`; and the assertion below compared the two by exact
 * equality and failed. CI run #4, Windows only, and the two platforms this file was written for
 * both passed.
 *
 * AND THE FIRST VERSION OF THIS PARAGRAPH NAMED THE WRONG COMPONENT, WHICH MATTERS MORE THAN THE
 * TYPO IT LOOKS LIKE. It said "the ESM loader canonicalises short names as well as symlinks".
 * IT DOES NOT. Measured three ways here, importing one file through `C:/PROGRA~1/…` and
 * `C:/Program Files/…` and comparing module identity: plain node gives TWO instances,
 * `node --import tsx` gives TWO, and the VITEST 4.1.10 RUNNER gives ONE. Short-name
 * canonicalisation belongs to the vite/vitest module runner, not to node.
 *
 * THAT IS WHY `.native` IS RIGHT HERE AND WRONG IN `tools/gates/lib/tempdir.mjs`. This file is the
 * one place in the repository whose `import()` goes through the runner, so its expected side must
 * canonicalise the way the runner does. The gates spawn `node --import tsx`, so their roots must
 * canonicalise the way NODE does — which is plain `realpathSync`, and that helper carries the
 * ruling not to "fix" it.
 */
function aliasedDir(): { readonly real: string; readonly alias: string } {
  const real = realpathSync.native(mkdtempSync(join(tmpdir(), 'hotelsim-alias-real-')));
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
  it('the root is a FIXED POINT of the canonicalisation the RUNNER uses', () => {
    // The property that failed on the Windows runner, asserted directly: canonicalising `real`
    // again must change nothing. A short name, a symlinked ancestor, or both would move it.
    //
    // THIS ARM COVERS THE SYMLINK HALF. The short-name half is staged for real at the foot of
    // this file — see "THE REAL RUNNER CONDITION".
    //
    // THE ROUTE TO THAT ARM IS RECORDED HERE BECAUSE THE LIMIT WAS WRITTEN WRONG THREE TIMES, each
    // time by inferring from one measurement instead of taking the next one:
    //
    //   1. "8.3 generation is disabled on this volume"  — from `cmd`'s short name for a NEWLY
    //      created long-named directory coming back unchanged. True, and about CREATION.
    //   2. "so the short-name half cannot be staged locally"  — does not follow. Aliases minted
    //      before generation was switched off still RESOLVE: `realpathSync('C:/PROGRA~1')` is
    //      `C:\PROGRA~1` while `.native` is `C:\Program Files`.
    //   3. "it needs a writable path with an alias, and this account has none"  — false. `Documents`
    //      is nine characters, so `C:\Users\<user>\DOCUME~1` exists, resolves, and is writable:
    //      plain `C:\Users\Sam\DOCUME~1`, native `C:\Users\Sam\Documents`.
    //
    // NOT GENERATED IS NOT THE SAME AS DOES NOT RESOLVE, and that distinction is the whole reason
    // the real condition turned out to be reproducible on a developer box.
    const { real, alias } = aliasedDir();
    expect(realpathSync.native(real)).toBe(real);
    expect(realpathSync.native(alias)).toBe(real);
  });

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

  it('AND WITH THE FIX IT IS CANONICAL — for SYMLINKS, which is the half the gates need', () => {
    // SAY WHAT THIS COVERS, BECAUSE IT IS NOT WHAT THE FILE HEADER ONCE CLAIMED. Both sides here
    // use plain `realpathSync`, so this arm is blind to the SHORT-NAME half by construction. That
    // is deliberate and correct rather than an oversight: `makeTempDir` exists to agree with the
    // resolver its consumers use, and the instruments spawn `node --import tsx`, which does not
    // canonicalise a short name either. An arm that demanded `.native` here would be testing for
    // a disagreement with the loader.
    //
    // The half this DOES cover has teeth, and the critic measured them: revert `makeTempDir` to a
    // bare `mkdtempSync` under an aliased TMPDIR and the property below goes false.
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
  it('a module reached through a SYMLINK comes back canonicalised', async () => {
    // `recorder-hooks.mjs` logs the url `next()` returned — "a specifier is what someone wrote;
    // a url is what node loaded" — so what the instrument compares against is always canonical,
    // whatever string the arm directory was built from.
    //
    // SYMLINKS, specifically. Node canonicalises those; the short-name half is the runner's and is
    // covered by the file header's three-way measurement, not by this arm.
    const { real, alias } = aliasedDir();
    writeFileSync(join(real, 'module.mjs'), 'export const self = import.meta.url;\n', 'utf8');

    const viaAlias = pathToFileURL(join(alias, 'module.mjs')).href;
    const loaded = (await import(viaAlias)) as { readonly self: string };

    // BOTH SIDES CANONICALISED, BY THE SAME CALL, AND THE PAIR IS WHAT KEEPS THE TEETH. This is
    // the line CI run #4 failed: it reconstructed the expected url from `real` and compared it to
    // the loader's answer by exact equality, so any canonicalisation the loader applied and the
    // reconstruction did not — a symlink on macOS, an 8.3 short name on the Windows runner — made
    // two spellings of one file look like two files.
    //
    // Canonicalising the expected side would ALONE be weaker: it could pass against a loader that
    // canonicalised nothing. The assertion above is what forbids that — the url must have moved
    // away from the alias it was imported by — so the two together say "it canonicalised, and it
    // canonicalised to exactly this", without depending on which trick the platform played.
    expect(loaded.self).not.toBe(viaAlias);
    expect(loaded.self).toBe(pathToFileURL(realpathSync.native(join(real, 'module.mjs'))).href);
  });

  it('THE FIX ITSELF, given teeth here: old form false, new form true, on one file', async () => {
    // A SYMLINK STANDS IN FOR THE SHORT NAME HERE, and it runs on every platform: the SHAPE is
    // what the fix addresses — one file, two spellings, one of them not canonical. The real 8.3
    // condition is staged in the arm below this one, on Windows machines that carry an alias.
    // Both are kept: they cover different halves and this one is the portable half.
    const { real, alias } = aliasedDir();
    writeFileSync(join(real, 'module.mjs'), 'export const self = import.meta.url;\n', 'utf8');
    const spelling = join(alias, 'module.mjs');
    const loaded = (await import(pathToFileURL(spelling).href)) as { readonly self: string };

    // THE OLD FORM — reconstruct the url from the spelling you happen to hold. This is exactly
    // what failed on the Windows runner, with a short name where this has a symlink.
    expect(loaded.self).not.toBe(pathToFileURL(spelling).href);

    // THE NEW FORM — canonicalise first, with the call the loader uses. Same file, now equal.
    expect(loaded.self).toBe(pathToFileURL(realpathSync.native(spelling)).href);
  });
});

describe('THE REAL RUNNER CONDITION — an 8.3 short root, and the ruling it confirms', () => {
  // UNTIL THIS ARM, THE RULING THE WHOLE REPAIR RESTS ON WAS ARGUED BY ANALOGY. "Plain
  // `realpathSync` is right and `.native` would be wrong in `tools/gates/lib/tempdir.mjs`" was
  // supported by a three-way module-identity measurement plus a SYMLINK stand-in. This stages the
  // actual condition the GitHub Windows runner presents — a temp root reached through an 8.3
  // alias — and runs the gates' own resolver over it.
  //
  // It is skipped where no writable alias exists, which is every non-Windows machine and any
  // Windows profile whose names are all eight characters or shorter. That is a real gap and it is
  // why the symlink arms above stay: they carry the shape everywhere, this one carries the
  // instance where it can.

  it.skipIf(SHORT_NAME_BASE === null)(
    'a plain-realpathSync root is a FIXED POINT of node\'s resolution under a short root',
    () => {
      const base = SHORT_NAME_BASE as string;
      // Create through the LONG spelling, then reach the same directory through the SHORT one —
      // which is exactly the asymmetry the runner has, with `TEMP` naming the short form.
      const real = mkdtempSync(join(realpathSync.native(base), 'hotelsim-shortname-'));
      made.push(real);
      const shortRoot = join(base, basename(real));

      const program = [
        `import { makeTempDir } from ${JSON.stringify(HELPER)};`,
        'import { writeFileSync, realpathSync } from "node:fs";',
        'import { join, sep } from "node:path";',
        'import { pathToFileURL, fileURLToPath } from "node:url";',
        'const dir = makeTempDir("arm-");',
        'writeFileSync(join(dir, "mod.mjs"), "export const self = import.meta.url;" + String.fromCharCode(10));',
        'const loaded = await import(pathToFileURL(join(dir, "mod.mjs")).href);',
        'process.stdout.write(JSON.stringify({',
        '  dir,',
        '  url: loaded.self,',
        '  contained: fileURLToPath(loaded.self).startsWith(dir + sep),',
        '  native: realpathSync.native(dir),',
        '}));',
      ].join('\n');

      // `--import tsx`, because that is what `measure.mjs` and `needs-history.mjs` spawn. The
      // resolver under test has to be the resolver the instruments actually use.
      const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', program], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, TMPDIR: shortRoot, TEMP: shortRoot, TMP: shortRoot, NODE_NO_WARNINGS: '1' },
      });
      if (result.status !== 0) throw new Error(`probe failed: ${result.stderr}`);
      const seen = JSON.parse(result.stdout) as {
        dir: string;
        url: string;
        contained: boolean;
        native: string;
      };

      // THE CONDITION IS REALLY STAGED — without this the rest could pass on a long path and mean
      // nothing, which is the vacuity every arm in this file is written against.
      expect(seen.dir).toContain('~');
      expect(seen.url).toContain('%7E');

      // WHAT THIS ESTABLISHES, AT THE STRENGTH IT ACTUALLY HAS. `makeTempDir`'s plain
      // `realpathSync` keeps the short spelling, node keeps the short spelling, and containment
      // holds — the root is a FIXED POINT of the resolver its consumers use.
      //
      // AND WHAT IT DOES NOT ESTABLISH, because the first version of this arm claimed it and
      // `sim-critic` measured it false: `.native` does NOT break containment here. Under a short
      // root node hands back whatever spelling it was given, so a `.native` root and the urls
      // beneath it both derive from the same long string and `contained` is true either way —
      // measured, both variants. The macOS case is not the parallel: there the two sides came from
      // DIFFERENT derivations, `mkdtempSync` supplying the aliased spelling and node canonicalising
      // it away.
      //
      // So the ruling rests on `.native` doing MORE than the resolver does, not on it being broken
      // today. `seen.native` is asserted to be the other spelling purely to record that the two
      // calls really do differ on this machine — it is a property of the platform, not a verdict
      // about the helper.
      expect(seen.contained).toBe(true);
      expect(seen.native).not.toBe(seen.dir);
      expect(seen.native.startsWith(realpathSync.native(base))).toBe(true);
    },
  );

  it('and the discovery is a MEASUREMENT, so a skip means "no alias here" and not "check broken"', () => {
    // A skipped test is silent, and silence is what this whole goal is about. So the discovery
    // itself is pinned: it returns a path only where the two realpath calls genuinely disagree,
    // and `null` otherwise. On this machine that is `DOCUME~1`; on Linux and macOS it is `null`
    // because there is no such thing, not because the lookup failed.
    if (SHORT_NAME_BASE === null) {
      // THE NEGATIVE, RE-DERIVED. The first version asserted a string was truthy, which on Linux
      // and macOS — two of the three CI platforms — was the whole test. Worse, it could not tell
      // "this machine has no alias" from "both lookups threw and the catch swallowed them".
      //
      // So the null case is now checked the only way it can be: every candidate must be genuinely
      // unqualified — absent, or present with its two realpaths in agreement. A candidate that
      // exists AND disagrees would mean the discovery missed one.
      for (const candidate of CANDIDATES) {
        let plain: string | null = null;
        let native: string | null = null;
        try {
          plain = realpathSync(candidate);
          native = realpathSync.native(candidate);
        } catch {
          plain = null;
        }
        if (plain !== null) expect(plain).toBe(native);
      }
      return;
    }
    expect(realpathSync(SHORT_NAME_BASE)).not.toBe(realpathSync.native(SHORT_NAME_BASE));
    expect(realpathSync(SHORT_NAME_BASE)).toContain('~');
  });
});
