// I3 — CONTENT IS DATA. The validation half of G-002.
//
// What these pin is the FAILURE path, mostly. A schema that accepts good content is
// worth little; a schema that rejects bad content with a message naming the field is
// the difference between a designer fixing a typo in ten seconds and someone
// bisecting the simulation for an afternoon.
//
// These tests read no files — this package cannot. The shipped `room-types.json` is
// exercised against the real bytes in `tools/headless/src/content-loader.test.ts`,
// which is the module that owns the filesystem.

import { describe, expect, it } from 'vitest';
import { ContentError, parseContent, parseContentJson } from './registry.js';

const roomType = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'standard_room',
  name: 'Standard Room',
  capacity: 2,
  nightlyRatePence: 8_500,
  ...overrides,
});

const parseOne = (overrides: Record<string, unknown> = {}): unknown => parseContent([roomType(overrides)]);

describe('parseContent — the happy path', () => {
  it('accepts a valid document and returns its room types', () => {
    const registry = parseContent([roomType()]);
    expect(registry.roomTypes).toHaveLength(1);
    expect(registry.roomTypes[0]).toEqual({
      id: 'standard_room',
      name: 'Standard Room',
      capacity: 2,
      nightlyRatePence: 8_500,
    });
  });

  it('accepts several room types', () => {
    const registry = parseContent([roomType(), roomType({ id: 'deluxe_room' })]);
    expect(registry.roomTypes.map((entry) => entry.id)).toEqual(['standard_room', 'deluxe_room']);
  });
});

describe('parseContentJson — invalid JSON is rejected', () => {
  it('rejects a trailing comma with a message saying it is not JSON', () => {
    // The exit criterion's named path. "This is not JSON" and "this is JSON but not
    // content" are different mistakes with different fixes, and are reported apart.
    const attempt = (): unknown => parseContentJson('[{"id": "standard_room",}]', 'rooms.json');
    expect(attempt).toThrow(ContentError);
    expect(attempt).toThrow(/rooms\.json is not valid JSON/);
  });

  it('rejects truncated and empty documents', () => {
    expect(() => parseContentJson('[{"id":', 'rooms.json')).toThrow(/not valid JSON/);
    expect(() => parseContentJson('', 'rooms.json')).toThrow(/not valid JSON/);
  });

  it('accepts JSON that is valid content', () => {
    expect(parseContentJson(JSON.stringify([roomType()])).roomTypes).toHaveLength(1);
  });

  it('separates "not JSON" from "not content"', () => {
    expect(() => parseContentJson('{"roomTypes": []}', 'rooms.json')).toThrow(/is not valid content/);
    expect(() => parseContentJson('{"roomTypes": []}', 'rooms.json')).not.toThrow(/not valid JSON/);
  });
});

describe('parseContent — structural rejection', () => {
  it('rejects a wrapper object, because the document is a top-level array', () => {
    // Not a stylistic preference: `check-content.mjs` walks
    // `Array.isArray(parsed) ? parsed : Object.values(parsed)` and then reads
    // `entry.id`, so a wrapper makes the gate's id check pass over nothing at all.
    expect(() => parseContent({ roomTypes: [roomType()] })).toThrow(/not valid content/);
  });

  it('rejects an empty document — content that defines nothing is a mistake', () => {
    expect(() => parseContent([])).toThrow(/not valid content/);
  });

  it('rejects a null or scalar document', () => {
    expect(() => parseContent(null)).toThrow(ContentError);
    expect(() => parseContent(42)).toThrow(ContentError);
  });
});

describe('parseContent — field rejection', () => {
  it('rejects an id that is not snake_case (ADR-0003)', () => {
    // Enforced at load, not only by the gate: the gate cannot see a document built in
    // memory, or fetched by a bundler at M5, and this can.
    expect(() => parseOne({ id: 'standardRoom' })).toThrow(/snake_case/);
    expect(() => parseOne({ id: 'Standard_Room' })).toThrow(/snake_case/);
    expect(() => parseOne({ id: 'standard room' })).toThrow(/snake_case/);
    expect(() => parseOne({ id: 'room' })).toThrow(/snake_case/);
  });

  it('rejects an unknown key rather than silently ignoring a typo', () => {
    // A silently-dropped `nightlyRatePenc` becomes "the balance is slightly wrong"
    // three goals later, with nothing pointing back at the content file.
    expect(() => parseOne({ nightlyRatePenc: 8_500 })).toThrow(/Unrecognized key/);
  });

  it('rejects a float price (ADR-0002 — money is integer minor units)', () => {
    expect(() => parseOne({ nightlyRatePence: 85.5 })).toThrow(/nightlyRatePence/);
    expect(() => parseOne({ nightlyRatePence: '8500' })).toThrow(/nightlyRatePence/);
  });

  it('rejects a negative price and a capacity below one', () => {
    expect(() => parseOne({ nightlyRatePence: -1 })).toThrow(/nightlyRatePence/);
    expect(() => parseOne({ capacity: 0 })).toThrow(/capacity/);
    expect(() => parseOne({ capacity: 1.5 })).toThrow(/capacity/);
  });

  it('rejects a missing or empty name', () => {
    expect(() => parseContent([{ id: 'standard_room', capacity: 2, nightlyRatePence: 8_500 }])).toThrow(/name/);
    expect(() => parseOne({ name: '' })).toThrow(/name/);
  });

  it('rejects duplicate ids, which would make lookup depend on document order', () => {
    expect(() => parseContent([roomType(), roomType()])).toThrow(/duplicate room type id/);
    expect(() => parseContent([roomType(), roomType()])).toThrow(/standard_room/);
  });
});

describe('the error a designer actually sees', () => {
  it('names the failing field and the source, and carries no stack frames', () => {
    let message = '';
    try {
      parseContentJson(JSON.stringify([roomType({ nightlyRatePence: 85.5 })]), 'data/room-types.json');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('data/room-types.json');
    expect(message).toContain('nightlyRatePence');
    // Not a zod stack trace through six frames of library internals.
    expect(message).not.toContain('at Object.');
    expect(message).not.toContain('node_modules');
  });

  it('reports every problem in one pass, not the first one only', () => {
    const message = (((): string => {
      try {
        parseContent([roomType({ id: 'nope', capacity: 0 })]);
        return '';
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    })());
    expect(message).toContain('id');
    expect(message).toContain('capacity');
  });

  it('is a ContentError, so a host can tell content failure from a bug', () => {
    expect(() => parseContent([])).toThrow(ContentError);
    expect(new ContentError('x').name).toBe('ContentError');
  });
});
