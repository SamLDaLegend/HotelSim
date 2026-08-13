// THE NEED-VECTOR ARMS ARE WHAT THEY CLAIM TO BE — AND NOT ONE LINE OF THIS FILE HOLDS A
// STOPWATCH (G-016, G-013, relocated at G-020c).
//
//   pnpm exec vitest run scaling      the arms
//   pnpm check:scaling                the bounds
//
// WHAT MOVED, AND WHY IT HAD TO. This file used to time four arms in its `describe` BODY and
// assert three hard ratios against hard bounds, inside a parallel unit-test runner, inside
// `pnpm test`, which is I4's gate. §2.0: a gate that fails intermittently is not red, it is
// UNRELIABLE — and I4 was unreliable from G-016 to G-020c partly because of this file.
//
// The bounds are now `tools/gates/scaling.mjs`, derived in `tools/gates/scaling-bound.mjs`
// from a campaign taken at that instrument. The arms themselves are `scaling-arms.ts`, which
// both sides import, so there is one definition of the workload and not two.
//
// AND RELOCATION WAS NOT THE REPAIR — THE FLAKE WAS NEVER CONTENTION. `sim-critic` measured
// the shipped assertion on a clean extraction of HEAD, ISOLATED, one fresh process per run,
// n=10, QUIET, win32/12cpu: 9 x exit 0 and 1 x exit 1, "expected 2.653418174841722 to be less
// than 2.5", with an independent tsx probe reading 2.5903. G-020c's own campaign then read
// 2.5906 as its worst of twelve quiet readings. THE INCUMBENT BOUND OF 2.5 WAS UNDER THE
// INSTRUMENT'S OWN QUIET SPREAD, so moving it would have moved the flake rather than removed
// it. What discharges the defect is the re-derivation, not the relocation.
//
// AND THE READING THAT SETTLED WHETHER THAT WAS A REGRESSION — because "it used to be 1.74 and
// now reads 2.08" is the natural reading of those numbers, and it is wrong.
// `pnpm sim:needs-history --base aa30218` measures the same three-arm rotation at HEAD and at
// the last commit before G-013, in one sitting, each revision running its own simulation, its
// own content and its own harness:
//
//   QUIET,  n=25   head 1.7442 .. 2.0155 .. 2.3134   base 1.4834 .. 1.7094 .. 1.8540
//                  ratio 1.1791, interval 1.1071 .. 1.2534 at 95.7%  -> NO MULTIPLE, EXCLUDED
//   LOADED, n=25   head 1.4917 .. 2.1077 .. 2.5887   base 1.1115 .. 1.9157 .. 2.3212
//                  ratio 1.1002, interval 0.9668 .. 1.3228 at 95.7%  -> INCONCLUSIVE
//
// WHAT THAT SETTLES: the quiet interval EXCLUDES a 1.3x multiple, so whatever separates the two
// revisions is NOT the class this project has ever produced. The loaded arm cannot tell, and
// says so rather than reporting its point estimate.
//
// AND WHAT IT POSITIVELY SHOWS: the quiet interval also EXCLUDES 1.0, so a real difference of
// roughly 11-25% between HEAD and the last commit before G-013 is evidence rather than an open
// question. Investigating or optimising it is explicitly out of this goal's scope and is parked
// with its falsification test.
//
// A SENTENCE HERE WAS WITHDRAWN, AND IT IS WORTH KNOWING WHY. It said most of the movement
// against the recorded 1.74 was the distance between two SITTINGS. Decomposed on these figures
// it is false: the sitting term is base 1.7094 / 1.74 = 0.9824, i.e. -1.8%, while the revision
// term is 1.1791. It was true of an earlier campaign, was carried unchanged through two
// campaign replacements, and nobody re-derived it — a conclusion outliving the numbers under
// it. (The recorded 1.74 is also from a different instrument: in-vitest, four-arm rotation.)
//
// (Two earlier sets of figures here were WITHDRAWN rather than restated: one taken from a
// version of `needs3-arm.ts` that a scripted edit corrupted, one taken through a point-estimate
// verdict that has since been replaced. The instrument changed under both.)
//
// WHAT STAYS HERE IS EVERYTHING A STOPWATCH CANNOT SAY:
//
//   1. the arms really do differ in need count — a scaling test whose axis never moved is
//      the correction `PARKING.md` carries twice from G-009;
//   2. the dense arm really has more providers AND REALLY USES THEM, asserted behaviourally
//      in satisfactions rather than by trusting a host flag.
//
// Both are deterministic: same seed, same content, same answer on every machine. That is the
// line this goal draws — a claim about the SIMULATION belongs in `pnpm test`, a claim about
// how long the simulation TAKES belongs in a gate that was built to carry one.

