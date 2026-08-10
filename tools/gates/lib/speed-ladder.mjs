// The play-speed ladder, as the GATES read it (G-021).
//
// I5's budget is inversely proportional to the fastest play speed (HOTELSIM.md §2.1.2), so
// `budget.mjs` needs the ladder. It cannot have the validated one: `tools/gates` is plain
// Node ESM with no build step, and `packages/content`'s validator is TypeScript + Zod.
//
// THAT IS TWO VALIDATORS, AND THE ONE THAT WOULD GUARD THE SHIPPING BYTES IS THIS ONE.
// `sim-critic` raised it at §5.6: every rule the Zod schema enforces — `strictObject`,
// snake_case ids, a label that is not a bare multiplier — would have been applied to
// synthetic documents in tests and NEVER to the file the gate actually reads, because the
// gate does not go through Zod. A weak reader here would mean the shipped ladder is
// guarded by the weaker of the two.
//
// So this file implements the SAME rules, and the duplication is CROSS-CHECKED rather than
// trusted: `tools/headless/src/speed-ladder.budget.test.ts` runs a battery of documents
// through this reader AND through `parseSpeedLadder` and asserts they agree on every one.
// That is the `lib/content-id.mjs` + `content-id-agreement.test.ts` arrangement exactly,
// and it is a cross-check between two live values rather than a comparison against a
// copied literal (ADR-0005).
//
// The id pattern is not duplicated a third time — it is imported from `./content-id.mjs`,
// which is already the single source of ADR-0003.

import { readFileSync } from 'node:fs';
import { contentIdRegExp } from './content-id.mjs';

/**
 * A label that is a bare multiplier, refused.
 *
 * WHAT THIS BUYS, STATED HONESTLY BECAUSE THE FIRST DRAFT OVERSOLD IT. It stops a DESIGNER
 * encoding a relation between rungs in a label — "2x" as a name is a claim about another
 * rung, and the ladder is deliberately not a ramp (30/12/5; 30 is the anchor, not a
 * multiple of anything). It is LEAKY as a ban on the idea: `"x2"`, `"2x speed"` and
 * `"Fast (2x)"` all pass. And it does NOT reach the failure the human's ruling names —
 * "M5 hardcodes 1x/2x/3x" is a property of `apps/game` source, which no content validator
 * can see. `speed-ladder.scan.test.ts` covers that root; the arithmetic half is parked.
 *
 * Duplicated in `packages/content/src/schema.ts` and cross-checked, like everything else
 * in this file.
 */
export const MULTIPLIER_LABEL_PATTERN = '^\\s*\\d+(?:[.,]\\d+)?\\s*[x\\u00d7]\\s*$';

/** Fresh RegExp each call — a shared one carries state between callers. */
export const multiplierLabelRegExp = () => new RegExp(MULTIPLIER_LABEL_PATTERN, 'i');

/** A speed ladder that could not be read. Its message names the file, always. */
export class SpeedLadderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SpeedLadderError';
  }
}

const RUNG_KEYS = ['id', 'name', 'ticksPerRealSecond'];

/**
 * Validate a parsed speed-ladder document. Returns the rungs, or throws.
 *
 * EVERY RUNG STATES ITS OWN SPEED, AND THE KEY SET IS CLOSED. That is the enforceable half
 * of "there is no implied arithmetic between rungs": there is no `multiplier`, no `base`,
 * no `relativeTo` a document can carry, and no rung whose value is absent and therefore
 * has to be computed from a neighbour. A key this list does not name is refused by name.
 */
export function parseSpeedLadder(raw, sourceLabel = 'speed ladder') {
  const fail = (what) => {
    throw new SpeedLadderError(`${sourceLabel} is not a valid speed ladder: ${what}`);
  };
  if (!Array.isArray(raw)) fail('the document is not a top-level array of rungs');
  if (raw.length === 0) fail('the ladder has no rungs');

  const ids = new Map();
  const speeds = new Map();
  const rungs = [];
  raw.forEach((entry, index) => {
    const at = `rung ${index}`;
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) fail(`${at} is not an object`);
    for (const key of Object.keys(entry)) {
      if (!RUNG_KEYS.includes(key)) fail(`${at} carries an unrecognised key "${key}"`);
    }
    for (const key of RUNG_KEYS) {
      if (!(key in entry)) fail(`${at} is missing "${key}"`);
    }
    const { id, name, ticksPerRealSecond } = entry;
    if (typeof id !== 'string' || !contentIdRegExp().test(id)) {
      fail(`${at} has an id that is not snake_case: ${JSON.stringify(id)} (ADR-0003)`);
    }
    if (typeof name !== 'string' || name.trim().length === 0) fail(`${at} ("${id}") has no name`);
    if (multiplierLabelRegExp().test(name)) {
      fail(`${at} ("${id}") is named ${JSON.stringify(name)} — a rung's label may not be a bare multiplier`);
    }
    // `isSafeInteger`, NOT `isInteger`, AND THE DIFFERENCE WAS A MEASURED DIVERGENCE. Zod's
    // `z.int()` bounds to the safe range; `Number.isInteger` does not, so this reader used to
    // accept 9007199254740994, 1e21 and 1e300 where the loader refused all three — the gate
    // weaker than the validator, in exactly the direction the two-validator cross-check
    // exists to prevent. And it is not academic: such a rung drives `TICK_BUDGET_NS` to
    // roughly zero, so I5 would report "over budget" instead of "invalid ladder", sending
    // whoever reads it hunting a performance regression that does not exist.
    if (
      typeof ticksPerRealSecond !== 'number' ||
      !Number.isSafeInteger(ticksPerRealSecond) ||
      ticksPerRealSecond < 1
    ) {
      fail(`${at} ("${id}") has ticksPerRealSecond ${JSON.stringify(ticksPerRealSecond)}, not a safe integer >= 1`);
    }
    const firstId = ids.get(id);
    if (firstId !== undefined) fail(`duplicate rung id "${id}" at rungs ${firstId} and ${index}`);
    ids.set(id, index);
    const firstSpeed = speeds.get(ticksPerRealSecond);
    if (firstSpeed !== undefined) {
      fail(`rungs ${firstSpeed} and ${index} are both ${ticksPerRealSecond} ticks/s — a duplicate rung is a dead position on the control`);
    }
    speeds.set(ticksPerRealSecond, index);
    rungs.push(Object.freeze({ id, name, ticksPerRealSecond }));
  });
  return Object.freeze(rungs);
}

/**
 * The fastest intended play speed — §2.1.2's requirement, in one word: the MAXIMUM.
 *
 * NOT `rungs[0]`, and not `rungs.at(-1)`. Array position carries no meaning in this format,
 * which is the consumer-side half of "no implied arithmetic between rungs": no rung is the
 * base, so no rung can be read as one. `speed-ladder.budget.test.ts` proves it with a
 * ladder whose fastest rung sits in the MIDDLE — first, last, min and sum all disagree with
 * the answer, so four wrong reducers die on one arm.
 */
export function topSpeedTicksPerSecond(rungs) {
  let top = 0;
  for (const rung of rungs) if (rung.ticksPerRealSecond > top) top = rung.ticksPerRealSecond;
  return top;
}

/** Read and validate a ladder file. Any failure names the path — there is no fallback. */
export function readSpeedLadder(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new SpeedLadderError(`could not read the speed ladder at ${path}: ${error.message}`);
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new SpeedLadderError(`${path} is not valid JSON: ${error.message}`);
  }
  return parseSpeedLadder(raw, path);
}
