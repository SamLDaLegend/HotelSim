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
import {
  ContentError,
  parseContent,
  parseContentJson,
  parseEconomies,
  parseEconomiesJson,
  parseGuestRules,
  parseGuestRulesJson,
} from './registry.js';

const roomType = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'standard_room',
  name: 'Standard Room',
  capacity: 2,
  nightlyRatePence: 8_500,
  nightlyUpkeepPence: 2_500,
  constructionCostPence: 250_000,
  // Required on disk since G-011, for the MIRROR of the dominance reason the prices are: a
  // missing price ships a room that is free, a missing refund ships one that can never be
  // liquidated — which silently re-opens half of the dead state ADR-0011 closed. `0` is
  // the sayable version of "scrapping this returns nothing".
  demolitionRefundBasisPoints: 5_000,
  // Required on disk since G-009, for the same dominance reason both prices are: a room
  // type that requires nothing is strictly easier to make valid than one that does.
  // `[]` is the sayable version of "no furniture".
  requires: ['single_bed'],
  ...overrides,
});

/** The same record with one key deleted, which is what a designer's oversight looks like. */
const roomTypeWithout = (key: string): Record<string, unknown> => {
  const entry = roomType();
  delete entry[key];
  return entry;
};

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
      nightlyUpkeepPence: 2_500,
      constructionCostPence: 250_000,
      demolitionRefundBasisPoints: 5_000,
      requires: ['single_bed'],
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

  it('rejects a float, negative or non-numeric upkeep (ADR-0002)', () => {
    expect(() => parseOne({ nightlyUpkeepPence: 25.5 })).toThrow(/nightlyUpkeepPence/);
    expect(() => parseOne({ nightlyUpkeepPence: -1 })).toThrow(/nightlyUpkeepPence/);
    expect(() => parseOne({ nightlyUpkeepPence: '2500' })).toThrow(/nightlyUpkeepPence/);
  });

  it('rejects a float, negative or non-numeric construction cost (ADR-0002)', () => {
    expect(() => parseOne({ constructionCostPence: 2_500.5 })).toThrow(/constructionCostPence/);
    expect(() => parseOne({ constructionCostPence: -1 })).toThrow(/constructionCostPence/);
    expect(() => parseOne({ constructionCostPence: '250000' })).toThrow(/constructionCostPence/);
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

describe('new content on disk must state both of its prices (G-008)', () => {
  // THE FREE ROOM. A room type on disk that omits `nightlyUpkeepPence` and
  // `constructionCostPence` is free to build and free to keep — strictly better than
  // every priced room type on every axis, which is the dominant-strategy collapse the
  // build loop dies of. Measured before this check existed, `--rooms 0 --build 1
  // --days 200` under exactly the document below: 1,680 rooms built from a balance of
  // 0, zero refusals, balance +20,366,000p. Under the shipped content, same flags:
  // 0 rooms, balance 0, 1,680 insufficient-funds refusals. One forgotten JSON key.
  //
  // The keys stay OPTIONAL in `RoomTypeData` in packages/sim, which is not an
  // inconsistency but the whole point: history may omit and still fingerprint as it
  // did (ADR-0006's permanent v1 fixture is a frozen sim-side literal and never comes
  // through this schema), while anything arriving on disk today must say its prices.
  it('rejects a room type that omits nightlyUpkeepPence', () => {
    expect(() => parseContent([roomTypeWithout('nightlyUpkeepPence')])).toThrow(ContentError);
    expect(() => parseContent([roomTypeWithout('nightlyUpkeepPence')])).toThrow(/nightlyUpkeepPence/);
  });

  it('rejects a room type that omits constructionCostPence', () => {
    expect(() => parseContent([roomTypeWithout('constructionCostPence')])).toThrow(ContentError);
    expect(() => parseContent([roomTypeWithout('constructionCostPence')])).toThrow(/constructionCostPence/);
  });

  it('rejects the free room — both keys gone — naming both, not just the first', () => {
    const free = roomTypeWithout('nightlyUpkeepPence');
    delete free['constructionCostPence'];
    let message = '';
    try {
      parseContent([free], 'data/room-types.json');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('data/room-types.json');
    expect(message).toContain('nightlyUpkeepPence');
    expect(message).toContain('constructionCostPence');
  });

  // THE COMPANION, and the reason the three above are evidence rather than noise: the
  // byte-identical document WITH the two keys parses. So what those tests detect is the
  // absence of the key and nothing else — no unrelated strictness, no accident of the
  // factory. Restore either `.optional()` in `roomTypeSchema` and they go red while
  // this one stays green, which is the mutation that must be caught.
  it('accepts the same document once both prices are stated', () => {
    expect(() => parseContent([roomType()])).not.toThrow();
  });

  it('accepts 0 — free is sayable, it just cannot be said by silence', () => {
    // `0` and an absent key were always different statements. This keeps the deliberate
    // one available: a designer who means "free to build" writes the number and owns it.
    expect(() => parseOne({ nightlyUpkeepPence: 0, constructionCostPence: 0 })).not.toThrow();
  });

  it('rejects a room type that omits requires, and accepts one that says [] (G-009)', () => {
    // The same argument as the two prices, one goal later: silence on disk is a
    // designer's oversight and `[]` is a designer's statement. A room needing no
    // furniture is a real thing — a corridor at M3, a broom cupboard — and it says so.
    expect(() => parseContent([roomTypeWithout('requires')])).toThrow(ContentError);
    expect(() => parseContent([roomTypeWithout('requires')])).toThrow(/requires/);
    expect(() => parseOne({ requires: [] })).not.toThrow();
  });

  it('rejects a room type that omits demolitionRefundBasisPoints, and accepts 0 (G-011)', () => {
    // The same argument again, for the MIRROR hazard. A missing price makes a room
    // strictly better than every priced one; a missing refund makes it impossible to
    // liquidate, which quietly re-opens half of the absorbing state ADR-0011 closed —
    // with every gate green, because nothing else in the pipeline can see it.
    expect(() => parseContent([roomTypeWithout('demolitionRefundBasisPoints')])).toThrow(ContentError);
    expect(() => parseContent([roomTypeWithout('demolitionRefundBasisPoints')])).toThrow(
      /demolitionRefundBasisPoints/,
    );
    expect(() => parseOne({ demolitionRefundBasisPoints: 0 })).not.toThrow();
  });

  it('bounds the refund rate to 0..10000 basis points, and demands an integer', () => {
    // A fraction is an integer for the same reason money is (ADR-0002): `0.5` on disk
    // would reach `constructionCostPence * fraction` and produce a last penny that depends
    // on the platform. 10,000bp is 100%; there is no such thing as refunding 150%.
    for (const bad of [-1, 10_001, 5_000.5, '5000']) {
      expect(() => parseOne({ demolitionRefundBasisPoints: bad })).toThrow(
        /demolitionRefundBasisPoints/,
      );
    }
    for (const good of [0, 1, 5_000, 10_000]) {
      expect(() => parseOne({ demolitionRefundBasisPoints: good })).not.toThrow();
    }
  });
});

describe('the economy table (G-011)', () => {
  const economy = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'house_rules',
    name: 'House Rules',
    startingCapitalPence: 500_000,
    loanPrincipalPence: 300_000,
    loanFeeBasisPoints: 1_000,
    loanRepaymentPerNightPence: 10_000,
    liquidationRoomsMax: 4,
    ...overrides,
  });
  const parseOneEconomy = (overrides: Record<string, unknown> = {}): unknown =>
    parseEconomies([economy(overrides)]);

  it('accepts the shipped shape and returns it verbatim', () => {
    expect(parseEconomies([economy()])).toEqual([economy()]);
  });

  it('demands every field, because there is no sensible default for a house rule', () => {
    for (const key of [
      'id',
      'name',
      'startingCapitalPence',
      'loanPrincipalPence',
      'loanFeeBasisPoints',
      'loanRepaymentPerNightPence',
      'liquidationRoomsMax',
    ]) {
      const entry = economy();
      delete entry[key];
      expect(() => parseEconomies([entry])).toThrow(ContentError);
    }
  });

  it('demands integer pence and rejects a float, a negative and a string (ADR-0002)', () => {
    for (const key of ['startingCapitalPence', 'loanPrincipalPence', 'loanRepaymentPerNightPence']) {
      for (const bad of [1.5, -1, '500']) {
        expect(() => parseOneEconomy({ [key]: bad })).toThrow(new RegExp(key));
      }
    }
  });

  it('bounds the loan fee to 0..10000 basis points', () => {
    for (const bad of [-1, 10_001, 1_000.5]) {
      expect(() => parseOneEconomy({ loanFeeBasisPoints: bad })).toThrow(/loanFeeBasisPoints/);
    }
    expect(() => parseOneEconomy({ loanFeeBasisPoints: 0 })).not.toThrow();
    expect(() => parseOneEconomy({ loanFeeBasisPoints: 10_000 })).not.toThrow();
  });

  it('demands a positive integer liquidationRoomsMax — the lender brake (G-011)', () => {
    // The mirror of the refund's upper bound: it is what stops a refund of zero turning
    // the loan into an unbounded credit line. "Rooms" is a count, so 0, a negative and a
    // fraction are all meaningless, and the schema says so before `bindContent` has to.
    for (const bad of [0, -1, 2.5, '4']) {
      expect(() => parseOneEconomy({ liquidationRoomsMax: bad })).toThrow(/liquidationRoomsMax/);
    }
    for (const good of [1, 2, 4, 1_000]) {
      expect(() => parseOneEconomy({ liquidationRoomsMax: good })).not.toThrow();
    }
  });

  it('rejects an unknown key, because a typo that is ignored becomes a balance mystery', () => {
    expect(() => parseOneEconomy({ loanInterestBasisPoints: 500 })).toThrow(ContentError);
  });

  it('rejects an empty document and duplicate ids', () => {
    expect(() => parseEconomies([])).toThrow(ContentError);
    expect(() => parseEconomies([economy(), economy()])).toThrow(/duplicate economy id/);
  });

  it('demands a snake_case id, like every other content table (ADR-0003)', () => {
    expect(() => parseOneEconomy({ id: 'houseRules' })).toThrow(/snake_case/);
  });

  it('keeps "not JSON" and "not content" apart, like every other parser here', () => {
    expect(() => parseEconomiesJson('[{"id":', 'economy.json')).toThrow(/economy\.json is not valid JSON/);
    expect(() => parseEconomiesJson('[]', 'economy.json')).toThrow(/economy\.json is not valid content/);
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

describe('the guest rules table (G-014b)', () => {
  // THE VALIDATION BOUNDARY OF THE FILE THIS GOAL ADDED, AND IT SHIPPED WITH NOTHING ON IT.
  // Every other table in this package has a block like this one; `guest-rules.json` had zero
  // tests, and `ai-critic` probed all six of its clauses by hand and found every one correct.
  // "Correct today, pinned by nothing" is ADR-0007's subject exactly, and two of these are
  // load-bearing rather than routine:
  //
  //   the DUPLICATE-ID refusal is what makes `firstGuestRules` — and therefore
  //   `abandonMarginOf` — order-independent. Two entries sharing an id would make the
  //   shipped margin depend on which one the normaliser reached first, which is I2's
  //   Set-iteration hazard arriving through a content file.
  //
  //   the MISSING-FIELD refusal is the whole of the ADR-0008 argument
  //   `abandonMarginBasisPointsSchema` spends thirty lines making: absence in HISTORY means
  //   total commitment, and absence on a NEW document is a designer forgetting a dial. Only
  //   the schema knows the bytes came off disk today, so only the schema can tell them apart
  //   — and until now nothing checked that it did.
  const rules = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 'house_guest_rules',
    name: 'House Guest Rules',
    abandonMarginBasisPoints: 6_000,
    // The review scale (G-019). Required on disk for the SAME reason the margin is, and the
    // two of them are the whole of this table today.
    reviewScoreMin: 1,
    reviewScoreMax: 5,
    ...overrides,
  });
  const parseOneRule = (overrides: Record<string, unknown> = {}): unknown => parseGuestRules([rules(overrides)]);

  it('accepts the shipped shape and returns it verbatim', () => {
    expect(parseGuestRules([rules()])).toEqual([rules()]);
  });

  it('DEMANDS THE MARGIN, because silence on a new document is a forgotten dial', () => {
    // The ADR-0008 asymmetry made mechanical. `GuestRulesData` in `packages/sim` keeps this
    // key optional and reads its absence as total commitment, which is exactly true of
    // content written before G-014b. A document that reaches THIS schema was written today,
    // and a designer who forgets the field would otherwise inherit the historical default and
    // ship a hotel whose guests silently stopped changing their minds.
    for (const key of ['id', 'name', 'abandonMarginBasisPoints', 'reviewScoreMin', 'reviewScoreMax']) {
      const entry = rules();
      delete entry[key];
      expect(() => parseGuestRules([entry])).toThrow(ContentError);
    }
  });

  it('DEMANDS BOTH ENDS OF THE REVIEW SCALE, and refuses one that cannot separate two stays', () => {
    // G-019. The same asymmetry one field over: `GuestRulesData` keeps both optional and
    // reads their absence as "this content left no reviews", which is exactly true of
    // anything written before G-019 — and a document reaching THIS schema was written today.
    //
    // The relation that decides the design — `max - min >= needTypes.length` — is NOT here,
    // and cannot be: this schema never sees the need table. It lives in `bindContent`. What
    // is checkable from one document is that the scale admits more than one score at all.
    for (const bad of [{ reviewScoreMax: 1 }, { reviewScoreMax: 0 }, { reviewScoreMin: 5, reviewScoreMax: 5 }]) {
      expect(() => parseOneRule(bad)).toThrow(/reviewScoreMax must be greater than reviewScoreMin/);
    }
    for (const bad of [1.5, '5', null]) {
      expect(() => parseOneRule({ reviewScoreMax: bad })).toThrow(ContentError);
    }
    // A scale that does not start at 1 is a perfectly good scale; nothing here requires one.
    expect(() => parseOneRule({ reviewScoreMin: -2, reviewScoreMax: 2 })).not.toThrow();
  });

  it('bounds the margin to 0..10000 basis points, and rejects a float', () => {
    for (const bad of [-1, 10_001, 6_000.5, '6000']) {
      expect(() => parseOneRule({ abandonMarginBasisPoints: bad })).toThrow(/abandonMarginBasisPoints/);
    }
    // BOTH ENDS ARE LEGAL AND BOTH MEAN SOMETHING (G-014b criterion 3): 0 is the thrash
    // control arm and 10,000 is the era before this goal. A schema that refused either would
    // make an arm of this goal's own evidence unloadable.
    for (const good of [0, 1, 6_000, 10_000]) {
      expect(() => parseOneRule({ abandonMarginBasisPoints: good })).not.toThrow();
    }
  });

  it('rejects an unknown key, because a typo that is ignored becomes a behaviour mystery', () => {
    expect(() => parseOneRule({ abandonMarginBasisPoint: 6_000 })).toThrow(ContentError);
  });

  it('REJECTS DUPLICATE IDS, which is what keeps the shipped margin independent of file order', () => {
    expect(() => parseGuestRules([rules(), rules()])).toThrow(/duplicate guest rules id/);
    // And two DIFFERENT ids are fine: the table is a list because M6 wants per-archetype
    // rules, and `firstGuestRules` takes the lowest id after normalisation.
    expect(() => parseGuestRules([rules(), rules({ id: 'strict_guest_rules' })])).not.toThrow();
  });

  it('rejects an empty document, so a file that parses cannot mean "no rules"', () => {
    expect(() => parseGuestRules([])).toThrow(ContentError);
  });

  it('demands a snake_case id, like every other content table (ADR-0003)', () => {
    expect(() => parseOneRule({ id: 'houseGuestRules' })).toThrow(/snake_case/);
  });

  it('keeps "not JSON" and "not content" apart, like every other parser here', () => {
    expect(() => parseGuestRulesJson('[{"id":', 'guest-rules.json')).toThrow(
      /guest-rules\.json is not valid JSON/,
    );
    expect(() => parseGuestRulesJson('[]', 'guest-rules.json')).toThrow(
      /guest-rules\.json is not valid content/,
    );
  });
});
