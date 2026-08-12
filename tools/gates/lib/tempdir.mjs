// A TEMP DIRECTORY WHOSE PATH IS THE ONE NODE WILL HAND BACK (G-022).
//
//   const dir = makeTempDir('hotelsim-measure-');
//
// WHAT THIS FIXES, AND IT WAS FOUND BY THE FIRST CI MATRIX THIS PROJECT EVER RAN.
//
// `mkdtempSync(join(tmpdir(), prefix))` returns a path built from `os.tmpdir()`, and on macOS
// that is `/var/folders/…` — where **`/var` is a symlink to `/private/var`**. Node's ESM loader
// canonicalises symlinks when it resolves a module, so a file imported from `/var/folders/x/m.ts`
// comes back as `file:///private/var/folders/x/m.ts`.
//
// Two instruments then compare a resolved module path against the directory they created:
//
//   measure.mjs:269        path.startsWith(arm.dir + sep)
//   needs-history.mjs:180  reading.simResolvedTo.startsWith(treeUrl)
//
// Both are the SAME CHECK — "this arm ran its own copy of the simulation and not the repo's" —
// and both compare a canonicalised path against an uncanonicalised prefix. On macOS the prefixes
// never match, the instrument concludes that a module resolved outside its arm, and it refuses to
// report anything. That is `check:measure` and `check:tickcost:proof` going red on macOS in CI
// runs #1, #2 and #3 while passing on Linux and Windows, where `/tmp` and the Windows temp
// directory have no symlinked ancestor and the raw path is already canonical.
//
// THE REFUSAL WAS CORRECT BEHAVIOUR ON A WRONG PREMISE, which is why it was expensive to read:
// both gates failed FASTER than the other platforms succeeded (15.2s against 21-25s; 40.0s
// against 53-60s), because an instrument that aborts does less work than one that measures. No
// timing bound was involved and none was touched.
//
// WHY CANONICALISE AT CREATION RATHER THAN AT COMPARISON. The directory path does not only feed
// those two predicates: it is also a spawn cwd, the base of `relative()` calls that build the
// per-arm file lists, and part of what gets hashed. Fixing the comparison would leave every other
// consumer holding a path that names the same directory by a different string. One canonical
// value from the moment it exists is the layer where this is true once instead of five times.
//
// WHERE ELSE THIS CLASS LIVES, SWEPT RATHER THAN PROMISED (§5.8). The class is "comparing a
// canonicalised path against an uncanonicalised prefix". A grep for containment predicates over
// `tools/` returns exactly two: `measure.mjs:269` (path form) and `needs-history.mjs:180` (url
// form). Both are fed by temp roots, and all FOUR roots — `measure.mjs`, `needs-history.mjs`,
// `check-measure.mjs`, `check-tripwire.mjs` — now come from here, so both are repaired at the
// source rather than at the comparison.
//
// The other thirteen `mkdtempSync` sites are in test files that copy a gate and spawn it; none
// makes a containment claim, and CI run #3 is the evidence rather than the assurance — `pnpm
// test` passed on all three platforms in the same run in which these two gates failed on one.
//
// AND NOTE WHAT NO PROOF-OF-BITE TEST IN THIS REPOSITORY COULD HAVE CAUGHT: every gate harness
// runs on the machine it was written on, and this defect cannot exist on that machine. It took a
// second operating system. `tools/headless/src/tempdir.symlink.test.ts` now reproduces the class
// on ANY platform by making an alias deliberately, which is the part that transfers.

import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// DO NOT CHANGE `realpathSync` TO `realpathSync.native` HERE. RULED AT G-022 SWEEP 1, AGAINST
// THE INSTINCT OF EVERYONE WHO LOOKED AT IT, INCLUDING ITS AUTHOR.
//
// The temptation arrives with a true observation: `realpathSync` does NOT expand an 8.3 short
// name, `.native` does, and the GitHub Windows runner's TEMP is `C:\Users\RUNNER~1\…`. So a root
// minted here keeps the short form on that runner, and it looks like a latent version of the very
// defect this file fixes.
//
// IT IS NOT, AND THE REASON IS THAT `realpathSync` IS EXACTLY LOADER-EQUIVALENT. It resolves
// symlinks, which node's resolution resolves; it leaves short names alone, which node's resolution
// also leaves alone. The arm root and the urls recorded beneath it therefore agree in both
// spellings. Measured three ways on `win32/12cpu`, importing one file through `C:/PROGRA~1/…` and
// `C:/Program Files/…` and comparing module identity:
//
//   plain node                     two instances  -> does NOT canonicalise a short name
//   node --import tsx              two instances  -> does NOT either, and this is what the
//                                                    instruments actually spawn
//   inside the vitest 4.1.10 runner   ONE instance -> DOES canonicalise
//
// SO THE REASON TO KEEP `realpathSync` IS THAT IT IS THE MINIMAL CALL MATCHING NODE'S OWN
// CANONICALISATION: it resolves what node resolves and stops where node stops, which makes this
// root a FIXED POINT OF THE RESOLVER BY CONSTRUCTION rather than by coincidence.
//
// AND SAY PRECISELY WHAT `.native` WOULD AND WOULD NOT DO, because the first version of this
// paragraph overstated it and `sim-critic` measured it false (G-022 sweep 2). It claimed `.native`
// would make the helper disagree with the resolver and the instrument would refuse to report.
// IT WOULD NOT, TODAY: under a short root, `.native` yields the long spelling and node hands back
// whatever spelling it was given, so every path downstream derives from that same long string and
// containment still holds. Measured both ways on the real condition — `contained: true` for plain
// AND for native.
//
// What is true is narrower and is the reason the ruling stands: `.native` canonicalises FURTHER
// than the resolver its consumers use, and that surplus costs nothing only while every path being
// compared derives from this same root. The first time a root is compared against a path obtained
// independently of it — a golden, a config, another process's output — the surplus is exactly the
// mismatch macOS produced, where `mkdtempSync` supplied the aliased spelling and node canonicalised
// it away. Matching the resolver has no such failure mode, so match it.
//
// WHERE THE FALSE MODEL CAME FROM, since it is the reason this comment is long: G-022 wrote "the
// ESM loader canonicalises short names as well as symlinks" into a test file and into a commit
// message. It is false of node and true of vitest, and the test that produced it is the one file
// in the repository that runs inside vitest rather than beside it. The short-name half belongs to
// the RUNNER, not to the loader, and only code executing under the runner needs `.native`.

/**
 * Make a temporary directory and return its CANONICAL path.
 *
 * `realpathSync` is applied to the created directory rather than to `tmpdir()` so that the
 * returned string is the one the filesystem will report for anything inside it — which is the
 * string Node's module resolution will produce, and therefore the only one a containment check
 * can be written against.
 */
export function makeTempDir(prefix) {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}
