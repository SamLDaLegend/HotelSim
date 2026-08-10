// G-021 — I5'S BUDGET IS DERIVED FROM CONTENT, AND CHANGING A RUNG MOVES IT.
//
//   pnpm exec vitest run speed-ladder
//
// THE GOAL'S CENTRAL RISK, STATED BEFORE THE CODE WAS WRITTEN AND RULED ON BY THE
// ORCHESTRATOR: the shipped ladder's fastest rung is 30, which is the constant it replaces,
// so `BUDGET_MS` stays 389,333ms and NO GATE READING DISCRIMINATES A WORKING FEATURE FROM A
// DECORATIVE ONE. Everything below is the only discriminator in the goal. `budget.mjs`
// could hold `= 30` under a comment saying it reads content and every other gate in the
// repo would still be green.
//
// SO THE PROOF RUNS THE SHIPPED MODULE, BYTE FOR BYTE, AGAINST DIFFERENT CONTENT. A test
// that handed a parse function an object literal would show that arithmetic responds to an
// argument; it would say nothing about the file CI runs. Instead:
//
//   - the gate's modules are COPIED into a mirrored temp tree and their `sha256` asserted
//     equal to the shipped ones, so "the ARITHMETIC needs no edit" is a measurement rather
//     than a sentence (`CLAUDE.md`, the mutation recipe: capture a hash first, compare after);
//   - only the JSON differs between arms;
//   - every alternative ladder is validated by the real Zod schema BEFORE it is written, so
//     no arm proves something about content the shipped loader would refuse.
//
// WHAT "NO CODE EDIT" DOES AND DOES NOT MEAN — the claim was OVERSTATED here and in three
// other files, and the correction is measured. `sim-critic` retuned the shipped ladder to
// {20,10,4} and ran the suite; the orchestrator and this author each reproduced it. The
// DERIVATION needs no edit — every arm below passes, against a byte-identical module. But
// the derived FIGURE is quoted in four pinned places, and FIVE assertions in
// `bench.budget.test.ts` go red: `budget.mjs`'s own summary comment (a `.mjs` file under
// `tools/gates`, so updating it IS a code edit), HOTELSIM.md §2.1.2's inputs, §2.1.2's
// worked arithmetic, §2's invariant table, and CLAUDE.md's compacted row. That is the
// ADR-0007 machinery working exactly as designed — "it moves by re-deriving, never by
// nudging" — and it is the opposite of a defect. What is true is: A RETUNE IS A JSON EDIT
// PLUS FOUR QUOTED COPIES, EVERY ONE OF THEM NAMED BY A RED TEST.
//
// THE ARMS, AND WHY EACH ONE EXISTS. Every ladder below is the shipped one scaled by a
// positive integer, so none of them pins a value, a rung count or an id:
//
//   control    the shipped ladder, reproducing the shipped budget EXACTLY. Without it,
//              "the number moved" could be an artefact of the copy rather than of the JSON.
//   faster     every rung x2, x3, x5 -> the budget divides by the same factor. That is
//              §2.1.2's inverse proportionality asserted rather than quoted.
//   slower     a derived PAIR: x2 against x4. Halving the speed doubles the budget. It is
//              relative because a ladder SLOWER than the shipped one is not always
//              constructible — speeds are integers >= 1, so a shipped top of 1 has nothing
//              beneath it. Both directions are covered, because "a test that only fires in
//              the direction its author imagined" is this project's signature defect and it
//              has already appeared once inside `bench.budget.test.ts`.
//   position   the fastest rung placed at EVERY index in turn, plus a case asserting the
//              sweep discriminates — for each wrong reducer (first, last, min, sum) at least
//              one arm disagrees. The single middle-placement arm this replaced claimed to
//              kill four reducers per arm, which was false at the boundary indices: with the
//              max in the middle of three, a `[1]` reducer passes. Positional reducers die
//              COLLECTIVELY or not at all.
//   malformed  five documents the reader must REFUSE. Each asserts the thrown message NAMES
//              THE LADDER FILE, never merely that the child exited non-zero — a wrongly
//              assembled mirror also exits non-zero, which is the same discrimination
//              `bench.budget.test.ts` makes when it asserts `budget is 0ms (I5)`.
//   agreement  a battery run through BOTH validators, including the safe-integer boundary
//              where they actually diverged.
//
// AND EVERY NUMERIC ARM ASSERTS `BUDGET_MS > 0` AND PINS `TOP_SPEED` ITSELF, because **the
// xk relation is preserved by zero**: `0 === 2 * 0`. That was caught in this file's own first
// draft, which is the warning it exists to honour.
//
// NOTHING HERE PINS A RUNG'S VALUE, A RUNG COUNT, OR AN id. Every arm is the shipped ladder
// SCALED BY A POSITIVE INTEGER, with generated ids and labels. That property was CLAIMED by
// this header before it was true: `sim-critic` measured three retunes that broke the file —
// an odd top rung (`{25,12,5}`) tripped an evenness assertion, `{12,6,2}` collided a
// hardcoded 6 with `top / 2` and threw a duplicate-speed `ContentError`, and a two-rung
// ladder threw `Cannot read properties of undefined` while borrowing the third shipped id.
// All three reproduced here before the fix. Integer scaling has none of those edges:
// it is injective, it preserves integrality, and it does not care how many rungs there are.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { contentIdSchema, parseSpeedLadder } from '@hotelsim/content';
import { evaluateGateModule } from './gate-module.js';
import { loadSpeedLadderFrom, SPEED_LADDER_PATH } from './content-loader.js';
// @ts-expect-error — plain ESM gate helper, no types by design (tools/gates has no tsconfig).
import { parseSpeedLadder as gateParse, SpeedLadderError } from '../../gates/lib/speed-ladder.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BUDGET_MODULE = join(ROOT, 'tools/gates/budget.mjs');

