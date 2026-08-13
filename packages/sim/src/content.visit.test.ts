// G-027b θ-b2 — THE REFUSALS THAT MAKE LODGING-FREE CONTENT WRITEABLE, AND SAFE.
//
//   pnpm exec vitest run visit
//
// ============================================================================
// LODGING-FREE CONTENT WAS UNREPRESENTABLE, AND THE ENUMERATION THAT SIZED THIS GOAL MISSED IT.
//
// θ-b's plan enumerated 25 CONSUMERS of the lodging need and never enumerated the REFUSALS that
// stood between a designer and the content shape. All 25 were unreachable. Measured at HEAD,
// four candidate documents, every route closed:
//
//   3 engagement needs, roles declared, none lodging   THROW `assertLodgingNeedIsUnambiguous`
//   the same with `role` stripped                      THROW — the lowest id is PROMOTED to
//                                                      lodging, then an item providing it is
//                                                      refused (and `needTypeSchema` makes the
//                                                      key required on disk anyway)
//   no need types at all                               THROW — room types provide needs the
//                                                      content does not define
//   roles stripped, no guestRules                      as the second
//
// *Enumerating a list is not enumerating a class, and the list is always the part somebody
// noticed* (ADR-0027).
// ============================================================================
//
// Content ids here are camelCase (ADR-0003).

import { describe, expect, it } from 'vitest';
import { bindContent, lodgingNeedOf, visitDurationOf } from './content.js';
import type { GuestRulesData, NeedTypeData, RoomTypeData, SimContent } from './content.js';
import { SAVE_V1_CONTENT, SAVE_V1_CONTENT_FINGERPRINT } from './fixtures/save-v1.js';

const cafe: RoomTypeData = {
  id: 'cafe',
  name: 'cafe',
  capacity: 8,
  nightlyRatePence: 0,
  provides: ['food'],
  fitBasisPoints: 7_500,
};
const bedroom: RoomTypeData = { id: 'bedroom', name: 'bedroom', capacity: 2, nightlyRatePence: 8_500, provides: ['rest'] };
const food: NeedTypeData = { id: 'food', name: 'food', role: 'engagement', capacityTicks: 200, refillPerTick: 6 };
const rest: NeedTypeData = { id: 'rest', name: 'rest', role: 'lodging', capacityTicks: 20, refillPerTick: 2 };

/** visit = ceil(0.30 x 200 / 6) = 10, and the whole of it is `t_last`, so the floor is 0. */
const VISIT = 10;

const visitorRules = (overrides: Partial<GuestRulesData> = {}): GuestRulesData => ({
  id: 'houseRules',
  name: 'House Rules',
  visitDurationTicks: VISIT,
  wantAtBasisPoints: 3_000,
  dissatisfactionCapacityTicks: 8,
  dissatisfactionReliefPerTick: 1,
  ...overrides,
});

const foodCourt = (rules: Partial<GuestRulesData> = {}): SimContent => ({
  roomTypes: [cafe],
  needTypes: [food],
  guestRules: [visitorRules(rules)],
});

