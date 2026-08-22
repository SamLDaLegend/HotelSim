// G-027a — WHERE 1,440 COMES FROM, AND WHAT `bindContent` REFUSES.
//
//   pnpm exec vitest run stay
//
// The number is DERIVED and the derivation is EXECUTED. §2.1's rule is that a gate
// threshold must be traceable to a stated requirement; ADR-0007's third amendment is that
// the tracing must be a check rather than a paragraph. So nothing below compares
// `stayDurationTicks` against `TICKS_PER_DAY` and calls that a derivation — that would be
// two spellings of one constant agreeing with itself, which is the vacuity ADR-0007 names.
// It steps a world instead and COUNTS what the requirement is about.
//
// It lives in `tools/headless` because it reads the shipped content and the shipped bytes
// off the disk, which `packages/sim` may not do (I1).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  bindContent,
  idleShareBasisPoints,
  serviceFloorRefill,
  isSettlementTick,
  lodgingNeedOf,
  needTypesInOrder,
  stayDurationOf,
  TICKS_PER_DAY,
} from '@hotelsim/sim';
import type { SimContent } from '@hotelsim/sim';
import { ECONOMY_PATH, GUEST_RULES_PATH, ROOM_TYPES_PATH, loadContent } from './content-loader.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const content = loadContent();

describe('the shipped stay duration', () => {
  const stay = stayDurationOf(content);

  it('is declared, and the shipped hotel therefore has a checkout at all', () => {
    expect(stay).toBeDefined();
  });

  it('SPANS EXACTLY ONE SETTLEMENT, FROM EVERY START OFFSET — counted, not compared', () => {
    // THE REQUIREMENT, EXECUTED. A stay beginning on tick `t` covers the ticks
    // `t + 1 .. t + stay` (a guest arriving on `t` is first stepped on `t + 1`). Count the
    // settlement ticks in that window. The requirement is that it is exactly one, whatever
    // `t` is — which is what makes `nightlyRatePence` against `nightlyUpkeepPence` a
    // comparison a designer can make in their head.
    expect(stay).toBeDefined();
    const window = stay ?? 0;
    for (let start = 0; start < TICKS_PER_DAY; start += 1) {
      let settlements = 0;
      for (let tick = start + 1; tick <= start + window; tick += 1) {
        if (isSettlementTick(tick)) settlements += 1;
      }
      expect(settlements, `a stay starting at tick ${start} spans ${settlements} settlements`).toBe(1);
    }
  });

  it('and NOTHING SHORTER OR LONGER HAS THAT PROPERTY — the failing companion', () => {
    // ADR-0007: a check that cannot fail is not a check. If the loop above passed for
    // several durations it would be measuring nothing about 1,440 in particular.
    const spans = (window: number): Set<number> => {
      const seen = new Set<number>();
      for (let start = 0; start < TICKS_PER_DAY; start += 1) {
        let settlements = 0;
        for (let tick = start + 1; tick <= start + window; tick += 1) {
          if (isSettlementTick(tick)) settlements += 1;
        }
        seen.add(settlements);
      }
      return seen;
    };
    for (const wrong of [(stay ?? 0) - 1, (stay ?? 0) + 1, Math.floor((stay ?? 0) / 2)]) {
      const seen = spans(wrong);
      expect(seen.size === 1 && seen.has(1), `a stay of ${wrong} ticks is also exactly one settlement`).toBe(
        false,
      );
    }
  });

  it('leaves the shipped table a quarter of a guest time idle, computed off the table itself', () => {
    // THE FLOOR THIS ASSERTION USED TO READ IS GONE (G-027b). It was a TICK floor —
    // `max(lodging satisfyTicks, sum of engagement satisfyTicks)` — and both fields it summed
    // are deleted by the stock model. What refuses an over-demanding table now is a SHARE: a
    // need held in steady state is served for `1/(1 + refillPerTick)` of the time, and the
    // lodging need costs a further slice of the away time the engagement needs generate.
    //
    // The complement of that demand is the IDLE SHARE, and it is the same fold — one
    // derivation, two READINGS since G-041, so the number a gate refuses on and the number a
    // criterion is written against can never describe different hotels. At the DECLARED rates
    // the table demands 2,997 basis points and leaves 7,003; at the SERVICE FLOOR it demands
    // 7,500 and leaves 2,500, which is the pair this project simulated as a single number until
    // ADR-0054 made `refillPerTick` a ceiling. See `needShareBasisPoints`.
    const lodging = lodgingNeedOf(content);
    expect(lodging).toBeDefined();
    expect(lodging?.capacityTicks).toBe(300);
    expect(lodging?.refillPerTick).toBe(2);
    expect(lodging === undefined ? undefined : serviceFloorRefill(lodging)).toBe(1);
    for (const needType of needTypesInOrder(content)) {
      if (needType.id === lodging?.id) continue;
      expect(needType.capacityTicks).toBe(1_400);
      expect(needType.refillPerTick).toBe(14);
      expect(serviceFloorRefill(needType)).toBe(7);
    }
    expect(idleShareBasisPoints(content)).toBe(7_003);
    // And the stay is still long enough for the lodging need to become wanted twice, which is
    // the refusal that replaced the floor. `bindContent` accepted this content, so it is.
    expect(stay).toBe(1_440);
  });
});