/** The gate modules a copy of `budget.mjs` needs to run. Every one is copied verbatim. */
const GATE_FILES = ['budget.mjs', 'lib/speed-ladder.mjs', 'lib/content-id.mjs'] as const;
const LADDER_IN_TREE = 'packages/content/data/speed-ladder.json';

const NUMBERS = ['TOP_SPEED_TICKS_PER_SECOND', 'BUDGET_MS', 'TICK_BUDGET_NS'] as const;

const sha256 = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');

const shipped = evaluateGateModule(BUDGET_MODULE, NUMBERS);
const shippedLadder = loadSpeedLadderFrom(SPEED_LADDER_PATH);

type Rung = { id: string; name: string; ticksPerRealSecond: number };

/**
 * Rungs are assembled through this rather than written as literals, so that this file
 * carries no `ticksPerRealSecond: <number>` binding of its own — `speed-ladder.scan.test.ts`
 * scans `tools/headless/src`, and a test that made the scan fire would be a poor advert for
 * either. It is not an exclusion: this file is scanned, and it is clean.
 */
const rung = (id: string, name: string, ticksPerRealSecond: number): Rung => ({ id, name, ticksPerRealSecond });

/**
 * A ladder of the given speeds, with ids and labels GENERATED rather than borrowed.
 *
 * THE FIRST VERSION BORROWED THE SHIPPED LADDER'S ids BY INDEX, AND THAT MADE THE FILE THAT
 * PROVES THE LADDER IS RETUNABLE DEPEND ON THE SHIPPED LADDER'S VALUES — while its own
 * header claimed the opposite. `sim-critic` measured three retunes that break it:
 * `{25,12,5}` (odd top) failed an evenness assertion, `{12,6,2}` produced a duplicate-speed
 * `ContentError` because a hardcoded 6 collided with `top / 2`, and `{30,5}` threw
 * `Cannot read properties of undefined` right here, reading `shippedLadder[2]`. All three
 * reproduced. Generated ids remove the rung-count coupling; deriving every arm by INTEGER
 * SCALING (below) removes the value coupling.
 */
function ladderOf(speeds: readonly number[]): readonly Rung[] {
  for (const speed of speeds) {
    expect(Number.isSafeInteger(speed), `an arm scaled a rung out of the safe range: ${speed}`).toBe(true);
  }
  return speeds.map((speed, i) => rung(`speed_arm_${i + 1}`, `Arm ${i + 1}`, speed));
}

/** Every shipped rung multiplied by a positive integer: still integers, still distinct. */
const scaled = (k: number): readonly Rung[] => ladderOf(shippedLadder.map((r) => r.ticksPerRealSecond * k));

/**
 * Write a mirrored tree, copy the gate modules into it verbatim, and return the copy's path.
 *
 * `tools/gates` is not touched: every edit is to a throwaway this test wrote, so no env var,
 * no flag and no CI lever exists to pull. That is G-018 round 3's technique, and the reason
 * the ladder is resolved from a REPO_ROOT constant rather than from `import.meta.url` — the
 * relative layout is reproduced here, so the copied module needs no edit at all.
 */
