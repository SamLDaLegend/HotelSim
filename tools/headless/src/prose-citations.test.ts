// PROSE THAT POINTS AT CODE, HELD TO THE CODE IT POINTS AT (θ-a, unpinned-claim pass).
//
//   pnpm exec vitest run prose-citations
//
// ============================================================================
// WHY THIS FILE EXISTS, AND WHY IT IS A TEST RATHER THAN A BETTER SENTENCE. §7.1's 2026-08-09
// human ruling splits the re-examination trigger by subject, and the prose arm names its remedy
// exactly: **pin the claim in a test or delete it. A claim nothing pins is not evidence.** The
// class it was ruled about had by then survived six passes of careful rewording by four authors,
// and the pass that produced this file found two more MAJORs of it — both in files the previous
// pass had itself edited, one of them sixty lines above a rename made in that same pass.
//
// THE TWO SHAPES THIS FILE PINS, because they are the two that a reader cannot check and a
// machine can:
//
//   A CITATION — prose that points at a symbol somewhere else. `guest.ts` said the sim derives
//   presence at `guests.ts:1479`; the definition was at :1485, and :1479 was the middle of a
//   comment. `viewer.js` cited `guest.ts:191` for a call at :168, where :191 is an unrelated
//   function. **A line number in a comment is an unpinned claim with a very short half-life** —
//   it is invalidated by any edit ABOVE it, including edits by someone who never read it. Five
//   instances were found in two files in one afternoon, three of them freshly broken by another
//   repair in the same pass. So the citations here name SYMBOLS, and both ends are registered:
//   the sentence must still be written, and the thing it names must still exist.
//
//   A TRANSCRIPTION — code copied into a comment because the file cannot import it. `viewer.js`
//   is a plain browser module and may not import `packages/sim` (ADR-0013 §1), so it quotes
//   `isNeedWanted`'s three branches instead. A quote that has silently stopped matching its
//   original is worse than no quote, because it reads as authority. These are compared to the
//   BYTES of the function they quote.
//
// WHAT IT DOES NOT DO, said plainly so the silence is not read as coverage. It is a REGISTER,
// not a walker: it holds the citations enumerated by the pass that wrote it, not every citation
// in the repository. It cannot judge whether a sentence is TRUE — only whether the thing it
// names still exists — and no predicate can judge the tense of prose, which is why
// `deleted-vocabulary.test.ts` blanks comments and why the human control it describes is still
// the control. What this removes is the failure where a rename lands and its own references do
// not: that one is mechanical, and it had just happened twice.
//
// WATCHED FAILING ON THE REAL TREE, NOT ONLY ON SYNTHETIC INPUT. `drawNeedVector` was renamed
// throughout `apps/game/src/view/guest.ts` and both arms fired for the right reason, naming the
// file and the text: the sentence arm reported "threshold and the bar heights all belong to
// `drawNeedVector` now" as no longer written, and the anchor arm reported `function
// drawNeedVector(` as no longer landing. The file was restored from a scratch copy and its
// sha256 compared before and after — a767d705…0d118 both times, which is `CLAUDE.md`'s recipe,
// and `git checkout --` was not reached for because two tracks' unreviewed work is live in this
// tree (ADR-0022). One probe below was ALSO watched failing for the right reason unprompted: it
// spelled its "absent" sentence out whole, and the file then contained the sentence it claimed
// nobody had written.
//
// IT READS NAMED FILES AND WALKS NO TREE, deliberately: `scanner.census.test.ts` draws the
// scanner line at tree-walking, because a walker whose predicate decays reports a clean tree
// forever, whereas a check that reads one named file throws at the read when its subject moves.
// Everything below is `readFileSync` on a path written out in full, so a moved file fails loudly
// instead of silently scanning nothing.
// ============================================================================

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Repo-relative, always. A path that no longer exists throws here rather than scanning nothing. */
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

type Citation = {
  /** The file whose prose makes the claim. */
  readonly from: string;
  /** The claim itself, verbatim and on ONE line, so a rewrite reddens rather than rots. */
  readonly says: string;
  /** The file the claim points at. */
  readonly about: string;
  /** Text that must still be in that file for the claim to have a referent. */
  readonly anchor: string;
  /** Why the citation exists at all. A register without one is a list of good intentions. */
  readonly why: string;
};

