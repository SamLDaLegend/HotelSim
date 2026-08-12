// DOES THE LADDER GATE ACTUALLY BITE? (G-030)
//
//   pnpm exec vitest run ladder-arithmetic
//
// `tools/gates/check-ladder.mjs` is the instrument HOTELSIM.md §2.1.1 parked and ADR-0018
// called due: nothing in `packages/content` can stop render code computing
// `ladder[i] / ladder[0]` and reintroducing the speed-ladder-as-multiplier defect G-021
// deleted. It is a SCANNER, and the human's M2-exit ruling is that every scanner gate owes a
// proof-of-bite — "a scanner whose predicate has quietly stopped matching reports a clean
// tree forever, and it reports it most confidently about the thing it was built to catch."
//
// THE ACCEPTANCE BAR IS THAT IT FAILS FOR THE RIGHT REASON. G-019 shipped a proof that
// removed the scanned SUBJECT rather than the MENTION, so a predicate hard-coded to `false`
// satisfied it. Two things here answer that:
//
//   A PREDICATE HARD-CODED TO `false` FAILS the biting arms, because the subject — a
//   populated `apps/game` — is present in every one of them, and each asserts the offending
//   FILE, LINE and TOKEN appear in the message.
//
//   A PREDICATE HARD-CODED TO `true` FAILS the four ALLOWED arms, which are not decoration:
//   a tick accumulator, a period, a comparison between two rungs, and a comma-separated
//   pair. `PARKING.md`'s falsification test says in as many words that if the pattern cannot
//   separate the ban from "a tick-accumulator dividing by ticksPerSecond", the ban is
//   unenforceable and the honest answer is to say so rather than keep implying a check
//   exists. Those arms are where that separation is asserted rather than claimed.
//
// AND THE WORD BOUNDARY IS PINNED TWICE, ONCE BEHAVIOURALLY AND ONCE FROM THE BYTES ON DISK.
// `CLAUDE.md` documents three instances, three goals, three authors, every one inside a
// scanner: `` `\b${name}` `` in a template literal loses its backslash and a word boundary
// becomes a two-letter character class. The rule it gives is to check the shipped line
// against the bytes on disk rather than a retyped copy, "because the eye supplies the
// backslash the file does not have" — so the last describe below READS the construction out
// of `check-ladder.mjs` and COMPILES it.
//
// THE TECHNIQUE: A MIRRORED TREE AND A BYTE-IDENTICAL GATE (`purity-gate.test.ts:26`).
// `check-ladder.mjs` derives ROOT from its own location, so a copy at
// `<tmp>/tools/gates/check-ladder.mjs` scans `<tmp>/apps/game` — with no edit to the gate,
// no injectable path, and therefore no lever anyone could pull in CI. The sha256 assertion
// turns "copied" into a claim a later change trips over.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const GATE = join(ROOT, 'tools/gates/check-ladder.mjs');
const SCAN_LIB = join(ROOT, 'tools/gates/lib/scan.mjs');

/**
 * A plausible renderer module that reads the ladder correctly, so the scanned tree is never
 * empty. THE SUBJECT STAYS IN PLACE in every arm — if a mutation were "delete the app", the
 * gate would report a clean tree and every "exit non-zero" assertion would need a violation
 * that is not there, which is how G-019's proof passed while proving nothing.
 */
const CLEAN_APP = [
  "import type { SpeedRung } from '@hotelsim/content';",
  '',
  'export function ticksEarned(seconds: number, rung: SpeedRung, carry: number): number {',
  '  return carry + seconds * rung.ticksPerRealSecond;',
  '}',
  '',
  'export function labelOf(rung: SpeedRung): string {',
  '  return rung.name;',
  '}',
  '',
].join('\n');

type Tree = { readonly dir: string; readonly gate: string };

let tree: Tree;

function makeTree(options: { readonly populated: boolean } = { populated: true }): Tree {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-ladder-bite-'));
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  mkdirSync(join(dir, 'apps/game/src'), { recursive: true });
  writeFileSync(join(dir, 'tools/gates/check-ladder.mjs'), readFileSync(GATE));
  writeFileSync(join(dir, 'tools/gates/lib/scan.mjs'), readFileSync(SCAN_LIB));
  if (options.populated) writeFileSync(join(dir, 'apps/game/src/driver.ts'), CLEAN_APP);
  return { dir, gate: join(dir, 'tools/gates/check-ladder.mjs') };
}