function mirror(dir: string, ladderText: string | null): string {
  mkdirSync(join(dir, 'tools/gates/lib'), { recursive: true });
  mkdirSync(join(dir, dirname(LADDER_IN_TREE)), { recursive: true });
  for (const file of GATE_FILES) {
    const from = join(ROOT, 'tools/gates', file);
    const to = join(dir, 'tools/gates', file);
    const bytes = readFileSync(from);
    writeFileSync(to, bytes);
    // THE ASSERTION THAT MAKES "THE ARITHMETIC NEEDS NO EDIT" A MEASUREMENT. If any arm
    // below ever needed a patch to the gate's source to pass, this is where it would show.
    expect(sha256(readFileSync(to)), `${file} was not copied verbatim`).toBe(sha256(bytes));
  }
  if (ladderText !== null) writeFileSync(join(dir, LADDER_IN_TREE), ladderText);
  return join(dir, 'tools/gates/budget.mjs');
}

function withMirror<T>(ladderText: string | null, use: (modulePath: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'hotelsim-ladder-'));
  try {
    return use(mirror(dir, ladderText));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Evaluate a copy against a ladder the Zod schema has already accepted. */
function budgetUnder(rungs: readonly Rung[]): Record<(typeof NUMBERS)[number], number> {
  expect(() => parseSpeedLadder(rungs), 'the arm itself must be valid content').not.toThrow();
  return withMirror(`${JSON.stringify(rungs, null, 2)}\n`, (module) => evaluateGateModule(module, NUMBERS));
}

/** Evaluate a copy that is expected to REFUSE, and return what it said. */
function refusalUnder(ladderText: string | null): string {
  return withMirror(ladderText, (module) => {
    const result = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(module).href)});`],
      { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
    );
    expect(result.status, 'the gate module loaded a ladder it should have refused').not.toBe(0);
    return result.stderr ?? '';
  });
}

describe('the shipped ladder is content, and the shipped bytes are validated (I3, G-021)', () => {
  it('parses through the real Zod schema, not only through the gate reader', () => {
    const ladder = loadSpeedLadderFrom(SPEED_LADDER_PATH);
    expect(ladder.length).toBeGreaterThan(0);
    for (const rungOnDisk of ladder) {
      expect(Number.isInteger(rungOnDisk.ticksPerRealSecond)).toBe(true);
      expect(rungOnDisk.ticksPerRealSecond).toBeGreaterThan(0);
      expect(rungOnDisk.name.trim().length).toBeGreaterThan(0);
      // ADR-0003, pinned rather than assumed: `speed_fast` passes, `fast` would turn I3 red
      // because `check-content.mjs` walks every `id` in every content file.
      expect(contentIdSchema.safeParse(rungOnDisk.id).success, `${rungOnDisk.id} is not snake_case`).toBe(true);
      expect(rungOnDisk.id).toContain('_');
    }
  });

  it('is the same file the gate reads — one ladder, not two', () => {
    const path = withMirror(null, () => undefined) as undefined;
    expect(path).toBeUndefined();
    const declared = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import * as m from ${JSON.stringify(pathToFileURL(BUDGET_MODULE).href)};` +
          'process.stdout.write(m.SPEED_LADDER_PATH);',
      ],
      { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
    );
    expect(declared.status).toBe(0);
    expect(resolve(declared.stdout.trim())).toBe(resolve(SPEED_LADDER_PATH));
  });

  it("the gate's top speed is the ladder's fastest rung", () => {
    const fastest = Math.max(...shippedLadder.map((r) => r.ticksPerRealSecond));
    expect(shipped.TOP_SPEED_TICKS_PER_SECOND).toBe(fastest);
    expect(shipped.BUDGET_MS).toBeGreaterThan(0);
  });
});

/**
 * TWO VALIDATORS, AND THE WEAKER ONE GUARDS THE SHIPPING BYTES UNLESS THIS EXISTS.
 *
 * `packages/content` validates with Zod; `tools/gates` cannot (plain ESM, no build step) and
 * has its own reader. Every rule — the closed key set, snake_case ids, the multiplier-label
 * refusal, integer speeds, uniqueness — would otherwise be applied to synthetic documents in
 * tests and never to the file the gate reads. This is the `content-id-agreement.test.ts`
 * arrangement: a cross-check between two LIVE values over a battery, never a comparison
 * against a copied literal (ADR-0005).
 */