// ============================================================================
//  THE REFUSALS. Content ids in the hand-built sets below are camelCase, because these
//  are sim-shaped documents built in memory rather than files on disk (ADR-0003).
// ============================================================================

const roomType = (id: string, provides: readonly string[]) => ({
  id,
  name: id,
  capacity: 2,
  nightlyRatePence: 8_500,
  provides,
});
const need = (id: string, role: 'lodging' | 'engagement', refillPerTick: number) => ({
  id,
  name: id,
  role,
  capacityTicks: 100,
  refillPerTick,
});
const withRules = (stay: number | undefined): SimContent => ({
  roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
  needTypes: [need('rest', 'lodging', 2), need('food', 'engagement', 3)],
  guestRules:
    stay === undefined
      ? [{ id: 'houseRules', name: 'House Rules', toleranceTicks: 100 }]
      : [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: stay, toleranceTicks: 100 }],
});

describe('bindContent refuses a hotel whose guests could never leave', () => {
  it('accepts content that declares a lodging need and a stay', () => {
    expect(() => bindContent(withRules(60))).not.toThrow();
  });

  it('refuses guest rules that declare no stayDurationTicks', () => {
    expect(() => bindContent(withRules(undefined))).toThrow(/declare no stayDurationTicks/);
  });

  it('refuses content that declares a lodging need and no guest rules at all', () => {
    const { guestRules: _none, ...bare } = withRules(60);
    expect(() => bindContent(bare)).toThrow(/no guest rules at all/);
  });

  it('BUT ACCEPTS CONTENT WITH NO LODGING NEED — which is what keeps SAVE_V1_CONTENT ticking', () => {
    // The whole reason the refusal is keyed on the lodging need. A content set with no need
    // types has no guest that could hold a room forever, so there is nothing to refuse; and
    // that document is the permanent v1 fixture's, whose fingerprint may not move (ADR-0006,
    // ADR-0010). `guest.stay.save.test.ts` asserts the fingerprint itself.
    expect(() => bindContent({ roomTypes: [roomType('bedroom', [])] })).not.toThrow();
  });

  it('refuses a need table that demands the WHOLE of a guest time — the successor to the floor', () => {
    // THE TICK FLOOR BECAME A SHARE (G-027b). "A stay long enough to finish everything" is a
    // sentence about a task; under a stock nothing finishes, and what can still be guaranteed
    // unhappiness is a table whose needs together demand more time than a guest has. At refill
    // 1 a single engagement need costs half of it and the lodging need the same again, which
    // is the whole of it.
    const greedy: SimContent = {
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('rest', 'lodging', 1), need('food', 'engagement', 1)],
      guestRules: [{ id: 'houseRules', name: 'House Rules', stayDurationTicks: 60, toleranceTicks: 100 }],
    };
    expect(() => bindContent(greedy)).toThrow(/basis points of a guest's time/);
  });

  it('and refuses a stay too short for the LODGING need to become wanted twice', () => {
    // The other half of what the floor used to cover, and the one that is specific to a stock:
    // rest decays only in away time, so a stay that generates too little of it ships a guest
    // that holds a room all stay with a full bar — the furniture problem ADR-0017 exists to
    // remove. A want line is what arms this refusal, so it is declared here and nowhere else
    // in this block.
    const sleepy: SimContent = {
      roomTypes: [roomType('bedroom', ['rest']), roomType('cafe', ['food'])],
      needTypes: [need('rest', 'lodging', 2), need('food', 'engagement', 3)],
      guestRules: [
        { id: 'houseRules', name: 'House Rules', stayDurationTicks: 60, toleranceTicks: 100, wantAtBasisPoints: 5_000 },
      ],
    };
    expect(() => bindContent(sleepy)).toThrow(/it would never become wanted twice/);
  });

  it('refuses a zero or fractional stay at the clone boundary', () => {
    expect(() => bindContent(withRules(0))).toThrow(/stayDurationTicks of 0/);
    expect(() => bindContent(withRules(60.5))).toThrow(/stayDurationTicks of 60\.5/);
  });
});

