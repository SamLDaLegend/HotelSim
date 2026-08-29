// G-065 — THE SHIPPED VOICE. `guest-remarks.json`, driven through the real selector.
//
//   pnpm exec vitest run remark.content
//
// ============================================================================
// WHAT THIS FILE IS FOR, AND WHAT IT DELIBERATELY DOES NOT CLAIM.
//
// `review.remark.test.ts` in `packages/sim` pins the SELECTOR against tables written to
// exercise it. This one pins the TABLE THAT SHIPS, against the content that ships, through the
// same public door a host would use — `loadGuestRemarksFrom`, then `bindGuestRemarks`, then
// `remarkFor`. Between them: one file says the machine is right, this one says the words are
// reachable.
//
// IT ASSERTS NOTHING ABOUT WHETHER A LINE IS FUNNY. That is a human reading the JSON, and
// ADR-0013's rule about perceptual criteria applies — a criterion with no check is a word that
// comes out. What is mechanical, and is here:
//
//   EVERY CELL SPEAKS      every score the scale admits, times every need the table declares,
//                          times every whole hour of a stay, produces a line
//   EVERY CELL IS NAMED    and not merely covered by the wildcard — the register rule is that
//                          the grievance is SPECIFIC, so a hole is a table that shrugs
//   THE WILDCARD IS ALIVE  and fires, so the safety net is not a row nothing selects
//   THE NUMBER IS REAL     no rendered line still carries a placeholder, and none of them
//                          reads "1 hours"
//   THE BYTES ARE PLAIN    ASCII only, so a line is byte-identical on every platform
// ============================================================================

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bindGuestRemarks, needTypesInOrder, remarkFor, reviewScaleOf, TICKS_PER_HOUR } from '@hotelsim/sim';
import type { NeedState } from '@hotelsim/sim';
import { HOURS_PLACEHOLDER } from '@hotelsim/content';
import { GUEST_REMARKS_PATH, loadContent, loadGuestRemarksFrom } from './content-loader.js';

const CONTENT = loadContent();
const REMARKS = loadGuestRemarksFrom(GUEST_REMARKS_PATH);
const BOOK = bindGuestRemarks(CONTENT, REMARKS);
const NEEDS = needTypesInOrder(CONTENT);
const SCALE = reviewScaleOf(CONTENT);
const STAY = 1_440;
const HOURS_PER_DAY = 24;

/** The shipped need vector, with one need starved for `ticks` and the rest served throughout. */
function starveByTicks(needIndex: number, ticks: number): readonly NeedState[] {
  return NEEDS.map((need, i) => ({
    needId: need.id,
    deficit: 0,
    unservedTicks: i === needIndex ? ticks : 0,
    reservedEntityId: 0,
  })) as unknown as readonly NeedState[];
}

/** The same, in whole hours. */
const starve = (needIndex: number, hours: number): readonly NeedState[] =>
  starveByTicks(needIndex, hours * TICKS_PER_HOUR);

/** Every line the shipped table can put in front of a player, once each. */
function everySpokenLine(): readonly string[] {
  const said: string[] = [];
  for (let needIndex = 0; needIndex < NEEDS.length; needIndex += 1) {
    for (let hours = 0; hours <= HOURS_PER_DAY; hours += 1) {
      for (const cutShort of [false, true]) {
        for (let stars = 0; stars <= NEEDS.length + 1; stars += 1) {
          const spoken = remarkFor(BOOK, CONTENT, starve(needIndex, hours), cutShort, STAY, stars, 0);
          if (spoken !== undefined) said.push(spoken.text);
        }
      }
    }
  }
  return said;
}