describe('the gate reader and the Zod schema agree on every document', () => {
  const ok = (id: string, name: string, speed: number): Rung => rung(id, name, speed);
  /** Every malformed document is DERIVED from a good rung rather than written out, so this
   *  file declares no `ticksPerRealSecond: <number>` of its own — `speed-ladder.scan.test.ts`
   *  scans this directory, and it caught the first draft of this battery doing exactly that. */
  const without = (r: Rung, key: keyof Rung): Record<string, unknown> => {
    const copy: Record<string, unknown> = { ...r };
    delete copy[key];
    return copy;
  };
  const plus = (r: Rung, key: string, value: unknown): Record<string, unknown> => ({ ...r, [key]: value });
  const CASES: ReadonlyArray<readonly [string, unknown, boolean, string]> = [
    ['the shipped ladder', JSON.parse(readFileSync(SPEED_LADDER_PATH, 'utf8')), true, 'what ships'],
    ['one rung', [ok('speed_only', 'Only', 1)], true, 'a single-rung ladder is legal'],
    ['three rungs', [ok('speed_a', 'A', 3), ok('speed_b', 'B', 2), ok('speed_c', 'C', 1)], true, 'the usual shape'],
    ['a long label', [ok('speed_a', 'Fast (30 ticks/s)', 3)], true, 'a number in a label is not a multiplier'],

    ['not an array', { speeds: [ok('speed_a', 'A', 1)] }, false, 'a wrapper object hides ids from check:content'],
    ['empty', [], false, 'a ladder with no rungs is not a ladder'],
    ['a null rung', [null], false, 'not an object'],
    ['missing name', [without(ok('speed_a', 'A', 5), 'name')], false, 'labels travel with the values'],
    ['empty name', [ok('speed_a', '', 5)], false, 'a blank label is not a label'],
    ['blank name', [ok('speed_a', '   ', 5)], false, 'whitespace is not a label'],
    ['missing speed', [without(ok('speed_a', 'A', 5), 'ticksPerRealSecond')], false, 'every rung states its own speed'],
    [
      'a multiplier key',
      [plus(ok('speed_a', 'A', 5), 'multiplier', 2)],
      false,
      'no rung may be expressed relative to another',
    ],
    ['a base key', [plus(ok('speed_a', 'A', 5), 'baseTicksPerRealSecond', 1)], false, 'there is no base rung'],
    ['a multiplier label', [ok('speed_a', '2x', 5)], false, 'a label may not assert a ratio'],
    ['a unicode multiplier label', [ok('speed_a', '2×', 5)], false, 'the same claim in another glyph'],
    ['a spaced multiplier label', [ok('speed_a', ' 30 X ', 5)], false, 'still a bare multiplier'],
    ['a zero rung', [ok('speed_a', 'A', 0)], false, 'pause is a transport state, not a rate'],
    ['a negative rung', [ok('speed_a', 'A', -5)], false, 'time does not run backwards'],
    ['a fractional rung', [ok('speed_a', 'A', 2.5)], false, 'integers, for I2s reason'],
    ['a string speed', [plus(ok('speed_a', 'A', 5), 'ticksPerRealSecond', '30')], false, 'not a number'],
    ['duplicate speeds', [ok('speed_a', 'A', 5), ok('speed_b', 'B', 5)], false, 'a dead position on the control'],
    ['duplicate ids', [ok('speed_a', 'A', 5), ok('speed_a', 'B', 6)], false, 'lookup would depend on order'],
    ['a camelCase id', [ok('speedFast', 'A', 5)], false, 'ADR-0003'],
    ['an id with no underscore', [ok('fast', 'A', 5)], false, 'indistinguishable from a code identifier'],

    // THE AXIS THE FIRST BATTERY MISSED, AND IT IS THE ONE THAT MATTERED. The other cases
    // probe where the two validators obviously agree; these probe where they could DRIFT,
    // which is the only thing a cross-check is for. `Number.isInteger` accepted all four of
    // these while `z.int()` refused the last three — measured against both live validators,
    // gate weaker than loader. A rung of 1e300 drives `TICK_BUDGET_NS` to ~0, so I5 would
    // have reported "over budget" rather than "invalid ladder".
    [
      'MAX_SAFE_INTEGER',
      [ok('speed_a', 'A', Number.MAX_SAFE_INTEGER)],
      true,
      'absurd but exactly representable — both must allow it, or the boundary is untested',
    ],
    [
      'just past MAX_SAFE_INTEGER',
      [ok('speed_a', 'A', Number.MAX_SAFE_INTEGER + 3)],
      false,
      'an integer that is no longer exactly representable',
    ],
    ['1e21', [ok('speed_a', 'A', 1e21)], false, 'integral, unsafe, and prints in exponent form'],
    ['1e300', [ok('speed_a', 'A', 1e300)], false, 'drives the per-tick budget to zero'],
    ['Infinity', [ok('speed_a', 'A', Number.POSITIVE_INFINITY)], false, 'not a speed'],
    ['NaN', [ok('speed_a', 'A', Number.NaN)], false, 'not a speed'],
  ];

  const schemaAccepts = (doc: unknown): boolean => {
    try {
      parseSpeedLadder(doc);
      return true;
    } catch {
      return false;
    }
  };
  const gateAccepts = (doc: unknown): boolean => {
    try {
      (gateParse as (raw: unknown, label?: string) => unknown)(doc, 'battery');
      return true;
    } catch {
      return false;
    }
  };

  it.each(CASES)('%s', (_label, doc, expected, why) => {
    // As with the content-id battery, the point is not what the answer is but that both
    // validators give the SAME answer — a drift makes this red rather than making the gate
    // quietly softer than the loader.
    expect(schemaAccepts(doc), `schema (${why})`).toBe(expected);
    expect(gateAccepts(doc), `gate reader (${why})`).toBe(expected);
  });

  it('the gate reader throws its own error type, so a caller can tell it apart', () => {
    expect(() => (gateParse as (raw: unknown) => unknown)([])).toThrow(SpeedLadderError as ErrorConstructor);
  });
});

