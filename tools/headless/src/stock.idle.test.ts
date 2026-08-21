// G-027b — N AND X: THE IDLE GUEST, COMPUTED FROM CONTENT AND THEN STEPPED.
//
//   pnpm exec vitest run stock
//
// ============================================================================
// TWO PATHS, AND THE SECOND ONE IS AN EXECUTION RATHER THAN A SECOND SPELLING.
//
// The first draft of this pair checked X two ways — `1 - Σ serviceTicksPerDay/S` against
// `1 - Σ 1/(1+r)` — and those are ONE EXPRESSION: `serviceTicksPerDay` IS `S/(1+r)`, so the
// assertion could not fail, and it would have reported "agree" under the very number set whose
// lodging need never became wanted. ADR-0007's shape inside the assertion minted to repair an
// ADR-0007 finding.
//
// So the second path STEPS A WORLD — one guest, well provisioned, no contention — counts the
// frames on which it wants nothing, and divides. That is G-027a's own precedent for
// `stayDurationTicks` ("derived and EXECUTED — counted by stepping a world rather than asserted
// against TICKS_PER_DAY"), and against the broken number set it reads 62.5% against a 29.2%
// ceiling: RED, at BUILD, which is where this class has to fail.
//
// THE ORDERING THE CRITERION RESTS ON, and every step of it is one-directional:
//
//     realised (contended)   <=   stepped free-flow   <=   X, the identity
//
// Contention only ever LENGTHENS the time a guest spends wanting, and a guest arrives at its
// want line so it carries an arrival deficit that adds service and removes idle. Neither slack
// can run the other way, which is why X is a ceiling rather than a prediction.
// ============================================================================

// ############################################################################
//  ADR-0029 (HUMAN) RE-SCOPED WHAT THIS FILE MEASURES, AND ONE HALF OF IT IS NOW A DIFFERENT
//  POPULATION. READ THIS BEFORE READING A NUMBER BELOW.
//
//  The ruling, verbatim in its consequences: a SLEEPING guest is never idle; an AWAKE guest idle
//  IN ITS OWN ROOM is acceptable; **only a guest stranded in PUBLIC with needs it cannot get met
//  is a defect.** The idle share was pooling all three under one name.
//
//  So the X and N arms below measure the SECOND population — a room-holder that wants nothing —
//  and under this ruling that is not a defect at all. They are kept, and retitled for what they
//  are: a derivation and its execution, pinning that the model's duty cycle is what the content
//  rates say it is. Nothing in them is a pass/fail statement about the game any more.
//
//  THE THIRD POPULATION GETS ITS OWN ARMS, AND MEASURING IT PRODUCED A FINDING THAT CHANGES THE
//  SHAPE OF THE CRITERION. A guest standing in public with no room ALWAYS wants something
//  unserved — its own lodging need, which nothing is serving and which no room-holder's excusal
//  covers. So "with needs it cannot get met" is true of every member of the population it was
//  meant to narrow: the qualifier inspects nothing. That is asserted below rather than argued,
//  and it is why the criterion is a two-sided EXISTENCE claim in absolute guest-ticks — zero in a
//  hotel provisioned to the derived rule, non-zero in a starved one — rather than a ceiling on a
//  share. A ceiling over a population that is empty whenever the hotel is adequate would be
//  ADR-0007's shape wearing a threshold.
// ############################################################################

import { describe, expect, it } from 'vitest';
import {
  createWorld,
  findNeedType,
  guestsInOrder,
  idleShareBasisPoints,
  isNeedWanted,
  lodgingNeedOf,
  needTypesInOrder,
  NO_ENTITY,
  ONE_WHOLE_BASIS_POINTS,
  stayDurationOf,
  stepTick,
  toleranceOf,
  wantAtOf,
  wantLineOf,
  wantsSomethingUnserved,
} from '@hotelsim/sim';
import type { BoundContent, Guest } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';

const content = loadContent();
const STAY = stayDurationOf(content) ?? 0;

/** The stride the baseline was recorded at, and the stride N is denominated in. */
const RECORD_STRIDE = 10;