describe('assertLodgingNeedIsUnambiguous — the gate, and what survives lifting it', () => {
  it('ACCEPTS a table whose needs all declare `engagement`, which is a food court', () => {
    const bound = bindContent(foodCourt());
    expect(lodgingNeedOf(bound)).toBeUndefined();
    expect(visitDurationOf(bound)).toBe(VISIT);
  });

  it('and STILL refuses two lodging needs, naming both', () => {
    // ADR-0027: a relaxation is where a property gets dropped. This clause is untouched.
    expect(() =>
      bindContent({
        roomTypes: [bedroom, { id: 'cabin', name: 'cabin', capacity: 2, nightlyRatePence: 100, provides: ['sleep'] }],
        needTypes: [rest, { id: 'sleep', name: 'sleep', role: 'lodging', capacityTicks: 20, refillPerTick: 2 }],
        guestRules: [visitorRules({ stayDurationTicks: 60, toleranceTicks: 100, wantAtBasisPoints: 1_000 })],
      }),
    ).toThrow(/are both the lodging need/);
  });

  it('and STILL reads a role-less table by its lowest id, which is the pre-M2 era', () => {
    // The other property the lifted clause was protecting: the historical fallback must not be
    // able to promote a need a designer explicitly marked `engagement`. It cannot, because the
    // fallback only fires when NO need declares a role at all.
    const historical = bindContent({
      roomTypes: [
        { id: 'alphaRoom', name: 'alphaRoom', capacity: 2, nightlyRatePence: 8_500, provides: ['alpha'] },
        { id: 'betaRoom', name: 'betaRoom', capacity: 8, nightlyRatePence: 0, provides: ['beta'] },
      ],
      needTypes: [
        { id: 'alpha', name: 'alpha', capacityTicks: 20, refillPerTick: 2 },
        { id: 'beta', name: 'beta', capacityTicks: 200, refillPerTick: 6 },
      ],
      guestRules: [
        {
          id: 'houseRules',
          name: 'House Rules',
          stayDurationTicks: 60,
          toleranceTicks: 100,
          wantAtBasisPoints: 1_000,
        },
      ],
    });
    expect(lodgingNeedOf(historical)?.id).toBe('alpha');
    // AND SUCH CONTENT IS NOT ASKED FOR A VISIT DURATION, because its lowest id IS the lodging
    // need — the historical reading is untouched, so no pre-M2 document acquires a new
    // obligation. That is the half a "does my new refusal fire" test would not have looked at.
    expect(visitDurationOf(historical)).toBeUndefined();
  });
});

describe('assertEveryStayCanEnd — SIX properties, and only the fourth moved', () => {
  // ==========================================================================
  // ENUMERATED BEFORE THE REPLACEMENT WAS WRITTEN (ADR-0027). What the old function asserted:
  //
  //   1. lodging need + zero guestRules rows        -> refuse        KEPT
  //   2. every row with a lodging need declares toleranceTicks       KEPT
  //   3. ...declares stayDurationTicks                               KEPT
  //   4. NO lodging need -> no refusal at all                        REPLACED
  //   5. asked of EVERY row, never only the first                    KEPT
  //   6. SAVE_V1_CONTENT keeps binding, `8e09fe4f0fa162a3`           KEPT
  //
  // Each has its own case below, because "does my new test pass" is the wrong question and
  // "what did the old check forbid that mine now permits" is the right one.
  // ==========================================================================
  const hotel = (rules: Partial<GuestRulesData>): SimContent => ({
    roomTypes: [bedroom, cafe],
    needTypes: [food, rest],
    guestRules: [{ id: 'houseRules', name: 'House Rules', wantAtBasisPoints: 1_000, ...rules }],
  });

  it('(1) refuses a lodging need with no guest rules at all', () => {
    expect(() => bindContent({ roomTypes: [bedroom, cafe], needTypes: [food, rest] })).toThrow(
      /declares the lodging need "rest" and no guest rules at all/,
    );
  });

  it('(2) refuses a lodging row with no toleranceTicks', () => {
    expect(() => bindContent(hotel({ stayDurationTicks: 60 }))).toThrow(/declare no toleranceTicks/);
  });

  it('(3) refuses a lodging row with no stayDurationTicks', () => {
    expect(() => bindContent(hotel({ toleranceTicks: 100 }))).toThrow(/declare no stayDurationTicks/);
  });

  it('(5) asks it of EVERY row, not only the first', () => {
    // An M6 archetype that forgot the field would otherwise load and be discovered by a guest.
    expect(() =>
      bindContent({
        roomTypes: [cafe],
        needTypes: [food],
        guestRules: [visitorRules(), { id: 'zzSecond', name: 'Second', wantAtBasisPoints: 3_000 }],
      }),
    ).toThrow(/guest rules "zzSecond" declare no visitDurationTicks/);
  });

  it('(6) and SAVE_V1_CONTENT still binds, with its fingerprint unmoved', () => {
    // ------------------------------------------------------------------
    // THE TRAP, AND IT IS WHY THE SPLIT IS ON THE NEED TABLE RATHER THAN ON THE ROLE.
    //
    // `SAVE_V1_CONTENT` has NO need types, so `lodgingNeedIn` answers `undefined` for it and for
    // a food court ALIKE — the two are indistinguishable through the lodging id. A naive
    // "always demand a visit duration" would therefore have demanded one of the permanent v1
    // fixture, which declares no `guestRules` at all, and the fixture would have stopped binding.
    // That is the husk ADR-0006 exists to prevent, and it is why `assertEveryVisitCanEnd` returns
    // early on an EMPTY need table: nothing can arrive, so nothing needs bounding.
    // ------------------------------------------------------------------
    const bound = bindContent(SAVE_V1_CONTENT);
    expect(bound.fingerprint).toBe(SAVE_V1_CONTENT_FINGERPRINT);
    expect(bound.fingerprint).toBe('8e09fe4f0fa162a3');
    expect(lodgingNeedOf(bound)).toBeUndefined();
  });

  it('(4) REPLACED: engagement needs and no lodging need must declare a visit duration', () => {
    // The property the old early return silently dropped the moment a guest could arrive under
    // such content. Measured before this branch existed: 30 arrivals, 30 still resident after
    // ten simulated days, ZERO departures of any kind, in a fully provisioned hotel.
    const { guestRules: _dropped, ...noRules } = foodCourt();
    expect(() => bindContent({ ...noRules, guestRules: [{ id: 'houseRules', name: 'House Rules', wantAtBasisPoints: 3_000 }] })).toThrow(
      /declare no visitDurationTicks/,
    );
    expect(() => bindContent(noRules)).toThrow(/declares no guest rules at all, so nothing says how long a visit lasts/);
  });
});