const CITATIONS: readonly Citation[] = [
  {
    from: 'apps/game/src/view/guest.ts',
    says: '`stockFractionOf`, the failing',
    about: 'apps/game/src/view/guest.ts',
    anchor: 'export function stockFractionOf(',
    why:
      'THE INSTANCE THIS FILE WAS WRITTEN FOR. The sentence read "Patience fractions … belong to ' +
      '`drawNeedVector` now" — present tense, naming the quantity the previous pass had renamed ' +
      'in this same file, for the stated reason that an identifier cannot be put in the past ' +
      'tense. The rename landed and the sentence pointing at it did not.',
  },
  {
    from: 'apps/game/src/view/guest.ts',
    says: 'threshold and the bar heights all belong to `drawNeedVector` now',
    about: 'apps/game/src/view/guest.ts',
    anchor: 'function drawNeedVector(',
    why: 'The other half of the same sentence: where the per-column reading moved TO.',
  },
  {
    from: 'apps/game/src/view/guest.ts',
    says: 'makes for `const atHome` in `guests.ts`',
    about: 'packages/sim/src/guests.ts',
    anchor: 'const atHome =',
    why:
      'The `beingServed` fact the renderer hands the sim\'s own predicate. Cited as ' +
      '`guests.ts:1479` until this pass; the definition is six lines further down.',
  },
  {
    from: 'apps/game/src/view/guest.ts',
    says: "definition of presence (`const atHome` in `guests.ts`)",
    about: 'packages/sim/src/guests.ts',
    anchor: 'const atHome =',
    why: 'The second of the two citations of the same definition in the same file, drifted the same way.',
  },
  {
    from: 'apps/game/src/view/guest.ts',
    says: '`stockFractionOf` in `tools/viewer/viewer.js` says the same at length',
    about: 'tools/viewer/viewer.js',
    anchor: 'function stockFractionOf(need) {',
    why:
      'The renderer defers to the viewer\'s longer account of why an unknown need id returns ' +
      'null rather than 1. It cited a LINE RANGE, which this pass invalidated by editing the ' +
      'viewer above it — the half-life problem in one move.',
  },
  {
    from: 'apps/game/src/view/guest.ts',
    says: 'FINDING from `drawGuest` in `tools/viewer/viewer.js`',
    about: 'tools/viewer/viewer.js',
    anchor: 'function drawGuest(',
    why: 'Colour and fill answer two independent questions — a finding inherited from the viewer.',
  },
  {
    from: 'apps/game/src/view/scene.ts',
    says: '`drawGuests` in `viewer.js`, measured at',
    about: 'tools/viewer/viewer.js',
    anchor: 'function drawGuests(',
    why:
      'The guest pitch is driven by the need vector rather than the body. Cited as a line range ' +
      'that had already drifted off the function it names before this pass touched anything.',
  },
  {
    from: 'apps/game/src/view/scene.ts',
    says: '(`drawGuests` in `viewer.js`, seven guests on one cell',
    about: 'tools/viewer/viewer.js',
    anchor: 'function drawGuests(',
    why: 'The same finding, cited a second time where the rule was reinstated after WATCH #6.',
  },
  {
    from: 'apps/game/src/view/palette.ts',
    says: "`tools/viewer/viewer.js`'s PALETTE block",
    about: 'tools/viewer/viewer.js',
    anchor: '// PALETTE —',
    why:
      'Rank-not-hash is a TRADE, and the property being given up was argued for in the viewer. ' +
      'The argument is what is being cited, so the anchor is the block heading rather than code.',
  },
  {
    from: 'tools/viewer/viewer.js',
    says: 'calls `isNeedWanted` from its own `isWanted`, in',
    about: 'apps/game/src/view/guest.ts',
    anchor: 'function isWanted(content: BoundContent, need: NeedState, beingServed: boolean): boolean {',
    why:
      'The viewer transcribes a predicate the OTHER renderer calls, and points at the call so a ' +
      'reader can compare them. Cited as `guest.ts:191` until this pass, which is inside ' +
      '`lobbyFractionOf` and has nothing to do with it.',
  },
  {
    from: 'tools/viewer/viewer.js',
    says: '`TICKS_PER_DAY` — `packages/sim/src/world.ts`',
    about: 'packages/sim/src/world.ts',
    anchor: 'export const TICKS_PER_DAY',
    why:
      'One of the two constants the viewer duplicates because it may not import the sim. The ' +
      'coupling comment says nothing goes red when they diverge; for the NAME, something does ' +
      'now. It cited `world.ts:33` and the constant is at :35.',
  },
  {
    from: 'tools/headless/src/deleted-vocabulary.test.ts',
    says: 'driven over synthetic sources',
    about: 'tools/headless/src/scanner.census.test.ts',
    anchor: 'driven over synthetic sources',
    why:
      'A file quoting the licence granted to it by the register that lists it — the strongest ' +
      'form of citation available, because the quote IS the anchor. It cited ' +
      '`scanner.census.test.ts:464`, which is an `expect` in an unrelated test.',
  },
  {
    from: 'tools/headless/src/deleted-vocabulary.test.ts',
    says: '`it.skipIf(SHORT_NAME_BASE === null)`',
    about: 'tools/headless/src/tempdir.symlink.test.ts',
    anchor: 'it.skipIf(SHORT_NAME_BASE === null)(',
    why:
      'The one conditional chained call on disk, and the reason the title walk hops a balanced ' +
      'group rather than accepting `.each`. Cited by line until this pass.',
  },
];