describe('CHANGING A RUNG IN JSON CHANGES THE DERIVED BUDGET, THE ARITHMETIC UNTOUCHED (G-021)', () => {
  const top = shipped.TOP_SPEED_TICKS_PER_SECOND;

  it('CONTROL — the shipped ladder in the copy reproduces the shipped budget exactly', () => {
    const control = budgetUnder(scaled(1));
    expect(control.TOP_SPEED_TICKS_PER_SECOND).toBe(top);
    expect(control.BUDGET_MS).toBe(shipped.BUDGET_MS);
    expect(control.BUDGET_MS).toBeGreaterThan(0);
  });

  // EVERY ARM IS THE SHIPPED LADDER SCALED BY A POSITIVE INTEGER, and that is what makes
  // this file survive a retune. Scaling is injective, so distinct rungs stay distinct; it
  // preserves integrality, so no arm can wander into the malformed path; and it needs no
  // particular rung count, no even top rung and no absent value — the three couplings
  // `sim-critic` measured. `budget(xk) x k === budget(shipped)` is §2.1.2's inverse
  // proportionality, asserted rather than quoted.
  it.each([2, 3, 5])('FASTER — every rung x%i divides the budget by the same factor', (k) => {
    const faster = budgetUnder(scaled(k));
    expect(faster.TOP_SPEED_TICKS_PER_SECOND).toBe(top * k);
    expect(faster.BUDGET_MS).toBeGreaterThan(0);
    expect(faster.BUDGET_MS).toBeLessThan(shipped.BUDGET_MS);
    expect(faster.BUDGET_MS * k).toBeCloseTo(shipped.BUDGET_MS, 6);
  });

  it('SLOWER — between two derived ladders, HALVING the speed DOUBLES the budget', () => {
    // The direction is tested against a derived PAIR rather than by dividing the shipped
    // rungs. A ladder slower than the shipped one is not always constructible — speeds are
    // integers >= 1, so a shipped top of 1 has nothing below it — which is exactly why the
    // slow direction has to be expressed relatively. x2 is half the speed of x4.
    const half = budgetUnder(scaled(2));
    const quarter = budgetUnder(scaled(4));
    expect(quarter.TOP_SPEED_TICKS_PER_SECOND).toBe(half.TOP_SPEED_TICKS_PER_SECOND * 2);
    expect(half.BUDGET_MS).toBeGreaterThan(quarter.BUDGET_MS);
    expect(half.BUDGET_MS).toBeCloseTo(quarter.BUDGET_MS * 2, 6);
    expect(quarter.BUDGET_MS).toBeGreaterThan(0);
  });

  // POSITION MEANS NOTHING IN THIS FORMAT, so the fastest rung is placed at EVERY index in
  // turn. One arm at one position kills only the reducers that disagree there — with the
  // max in the middle of three, `[1]` still passes — so the sweep is over all of them.
  // Speeds are multiples of the shipped top, so this is derived like everything else.
  const SPREAD = [1, 2, 3, 5];
  const FASTEST = Math.max(...SPREAD);
  const ANSWER = FASTEST * top;
  const arrangement = (index: number): readonly number[] => {
    const others = SPREAD.filter((m) => m !== FASTEST);
    return [...others.slice(0, index), FASTEST, ...others.slice(index)].map((m) => m * top);
  };
  const INDICES = SPREAD.map((_, i) => i);

  it.each(INDICES)('POSITION — the fastest rung at index %i still gives the same answer', (index) => {
    const positioned = budgetUnder(ladderOf(arrangement(index)));
    expect(positioned.TOP_SPEED_TICKS_PER_SECOND).toBe(ANSWER);
    expect(positioned.BUDGET_MS * FASTEST).toBeCloseTo(shipped.BUDGET_MS, 6);
    expect(positioned.BUDGET_MS).toBeGreaterThan(0);
  });

  it('and the sweep DISCRIMINATES — each wrong reducer disagrees on at least one arm', () => {
    // The claim "one arm kills four wrong reducers" was false as first written: it asserted
    // per-arm that `[0]` is not the answer, which is untrue of the arm that puts the fastest
    // rung FIRST. Positional reducers are killed COLLECTIVELY by the sweep, so that is what
    // is checked — otherwise the sweep could be four copies of a case none of them fails.
    const REDUCERS: ReadonlyArray<readonly [string, (s: readonly number[]) => number]> = [
      ['first', (s) => s[0] as number],
      ['last', (s) => s[s.length - 1] as number],
      ['min', (s) => Math.min(...s)],
      ['sum', (s) => s.reduce((a, b) => a + b, 0)],
    ];
    for (const [name, reduce] of REDUCERS) {
      const disagreeing = INDICES.filter((i) => reduce(arrangement(i)) !== ANSWER);
      expect(disagreeing.length, `no arm in the sweep would catch a \`${name}\` reducer`).toBeGreaterThan(0);
    }
  });

  it('the ×2 relation alone is not the proof — every arm also pins TOP_SPEED and > 0', () => {
    // `0 === 2 * 0`, so a module that derived a budget of zero would satisfy every ratio
    // above. Stated as its own case so that deleting the guards is visible.
    expect(shipped.BUDGET_MS).toBeGreaterThan(0);
    expect(shipped.TICK_BUDGET_NS).toBeGreaterThan(0);
  });
});

