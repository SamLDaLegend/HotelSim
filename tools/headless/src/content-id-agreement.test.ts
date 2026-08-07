// The content-ID convention (ADR-0003) is enforced in two places that cannot share a
// module import: `tools/gates/check-content.mjs` (plain Node ESM, no build step) and
// `packages/content/src/schema.ts` (TypeScript + Zod).
//
// This test imports BOTH live values and asserts they agree. It is deliberately NOT a
// test comparing either one against a copied literal — ADR-0005 is explicit that a
// duplicated literal rots exactly as fast as the thing it claims to pin. If the gate
// and the schema ever disagree, this fails; the gate does not quietly go soft.

import { contentIdSchema } from '@hotelsim/content';
import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM gate helper, no types by design (tools/gates has no tsconfig).
import { CONTENT_ID_PATTERN, contentIdRegExp } from '../../gates/lib/content-id.mjs';

const gateAccepts = (id: string): boolean => (contentIdRegExp() as RegExp).test(id);
const schemaAccepts = (id: string): boolean => contentIdSchema.safeParse(id).success;

/** Ids that must be accepted, and ids that must be rejected, with why. */
const CASES: ReadonlyArray<readonly [string, boolean, string]> = [
  ['standard_room', true, 'the shipped room type'],
  ['night_porter', true, 'a plausible staff role'],
  ['double_bed_2', true, 'trailing digits in a segment'],
  ['a_b', true, 'shortest legal form'],
  ['business_traveller_deluxe', true, 'three segments'],

  ['standard', false, 'no underscore — indistinguishable from a code identifier'],
  ['Standard_Room', false, 'capitals'],
  ['standardRoom', false, 'camelCase'],
  ['_leading', false, 'leading underscore'],
  ['trailing_', false, 'trailing underscore'],
  ['double__bed', false, 'empty segment'],
  ['2_rooms', false, 'leading digit'],
  ['standard room', false, 'space'],
  ['standard-room', false, 'kebab-case'],
  ['', false, 'empty string'],
  ['standard_room\nx', false, 'newline — a $ anchor without /m must not let this through'],
];

describe('ADR-0003 content id convention', () => {
  it('is exported as a pattern string the gate and the schema can both reach', () => {
    expect(typeof CONTENT_ID_PATTERN).toBe('string');
    expect(CONTENT_ID_PATTERN.length).toBeGreaterThan(0);
  });

  it.each(CASES)('gate and schema agree on %s', (id, expected, why) => {
    // The point is not what the answer is, but that both places give the SAME answer.
    expect(gateAccepts(id), `gate on "${id}" (${why})`).toBe(expected);
    expect(schemaAccepts(id), `schema on "${id}" (${why})`).toBe(expected);
  });

  it('agrees on a generated spread of ids, not only the hand-picked ones', () => {
    const alphabet = ['a', 'z', 'A', '0', '9', '_', '-', ' ', '.'];
    const disagreements: string[] = [];
    for (const a of alphabet) {
      for (const b of alphabet) {
        for (const c of alphabet) {
          const id = `${a}${b}_${c}`;
          if (gateAccepts(id) !== schemaAccepts(id)) disagreements.push(id);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });

  it('gives a fresh regex each call, so no lastIndex leaks between callers', () => {
    expect(contentIdRegExp()).not.toBe(contentIdRegExp());
    expect((contentIdRegExp() as RegExp).lastIndex).toBe(0);
  });
});