/** Citations whose sentence is no longer written where it was registered. */
const unwritten = (entries: readonly Citation[]): string[] =>
  entries.filter((entry) => !read(entry.from).includes(entry.says)).map((entry) => `${entry.from}: "${entry.says}"`);

/** Citations that no longer land on anything. */
const unresolved = (entries: readonly Citation[]): string[] =>
  entries
    .filter((entry) => !read(entry.about).includes(entry.anchor))
    .map((entry) => `${entry.from} -> ${entry.about}: "${entry.anchor}"`);

describe('a citation names something that still exists, at both ends', () => {
  it('the register has entries, each with a reason', () => {
    // Vacuity first: an empty register satisfies every assertion below.
    expect(CITATIONS.length).toBeGreaterThan(10);
    for (const entry of CITATIONS) {
      expect(entry.why, `${entry.from} -> ${entry.about}`).not.toBe('');
      expect(entry.says).not.toBe('');
      expect(entry.anchor).not.toBe('');
    }
  });

  it('every registered sentence is still written where it was registered', () => {
    // The half that stops the register rotting into a suppression list: reword the sentence and
    // this reddens, so the registration is re-examined rather than left pointing at a ghost.
    expect(unwritten(CITATIONS)).toEqual([]);
  });

  it('and every registered sentence still lands on something', () => {
    // The half that catches a rename. This is the assertion the two MAJORs would have failed.
    expect(unresolved(CITATIONS)).toEqual([]);
  });

  it('BITES — a citation whose target has been renamed away is NAMED, not merely counted', () => {
    const forged: Citation = {
      from: 'tools/headless/src/prose-citations.test.ts',
      says: 'BITES — a citation whose target has been renamed away',
      about: 'packages/sim/src/needs.ts',
      anchor: 'export function noSuchFunctionWasEverDeclared(',
      why: 'A probe, not a real citation.',
    };
    // The forged entry's SENTENCE is real — it is this test's own title — so only the anchor
    // half can fire. That is deliberate: a probe that failed both arms would not discriminate
    // between them, and it is the anchor arm that the renames defeated.
    expect(unwritten([forged])).toEqual([]);
    expect(unresolved([...CITATIONS, forged])).toEqual([
      'tools/headless/src/prose-citations.test.ts -> packages/sim/src/needs.ts: ' +
        '"export function noSuchFunctionWasEverDeclared("',
    ]);
  });

  it('and BITES the other way — a sentence that has been reworded away is NAMED', () => {
    // ASSEMBLED FROM TWO PIECES, and the first version was not. Written whole, the probe string
    // is a sentence this file DOES contain — it is sitting in the probe — so `unwritten` found
    // it and the assertion failed on the day it was written. That is `deleted-vocabulary.test.ts`'s
    // `ERROR_CALL` problem exactly: a check that reads source cannot tell its own subject from a
    // string that quotes it, and the one file that must quote it takes the care.
    const ABSENT = 'a sentence nobody ' + 'has ever written in this file';
    const stale: Citation = {
      from: 'tools/headless/src/prose-citations.test.ts',
      says: ABSENT,
      about: 'packages/sim/src/needs.ts',
      anchor: 'export function isNeedWanted(',
      why: 'A probe, not a real citation.',
    };
    expect(unresolved([stale])).toEqual([]);
    expect(unwritten([...CITATIONS, stale])).toEqual([
      `tools/headless/src/prose-citations.test.ts: "${ABSENT}"`,
    ]);
  });
});

