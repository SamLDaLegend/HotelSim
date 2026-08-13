// G-027b — THE TWELVE NUMBERS, ENUMERATED FROM THE SCHEMA AND EACH ONE EXERCISED.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// A CENSUS, NOT A FORMULA. The goal block said `2 x needTypes + 2`; the true count is
// `2 x needTypes + 4` = TWELVE, because the model also reads `abandonMarginBasisPoints` (whose
// derivation R1 re-opens, so it cannot be excluded as pre-existing) and `stayDurationTicks`.
// A formula that happens to equal the right answer is not a census — so the list is REFLECTED
// out of the parsed schemas and asserted set-equal to the names below, and a numeric field
// added to either schema and not added here reddens by name.
//
// AND EVERY ONE OF THEM MUST MOVE THE SIMULATION. The second half is the exhaustion arm: run
// the shipped content, run it again with one number changed, and require the state hash to
// differ. A number in the census that no run can see is either not read or not load-bearing,
// and either way the census describes a hotel nobody is running.
//
// IT LIVES HERE RATHER THAN IN `packages/sim` FOR ONE REASON: the shipped numbers are BYTES ON
// DISK, and `packages/sim` may not read a file (I1). A copy of the table inside the sim's tests
// would be the duplicated constant this repo has paid for twice.
// ============================================================================

import { describe, expect, it } from 'vitest';
import { guestRulesSchema, needTypeSchema } from '@hotelsim/content';
import {
  abandonMarginOf,
  bindContent,
  createWorld,
  formNeedVector,
  idleShareBasisPoints,
  lodgingNeedOf,
  needTypesInOrder,
  ONE_WHOLE_BASIS_POINTS,
  run,
  serialise,
  stayDurationOf,
  toleranceOf,
  wantAtOf,
} from '@hotelsim/sim';
import type { BoundContent, GuestRulesData, NeedTypeData, SimContent } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { marginBoundOver } from './fixtures/margin-bound.js';
import { schedule } from './report.js';

const SHIPPED = loadContent();

/** The numbers the stock model reads. THE LIST, and the thing the reflection is compared to. */
const PER_NEED_TYPE = ['capacityTicks', 'refillPerTick'] as const;
const PER_GUEST_RULES = ['wantAtBasisPoints', 'toleranceTicks', 'abandonMarginBasisPoints', 'stayDurationTicks'] as const;

/** Numeric fields the schemas declare that the MODEL does not read, each with its owner. */
const NOT_THE_MODELS: Record<string, string> = {
  reviewScoreMin: 'reviews (G-019)',
  reviewScoreMax: 'reviews (G-019)',
};

const numericFieldsOf = (shape: Record<string, unknown>): readonly string[] =>
  Object.entries(shape)
    .filter(([, field]) => {
      const def = (field as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def;
      return def?.type === 'int' || def?.type === 'number' || def?.innerType?.def?.type === 'int';
    })
    .map(([name]) => name)
    .sort();

/** The shipped tables, rebound with one of them replaced. */
const rebound = (patch: Partial<SimContent>): BoundContent => bindContent({ ...SHIPPED.content, ...patch });

describe('THE CENSUS — reflected out of the schemas, not counted by hand', () => {
  it('a need type declares exactly the two rates the model reads', () => {
    expect(numericFieldsOf(needTypeSchema.shape as unknown as Record<string, unknown>)).toEqual([...PER_NEED_TYPE].sort());
  });

  it('every numeric field of guest rules is either in the census or has a named owner', () => {
    const declared = numericFieldsOf(guestRulesSchema.shape as unknown as Record<string, unknown>);
    for (const name of declared) {
      const owned = (PER_GUEST_RULES as readonly string[]).includes(name) || NOT_THE_MODELS[name] !== undefined;
      expect(owned, `${name} is declared on disk and belongs to nobody`).toBe(true);
    }
    for (const name of PER_GUEST_RULES) expect(declared).toContain(name);
  });

  it('and the total is 2 x needTypes + 4 — TWELVE, not the ten first planned', () => {
    expect(needTypesInOrder(SHIPPED).length).toBe(4);
    expect(PER_NEED_TYPE.length * needTypesInOrder(SHIPPED).length + PER_GUEST_RULES.length).toBe(12);
  });
});

describe('THE EXHAUSTION ARM — every number in the census moves the simulation', () => {
  const hashOf = (content: BoundContent): string => {
    const world0 = createWorld(42, content);
    const commands = schedule(2_000, content, world0.grid, 3, 120);
    return serialise(run(world0, content, 2_000, commands));
  };
  const baseline = hashOf(SHIPPED);

  it('a mutation to ANY of the twelve produces a different run', () => {
    const unmoved: string[] = [];
    for (const needType of needTypesInOrder(SHIPPED)) {
      for (const field of PER_NEED_TYPE) {
        const mutated = rebound({
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.id === needType.id ? ({ ...entry, [field]: entry[field] + 70 } as NeedTypeData) : entry,
          ),
        });
        if (hashOf(mutated) === baseline) unmoved.push(`${needType.id}.${field}`);
      }
    }
    for (const field of PER_GUEST_RULES) {
      const mutated = rebound({
        guestRules: (SHIPPED.content.guestRules ?? []).map(
          (entry) => ({ ...entry, [field]: (entry[field] ?? 0) - 60 }) as GuestRulesData,
        ),
      });
      if (hashOf(mutated) === baseline) unmoved.push(`guestRules.${field}`);
    }
    expect(unmoved).toEqual([]);
  });
});