// ============================================================================
//  THE GUARD THIS GOAL CARES ABOUT MOST.
// ============================================================================
describe('the money files are BYTE-IDENTICAL — this goal moved the margin and not the prices', () => {
  // ------------------------------------------------------------------------
  // WHY THIS IS THE MOST IMPORTANT ASSERTION IN THE GOAL.
  //
  // A stay was `night_rest.satisfyTicks` = 480 ticks and is now 1,440, so a room bills once
  // a day where it billed three times. Every balance figure in the project moves, the
  // balance goldens go red, AND THE CHEAPEST WAY TO MAKE THEM GREEN IS TO RAISE
  // `nightlyRatePence`. That is PRICING, which is M4's, and reaching for it inside a goal
  // about guest behaviour is §9's stop condition — "the orchestrator is writing feature
  // code", one milestone over.
  //
  // So the two money tables are pinned by their BYTES rather than by their meaning, and a
  // diff of one character fails here by name. `git diff --exit-code` is the same claim made
  // from outside the suite; this is the half that runs in CI on every platform.
  // ------------------------------------------------------------------------
  const bytesOf = (path: string): string => readFileSync(path, 'utf8');

  it('room-types.json carries the same prices it carried before this goal', () => {
    const rooms = JSON.parse(bytesOf(ROOM_TYPES_PATH)) as { id: string; nightlyRatePence: number; nightlyUpkeepPence: number }[];
    const standard = rooms.find((room) => room.nightlyRatePence > 0 && room.nightlyUpkeepPence > 0);
    expect(standard?.nightlyRatePence).toBe(8_500);
    expect(standard?.nightlyUpkeepPence).toBe(2_500);
  });

  it('and NO ROOM TYPE UNDERCUTS THE PAIR ABOVE — the whole table, not the one row', () => {
    // ------------------------------------------------------------------------
    // THE `git diff HEAD` ARM THAT WAS HERE IS GONE, AND IT WAS A GOAL-SCOPED GUARD SHIPPED
    // AS A PERMANENT ONE.
    //
    // It read `git diff HEAD -- room-types.json economy.json` and required both empty. That
    // is evidence only while G-027a is UNCOMMITTED: the moment this lands, `HEAD` contains the
    // very state it compares against and the assertion passes against itself for ever —
    // vacuous for its own claim, in a file whose subject is vacuous guards. And it would go
    // RED for M4's first pricing goal, with a message reading "pricing is M4's" inside a
    // describe block named for this one.
    //
    // The byte-level check still happened and is where it belongs: `git diff --exit-code` run
    // at VERIFY, by the orchestrator, against the uncommitted tree. What survives here is the
    // half that is true for ever — the shipped prices, and the property a value pin on ONE row
    // could not carry.
    // ------------------------------------------------------------------------
    const rooms = JSON.parse(bytesOf(ROOM_TYPES_PATH)) as {
      id: string;
      nightlyRatePence: number;
      nightlyUpkeepPence: number;
      constructionCostPence: number;
      demolitionRefundBasisPoints: number;
    }[];
    // The pin above names one row. This says no OTHER row was added or edited to move the
    // hotel's average rate — a fourth cheap room type would be a pricing change wearing a
    // content-addition hat, which is the evasion the byte guard was really for.
    expect(rooms).toHaveLength(4);
    expect(rooms.filter((room) => room.nightlyRatePence > 0).map((room) => room.nightlyRatePence)).toEqual([8_500]);
    expect(rooms.map((room) => room.nightlyUpkeepPence).sort((a, b) => a - b)).toEqual([
      1_500, 1_500, 1_500, 2_500,
    ]);
    // ------------------------------------------------------------------------
    // AND THE TWO MONEY FIELDS THIS TEST DID NOT READ, WHICH ARE THE ONES A FUTURE GOAL WOULD
    // REACH FOR. Neither was pinned against the shipped bytes ANYWHERE — `registry.test.ts`
    // and the `recovery.*` tests use 250,000 in HAND-BUILT FIXTURES, which say nothing about
    // this file — while ADR-0020 claimed "every value in both" was asserted here.
    //
    // WHY THESE EIGHT VALUES AND NOT A NARROWER ADR SENTENCE. Both repairs make the sentence
    // true; only this one closes the evasion, and the evasion is specific. G-027a moved the
    // G-008 build golden from TEN rooms built to THREE, because a 1,440-tick stay earns about
    // a third the revenue per room-day and the cash test refuses far more builds. **The
    // cheapest way to make that golden comfortable again is to lower `constructionCostPence`**
    // — which `PARKING.md` names as a lever with "Do NOT also raise `constructionCostPence`" —
    // and it would have passed every assertion above. `demolitionRefundBasisPoints` is the
    // same shape one field over: 247,500p is the threshold at which the G-005 upkeep dodge
    // reopens, and nothing here was watching it.
    // ------------------------------------------------------------------------
    expect(rooms.map((room) => room.constructionCostPence)).toEqual([250_000, 250_000, 250_000, 250_000]);
    expect(rooms.map((room) => room.demolitionRefundBasisPoints)).toEqual([5_000, 5_000, 5_000, 5_000]);
  });

  it('economy.json carries every number it carried before this goal — ALL FIVE', () => {
    // ------------------------------------------------------------------------
    // THE SUCCESSOR TO THE `git diff` ARM WAS STRONGER FOR ONE FILE AND NARROWER FOR THIS ONE,
    // AND `ai-critic` CAUGHT THE ASYMMETRY. The byte guard covered both files; what replaced it
    // pinned the whole room-type table and left `economy.json` asserted only as
    // `length > 0`. **None of these five was pinned against the shipped bytes ANYWHERE** — the
    // only cover was one field of five reached incidentally by `cli.stdout.test.ts`'s golden.
    //
    // ADR-0020 says both files are byte-identical "asserted by `content.stay.test.ts`". That
    // sentence is now true of both, which is the cheaper of the two available repairs — the
    // other was narrowing the ADR to match a weaker test.
    //
    // These are the LENDER's terms, and they are pricing in the same sense `nightlyRatePence`
    // is: G-027a cut revenue per room-day to roughly a third, so raising the starting capital
    // or the loan principal is exactly the move that would make the balance goldens comfortable
    // again. M4's, and §9's stop condition until then.
    // ------------------------------------------------------------------------
    const economy = JSON.parse(bytesOf(ECONOMY_PATH)) as Record<string, number>[];
    expect(economy).toHaveLength(1);
    expect(economy[0]).toMatchObject({
      startingCapitalPence: 500_000,
      loanPrincipalPence: 300_000,
      loanFeeBasisPoints: 1_000,
      loanRepaymentPerNightPence: 10_000,
      liquidationRoomsMax: 4,
    });
  });

  it('and guest-rules.json is the ONE content file this goal edits', () => {
    // The complement of the guards above, and it is what keeps them from being met by a goal
    // that edited nothing at all.
    const rules = JSON.parse(bytesOf(GUEST_RULES_PATH)) as { stayDurationTicks?: number }[];
    expect(rules[0]?.stayDurationTicks).toBe(1_440);
  });
});

describe('the stay suite is four files, and the filter reaches all of them', () => {
  // THE CENSUS, in `scanner.census.test.ts`'s idiom. `pnpm exec vitest run stay` is an exit
  // criterion, and a filter that matched ZERO files would pass it in silence — the vacuity
  // that file exists to name. This is the assertion that makes the criterion mean something.
  const STAY_FILES = [
    'packages/sim/src/guest.stay.test.ts',
    'packages/sim/src/guest.stay.save.test.ts',
    'tools/headless/src/guest.stay.terminator.test.ts',
    'tools/headless/src/content.stay.test.ts',
  ];

  it('all four exist, and each is a file `vitest run stay` selects', () => {
    for (const file of STAY_FILES) {
      expect(() => readFileSync(join(ROOT, file), 'utf8')).not.toThrow();
      expect(file.includes('stay')).toBe(true);
      expect(file.endsWith('.test.ts')).toBe(true);
    }
    expect(STAY_FILES).toHaveLength(4);
    expect(new Set(STAY_FILES).size).toBe(4);
  });

  it('and this file is one of them, so the census cannot be pointed at nothing', () => {
    expect(STAY_FILES).toContain('tools/headless/src/content.stay.test.ts');
  });
});