describe('a ladder the gate cannot read STOPS it — there is no fallback', () => {
  // Built rather than written out, for the reason the battery above is: the scan covers this
  // directory, and a JSON string carrying `"ticksPerRealSecond":5` is a speed binding wearing
  // quotes. (It walked past the scan until this file made it fire and the pattern was widened.)
  const document = (r: Record<string, unknown>): string => `${JSON.stringify([r], null, 2)}\n`;
  const REFUSALS: ReadonlyArray<readonly [string, string | null]> = [
    ['an empty ladder', '[]\n'],
    ['a rung whose speed is a word', document({ id: 'speed_a', name: 'A', ticksPerRealSecond: 'fast' })],
    ['a rung with an unknown key', document({ ...rung('speed_a', 'A', 5), multiplier: 2 })],
    ['a document that is not JSON', '{ not json\n'],
    ['no ladder file at all', null],
  ];

  it.each(REFUSALS)('%s', (_label, text) => {
    const stderr = refusalUnder(text);
    // NAMING THE FILE IS THE DISCRIMINATING ASSERTION, NOT THE EXIT STATUS. A mirror
    // assembled wrongly — a missing `lib/`, a bad import — also exits non-zero, and a test
    // that accepted that would pass while witnessing the harness break rather than the gate
    // refuse. Same distinction `bench.budget.test.ts` draws with `budget is 0ms (I5)`.
    expect(stderr).toContain('speed-ladder.json');
    expect(stderr).toContain('SpeedLadderError');
    expect(stderr).not.toContain('Cannot find module');
  });
});