/** A room-holding guest-frame is IDLE when the guest wants nothing at all. */
const wantsNothing = (bound: BoundContent, guest: Guest): boolean => {
  const lodging = lodgingNeedOf(bound);
  const wantAt = wantAtOf(bound);
  for (const need of guest.needs) {
    const served =
      guest.engagement !== null
        ? guest.engagement.needId === need.needId
        : lodging !== undefined && need.needId === lodging.id;
    if (isNeedWanted(findNeedType(bound, need.needId), need, wantAt, served)) return false;
  }
  return true;
};

/** Step one guest through a well-provisioned hotel and read both statistics off it. */
const stepTheBox = (
  rooms: number,
  arrivalEveryTicks: number,
  amenities: number,
  ticks: number,
): {
  readonly idleBasisPoints: number;
  readonly longestRunTicks: number;
  readonly frames: number;
  readonly publicTicks: number;
  readonly strandedTicks: number;
  readonly longestStrandedRunTicks: number;
} => {
  let world = createWorld(7, content);
  const commands = schedule(ticks, content, world.grid, rooms, arrivalEveryTicks, 0, 0, 0, amenities);
  const byTick = new Map<number, ReturnType<typeof schedule>[number]['command'][]>();
  for (const scheduled of commands) {
    const bucket = byTick.get(scheduled.tick) ?? [];
    bucket.push(scheduled.command);
    byTick.set(scheduled.tick, bucket);
  }
  let frames = 0;
  let idle = 0;
  // ADR-0029's THIRD POPULATION, counted in the same walk: awake, holding no room, engaged with
  // nothing — standing in public — and, separately, doing so while wanting something unserved.
  let publicTicks = 0;
  let strandedTicks = 0;
  // PER GUEST, because the bound this population has is a bound on ONE guest's wait: it gives up
  // at `toleranceTicks`. A total over every guest has no bound at all — a hotel can strand any
  // number of them — so the total is the wrong quantity to compare against content.
  const strandedRuns = new Map<number, number>();
  let longestStranded = 0;
  const runs = new Map<number, number>();
  let longest = 0;
  for (let t = 0; t < ticks; t += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? []);
    for (const guest of guestsInOrder(world.guests)) {
      if (guest.roomEntityId === NO_ENTITY) {
        runs.delete(guest.id);
        // (a guest that later gets a room leaves this branch, and its stranded run ends below)
        if (guest.engagement === null) {
          publicTicks += 1;
          // THE SHIPPED PREDICATE, not a fourth spelling of its three exclusions. A guest with no
          // room excuses nothing (ADR-0026 as amended) and has no lodging room serving it, so the
          // served slots are its engagement — which is null on every tick counted here.
          if (wantsSomethingUnserved(content, guest.needs, null, null, wantAtOf(content), null)) {
            strandedTicks += 1;
            const streak = (strandedRuns.get(guest.id) ?? 0) + 1;
            strandedRuns.set(guest.id, streak);
            if (streak > longestStranded) longestStranded = streak;
          } else {
            strandedRuns.set(guest.id, 0);
          }
        } else {
          // Engaged with something: in public, but not stranded, so the run ends.
          strandedRuns.set(guest.id, 0);
        }
        continue;
      }
      frames += 1;
      strandedRuns.set(guest.id, 0);
      if (wantsNothing(content, guest)) {
        idle += 1;
        const run = (runs.get(guest.id) ?? 0) + 1;
        runs.set(guest.id, run);
        if (run > longest) longest = run;
      } else {
        runs.set(guest.id, 0);
      }
    }
  }
  return {
    idleBasisPoints: frames === 0 ? 0 : Math.round((idle * ONE_WHOLE_BASIS_POINTS) / frames),
    longestRunTicks: longest,
    frames,
    publicTicks,
    strandedTicks,
    longestStrandedRunTicks: longestStranded,
  };
};

