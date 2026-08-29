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
import { WORLD_KEYS } from '@hotelsim/sim';

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

// ============================================================================
//  AND IT SHOWS WHAT THE SIMULATION RECORDS (G-019, `ai-critic`'s final-round MAJOR).
//
//  This file checked "cannot act" and "disposable" and never "shows what the sim records",
//  so `World.reviewOutcomes` was in every recorded frame from the day it existed — `frameAt`
//  is a raw `JSON.parse` of the serialised world — and the viewer drew `guestOutcomes` and
//  `needOutcomes` and nothing for it. The consequence was not cosmetic: G-019's WATCH entry
//  asked a human whether the wait penalty read as fair and pointed them at an instrument
//  that could not show a single review. **A perceptual criterion aimed at an instrument
//  blind to its subject** is ADR-0013 §3's shape one level up from the prompt it amended.
//
//  THE FIX FOR THE INSTANCE IS A ROW IN THE VIEWER. THIS IS THE FIX FOR THE CLASS, and it is
//  the allow-list shape rather than a demand that everything be drawn: a field is either
//  referenced by the viewer or is NAMED HERE as deliberately undrawn, with its reason, and
//  the two sets must exactly partition `WORLD_KEYS`. The next `World` field is then a
//  decision somebody writes down rather than a gap nobody notices.
//
//  IT IS NOT A FEATURE OF THE VIEWER (§9). It adds nothing to `tools/viewer` and defends
//  nothing there; it is a check on it, exactly as the scans above are.
// ============================================================================

const DELIBERATELY_NOT_DRAWN: Readonly<Record<string, string>> = {
  // The PRNG state is four opaque integers. Drawing them would say nothing a watcher can use,
  // and `world.tick` beside the scrubber already answers "where am I in the run".
  rng: 'four opaque integers; nothing a watcher can read',
  // Player build and loan COMMAND counters. A watcher sees the building itself change; these
  // are the CLI report's subject, and `sim:run` prints both.
  buildOutcomes: 'counters for player commands; the building itself is what is drawn',
  loanOutcomes: 'counters for player commands; the report is where these are read',
  // G-038b-i. THE LIFT AND ITS QUEUE, AND THIS PAIR IS EXEMPTED WITH A DEBT ATTACHED RATHER
  // THAN BECAUSE A WATCHER COULD NOT USE THEM.
  //
  // A line of guests at a lift is exactly the sort of thing a watcher WOULD read, and the two
  // entries above are exempt because nothing about them is watchable. These are different, and
  // saying so is the point: G-038b-i ships the mechanism INERT — `world.lift` is `null` in every
  // world any harness produces, so the viewer would be drawing a permanent `null` and a
  // permanently empty array — and ADR-0075 measured what drawing it would cost:
  //
  //   > *"neither drawing path can express a queue. The iso scene computes
  //   > `room = floor(width / pitch)`, 3 from scale 0.75 to the clamp; a fourth guest becomes a
  //   > `+N` label. The replay viewer compresses pitch to `width / guests.length` — one
  //   > unreadable stripe of colour."*
  //
  // **So the drawing work is G-038b-ii's and it must budget it.** These two lines are the debt,
  // written where the goal that pays it will be forced to read them: the moment a harness
  // installs a lift, a watcher with no line drawn is looking at a hotel that is lying to it.
  lift: 'inert until G-038b-ii declares one; drawing a queue is that goal and ADR-0075 prices it',
  liftQueue: 'always empty until G-038b-ii declares a lift; the drawing work is budgeted there',
  // G-052a. THE PAYROLL, AND THIS EXEMPTION IS STRUCTURAL RATHER THAN A DEBT — which is the
  // difference between it and the two lines above.
  //
  // The lift pair is exempt because the drawing work was DEFERRED; a watcher would read a queue
  // if there were one. A member of staff at G-052a HAS NOWHERE TO BE DRAWN: it carries an id and
  // a role and no position, deliberately, because occupying a room is G-052b. There is no cell,
  // no floor and no footprint to put a rectangle at, so drawing it would mean inventing a place
  // for it — which is precisely the decision G-052b exists to make.
  //
  // WHAT A WATCHER LOSES BY THIS, STATED SO IT IS A CHOICE AND NOT AN OVERSIGHT: nothing on
  // screen says the hotel is paying anybody. The wage bill is in the CLI report — `wages Np, N
  // on the payroll, N nights` — where the other money terms are read. THE MOMENT G-052b GIVES A
  // MEMBER OF STAFF A POSITION THIS LINE IS A LIE, and that goal must budget the drawing, in
  // exactly the sense the lift lines say it must.
  staff: 'no position at G-052a; G-052b places staff and owns the drawing',
  // G-066a. THE REMARK FEED, AND THIS EXEMPTION IS A DEBT WITH A NAMED OWNER — the lift pair's
  // kind, not the payroll's.
  //
  // A guest saying what it thought of the hotel is exactly the sort of thing a watcher WOULD
  // read; there is nothing structural stopping it being drawn, and that is what separates this
  // from `staff`. What stops it HERE is scope: G-066a is the sim half and ships the ring, and
  // G-066b is the renderer and is a different goal with a different owner. The sim half cannot
  // render a line anyway — turning a stored record into a sentence needs a `RemarkBook`, and the
  // remark table is deliberately outside injected content, so `tools/viewer` would have to load
  // `guest-remarks.json` through its own door exactly as `tools/headless` does.
  //
  // WHAT A WATCHER LOSES BY THIS, STATED SO IT IS A CHOICE AND NOT AN OVERSIGHT: nothing on
  // screen says a departing guest had an opinion, so this goal's change is INVISIBLE in a
  // recording — which is why its WATCH reports no frame rather than manufacturing one. THE
  // MOMENT G-066b DRAWS THE FEED THIS LINE IS A LIE, in exactly the sense the lift lines say
  // theirs are.
  recentRemarks: 'the sim half only at G-066a; G-066b renders the feed and owns the drawing',
};