describe('assertVisitCeilingIsInTheWindow — two-sided, because a visitor fails from both ends', () => {
  // ==========================================================================
  // ADR-0028 §2 RULED ONE SIDE AND THE OTHER WAS FOUND BY SWEEPING IT. Measured on a materialised
  // arm, 14,400 ticks, arrivals every 30, a WORKING food court (3 providers per need) against a
  // STARVED one (1 per need):
  //
  //   ceiling 431, 208    0 walkouts / 0 walkouts     the row is DEAD — §2's own finding
  //   ceiling 181..207    0 walkouts / 143..164       DISCRIMINATES throughout
  //   ceiling 104, 60     476 / 475                   SATURATED — every visitor walks out of a
  //                                                   WORKING food court, and `visitEnded` is 0
  //
  // 104 and 60 satisfy the one-sided rule and are broken. The floor derives itself from the same
  // fold that produces the duration: a lone visitor in an empty, fully provisioned food court
  // still accumulates `visit - t_last` ticks of let-down, because it is served ONE thing at a
  // time. ADR-0026's amendment, one field over: *if some of the fill is structural, the dial has
  // a floor nobody can see.*
  // ==========================================================================
  it('refuses a ceiling AT the visit duration, where no visitor could ever reach it', () => {
    expect(() => bindContent(foodCourt({ dissatisfactionCapacityTicks: VISIT }))).toThrow(
      /must sit strictly inside \(0, 10\)/,
    );
  });

  it('refuses a ceiling ABOVE it, for the same reason', () => {
    expect(() => bindContent(foodCourt({ dissatisfactionCapacityTicks: 431 }))).toThrow(
      /At or above 10 no visitor can ever reach it/,
    );
  });

  it('and the message says what each end costs the PLAYER, not what it costs the code', () => {
    const message = (() => {
      try {
        bindContent(foodCourt({ dissatisfactionCapacityTicks: 431 }));
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).toContain('the player is told nothing by the row that exists to tell them to build more');
    expect(message).toContain('Both ends fail silently');
  });

  it('ACCEPTS the whole admissible window, so the refusal is not simply always-throwing', () => {
    // The anti-vacuity half. On this one-need fixture `t_last` IS the whole visit, so the floor
    // is 0 and the window is (0, 10) — every integer in it must bind.
    for (let ceiling = 1; ceiling < VISIT; ceiling += 1) {
      expect(() => bindContent(foodCourt({ dissatisfactionCapacityTicks: ceiling }))).not.toThrow();
    }
  });

  it('and the FLOOR bites on a table where it is not zero', () => {
    // Two needs, so the last one's service is not the whole round: with two identical needs at
    // want-line deficit 60 and refill 6, t1 = 10 and t2 = ceil(70/6) = 12, so visit = 22 and the
    // floor is 22 - 12 = 10. A ceiling of 10 or below must be refused; 11 must bind.
    const twoNeeds = (ceiling: number): SimContent => ({
      roomTypes: [cafe, { id: 'games', name: 'games', capacity: 8, nightlyRatePence: 0, provides: ['fun'], fitBasisPoints: 7_500 }],
      needTypes: [food, { id: 'fun', name: 'fun', role: 'engagement', capacityTicks: 200, refillPerTick: 6 }],
      guestRules: [visitorRules({ visitDurationTicks: 22, dissatisfactionCapacityTicks: ceiling })],
    });
    expect(() => bindContent(twoNeeds(10))).toThrow(/must sit strictly inside \(10, 22\)/);
    expect(() => bindContent(twoNeeds(9))).toThrow(/At or below 10 every visitor reaches it/);
    expect(() => bindContent(twoNeeds(11))).not.toThrow();
    expect(() => bindContent(twoNeeds(21))).not.toThrow();
  });

  it('and it says NOTHING about content that declares a lodging need', () => {
    // The populations are partitioned: the lobby rule speaks about hotels, this one about food
    // courts, and neither is left unguarded. A hotel with a ceiling far outside a food court's
    // window binds happily, because no visitor can arrive under it.
    expect(() =>
      bindContent({
        roomTypes: [bedroom, cafe],
        needTypes: [food, rest],
        guestRules: [
          {
            id: 'houseRules',
            name: 'House Rules',
            stayDurationTicks: 60,
            visitDurationTicks: VISIT,
            toleranceTicks: 100,
            wantAtBasisPoints: 1_000,
            dissatisfactionCapacityTicks: 200,
            dissatisfactionReliefPerTick: 1,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe('assertVisitRoundIsAnalysable — the fold has a DOMAIN, and every property of it is enforced', () => {
  // ==========================================================================
  // THREE SWEEPS, THREE MISSING PROPERTIES, AND THE ANSWER IS A SMALLER DOMAIN (ADR-0031).
  //
  // `visitRoundTicks` predicts the order and timing in which a visitor's needs are served, and
  // that prediction sets BOTH endpoints of a bind-time refusal. Each sweep found it missing one
  // more thing the simulation does:
  //
  //   sweep 1  it walked ASCENDING ID; the sim picks by `pressureBasisPoints`
  //   sweep 2  repaired — the fold now reproduces `reserve`'s choice
  //   sweep 3  it does not CLAMP the deficit at `capacityTicks`, and the sim does
  //   sweep 3  it models only the UNENGAGED pass; a challenger clearing the ABANDON MARGIN takes
  //            an incumbent mid-service, and the fold had no term for the margin at all
  //
  // On content the sweep-2 guard accepted, the true range was (635, 669) against a derived
  // (810, …) — disjoint — and a third table printed an EMPTY range in which no ceiling binds.
  //
  // **A predictor that must track a simulation to stay correct is a simulation.** So the fold did
  // NOT grow a clamp, a margin term and a preemption model — three individually correct additions
  // that jointly build a second simulator inside a refusal, load-bearing and therefore
  // undeletable. Its domain is three properties, they are listed on the fold, and this block
  // drives each of them.
  //
  //   P1  no need served twice before every need is served once
  //   P2  no need saturates at capacityTicks while it waits
  //   P3  no waiting need can preempt a service through abandonMarginBasisPoints
  // ==========================================================================
  const heterogeneous = (visit: number): SimContent => ({
    roomTypes: [
      { id: 'aaaRoom', name: 'aaaRoom', capacity: 8, nightlyRatePence: 0, provides: ['aaa'], fitBasisPoints: 7_500 },
      { id: 'bbbRoom', name: 'bbbRoom', capacity: 8, nightlyRatePence: 0, provides: ['bbb'], fitBasisPoints: 7_500 },
      { id: 'cccRoom', name: 'cccRoom', capacity: 8, nightlyRatePence: 0, provides: ['ccc'], fitBasisPoints: 7_500 },
    ],
    needTypes: [
      { id: 'aaa', name: 'aaa', role: 'engagement', capacityTicks: 200, refillPerTick: 6 },
      { id: 'bbb', name: 'bbb', role: 'engagement', capacityTicks: 1_400, refillPerTick: 7 },
      { id: 'ccc', name: 'ccc', role: 'engagement', capacityTicks: 600, refillPerTick: 2 },
    ],
    guestRules: [visitorRules({ visitDurationTicks: visit, dissatisfactionCapacityTicks: 73 })],
  });

  it('REFUSES the table whose needs come due again mid-round, naming the need', () => {
    // Observed order on this table: aaa -> ccc -> aaa -> bbb. `aaa` comes round a second time
    // before `bbb` has been served at all, so there is no single last helping and `total - last`
    // is not the let-down floor.
    expect(() => bindContent(heterogeneous(198))).toThrow(
      /comes back to need "aaa" a second time before it has been served everything it came for/,
    );
    expect(() => bindContent(heterogeneous(198))).toThrow(/there is no single last helping/);
  });

  it('and says WHY it is a refusal rather than a test — the numbers back another refusal', () => {
    const message = (() => {
      try {
        bindContent(heterogeneous(198));
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).toContain('back a REFUSAL');
    expect(message).toContain('nothing goes red');
  });

  it('ACCEPTS a table whose service order is NOT ascending id, and gets its numbers right', () => {
    // ====================================================================
    // THE CASE THE FIRST VERSION REFUSED, AND IT WAS LEGAL CONTENT.
    //
    // `aaa` 1000/10, `bbb` 1000/10, `ccc` 100/10 at a 3,000bp want line. All three start at
    // pressure 3,000 — every clause of `pressureBasisPoints` is `deficit / capacityTicks`, so
    // capacity cancels at arrival — and the tie falls to the lowest id. The moment `aaa` is
    // filled the pressures DIVERGE, and the smallest-capacity need overtakes:
    //
    //     aaa  300/10 = 30 ticks    then bbb 330/1000 = 3,300 vs ccc 60/100 = 6,000  -> ccc
    //     ccc   60/10 =  6 ticks    then bbb 336/1000 = 3,360 vs aaa  6/1000 =    60 -> bbb
    //     bbb  336/10 = 34 ticks    every need served once; the round is over
    //
    // total 70, last 34, floor 36. The old fold walked ascending id and got 73 / 10 / 63 — so it
    // refused all 27 ceilings in [37, 63], every one of them legal and discriminating.
    // ====================================================================
    const legal = (ceiling: number): SimContent => ({
      roomTypes: [
        { id: 'aaaRoom', name: 'aaaRoom', capacity: 8, nightlyRatePence: 0, provides: ['aaa'], fitBasisPoints: 7_500 },
        { id: 'bbbRoom', name: 'bbbRoom', capacity: 8, nightlyRatePence: 0, provides: ['bbb'], fitBasisPoints: 7_500 },
        { id: 'cccRoom', name: 'cccRoom', capacity: 8, nightlyRatePence: 0, provides: ['ccc'], fitBasisPoints: 7_500 },
      ],
      needTypes: [
        { id: 'aaa', name: 'aaa', role: 'engagement', capacityTicks: 1_000, refillPerTick: 10 },
        { id: 'bbb', name: 'bbb', role: 'engagement', capacityTicks: 1_000, refillPerTick: 10 },
        { id: 'ccc', name: 'ccc', role: 'engagement', capacityTicks: 100, refillPerTick: 10 },
      ],
      guestRules: [visitorRules({ visitDurationTicks: 70, dissatisfactionCapacityTicks: ceiling })],
    });
    // IT BINDS AT ALL — the round is one clean cycle, in an order the old fold could not produce.
    expect(() => bindContent(legal(50))).not.toThrow();
    // AND THE FOLD'S NUMBERS ARE THE SIMULATION'S. The window is read out of the ceiling rule's
    // own message rather than asserted from a second copy of the arithmetic, so this pins the
    // fold that ships rather than a restatement of it.
    const message = (() => {
      try {
        bindContent(legal(70));
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).toContain('must sit strictly inside (36, 70)');
    // Both ends of the recovered range behave: 37 binds, 36 does not.
    expect(() => bindContent(legal(37))).not.toThrow();
    expect(() => bindContent(legal(63))).not.toThrow();
    expect(() => bindContent(legal(36))).toThrow(/At or below 36 every visitor reaches it/);
  });

  it('P2: REFUSES a table where a need SATURATES while it queues, which the sim would clamp', () => {
    // ====================================================================
    // `advanceNeed` STOPS A DEFICIT AT `capacityTicks`. The fold does not, so past that point it
    // counts ticks the simulation never charges and every number it produces is an overestimate.
    // ADR-0031 measured the consequence on content the sweep-2 guard ACCEPTED: needs reaching full
    // at 601 / 635 / 669, a true range of (635, 669) against a derived (810, …) — DISJOINT — and
    // on a third table a printed range of "(810, 669)", empty, in which no ceiling at all binds.
    //
    // `slow` has a tiny capacity and a slow refill, so it empties long before `bulk`'s service is
    // over: 90 ticks of waiting against a capacity of 40.
    // ====================================================================
    const saturating: SimContent = {
      roomTypes: [
        { id: 'bulkRoom', name: 'bulkRoom', capacity: 8, nightlyRatePence: 0, provides: ['bulk'], fitBasisPoints: 7_500 },
        { id: 'slowRoom', name: 'slowRoom', capacity: 8, nightlyRatePence: 0, provides: ['slow'], fitBasisPoints: 7_500 },
      ],
      needTypes: [
        { id: 'bulk', name: 'bulk', role: 'engagement', capacityTicks: 1_000, refillPerTick: 4 },
        { id: 'slow', name: 'slow', role: 'engagement', capacityTicks: 40, refillPerTick: 4 },
      ],
      guestRules: [visitorRules({ visitDurationTicks: 300, dissatisfactionCapacityTicks: 200 })],
    };
    expect(() => bindContent(saturating)).toThrow(/runs all the way down to \d+ while it waits its turn/);
    expect(() => bindContent(saturating)).toThrow(/A need stops emptying there - the simulation holds it/);
    expect(() => bindContent(saturating)).toThrow(/every tick past that point is counted twice/);
  });

  it('P3: REFUSES a table where a waiting need could PREEMPT the service in progress', () => {
    // ====================================================================
    // `reserve`'s ENGAGED pass hands the provider to a challenger whose pressure reaches the
    // incumbent's plus `abandonMarginBasisPoints`. The fold models a service running to full and
    // has no term for one that ends early. ADR-0031 measured it under the SHIPPED margin: a
    // visitor abandons a need at age 59, makes 62 engagement switches, and that need is never
    // full in its entire 1,000-tick life — against a fold claiming one clean round.
    //
    // A LOW MARGIN IS WHAT MAKES IT REACHABLE, and the shipped food court is safe because its
    // challengers never build enough pressure inside a round to clear 6,000 basis points. Here
    // the margin is 500, which anything wanted clears almost at once.
    // ====================================================================
    const preemptible: SimContent = {
      roomTypes: [
        { id: 'aRoom', name: 'aRoom', capacity: 8, nightlyRatePence: 0, provides: ['aNeed'], fitBasisPoints: 7_500 },
        { id: 'bRoom', name: 'bRoom', capacity: 8, nightlyRatePence: 0, provides: ['bNeed'], fitBasisPoints: 7_500 },
      ],
      needTypes: [
        { id: 'aNeed', name: 'aNeed', role: 'engagement', capacityTicks: 400, refillPerTick: 4 },
        { id: 'bNeed', name: 'bNeed', role: 'engagement', capacityTicks: 400, refillPerTick: 4 },
      ],
      guestRules: [visitorRules({ visitDurationTicks: 100, dissatisfactionCapacityTicks: 60, abandonMarginBasisPoints: 500 })],
    };
    expect(() => bindContent(preemptible)).toThrow(/reaches a pressure of \d+ basis points while it waits/);
    expect(() => bindContent(preemptible)).toThrow(/at or past the abandonMarginBasisPoints of 500/);
    expect(() => bindContent(preemptible)).toThrow(/walk away from what it is being served mid-helping/);
    // AND THE SAME TABLE WITH A MARGIN NOTHING CAN CLEAR IS ACCEPTED, so this is a rule about the
    // margin rather than about the need table. Total commitment is the era before G-014b and the
    // value `abandonMarginOf` supplies when content declares none.
    expect(() =>
      bindContent({
        ...preemptible,
        guestRules: [visitorRules({ visitDurationTicks: 100, dissatisfactionCapacityTicks: 60 })],
      }),
    ).not.toThrow();
  });

  it('and the WANT LINE is refused rather than skipped, so no document escapes the ceiling check', () => {
    // ====================================================================
    // BOTH RULES SKIPPED A ROW WITHOUT ONE, AND THE COMMENT SAID SOMETHING ELSE WAS CATCHING IT.
    //
    // `assertVisitRoundIsAnalysable`'s docstring claimed a missing `wantAtBasisPoints` was
    // "refused earlier, by the check that owns that field" — but `assertEveryNeedIsWantedOnArrival`
    // SKIPS such a row, so both new rules skipped it too and a lodging-free document with no want
    // line got NO CEILING CHECK AT ALL: the dead-row case admitted in silence, which is the one
    // outcome these two refusals exist to prevent. Unreachable through the loader (the schema
    // requires it on disk) and reachable through `bindContent`, which is the surface every other
    // refusal in this file is written for.
    // ====================================================================
    const noWantLine = {
      roomTypes: [cafe],
      needTypes: [food],
      guestRules: [
        {
          id: 'houseRules',
          name: 'House Rules',
          visitDurationTicks: VISIT,
          dissatisfactionCapacityTicks: 5_000,
          dissatisfactionReliefPerTick: 1,
        },
      ],
    } as SimContent;
    expect(() => bindContent(noWantLine)).toThrow(/declare no wantAtBasisPoints/);
    expect(() => bindContent(noWantLine)).toThrow(
      /a ceiling that makes the walkout row unreachable would be accepted in silence/,
    );
  });

  it('ACCEPTS the shipped shape, where every need clears the round comfortably', () => {
    // The anti-vacuity half: the one-need fixture and the shipped three-need table both pass,
    // so the rule is not simply always-throwing on lodging-free content.
    expect(() => bindContent(foodCourt())).not.toThrow();
  });

  it('and a want line far BELOW the round is legal when the round is still one clean cycle', () => {
    // ====================================================================
    // THE ARITHMETIC HERE WAS WRONG FOR ONE SWEEP, AND IT WAS OFFERED AS THE WARRANT FOR A
    // REFUSAL — which is the class this whole file exists to police.
    //
    // It read *"two needs of 200/6: t1 = 10, t2 = ceil(70/6) = 12, total 22 … `bbb` is filled at
    // 22 with zero ticks left"*. **`bbb` is 20/6, not 200/6.** The real sequence, through the
    // fold that ships:
    //
    //     want lines   aaa 0.30 x 200 = 60      bbb 0.30 x 20 = 6
    //     pressures    60/200 = 3,000           6/20 = 3,000      tie -> lower id, aaa
    //     serve aaa    ceil(60/6) = 10 ticks    aaa 0, bbb 16
    //     serve bbb    ceil(16/6) =  3 ticks    every need served once
    //     total 13, last 3, floor 10
    //
    // So the conclusion survives and its warrant did not: `bbb`'s want line of 6 is far below the
    // 13-tick round, and the content is legal anyway — because `bbb` is served LAST and nothing
    // comes due after it. It clears by six ticks rather than by zero, and it is not the
    // "no time left" case the old sentence claimed.
    //
    // (Note the fixture declares `visitDurationTicks` 12 against a derived round of 13. That is
    // legal — the field is a dial, not a computed value — and it is why the recovered window
    // below is (10, 12): the FLOOR is what the guest unavoidably accumulates, derived, and the
    // CEILING is when the content says it leaves.)
    // ====================================================================
    expect(() =>
      bindContent({
        roomTypes: [
          { id: 'aaaRoom', name: 'aaaRoom', capacity: 8, nightlyRatePence: 0, provides: ['aaa'], fitBasisPoints: 7_500 },
          { id: 'bbbRoom', name: 'bbbRoom', capacity: 8, nightlyRatePence: 0, provides: ['bbb'], fitBasisPoints: 7_500 },
        ],
        needTypes: [
          { id: 'aaa', name: 'aaa', role: 'engagement', capacityTicks: 200, refillPerTick: 6 },
          { id: 'bbb', name: 'bbb', role: 'engagement', capacityTicks: 20, refillPerTick: 6 },
        ],
        guestRules: [visitorRules({ visitDurationTicks: 12, dissatisfactionCapacityTicks: 11 })],
      }),
    ).not.toThrow();
    // AND THE WINDOW IS THE ONE THE ARITHMETIC ABOVE PREDICTS, read out of the shipped refusal
    // rather than restated — so the numbers in that comment are pinned rather than asserted.
    const twoNeeds = (ceiling: number): SimContent => ({
      roomTypes: [
        { id: 'aaaRoom', name: 'aaaRoom', capacity: 8, nightlyRatePence: 0, provides: ['aaa'], fitBasisPoints: 7_500 },
        { id: 'bbbRoom', name: 'bbbRoom', capacity: 8, nightlyRatePence: 0, provides: ['bbb'], fitBasisPoints: 7_500 },
      ],
      needTypes: [
        { id: 'aaa', name: 'aaa', role: 'engagement', capacityTicks: 200, refillPerTick: 6 },
        { id: 'bbb', name: 'bbb', role: 'engagement', capacityTicks: 20, refillPerTick: 6 },
      ],
      guestRules: [visitorRules({ visitDurationTicks: 12, dissatisfactionCapacityTicks: ceiling })],
    });
    const message = (() => {
      try {
        bindContent(twoNeeds(12));
      } catch (error) {
        return (error as Error).message;
      }
      return '';
    })();
    expect(message).toContain('must sit strictly inside (10, 12)');
  });

  it('and it says NOTHING about content with a lodging need, which has no visitors', () => {
    expect(() =>
      bindContent({
        roomTypes: [bedroom, cafe],
        needTypes: [food, rest],
        guestRules: [
          {
            id: 'houseRules',
            name: 'House Rules',
            stayDurationTicks: 60,
            visitDurationTicks: VISIT,
            toleranceTicks: 100,
            wantAtBasisPoints: 1_000,
            dissatisfactionCapacityTicks: 200,
            dissatisfactionReliefPerTick: 1,
          },
        ],
      }),
    ).not.toThrow();
  });
});

describe('assertDissatisfactionOutlastsTheLobby — narrowed in scope, unchanged in what it says', () => {
  it('STILL refuses a hotel whose ceiling does not outlast the lobby', () => {
    expect(() =>
      bindContent({
        roomTypes: [bedroom, cafe],
        needTypes: [food, rest],
        guestRules: [
          {
            id: 'houseRules',
            name: 'House Rules',
            stayDurationTicks: 60,
            visitDurationTicks: VISIT,
            toleranceTicks: 100,
            wantAtBasisPoints: 1_000,
            dissatisfactionCapacityTicks: 100,
            dissatisfactionReliefPerTick: 1,
          },
        ],
      }),
    ).toThrow(/the ceiling must be STRICTLY GREATER/);
  });

  it('and no longer refuses a FOOD COURT for a reason that cannot happen to it', () => {
    // Its message is about *"a guest with no room [that] wants lodging, unserved, on every tick
    // it is here"*. A visitor never wants lodging at all, so under lodging-free content this
    // refused a document with a sentence that was false of it — measured, it rejected the
    // food-court fixture outright at any ceiling below its `toleranceTicks`.
    expect(() => bindContent(foodCourt({ toleranceTicks: 180, dissatisfactionCapacityTicks: 5 }))).not.toThrow();
  });
});