// ----------------------------------------------------------------------------
// THE TRANSCRIPTION.

/**
 * The BRANCH LINES of `isNeedWanted`, lifted out of the sim's own source.
 *
 * Derived rather than typed for the reason every derivation in this repository is derived: a
 * hand-copied list of three lines is the thing being checked, so a hand-copied list here would
 * be checking a copy against a copy. The signature and the comments are dropped; what is left is
 * exactly the statements a reader of the viewer is being asked to trust.
 */
function isNeedWantedBranches(): string[] {
  const source = read('packages/sim/src/needs.ts');
  const start = source.indexOf('export function isNeedWanted(');
  const open = source.indexOf('): boolean {', start);
  const close = source.indexOf('\n}', open);
  return source
    .slice(open, close)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('if (') || line.startsWith('return '));
}

describe("the viewer's transcription of the sim's predicate is a QUOTE, not a paraphrase", () => {
  const branches = isNeedWantedBranches();
  const viewer = read('tools/viewer/viewer.js');

  it('lifted three branches out of the sim, so there is something to compare', () => {
    // If the extraction ever returns nothing, every assertion below passes over an empty list —
    // the vacuous clean tree, one function up.
    expect(branches).toHaveLength(3);
    expect(branches[0]).toContain('return false;');
    expect(branches[2]).toContain('wantLineOf(');
  });

  it('and BOTH transcriptions in the viewer carry all three, to the byte', () => {
    // TWO of them, and the count is the point: the file quotes the predicate once where it
    // declares its local collapse of it and once at the call site that relies on the collapse.
    // Sweep 3 found both quoting two branches of three; a reader cannot check a quote that has
    // dropped the middle of what it quotes, and nothing but this could tell them.
    for (const branch of branches) {
      expect(viewer.split(branch).length - 1, `viewer.js does not carry "${branch}" twice`).toBe(2);
    }
  });

  it('BITES — a paraphrased branch is not a quote', () => {
    // The mutation is the one that actually happened: a parameter renamed in the sim and the
    // transcription left spelling the old name. Asserted against a mutated COPY of the viewer
    // source in memory, so nothing on disk is touched (ADR-0022).
    const paraphrased = viewer.split('wantAtBasisPoints').join('wantAt');
    const third = branches[2] as string;
    expect(third).toContain('wantAtBasisPoints');
    expect(paraphrased.split(third).length - 1).toBe(0);
    // ...and the two branches that were NOT mutated still match, so this discriminates rather
    // than simply breaking the file.
    expect(paraphrased.split(branches[0] as string).length - 1).toBe(2);
    expect(paraphrased.split(branches[1] as string).length - 1).toBe(2);
  });
});

// ----------------------------------------------------------------------------
// THE FIELD LIST.

const NEED_TYPES_FILE = 'packages/content/data/need-types.json';

/** The line of `viewer.js`'s CONTENT header that enumerates the fields it reads. */
const FIELD_LIST_ANCHOR = 'The need-type fields this file reads are';