describe('X — the AT-HOME idle share (ADR-0029: not a defect), derived and then stepped', () => {
  it('the ceiling is computed from the shipped rates, and this test does not write it down', () => {
    // X = 1 − (Σ over ENGAGEMENT needs 1/(1+r)) × (1 + 1/r_lodging). The lodging term is NOT
    // 1/(1+r): rest decays only in AWAY time, and away time is what the engagement needs
    // generate. Substituting the wall-time duty there is precisely the defect this file's
    // second path exists to catch.
    const lodging = lodgingNeedOf(content);
    const engagement = needTypesInOrder(content).filter((entry) => entry.id !== lodging?.id);
    const engagementShare = engagement.reduce((total, entry) => total + 1 / (1 + entry.refillPerTick), 0);
    const byHand = Math.round(
      (1 - engagementShare * (1 + 1 / (lodging?.refillPerTick ?? 1))) * ONE_WHOLE_BASIS_POINTS,
    );
    expect(byHand).toBe(2_500);
    expect(idleShareBasisPoints(content)).toBe(byHand);
  });

  it('and a STEPPED free-flow guest comes in under it, with the gap reported as a number', () => {
    const box = stepTheBox(2, STAY * 3, 3, STAY);
    // One guest, room-holding for all but the tick it checks out on.
    expect(box.frames).toBe(STAY - 1);
    const ceiling = idleShareBasisPoints(content);
    // THE ASSERTION IS `<=`, NOT EQUALITY, and the gap is the arrival deficit: a guest arrives
    // at its want line, so its one and only stay carries a debt it never re-incurs.
    expect(box.idleBasisPoints).toBeLessThanOrEqual(ceiling);
    // Pinned as a range rather than a point so a tuning change moves it visibly without
    // reddening on the third decimal.
    //
    // THE RANGE MOVED DOWN AT G-023b-ii AND THE REASON IS THE GOAL: travel converts idle time
    // into TRAVEL time. A guest walking to the cafe is neither idle nor being served, so a
    // build in which going somewhere takes time has strictly less idleness than one in which
    // arriving is instantaneous. **Measured 861 before travel and 271 after**, at the shipped
    // table — the ceiling is unmoved at 2,500, because it is computed from the refill rates and
    // travel is not one of them, which is exactly why the gap below is asserted and not the
    // value. The paragraph above this one was written a goal early, under the probe that found
    // this; both readings are now the tree's rather than a probe's.
    //
    // AND IT IS A POINT NOW RATHER THAN A RANGE, WHICH IS SHARPER RATHER THAN BRAVER. The old
    // `[500, 1_200]` carried the reason *"so a tuning change moves it visibly without reddening
    // on the third decimal"* — and there is no third decimal here: `stepTheBox` steps one guest
    // through a fixed schedule and folds integer frames into integer basis points, so this
    // reading is exact and identical on every run and every platform. A window around an exact
    // integer is a window in which a real change can hide.
    expect(box.idleBasisPoints).toBe(271);
    // AND THE TWO STRUCTURAL CLAUSES, WHICH SURVIVE ANY RE-PIN OF THE LITERAL ABOVE: the share
    // is under its derived ceiling, and it is under it by a margin rather than by a rounding.
    expect(box.idleBasisPoints).toBeLessThan(ceiling);
    expect(ceiling - box.idleBasisPoints).toBeGreaterThan(1_000);
  });

  it('and CONTENTION only pushes it down, which is what makes the ceiling a ceiling', () => {
    // ==================================================================================
    // THE ARMS WERE RE-CUT AT G-023b-ii, AND THE OLD PAIR WAS MEASURING TWO THINGS.
    //
    // It compared `stepTheBox(2, STAY * 3, 3, STAY)` against `stepTheBox(6, 60, 2, STAY * 2)`
    // — arms differing in ROOM COUNT, AMENITY COUNT, ARRIVAL RATE and DURATION, of which only
    // the arrival rate is contention. That was harmless while distance was free: room and
    // amenity counts changed what a guest competed for and not how far it walked.
    //
    // **FOUND BY A PROBE WHOSE CONFIGURATION WAS NOT THEN THE SHIPPED ONE, AND IT IS NOW.**
    // G-023b-ii's first pass declared `guestCellsPerTick: 3`, ran the suite and reverted it;
    // its second pass ships that value, so the readings below are the tree's own.
    // Under that probe the inequality INVERTED — free-flow fell to 271 bp while the contended
    // arm read 484, so "contended is lower" reversed. The cause was not contention: the free
    // arm had THREE amenities spread across the plot against the contended arm's two, so its
    // guest walked further for the same needs. **The lever had collapsed** — ADR-0027's class,
    // and the shape G-032a spent a sweep unpicking when a `direction` flag outlived the
    // campaign that justified it.
    //
    // **THE CONFOUND WAS ALWAYS THERE; TRAVEL ONLY MADE IT VISIBLE.** Room and amenity counts
    // were never contention, and the arms are re-cut here rather than left for the goal that
    // turns travel on — a comparison that measures two things measures neither, whether or not
    // today's numbers happen to come out in the right order.
    //
    // SO THE ARMS NOW DIFFER IN ONE THING. Same rooms, same amenities, same duration; only the
    // arrival cadence changes, which is the definition of contention. Whatever the geometry
    // costs, it costs BOTH arms identically, so it cannot be what the comparison reports.
    // ==================================================================================
    const free = stepTheBox(6, STAY * 3, 2, STAY * 2);
    const contended = stepTheBox(6, 60, 2, STAY * 2);
    expect(contended.idleBasisPoints).toBeLessThanOrEqual(free.idleBasisPoints);
    expect(contended.idleBasisPoints).toBeLessThan(idleShareBasisPoints(content));
  });
});