describe('THE DERIVATIONS, EXECUTED — the day the shipped table describes', () => {
  const lodging = lodgingNeedOf(SHIPPED);
  const stay = stayDurationOf(SHIPPED) ?? 0;
  const engagement = needTypesInOrder(SHIPPED).filter((entry) => entry.id !== lodging?.id);

  it('each engagement need is served three times a day for an hour', () => {
    for (const entry of engagement) {
      const servicePerDay = stay / (1 + entry.refillPerTick);
      expect(servicePerDay).toBe(180);
      const visit =
        Math.floor((wantAtOf(SHIPPED) * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS) / entry.refillPerTick;
      expect(visit).toBe(60);
      expect(servicePerDay / visit).toBe(3);
    }
  });

  it('and sleep is DERIVED from that activity rather than stated beside it', () => {
    expect(lodging).toBeDefined();
    const away = engagement.reduce((total, entry) => total + stay / (1 + entry.refillPerTick), 0);
    expect(away).toBe(540);
    // An hour of activity costs an hour of recovery.
    expect(lodging?.refillPerTick).toBe(1);
    expect(away / (lodging?.refillPerTick ?? 1)).toBe(540);
    // Three naps a day, the rhythm the engagement needs already carry.
    const napAt = Math.floor((wantAtOf(SHIPPED) * (lodging?.capacityTicks ?? 0)) / ONE_WHOLE_BASIS_POINTS);
    expect(napAt).toBe(180);
    expect(away / napAt).toBe(3);
  });

  it('the day adds up, and what is left over is the headroom M3 spends', () => {
    expect(idleShareBasisPoints(SHIPPED)).toBe(2_500);
    const busy = ONE_WHOLE_BASIS_POINTS - idleShareBasisPoints(SHIPPED);
    // 1,080 of 1,440 ticks accounted for — 540 out and 540 napping — leaving 360. Stated in
    // ticks as well as basis points because the two are one statement and a reader checks one
    // of them. (The PLAN said 1,020/420: it carried a 480-tick sleep from the number set before
    // the lodging need was re-derived, while quoting the correct 25% beside it. The share was
    // right and the tick line was stale; this assertion is why that could not survive BUILD.)
    expect(Math.round((busy * stay) / ONE_WHOLE_BASIS_POINTS)).toBe(1_080);
    expect(stay - 1_080).toBe(360);
  });

  it('the want line clears `MAX_PENDING − margin`, and the margin clears its own re-derived bound', () => {
    expect(wantAtOf(SHIPPED)).toBeLessThanOrEqual(ONE_WHOLE_BASIS_POINTS - 1 - abandonMarginOf(SHIPPED));
    // IMPORTED, NOT RESTATED. `hysteresis.bound.test.ts` asserts the same bound from the other
    // end (criterion 5), and two copies of one derivation is the duplicated-constant defect
    // ADR-0021 was written about — a comment claiming two things describe the same building,
    // with nothing checking it.
    const bound = marginBoundOver(engagement);
    // 10,000 x 8 / 14 = 5,714.28, and it ROUNDS UP: a bound that is not a whole basis point is
    // never met by rounding down. (The PLAN quoted the un-rounded 5,714; the shipped 6,000
    // clears either, which is exactly why the arithmetic had to be executed rather than cited.)
    expect(bound).toBe(5_715);
    expect(abandonMarginOf(SHIPPED)).toBeGreaterThanOrEqual(bound);
    expect(bound).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });

  it('and tolerance is PRESERVED from the countdown era rather than re-derived', () => {
    expect(toleranceOf(SHIPPED)).toBe(180);
    expect(toleranceOf(SHIPPED) ?? 0).toBeLessThan(stay);
  });

  it('and the shipped capacities keep the QUANTISED pressure ordering the exact one', () => {
    // `utility.ts`'s header states the condition and `utility.test.ts` drives the arithmetic
    // over a fixed pair; neither can see the shipped table, because content is injected
    // (ADR-0001). This is the half that reads the real denominators.
    //
    //     lcm(capacityA, capacityB) < 10,000  IS SUFFICIENT for `pressureBasisPoints` to order
    //     two needs exactly as the un-floored cross-multiplication would.
    //
    // It is sufficient and NOT necessary, so a future table over the bound is not thereby
    // broken — it is a table whose ordering has to be argued rather than inherited, which is
    // what this reddening would be saying.
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    const capacities = needTypesInOrder(SHIPPED).map((entry) => entry.capacityTicks);
    expect(capacities.length).toBeGreaterThan(1);
    let worst = 0;
    for (let i = 0; i < capacities.length; i += 1) {
      for (let j = i + 1; j < capacities.length; j += 1) {
        const a = capacities[i] ?? 0;
        const b = capacities[j] ?? 0;
        worst = Math.max(worst, (a * b) / gcd(a, b));
      }
    }
    // 600 / 1,400 / 1,400 / 1,400: the engagement pairs are 1,400 and the lodging pairs 4,200.
    expect(worst).toBe(4_200);
    expect(worst).toBeLessThan(ONE_WHOLE_BASIS_POINTS);
  });
});

describe('THE REFUSALS, AND BOTH ARE REACHABLE FROM BOTH SIDES', () => {
  const withLodgingCapacity = (value: number): BoundContent =>
    rebound({
      needTypes: needTypesInOrder(SHIPPED).map((entry) =>
        entry.role === 'lodging' ? { ...entry, capacityTicks: value } : entry,
      ),
    });

  it('a lodging need too big to become wanted twice is REFUSED — including the one this goal planned', () => {
    // 900 sits exactly on the bound (want line 270 = half of 540 away-ticks); 901 is over it.
    expect(() => withLodgingCapacity(900)).not.toThrow();
    expect(() => withLodgingCapacity(901)).toThrow(/never become wanted twice/);
    // AND THE NUMBER SET THIS GOAL FIRST PLANNED, which made the lodging need decorative and
    // left the idle share at 62.5% against a 61.9% baseline. This refusal exists because of it.
    expect(() => withLodgingCapacity(3_200)).toThrow(/never become wanted twice/);
  });

  it('a table demanding a whole guest is REFUSED, and the shipped one is well under', () => {
    const withEngagementRefill = (value: number): BoundContent =>
      rebound({
        needTypes: needTypesInOrder(SHIPPED).map((entry) =>
          entry.role === 'engagement' ? { ...entry, refillPerTick: value } : entry,
        ),
      });
    expect(() => withEngagementRefill(7)).not.toThrow();
    expect(() => withEngagementRefill(1)).toThrow(/basis points of a guest's time/);
  });

  it('and content that declares a lodging need must say how long a guest waits', () => {
    expect(() =>
      rebound({
        guestRules: (SHIPPED.content.guestRules ?? []).map(({ toleranceTicks: _drop, ...rest }) => rest),
      }),
    ).toThrow(/toleranceTicks/);
  });

  describe('and a DECLARED want line that floors to 0 is REFUSED AT LOAD (round 1)', () => {
    // WHY THIS REFUSAL EXISTS: a guest is formed AT its want line, so a line of 0 forms a need
    // that is already FULL with nothing recorded as having served it — the one need vector
    // `assertNeedVector` refuses. Without a bind-time check the content binds cleanly and the
    // FIRST ARRIVAL throws from inside the tick, which is where ~45 fixtures for this goal died
    // one debugging cycle at a time. Every document below is schema-valid.
    //
    // AND THE SPLIT IS THE POINT: a DECLARED line that rounds away is a designer's number not
    // doing what they meant, and is refused; an ABSENT line is the pre-G-027b era and is
    // ACCEPTED, with the guest arriving one tick below full (`formNeedVector`). That is the
    // same "silence on disk / silence in history" rule the prices, `provides` and `requires`
    // already follow (ADR-0008).
    const withWantAt = (wantAt: number | undefined): (() => BoundContent) => {
      const rules = (SHIPPED.content.guestRules ?? []).map(({ wantAtBasisPoints: _drop, ...rest }) =>
        wantAt === undefined ? rest : ({ ...rest, wantAtBasisPoints: wantAt } as GuestRulesData),
      );
      return () => rebound({ guestRules: rules });
    };

    it('an explicit 0 — which `basisPointsSchema` permits and `cloneStockRules` admits', () => {
      expect(withWantAt(0)).toThrow(/line of 0 ticks/);
    });

    it('while an ABSENT want line still BINDS — history is a statement, not an oversight', () => {
      expect(withWantAt(undefined)).not.toThrow();
      // And the guest it forms is one tick below full on every need rather than at 0, which is
      // what makes the acceptance safe: `assertNeedVector` would refuse the alternative.
      for (const need of formNeedVector(withWantAt(undefined)())) {
        expect(need.deficit, `${need.needId} arrived full under content with no want line`).toBe(1);
        expect(need.metBy).toBeNull();
      }
    });

    it('and a line that FLOORS to 0 on a small capacity, with a legal want line and legal rates', () => {
      // 50 basis points of a 100-tick capacity is half a tick. The other need types keep the
      // shipped 1,400, so nothing else about this table is marginal — and 50 is a want line a
      // designer could write for a reason.
      const smallest = needTypesInOrder(SHIPPED)[0];
      expect(smallest).toBeDefined();
      expect(() =>
        bindContent({
          ...SHIPPED.content,
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.id === smallest?.id ? { ...entry, capacityTicks: 100 } : entry,
          ),
          guestRules: (SHIPPED.content.guestRules ?? []).map((entry) => ({ ...entry, wantAtBasisPoints: 50 })),
        }),
      ).toThrow(/line of 0 ticks/);
    });

    it('and the boundary is driven from BOTH sides at the shipped want line', () => {
      // The bound `wantAtBasisPoints x capacityTicks >= 10,000` written as the smallest capacity
      // the shipped 3,000 admits: 4 gives a line of 1 and binds, 3 gives 0.9 and is refused.
      // Quoted in `wantAtBasisPointsSchema`; executed here, because a boundary in prose is a
      // boundary nobody has checked.
      const withCapacity = (value: number) => (): BoundContent =>
        rebound({
          needTypes: needTypesInOrder(SHIPPED).map((entry) =>
            entry.role === 'lodging' ? entry : { ...entry, capacityTicks: value },
          ),
        });
      expect(wantAtOf(SHIPPED)).toBe(3_000);
      expect(withCapacity(4)).not.toThrow();
      expect(withCapacity(3)).toThrow(/line of 0 ticks/);
    });

    it('while the SHIPPED table clears it on every need — the refusal is not refusing everything', () => {
      // ANTI-VACUITY. A check that threw for all content would satisfy the three above and be
      // useless, and the shipped want line is 3,000 basis points against capacities of 600 and
      // 1,400 — lines of 180 and 420, both far from the floor.
      expect(() => rebound({})).not.toThrow();
      for (const entry of needTypesInOrder(SHIPPED)) {
        expect(Math.floor((wantAtOf(SHIPPED) * entry.capacityTicks) / ONE_WHOLE_BASIS_POINTS)).toBeGreaterThan(0);
      }
    });
  });

  it('while content with NO lodging need is untouched by all three', () => {
    expect(() =>
      bindContent({ roomTypes: [{ id: 'shed', name: 'shed', capacity: 1, nightlyRatePence: 0, requires: [] }] }),
    ).not.toThrow();
  });
});