describe('the viewer shows what the simulation records, or says why not', () => {
  /**
   * `key` as a whole word in any of `sources`.
   *
   * `\\w` AND NOT `\w`, AND THIS IS THE THIRD INSTANCE OF THAT MISTAKE IN THREE GOALS. A
   * template literal turns `\w` into a bare `w`, so the compiled pattern was
   * `(?<![w$])KEY(?![w$])` — a word boundary that is not a word boundary. `violationsIn`
   * four lines above this block has the correct spelling, and `review.boundary.test.ts`
   * documents this file's author catching the identical thing two rounds ago.
   *
   * `ai-critic` was straight about the impact and so is this comment: **it changed no answer
   * today.** Undrawn is `{buildOutcomes, loanOutcomes, rng}` under either pattern, and across
   * two dozen plausible future key names only one diverges. It is fixed because it is the
   * predicate the whole partition rests on, and because the bite below is what would have to
   * notice if it ever did matter.
   *
   * Takes the sources as a parameter so the probe can hand it a MUTATED copy rather than
   * defining a second, subtly different predicate to test the first one with.
   */
  const drawnIn = (sources: readonly Scanned[], key: string): boolean =>
    sources.some((f) => new RegExp(`(?<![\\w$])${key}(?![\\w$])`).test(f.source));
  const drawn = (key: string): boolean => drawnIn(files, key);

  it('every World key is either referenced by the viewer or named as deliberately undrawn', () => {
    const undrawn = WORLD_KEYS.filter((key) => !drawn(key));
    expect([...undrawn].sort()).toEqual(Object.keys(DELIBERATELY_NOT_DRAWN).sort());
  });

  it('and the exemption list carries nothing the viewer actually draws', () => {
    // The other direction. An entry for a field that IS drawn is a licence sitting open, and
    // would let a later removal from the viewer pass unnoticed.
    for (const key of Object.keys(DELIBERATELY_NOT_DRAWN)) {
      expect(drawn(key), `${key} is exempted but the viewer references it`).toBe(false);
    }
  });

  it('reviewOutcomes is drawn — the field this check was written for', () => {
    expect(drawn('reviewOutcomes')).toBe(true);
    expect(WORLD_KEYS).toContain('reviewOutcomes');
  });

  it('and the check BITES: ONE key goes undrawn and every other drawn key stays drawn', () => {
    /**
     * ADR-0007's second half, without mutating the repo — and THE FIRST VERSION OF THIS PROBE
     * WAS ITSELF THE CLASS IT EXISTS TO CATCH, which `ai-critic` found on verification.
     *
     * It dropped every FILE naming `needOutcomes`. `viewer.js` is the only file that draws
     * anything, so what remained was `index.html` and `serve.mjs` and **all twelve `World`
     * keys came back undrawn** — both assertions then held for a reason unrelated to the scan
     * discriminating, and `stillDrawn = () => false` would have passed them. The state it
     * claimed to reproduce is ONE key undrawn and eleven drawn; what it built was twelve
     * undrawn.
     *
     * The repair is to blank the TOKEN rather than remove the file, so the mutation is the
     * one whose consequence is being asserted. And the second assertion is the one that makes
     * it discriminate: every key drawn before must STILL be drawn, so a predicate that has
     * simply stopped working fails here instead of passing everywhere.
     */
    const drawnBefore = WORLD_KEYS.filter((key) => drawn(key));
    // The pre-round state was nine drawn of twelve; if that ever stops being true this probe
    // is comparing against a set it did not mean.
    expect(drawnBefore).toContain('needOutcomes');
    expect(drawnBefore.length).toBe(WORLD_KEYS.length - Object.keys(DELIBERATELY_NOT_DRAWN).length);

    const blanked = files.map((f) => ({ ...f, source: f.source.replace(/needOutcomes/g, ' ') }));
    // THE SUBJECT FLIPS...
    expect(drawnIn(blanked, 'needOutcomes')).toBe(false);
    expect(WORLD_KEYS.filter((key) => !drawnIn(blanked, key))).toContain('needOutcomes');
    // ...AND NOTHING ELSE DOES. This is what `stillDrawn = () => false` cannot satisfy.
    for (const key of drawnBefore) {
      if (key === 'needOutcomes') continue;
      expect(drawnIn(blanked, key), `${key} stopped being drawn when only needOutcomes was blanked`).toBe(true);
    }
    // And the partition the guard asserts moves by exactly one member, rather than collapsing.
    const undrawnAfter = WORLD_KEYS.filter((key) => !drawnIn(blanked, key));
    expect(undrawnAfter.length).toBe(Object.keys(DELIBERATELY_NOT_DRAWN).length + 1);
  });
});