describe('N — the longest AT-HOME idle run, in FRAMES, with the stride carried', () => {
  const nTicks = (): number => {
    const lodging = lodgingNeedOf(content);
    // OVER THE NEEDS THAT DECAY IN WALL TIME, AND THE LODGING NEED IS NOT ONE OF THEM. An idle
    // guest is in its room, so it accrues no away time and its rest deficit does not move: rest
    // CANNOT end an idle run, and a naive min over all four would produce a bound the model
    // does not honour. Keyed on the same rule the model uses rather than on a hard-coded name.
    return Math.min(
      ...needTypesInOrder(content)
        .filter((entry) => entry.id !== lodging?.id)
        .map((entry) => wantLineOf(entry, wantAtOf(content))),
    );
  };

  it('is 420 ticks and therefore 43 frames at the stride the baseline was taken at', () => {
    expect(nTicks()).toBe(420);
    const nFrames = Math.floor(nTicks() / RECORD_STRIDE) + 1;
    expect(nFrames).toBe(43);
    // THE CONVERSION IS ASSERTED, not carried in prose: the baseline's "96" is FRAMES at a
    // stride of 10, and a bound denominated in ticks compared against it would be wrong by the
    // stride — in the direction that passes trivially.
    expect(nFrames * RECORD_STRIDE).toBeGreaterThanOrEqual(nTicks());
    // `<=` and not `<`: when the stride divides the bound exactly, the `+1` IS the alignment
    // allowance and nothing is spare. A `<` here would forbid the exactly-divisible case, which
    // is the shipped one.
    expect((nFrames - 1) * RECORD_STRIDE).toBeLessThanOrEqual(nTicks());
  });

  it('and a stepped free-flow guest runs well under it', () => {
    const box = stepTheBox(2, STAY * 3, 3, STAY);
    expect(box.longestRunTicks).toBeLessThanOrEqual(nTicks());
    // Measured 120 ticks — 12 frames — against a baseline of 96 frames (the G-027a recording,
    // re-materialised at `ab2991c` in round 1: 61.88% idle, longest run 96 frames. The 102 this
    // line and the one above carried came from a pair no re-measurement could reproduce, and it
    // is withdrawn rather than restated).
    expect(Math.floor(box.longestRunTicks / RECORD_STRIDE) + 1).toBeLessThan(43);
  });
});

// ============================================================================
//  ADR-0029's THIRD POPULATION — THE ONE THE RULING CALLS A DEFECT.
// ============================================================================