/** Names between backticks on one line. No regex: `CLAUDE.md` has a section about why. */
function backtickedIn(line: string): string[] {
  const parts = line.split('`');
  const out: string[] = [];
  for (let i = 1; i < parts.length; i += 2) out.push(parts[i] as string);
  return out;
}

/** The field list the header publishes, or `[]` if the sentence has moved — which reddens below. */
function listedFields(source: string): string[] {
  const start = source.indexOf(FIELD_LIST_ANCHOR);
  if (start === -1) return [];
  const end = source.indexOf('\n', start);
  return backtickedIn(source.slice(start, end === -1 ? source.length : end));
}

const isNameChar = (c: string): boolean =>
  (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$';

/** Does this source read `.key` anywhere, as a whole property name? */
function namesProperty(source: string, key: string): boolean {
  const needle = `.${key}`;
  let i = source.indexOf(needle);
  while (i !== -1) {
    if (!isNameChar(source[i + needle.length] ?? '')) return true;
    i = source.indexOf(needle, i + 1);
  }
  return false;
}

describe("the viewer's CONTENT header names fields that content actually has", () => {
  const viewer = read('tools/viewer/viewer.js');
  const needTypes = JSON.parse(read(NEED_TYPES_FILE)) as readonly Record<string, unknown>[];
  const listed = listedFields(viewer);

  /**
   * The keys of a need type, from the shipped JSON rather than from the schema.
   *
   * The JSON is what the viewer `fetch`es and reads at runtime — it does not go through Zod, and
   * it could not: it is a browser module with no build step. So the JSON is the right authority
   * for "a field this file can read", and `packages/content`'s schema is checked against the same
   * data by `check:content` one gate over.
   */
  const keys = [...new Set(needTypes.flatMap((entry) => Object.keys(entry)))].sort();

  it('read the content, and every need type has the same shape', () => {
    expect(needTypes.length).toBeGreaterThan(0);
    for (const entry of needTypes) expect(Object.keys(entry).sort()).toEqual(keys);
  });

  it('the header still publishes a list', () => {
    // Vacuity: a moved sentence yields [], which would satisfy "every listed field exists".
    expect(listed.length).toBeGreaterThan(0);
  });

  it('every field the header names is a field a need type HAS', () => {
    // THE INSTANCE: the list said "patience" for three goals after ADR-0017 deleted it — a file
    // header naming a field, directly above the `loadContent` that reads `capacityTicks` instead.
    for (const field of listed) expect(keys, `viewer.js names "${field}"`).toContain(field);
  });

  it('and the list is exactly the fields the viewer reads — neither short nor padded', () => {
    // The other direction, which is what makes it a list rather than a disclaimer. It
    // OVER-APPROXIMATES and says so: `.name` and `.id` are read off rooms and items here too, so
    // a field a need type happens to share with them counts as read. That errs towards demanding
    // MORE of the sentence than it strictly owes, which is the safe direction for a header.
    expect([...listed].sort()).toEqual(keys.filter((key) => namesProperty(viewer, key)));
  });

  it('BITES — a field dropped from content is reported, and the reader discriminates', () => {
    // Both predicates driven on synthetic input, because on the real tree they agree and a
    // check that only ever sees agreement has not been seen working.
    expect(backtickedIn('reads are `id`, `name` and `role`,')).toEqual(['id', 'name', 'role']);
    expect(listedFields('nothing here')).toEqual([]);
    expect(listedFields(`// ${FIELD_LIST_ANCHOR} \`only\`, \`these\`\nand not this \`one\``)).toEqual([
      'only',
      'these',
    ]);
    expect(namesProperty('const a = x.role;', 'role')).toBe(true);
    expect(namesProperty('const a = x.roles;', 'role')).toBe(false);
    expect(namesProperty('const a = payroll;', 'role')).toBe(false);
    // And the field that is NOT read: content carries it, the viewer never touches it, so it must
    // not appear in the header. This is the arm that fails if the header pads its list.
    expect(keys).toContain('refillPerTick');
    expect(namesProperty(viewer, 'refillPerTick')).toBe(false);
    expect(listed).not.toContain('refillPerTick');
  });
});