import { describe, expect, it } from 'vitest';
import { createWorld, needOutcomeOf, needTypesInOrder, run } from '@hotelsim/sim';
import { loadContent } from './content-loader.js';
import { schedule } from './report.js';
import {
  ARRIVAL_EVERY_TICKS,
  DENSE_AMENITIES,
  lodgingOnly,
  ROOMS,
  SPARSE_AMENITIES,
  TICKS,
} from './scaling-arms.js';

const FULL = loadContent();
const ONE_NEED = lodgingOnly(FULL);

/** How many needs the shipped content gives each guest. Read, never assumed. */
const NEEDS = (FULL.content.needTypes ?? []).length;

describe('the need-vector arms differ in the axis they are named for', () => {
  it('the full arm carries a vector and the control carries the SMALLEST vector there is', () => {
    // Without this the ratio the gate measures could be 1.0 because both arms carry the same
    // vector — a scaling test whose axis never moved.
    //
    // THREE NEEDS RATHER THAN ONE SINCE G-027b, AND IT IS FORCED TWICE OVER. A lodging need
    // alone generates no away time, so it could never become wanted and `bindContent` refuses
    // the content; and rest must become wanted TWICE inside a stay, which at the shipped rates
    // takes the away time of two engagement needs rather than one. `lodgingOnly` searches for
    // the smallest table that binds rather than naming a number, so this asserts the SHAPE that
    // still makes the arm a control — strictly shorter than the full vector — and reads the
    // count off the arm. See `lodgingOnly` for what the collapse from 4-against-1 to
    // 4-against-3 costs the axis.
    expect(NEEDS).toBeGreaterThan(1);
    expect((ONE_NEED.content.needTypes ?? []).length).toBeLessThan(NEEDS);
    expect((ONE_NEED.content.needTypes ?? []).length).toBe(3);
    // And the trimmed arm still has somewhere to meet that need, or it would be measuring a
    // hotel that serves nobody rather than a hotel with one need.
    expect(ONE_NEED.content.roomTypes.length).toBeGreaterThan(0);
  });

  it('the control is reached through the ROLE, so no content id appears in code', () => {
    // ADR-0003: a snake_case string literal is a content ID and must not appear here. The
    // filter is by role, so adding a need type to `packages/content` grows the full arm by
    // itself and leaves the control at whatever the smallest bindable table is.
    const kept = ONE_NEED.content.needTypes ?? [];
    expect(kept.filter((entry) => entry.role === 'lodging')).toHaveLength(1);
    expect(kept.filter((entry) => entry.role === 'engagement').length).toBeGreaterThan(0);
    expect(kept.filter((entry) => entry.role === 'engagement').length).toBeLessThan(
      (FULL.content.needTypes ?? []).filter((entry) => entry.role === 'engagement').length,
    );
  });
});

describe('the dense arm really has more providers, and really uses them', () => {
  it('the dense hotel delivers materially more satisfactions than the sparse one', () => {
    // A timing ratio between two arms that behave identically measures nothing, and this is
    // the arm most at risk of it: `--amenities` is a host flag, and a host that silently
    // ignored it would leave the gate's density ratio at a comfortable 1.0 forever. So the
    // difference is asserted BEHAVIOURALLY rather than by trusting the flag.
    //
    // "The short-circuit stopped firing", said in a unit a reader can check. No stopwatch is
    // involved and the numbers are deterministic.
    // ------------------------------------------------------------------
    // PER DEPARTED GUEST SINCE θ-b1, AND THE RAW TOTAL WOULD NOW READ BACKWARDS.
    //
    // `met` is counted AT DEPARTURE, so the total is (satisfactions per guest) x (guests that
    // left). A dense hotel keeps its guests: they no longer walk out at their dissatisfaction
    // ceiling, so FEWER of them have departed by the horizon and the raw total falls even
    // though every guest is doing better. Measured: dense 90 against sparse 111 — the arm
    // inverted, while the property it exists to check held.
    //
    // The ratio is the honest quantity and it is compared by CROSS-MULTIPLICATION, integer and
    // lossless, so no float enters a deterministic test.
    // ------------------------------------------------------------------
    const served = (amenities: number): { readonly met: number; readonly departed: number } => {
      const world = createWorld(42, FULL);
      const finished = run(
        world,
        FULL,
        TICKS,
        schedule(TICKS, FULL, world.grid, ROOMS, ARRIVAL_EVERY_TICKS, 0, 0, 0, amenities),
      );
      let met = 0;
      for (const needType of needTypesInOrder(FULL)) met += needOutcomeOf(finished.needOutcomes, needType.id)?.met ?? 0;
      let departed = 0;
      for (const row of finished.guestOutcomes.departures) departed += row.count;
      return { met, departed };
    };
    const sparse = served(SPARSE_AMENITIES);
    const dense = served(DENSE_AMENITIES);
    expect(sparse.met).toBeGreaterThan(0);
    expect(sparse.departed).toBeGreaterThan(0);
    expect(dense.departed).toBeGreaterThan(0);
    expect(dense.met * sparse.departed).toBeGreaterThan(sparse.met * dense.departed);
  });
});