describe('the stranded guest: in public, awake, and not getting what it came for', () => {
  /**
   * Two hotels, chosen by the provisioning rule rather than by hand.
   *
   * PROVISIONED: enough beds for the cadence's whole demand, and amenities to match, so nobody
   * ever stands in the lobby. STARVED: a third of the beds, so guests arrive, wait and give up.
   * The pair is the two-sided form — a criterion that only ever asserted the zero could be met by
   * an instrument that counted nobody, which is exactly the failure ADR-0029's own predicate
   * turned out to have.
   */
  const provisioned = (): ReturnType<typeof stepTheBox> => stepTheBox(12, 120, 2, STAY * 2);
  const starved = (): ReturnType<typeof stepTheBox> => stepTheBox(3, 120, 1, STAY * 2);

  it('IS EMPTY in a hotel provisioned to the derived rule — nobody is ever left standing', () => {
    const box = provisioned();
    expect(box.strandedTicks).toBe(0);
    // AND THE ZERO IS NOT AN ARTEFACT OF AN EMPTY RUN: the hotel is full of guests the whole
    // time, they simply all have rooms. Without this the arm would pass on a hotel with no
    // guests in it at all.
    expect(box.frames).toBeGreaterThan(0);
  });

  it('AND IS NOT EMPTY in a starved one, which is what proves the instrument can fire', () => {
    // ADR-0007's companion case, and the half that a one-sided ceiling never had.
    const box = starved();
    expect(box.strandedTicks).toBeGreaterThan(0);
    // ========================================================================
    // AND ONE GUEST'S WAIT IS BOUNDED BY THE CONTENT'S OWN PATIENCE, asserted over the quantity
    // the bound is about: the LONGEST RUN one guest accumulates, against `toleranceTicks` read
    // off the table.
    //
    // THE WARRANT IS NARROWER THAN IT LOOKS AND THE NARROWING IS LOAD-BEARING. `stepGuests` gives
    // up on a roomless guest at `tick - arrivedTick >= tolerance` ONLY WHERE THE CONTENT DECLARES
    // A LODGING NEED (`guests.ts`, the `lodgingUnserved` guard). Under the food-court content
    // θ-b2 shipped there is no such branch: a roomless VISITOR lives out its visit, which the
    // shipped table makes longer than its tolerance, and this bound would be false of it. This
    // arm runs on the shipped hotel content, where the guard holds — which is why the bound is
    // read off `toleranceOf` rather than asserted as a property of the simulation.
    //
    // THE LINE IT REPLACES COULD NOT FAIL: `strandedTicks < publicTicks + 1` is arithmetic on two
    // counters incremented in the same branch, true for any content and any hotel, while the
    // comment above it warranted this proposition instead.
    //
    // AND THE ANTI-VACUITY GUARD IS THE `strandedTicks` LINE ABOVE, not a second `> 0` here: a run
    // is only ever counted inside the branch that counts a stranded tick, so `longestRun > 0` is
    // implied by `strandedTicks > 0` — the same two-counters shape this comment condemns. One
    // witness, stated once, at the top of the arm.
    // ========================================================================
    expect(box.longestStrandedRunTicks).toBeLessThanOrEqual(toleranceOf(content)!);
  });

  it('and the qualifier "with needs it cannot get met" inspects NOTHING — measured, not argued', () => {
    // ============================================================================
    // THE FINDING THAT SHAPED THE CRITERION. A guest in public holds no room, so its lodging
    // need is unserved by construction AND unexcused by construction — ADR-0026's excusal is
    // conditional on holding a room. There is therefore no such thing as a guest standing in the
    // lobby with nothing it wants, and the ruling's narrowing clause selects every member of the
    // population it was meant to narrow.
    //
    // ASSERTED ON BOTH HOTELS, INCLUDING THE ONE WHERE BOTH COUNTS ARE ZERO — 0 === 0 is a true
    // instance of the identity and a vacuous witness of it, which is why the starved arm above
    // pins the non-zero side separately.
    //
    // IF THIS EVER GOES RED the qualifier has started to matter, and the criterion above should
    // become a share of public time rather than a count of it.
    // ============================================================================
    for (const box of [provisioned(), starved()]) {
      expect(box.strandedTicks).toBe(box.publicTicks);
    }
    expect(starved().publicTicks).toBeGreaterThan(0);
  });
});