type Run = { readonly status: number | null; readonly output: string };

function runGate(gate: string = tree.gate): Run {
  const result = spawnSync(process.execPath, [gate], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

/** Add one renderer file to the scanned tree and run the real gate over it. */
function withFile(name: string, source: string): Run {
  writeFileSync(join(tree.dir, 'apps/game/src', name), source, 'utf8');
  return runGate();
}

const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex');

beforeEach(() => {
  tree = makeTree();
});

afterEach(() => {
  rmSync(tree.dir, { recursive: true, force: true });
});

describe('the gate under test is the shipped gate, and the tree it judges is not empty', () => {
  it('is a byte-identical copy of tools/gates/check-ladder.mjs', () => {
    expect(sha256(tree.gate)).toBe(sha256(GATE));
  });

  it('and the shipped gate passes against the shipped tree — the subject it exists for', () => {
    const { status, output } = runGate(GATE);
    expect(output).toContain('ok  ladder arithmetic');
    // The count is reported per root, and the real `apps/game` is not empty.
    expect(output).toMatch(/apps\/game: [1-9]\d* files/u);
    expect(status).toBe(0);
  });
});

describe('THE CONTROL — the synthetic tree passes, so a red arm is the mutation and not the harness', () => {
  it('accepts a renderer that multiplies elapsed seconds by ONE rung speed', () => {
    const { status, output } = runGate();
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });
});

describe('AND IT BITES — arithmetic between two rungs', () => {
  it('the ratio the ruling names: ladder[i] over ladder[0]', () => {
    const { status, output } = withFile(
      'speeds.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function multiplierOf(ladder: readonly SpeedRung[], i: number): number {',
        '  return ladder[i]!.ticksPerRealSecond / ladder[0]!.ticksPerRealSecond;',
        '}',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/speeds.ts:3');
    expect(output).toContain('ticksPerRealSecond');
    expect(output).toContain('computes a play speed from another play speed');
    expect(output).toContain('§2.1.1');
  });

  it('the same defect hoisted into a base variable, which is how a person would write it', () => {
    const { status, output } = withFile(
      'speeds.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function multiplierOf(ladder: readonly SpeedRung[], rung: SpeedRung): number {',
        '  const base = ladder[0]!.ticksPerRealSecond;',
        '  return rung.ticksPerRealSecond / base;',
        '}',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    // The USE is reported, not the binding: line 4, where the two speeds meet.
    expect(output).toContain('apps/game/src/speeds.ts:4');
    expect(output).toContain('"base"');
  });

  it('THE SAME RATIO WRAPPED ACROSS TWO LINES — a newline is not a statement boundary', () => {
    // THIS ARM IS THE ONE THAT WAS MISSING, AND ITS ABSENCE IS WHY THE GATE SHIPPED BLIND.
    // `STATEMENT_BREAK_SOURCE` counted `\n` as a break, so the ban's own headline example
    // went silent the moment somebody wrapped it — which is this repository's house style,
    // and which `check-ladder.mjs` itself does in four places. Measured against the shipped
    // predicate at the time: wrapped 0 violations, one-line 1. Every biting arm above was
    // written on one line, so nothing here could see it. Found by `render-critic`, sweep 1.
    const { status, output } = withFile(
      'wrapped.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function multiplierOf(ladder: readonly SpeedRung[], i: number): number {',
        '  return (',
        '    ladder[i]!.ticksPerRealSecond /',
        '    ladder[0]!.ticksPerRealSecond',
        '  );',
        '}',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/wrapped.ts:4');
  });

  it('and a one-level alias written as a CONDITIONAL, which the anchored rule could not see', () => {
    // The second half of the same finding. The alias rule anchored `^…$` on a bare member
    // read, so only the plainest spelling counted — and the shipped renderer contained a
    // ternary alias (`main.ts`: `const speed = paused || rung === undefined ? null :
    // rung.ticksPerRealSecond`) that the gate could not see while the file claimed one level
    // of aliasing was followed.
    // Written as `main.ts` writes it — ONE rung read behind a guard. An earlier draft of this
    // arm put a read in BOTH branches, which is two speeds and therefore not an alias at all;
    // it failed, correctly, and the correction is the point: an alias is a second NAME for one
    // speed, and a ternary choosing between two speeds is choosing, not renaming.
    const { status, output } = withFile(
      'conditional.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function ratio(other: SpeedRung, rung: SpeedRung | undefined, paused: boolean): number {',
        '  const base = paused || rung === undefined ? 0 : rung.ticksPerRealSecond;',
        '  return other.ticksPerRealSecond / base;',
        '}',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/conditional.ts:4');
    expect(output).toContain('"base"');
  });

  it('and a RENAMING DESTRUCTURE, the other one-level spelling', () => {
    const { status, output } = withFile(
      'destructured.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function ratio(top: SpeedRung, rung: SpeedRung): number {',
        '  const { ticksPerRealSecond: fastest } = top;',
        '  return rung.ticksPerRealSecond / fastest;',
        '}',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/destructured.ts:4');
  });

  it('and subtraction, because the ban is on arithmetic and not on one operator', () => {
    const { status, output } = withFile(
      'speeds.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export const gapOf = (a: SpeedRung, b: SpeedRung): number =>',
        '  a.ticksPerRealSecond - b.ticksPerRealSecond;',
        '',
      ].join('\n'),
    );
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/speeds.ts:3');
  });
});

describe('AND IT DOES NOT BITE ON THE THINGS A PLAY SPEED IS FOR — a `true` predicate fails here', () => {
  it('a tick accumulator: elapsed seconds times ONE rung speed', () => {
    // `PARKING.md`'s falsification test names this case explicitly as not a violation. The
    // first cut of the predicate DID fire on it — `const owed = carry + seconds * ticksPer…`
    // registered `owed` as an alias of a speed — and the fix is recorded on ALIAS_VALUE_SOURCE.
    const { status, output } = withFile(
      'accumulate.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function spend(seconds: number, rung: SpeedRung, carry: number): number {',
        '  const owed = carry + seconds * rung.ticksPerRealSecond;',
        '  return Math.floor(owed);',
        '}',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('a period: one second divided by ONE rung speed', () => {
    const { status, output } = withFile(
      'period.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export const msPerTick = (rung: SpeedRung): number => 1000 / rung.ticksPerRealSecond;',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('a COMPARISON between two rungs — choosing the fastest computes no new speed', () => {
    // This is how `ladder.ts` and `tools/gates/budget.mjs` both find the top rung without
    // trusting the table's order. Banning it would make the gate forbid the correct spelling.
    const { status, output } = withFile(
      'fastest.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function fastest(rungs: readonly SpeedRung[]): SpeedRung | undefined {',
        '  let best: SpeedRung | undefined;',
        '  for (const rung of rungs) {',
        '    if (best === undefined || rung.ticksPerRealSecond > best.ticksPerRealSecond) best = rung;',
        '  }',
        '  return best;',
        '}',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('two rung speeds separated by a COMMA — two readings, not one calculation', () => {
    const { status, output } = withFile(
      'reduce.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export const top = (rungs: readonly SpeedRung[]): number =>',
        '  rungs.reduce((best, rung) => Math.max(best, rung.ticksPerRealSecond), 0);',
        'export const pair = (a: SpeedRung, b: SpeedRung): readonly number[] =>',
        '  [a.ticksPerRealSecond, b.ticksPerRealSecond];',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('TWO SEPARATE STATEMENTS ON TWO LINES, relying on ASI — not one expression', () => {
    // THE COST OF FIXING THE WRAPPED CASE, AND THE ARM THAT BOUNDS IT. Dropping `\n` from the
    // break class outright would pair these two reads across a line break and report a
    // violation in code that computes nothing: the second line's leading `-` is a unary minus
    // on a new statement, not a subtraction of the first. So the newline still breaks — but
    // only when what follows it STARTS a statement, which is what these two lines do and what
    // a wrapped expression's continuation line does not.
    const { status, output } = withFile(
      'asi.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function both(a: SpeedRung, b: SpeedRung): readonly number[] {',
        '  const first = a.ticksPerRealSecond',
        '  const second = -b.ticksPerRealSecond',
        '  return [first, second]',
        '}',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('a tick accumulator WRAPPED across lines — still one speed, still allowed', () => {
    const { status, output } = withFile(
      'wrapped-ok.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function spend(seconds: number, rung: SpeedRung, carry: number): number {',
        '  const owed =',
        '    carry +',
        '    seconds * rung.ticksPerRealSecond;',
        '  return Math.floor(owed);',
        '}',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('and a comparison WRAPPED across lines, which is how the shipped renderer finds the top rung', () => {
    const { status, output } = withFile(
      'wrapped-compare.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function fastest(rungs: readonly SpeedRung[]): SpeedRung | undefined {',
        '  let best: SpeedRung | undefined;',
        '  for (const rung of rungs) {',
        '    if (',
        '      best === undefined ||',
        '      rung.ticksPerRealSecond >',
        '        best.ticksPerRealSecond',
        '    ) {',
        '      best = rung;',
        '    }',
        '  }',
        '  return best;',
        '}',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('prose describing the ban, which is a comment and not code', () => {
    const { status, output } = withFile(
      'note.ts',
      [
        '// Never write ladder[i].ticksPerRealSecond / ladder[0].ticksPerRealSecond — the rungs',
        '// are not multiples of each other (HOTELSIM.md §2.1.1).',
        'export const nothing = 1;',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });
});

describe('THE KNOWN FALSE POSITIVES — loud, bounded, and asserted so they are not surprises', () => {
  // WHY THESE ARE ARMS RATHER THAN FIXES, and it is the ordering that decides it: a false
  // report costs a reader five minutes and arrives with a file, a line and a message; a
  // silent miss certifies a clean tree forever and nobody looks, because nothing asked them
  // to. Both obvious tightenings — banning calls, banning comparisons — buy a silent miss
  // with a loud report: the first also drops `(rung).ticksPerRealSecond`, the second also
  // drops the ternary the shipped renderer actually contains. So the predicate stays wide and
  // the noise is written down here and in `check-ladder.mjs`. Measured by `render-critic`,
  // sweep 2; reproduced against the real predicate before these arms were written.

  it('a binding that merely PASSES a speed through a call is treated as a speed', () => {
    const { status, output } = withFile(
      'label.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function label(rung: SpeedRung, other: SpeedRung): string {',
        '  const shown = String(rung.ticksPerRealSecond);',
        '  return shown + other.ticksPerRealSecond;',
        '}',
        '',
      ].join('\n'),
    );
    // FIRES, and it should not. `shown` is a string. Assembling a label beside another rung
    // read reads as arithmetic between two speeds because `+` is both concatenation and
    // addition, and no regex can tell which without types.
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/label.ts:4');
  });

  it('and a COMPARISON result is registered as though it were a speed', () => {
    const { status, output } = withFile(
      'istop.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function describe(rung: SpeedRung, other: SpeedRung): number {',
        '  const isTop = rung.ticksPerRealSecond > 0 ? 1 : 0;',
        '  return isTop * other.ticksPerRealSecond;',
        '}',
        '',
      ].join('\n'),
    );
    // FIRES. `isTop` is a flag, not a speed — but it reads one exactly once with no
    // arithmetic, which is the alias test.
    expect(status).not.toBe(0);
    expect(output).toContain('apps/game/src/istop.ts:4');
  });

  it('and two ASI statements pair when the second is IDENTIFIER-led rather than keyword-led', () => {
    const { status, output } = withFile(
      'asi-ident.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function both(a: SpeedRung, b: SpeedRung): number {',
        '  let x = a.ticksPerRealSecond',
        '  x = -b.ticksPerRealSecond',
        '  return x',
        '}',
        '',
      ].join('\n'),
    );
    // FIRES, and this is the precise residue of the wrapped-expression fix. The keyword list
    // in `STATEMENT_BREAK_SOURCE` bounds `const`/`let`/`return`-led second statements — which
    // is why the ASI arm above passes — and does not bound an assignment or a call. The arm
    // that justified keeping a newline break at all therefore covered the shape it used and
    // not this one. Named rather than widened: the list is already sixteen keywords long.
    expect(status).not.toBe(0);
    // Line 3, not 4: a violation is reported at the FIRST read of the pair, which is the
    // `let x = a.ticksPerRealSecond` line. Worth pinning, because it is the one arm here
    // where the two reads sit on different lines and so the only one that says which end of
    // a pair the message points at.
    expect(output).toContain('apps/game/src/asi-ident.ts:3');
  });
});

describe('THE KNOWN ESCAPES — asserted SILENT, so closing one turns this red on purpose', () => {
  it('an index computed with arithmetic hides the alias, where a plain index does not', () => {
    // THE THIRD ESCAPE, AND IT WAS UNPARKED FOR A SWEEP WHILE THE GATE'S PROSE CLAIMED ALL
    // THREE WERE RECORDED. It is created by the no-arithmetic clause itself: the `-` inside
    // the brackets fails the alias test, so the binding is never registered and its later use
    // is invisible. The control below is the same code with `rungs[i]`, which bites — so this
    // pair is what makes the escape a measured limit rather than a suspicion.
    const escaped = withFile(
      'escape.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function ratio(rungs: readonly SpeedRung[], i: number, other: SpeedRung): number {',
        '  const base = rungs[i - 1]!.ticksPerRealSecond;',
        '  return other.ticksPerRealSecond / base;',
        '}',
        '',
      ].join('\n'),
    );
    expect(escaped.output).toContain('ok  ladder arithmetic');
    expect(escaped.status).toBe(0);

    const caught = withFile(
      'escape.ts',
      [
        "import type { SpeedRung } from '@hotelsim/content';",
        'export function ratio(rungs: readonly SpeedRung[], i: number, other: SpeedRung): number {',
        '  const base = rungs[i]!.ticksPerRealSecond;',
        '  return other.ticksPerRealSecond / base;',
        '}',
        '',
      ].join('\n'),
    );
    expect(caught.status).not.toBe(0);
    expect(caught.output).toContain('apps/game/src/escape.ts:4');
  });
});

describe('THE DEAD ROOT — a scan with nothing to scan must not report a clean tree', () => {
  it('an apps/game with no source files is a FAILURE, not a pass', () => {
    // The vacuity trap this whole family of checks is about (ADR-0007). Counted PER ROOT: a
    // global total stays comfortably non-zero while one root is misspelt and contributes
    // nothing, which is the shape `speed-ladder.scan.test.ts:90` records.
    const empty = makeTree({ populated: false });
    try {
      const { status, output } = runGate(empty.gate);
      expect(status).not.toBe(0);
      expect(output).toContain('matched no source files');
      expect(output).toContain('apps/game');
    } finally {
      rmSync(empty.dir, { recursive: true, force: true });
    }
  });
});

describe('THE WORD BOUNDARY, pinned behaviourally AND compiled from the bytes on disk', () => {
  it('does not fire on identifiers that merely CONTAIN the field name', () => {
    // If `\b` had decayed to a bare `b` — the defect `CLAUDE.md` records three times — the
    // two identifiers below would both count as rung reads and this arm would go red.
    const { status, output } = withFile(
      'lookalike.ts',
      [
        'const xticksPerRealSecondY = 3;',
        'const zticksPerRealSecond = 4;',
        'export const ratio = xticksPerRealSecondY / zticksPerRealSecond;',
        '',
      ].join('\n'),
    );
    expect(output).toContain('ok  ladder arithmetic');
    expect(status).toBe(0);
  });

  it('and the construction READ OUT OF check-ladder.mjs compiles to a real boundary', () => {
    // Not a retyped copy: the two fragments are extracted from the shipped file's bytes and
    // compiled here. A file that had lost a backslash would produce a pattern that matches
    // inside a longer word, and the assertions below say so.
    const source = readFileSync(GATE, 'utf8');
    const match = /new RegExp\('([^']*)' \+ word \+ '([^']*)', 'g'\)/u.exec(source);
    expect(match, 'check-ladder.mjs no longer builds its word pattern the documented way').not.toBeNull();
    const prefix = match?.[1] ?? '';
    const suffix = match?.[2] ?? '';
    // THE BYTES ON DISK MUST CARRY A DOUBLED BACKSLASH. `prefix` here is raw file TEXT, so a
    // correct file yields the three characters \ \ b; a file that had lost one would yield
    // the two characters \ b, which JavaScript consumes into a backspace before any RegExp
    // sees it. This is the assertion, and getting it the wrong way round first is itself the
    // documented hazard — the eye supplies the backslash the file does not have.
    expect(prefix).toBe('\\\\b');
    expect(suffix).toBe('\\\\b');
    // Compiled the way the runtime compiles it: the escape a JavaScript string literal would
    // resolve is resolved here, and the result must be a real word boundary.
    const asRuntimeString = (literal: string): string => literal.replace(/\\\\/gu, '\\');
    const compiled = new RegExp(asRuntimeString(prefix) + 'speed' + asRuntimeString(suffix), 'u');
    expect(compiled.test('speed')).toBe(true);
    expect(compiled.test('a.speed')).toBe(true);
    expect(compiled.test('xspeedy')).toBe(false);
    expect(compiled.test('myspeed')).toBe(false);
  });

  it('AND NO PATTERN ANYWHERE IN THE GATE CARRIES A LONE ESCAPE — the whole class, not four instances', () => {
    // THE ARM ABOVE PINS ONE CONSTRUCTION OF FOUR. `ALIAS_SOURCE`, `DESTRUCTURED_ALIAS_SOURCE`
    // and `STATEMENT_BREAK_SOURCE` are built from normal strings too, and the last is now the
    // most complex thing in the file — three alternatives, one of them assembled by `join` —
    // and it is the newest. Extracting each by name would leave the FIFTH pattern, whenever
    // somebody adds one, exactly as uncovered as these three were.
    //
    // So the assertion is over the class instead: in the gate's CODE, every backslash that
    // begins a regex escape must be DOUBLED. A single `\b`, `\s`, `\w` or `\d` inside a normal
    // string literal is consumed by JavaScript before any RegExp sees it — a word boundary
    // becomes a backspace, `\s` becomes a bare `s` — which is the defect `CLAUDE.md` records
    // three times, in three goals, by three authors, every one inside a scanner.
    //
    // Comments are stripped first, because the prose above and in the gate discusses `\n` and
    // `\b` by name and would otherwise be read as code.
    const code = stripComments(readFileSync(GATE, 'utf8'));
    const loneEscape = /(?<!\\)\\[bBdDsSwW]/gu;
    const offenders = [...code.matchAll(loneEscape)].map((m) => {
      const line = code.slice(0, m.index).split('\n').length;
      return `${line}: …${code.slice(Math.max(0, m.index - 40), m.index + 10).trim()}…`;
    });
    expect(
      offenders,
      `check-ladder.mjs carries a lone regex escape in code. In a normal string literal ` +
        `JavaScript consumes it before the RegExp is built:\n${offenders.join('\n')}`,
    ).toEqual([]);

    // AND THE CHECK IS SHOWN TO BITE, because a scan of a clean file is indistinguishable
    // from a scan that matches nothing. Both spellings, so a broken lookbehind is caught too.
    expect(`const p = '\\b' + w;`.match(loneEscape)).not.toBeNull();
    expect(`const p = '\\s*';`.match(loneEscape)).not.toBeNull();
    expect(`const p = '\\\\b' + w;`.match(loneEscape)).toBeNull();
    // And it must find the doubled ones present — a file with no escapes at all would pass
    // the assertion above while proving nothing about the patterns it claims to cover.
    expect(code).toContain('\\\\b');
    expect(code).toContain('\\\\s');
    expect(code.match(/\\\\[bBdDsSwW]/gu)?.length ?? 0).toBeGreaterThan(8);
  });
});

/**
 * Blank comments, keeping newlines so line numbers survive.
 *
 * Written out here rather than imported from `tools/gates/lib/scan.mjs` for the reason
 * `review.boundary.test.ts:23` gives: this package's tsconfig has no `allowJs`. Precedent:
 * `speed-ladder.scan.test.ts`, `viewer.readonly.test.ts` and `scanner.census.test.ts` all
 * carry their own copy for the same reason.
 */
function stripComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += source.slice(i, stop).replace(/[^\n]/gu, ' ');
      i = stop;
    } else if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/gu, ' ');
      i = stop;
    } else {
      out += source[i];
      i += 1;
    }
  }
  return out;
}
