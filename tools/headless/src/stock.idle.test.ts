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
  wantAtOf,
  wantLineOf,
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
): { readonly idleBasisPoints: number; readonly longestRunTicks: number; readonly frames: number } => {
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
  const runs = new Map<number, number>();
  let longest = 0;
  for (let t = 0; t < ticks; t += 1) {
    world = stepTick(world, content, byTick.get(world.tick) ?? []);
    for (const guest of guestsInOrder(world.guests)) {
      if (guest.roomEntityId === NO_ENTITY) {
        runs.delete(guest.id);
        continue;
      }
      frames += 1;
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
  };
};

describe('X — the idle share, from content and then from a stepped world', () => {
  it('the ceiling is computed from the shipped rates and is 25.00%', () => {
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
    // reddening on the third decimal. Measured 861 at the shipped table.
    expect(box.idleBasisPoints).toBeGreaterThan(500);
    expect(box.idleBasisPoints).toBeLessThan(1_200);
    expect(ceiling - box.idleBasisPoints).toBeGreaterThan(1_000);
  });

  it('and CONTENTION only pushes it down, which is what makes the ceiling a ceiling', () => {
    const free = stepTheBox(2, STAY * 3, 3, STAY);
    const contended = stepTheBox(6, 60, 2, STAY * 2);
    expect(contended.idleBasisPoints).toBeLessThanOrEqual(free.idleBasisPoints);
    expect(contended.idleBasisPoints).toBeLessThan(idleShareBasisPoints(content));
  });
});

describe('N — the longest idle run, in FRAMES, with the stride carried', () => {
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