describe('THE SHIPPED TABLE BINDS — against the shipped content, through the host door', () => {
  it('loads, and the review scale it is checked against is the one the content declares', () => {
    expect(SCALE).toBeDefined();
    expect(BOOK.rows.length).toBe(REMARKS.length);
    // A scan with an empty subject passes forever (ADR-0007). These say there is a table here.
    expect(BOOK.rows.length).toBeGreaterThan(NEEDS.length);
    expect(NEEDS.length).toBeGreaterThan(0);
  });

  it('and it is ordered ascending by id, whatever order the file is written in', () => {
    const ids = BOOK.rows.map((row) => row.id);
    expect(ids).toEqual([...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

describe('EVERY CELL SPEAKS, AND EVERY CELL IS NAMED', () => {
  it('every score times every need has a line that NAMES the need, not just a wildcard', () => {
    // `bindGuestRemarks` only requires coverage. This is the stronger, register-level claim:
    // the human's rule is that the grievance is specific and countable, so a cell served only
    // by the wildcard is a cell where the hotel's voice goes vague.
    const missing: string[] = [];
    for (let score = SCALE!.min; score <= SCALE!.max; score += 1) {
      for (const need of NEEDS) {
        const named = BOOK.rows.some((row) => row.score === score && row.needId === need.id);
        if (!named) missing.push(`${String(score)}/${need.id}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('and every score also has the wildcard that makes coverage total at zero hours', () => {
    for (let score = SCALE!.min; score <= SCALE!.max; score += 1) {
      const wildcard = BOOK.rows.some(
        (row) => row.score === score && row.needId === undefined && (row.minUnservedHours ?? 0) === 0,
      );
      expect(wildcard, `no wildcard at ${String(score)}`).toBe(true);
    }
  });

  it('so no reachable stay leaves a guest with nothing to say', () => {
    const said = everySpokenLine();
    expect(said.length).toBeGreaterThan(0);
    for (const line of said) expect(line.length).toBeGreaterThan(0);
  });

  it('THE WILDCARD IS ALIVE: a guest below every severity gate still gets one', () => {
    // Every specific line about a starved need is gated at two hours or more, so a guest whose
    // worst need was served throughout falls to the wildcard. If that stopped being true the
    // safety net would be five rows nothing selects.
    const spoken = remarkFor(BOOK, CONTENT, starve(0, 0), true, STAY, 0, 0);
    expect(spoken).toBeDefined();
    expect(BOOK.rows.find((row) => row.id === spoken?.remarkId)?.needId).toBeUndefined();
  });
});

describe('THE NUMBER IS REAL — and the grammar survives it', () => {
  it('no rendered line still carries the placeholder', () => {
    // The cross-check that keeps `packages/content`'s spelling and `packages/sim`'s in step.
    // ADR-0001 forbids the sim a value import from the content package, so the constant cannot
    // be single-sourced; this drives the shipped rows through the shipped substitution instead
    // of comparing one retyped literal against another (ADR-0005).
    for (const line of everySpokenLine()) expect(line).not.toContain(HOURS_PLACEHOLDER);
  });

  it('and none of them reads "1 hours"', () => {
    // `guestRemarksSchema` refuses a `{hours}` row reachable below two hours. This is that rule
    // observed at the other end, on rendered output, over every hour of a stay.
    for (const line of everySpokenLine()) expect(line).not.toMatch(/\b1 hours\b/);
  });

  it('and a line that counts prints the hours the simulation integrated, floored', () => {
    // A stay cut short is floored, and every floor row about a starved need is a counting row,
    // so this reaches the substitution rather than the wildcard. Nine hours and fifty-nine
    // minutes is nine hours: the guest never claims time it did not spend.
    const need = indexOfLodging();
    const exactly = remarkFor(BOOK, CONTENT, starve(need, 9), true, STAY, 0, 0);
    expect(exactly?.text).toContain('9 hours');
    const nearly = starveByTicks(need, 9 * TICKS_PER_HOUR + (TICKS_PER_HOUR - 1));
    expect(remarkFor(BOOK, CONTENT, nearly, true, STAY, 0, 0)?.text).toBe(exactly?.text);
  });
});

describe('THE BYTES ARE PLAIN — a line hashes the same on every platform', () => {
  it('every text and every name is ASCII', () => {
    // A curly quote or an en dash is two or three bytes and is exactly the sort of thing an
    // editor inserts silently. The shipped table is read from disk here rather than retyped.
    const raw = readFileSync(GUEST_REMARKS_PATH, 'utf8');
    const offending = [...raw].filter((ch) => ch !== '\n' && ch !== '\r' && ch !== '\t' && (ch < ' ' || ch > '~'));
    expect(offending).toEqual([]);
  });

  it('and every row carries a text and a name a designer wrote', () => {
    for (const row of BOOK.rows) {
      expect(row.text.trim(), row.id).toBe(row.text);
      expect(row.text.endsWith('.'), `${row.id} does not end in a full stop`).toBe(true);
      expect(row.name.length).toBeGreaterThan(0);
    }
  });
});

/** The lodging need's position in the shipped table, found rather than assumed (ADR-0003). */
function indexOfLodging(): number {
  const index = NEEDS.findIndex((need) => need.role === 'lodging');
  expect(index).toBeGreaterThanOrEqual(0);
  return index;
}
