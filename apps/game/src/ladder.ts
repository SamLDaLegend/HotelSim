// THE PLAY-SPEED LADDER, AS THE TRANSPORT CONTROL SEES IT (G-030).
//
// ---------------------------------------------------------------------------------------
// THE RULE THIS FILE EXISTS TO OBEY, AND IT IS A HUMAN RULING (HOTELSIM.md §2.1.1, rule 2):
//
//   "THERE IS NO IMPLIED ARITHMETIC BETWEEN RUNGS — they are not multiples of each other and
//    nothing may compute one from another. Otherwise M5 hardcodes '1x/2x/3x' against content
//    that does not mean that, and the first rebalance produces a UI that lies about itself."
//
// §2.1.1 then says what does NOT enforce it: "NONE OF THIS REACHES ARITHMETIC IN RENDER
// CODE: nothing in packages/content can stop M5 computing ladder[i] / ladder[0]." That
// instrument was parked with its falsification test because `apps/game` was shut. It is no
// longer shut, so it ships in this goal rather than after it (ADR-0018) — `pnpm check:ladder`,
// `tools/gates/check-ladder.mjs`, proved to bite in `tools/headless/src/ladder-arithmetic.test.ts`.
//
// TWO CONSEQUENCES FOR EVERYTHING BELOW:
//
//   1. THE RENDERER NEVER COPIES A SPEED INTO A VARIABLE. It holds a rung ID and looks the
//      rung up. A held number would be a rung's value living in code — the shape the
//      existing `speed-ladder.scan.test.ts` hunts — and it is also the first step towards
//      comparing one against another.
//   2. THE LABEL TRAVELS WITH THE VALUE. A rung carries its own name (format rule 1), so a
//      button's text is `rung.name`, never a string this file assembles from a ratio. The
//      unit is shown beside it — a button reading only "Fast" cannot be checked against
//      §2.1.2's arithmetic by anyone looking at the screen, which is the viewer's finding
//      and it survives the move here.
//
// A rung's speed is used for exactly one thing, in `driver.ts`: multiplying elapsed REAL
// SECONDS to get ticks owed. That is arithmetic over ONE speed and it is what a play speed
// is for; the parked falsification test names it explicitly as not a violation ("a
// tick-accumulator dividing by ticksPerSecond is not a violation").
// ---------------------------------------------------------------------------------------

import type { SpeedRung } from '@hotelsim/content';

/**
 * The rung with this id, or `undefined`.
 *
 * `undefined` rather than a fallback rung, and the direction matters: a default invented
 * here would be a speed this file decided, which is the defect G-021 deleted wearing the
 * word "default". A caller holding an id no ladder carries has a bug, and `driver.ts`
 * spends no ticks at all in that case — visible, rather than silently running at a speed
 * nobody chose.
 */
export function rungById(rungs: readonly SpeedRung[], id: string): SpeedRung | undefined {
  for (const rung of rungs) {
    if (rung.id === id) return rung;
  }
  return undefined;
}

/**
 * The rung the game opens at: the FASTEST one, found by comparing rungs rather than by
 * taking a position.
 *
 * NOT `rungs[0]`, AND THE REASON IS THE SAME TRAP `lodgingRoomTypeOf` DOCUMENTS one package
 * over: position in a JSON table is not a property anybody authored. The ladder is ordered
 * fastest-first today and a rebalance may reorder it; asking WHICH IS FASTEST keeps meaning
 * the same thing when it does. `tools/gates/budget.mjs` reduces the same table the same way
 * for I5's budget, and G-021 proved that consumer with an arm that puts the fastest rung in
 * the MIDDLE.
 *
 * WHY FASTEST AND NOT SLOWEST. The top rung is the one this project has actually WATCHED:
 * §2.1.1 records that 30 ticks/s — a simulated day in 48 real seconds — reads BRISK, a
 * prediction of "sluggish" scored and found wrong. Opening there keeps a first play session
 * comparable with the recordings that finding came from.
 */
export function fastestRung(rungs: readonly SpeedRung[]): SpeedRung | undefined {
  let fastest: SpeedRung | undefined;
  for (const rung of rungs) {
    if (fastest === undefined || rung.ticksPerRealSecond > fastest.ticksPerRealSecond) {
      fastest = rung;
    }
  }
  return fastest;
}
