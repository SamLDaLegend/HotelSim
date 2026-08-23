// A lift — the vertical connector with a CAPACITY, which is what makes a queue possible
// (G-038b-i, ADR-0075).
//
// ============================================================================
// WHAT THIS IS AND, MORE IMPORTANTLY, WHAT IT IS NOT.
//
// A lift is NOT a second vertical connector. It is a DECLARATION ABOUT THE SHAFT THIS WORLD
// ALREADY HAS — the aligned stairwell column in `stairs.ts` — saying that the shaft is served
// by a car rather than by steps, and that the car carries at most `capacity` guests at a time.
//
// THAT CHOICE IS THE WHOLE REASON THIS FILE IS SHORT, and it is the answer to the cost the
// goal named in advance. A second connector would have to move TWO HAND-KEPT COPIES OF ONE
// CONDITION: `stairLeg` in `guests.ts` (where the floor axis is spent) and `climbsFrom` in
// `validity.ts` (where a mover's vertical neighbours are derived), whose own comment says it
// is *"copied from `stairLeg` because it IS `stairLeg`'s condition"*. The two must move
// together or `unreachable` starts disagreeing with where guests can actually go — ADR-0008
// drift, on the rule G-038a-ii-beta exists to enforce.
//
//   **NEITHER MOVES IN THIS GOAL, AND THAT IS PROVED RATHER THAN PROMISED.** A lift changes no
//   cell, declares no cell and is not consulted by either function. The shaft's GEOMETRY is
//   `world.stairs`, unchanged; the lift is a rate on it.
//
// AND REACHABILITY IS UNCHANGED FOR A REASON THAT IS STRUCTURAL RATHER THAN INCIDENTAL.
// `unreachable` asks a TOPOLOGICAL question — can a mover get from the entrance to this cell
// AT ALL — and a queue is a TEMPORAL one: how long it takes. `capacity >= 1` is refused below
// and refused again in `assertLift`, so every floor the stair reached, the lift still reaches;
// it just reaches it later. **A lift can never sever a building**, which is exactly why
// `climbsFrom` may go on answering without knowing lifts exist.
// ============================================================================
//
// ============================================================================
// A LIFT REPLACES THE STAIR IN ITS SHAFT. IT DOES NOT SIT BESIDE ONE.
//
// ADR-0075's first ruling: *"a thing with unbounded capacity never queues."* A staircase has
// unbounded capacity. So a world offering BOTH a stair and a lift in the same shaft is a world
// in which the queue is never joined — every guest that found the car full would take the
// steps, and the mechanism would be inert by construction rather than by content.
//
// So `world.lift` is read as: **the shaft is a lift shaft**. The declared cells in
// `world.stairs` are the shaft; the lift says what moves through them and how fast.
//
// WHICH IS WHY A LIFT REQUIRES A SHAFT, CHECKED AT BOTH DOORS — `installLift` in `tick.ts` on
// the way in from a command, `assertWorldShape` in `save.ts` on the way in from a save. A lift
// with no stairwell would be silently inert (there is no cell for a line to form at), and a
// mechanism that is inert because of a state nobody checked is the defect ADR-0075 spent a
// plan review on.
// ============================================================================
//
// ============================================================================
// WHAT IS DELIBERATELY NOT MODELLED: THE CAR'S POSITION, AND ITS TRIP TIME.
//
// ADR-0075 measured the congestion this mechanism manages and found it DOES NOT OCCUR on any
// workload this project can produce — max 3 or 4 guests on the aligned stairwell cell — and
// then said exactly why a trip-time model would be the wrong repair:
//
//   > *"Any queue that did form would be manufactured by the lift's own trip time, not by the
//   > hotel being busy — a different mechanic from the one the statement claims."*
//
// A car with a position and a travel time manufactures a queue out of nothing, at any
// occupancy, and would make this half look alive while measuring nothing. So the model here is
// the smallest one that is honest: **the shaft carries at most `capacity` guests at a time,
// and the rest form a line.** Every guest riding occupies a place for as long as its climb
// takes, which with the shipped guest speed is one tick — so at that speed "how many are in
// the car" and "how many board per tick" are the same number. They stop being the same number
// the moment a climb takes more than one tick, and the queue is what carries the difference.
//
// WHERE THE NUMBERS COME FROM, AND THIS IS THE SEAM THE GOAL WAS CUT ON. **Neither number is
// derived here and neither is shipped.** No content declares a lift, no harness installs one,
// and `world.lift` is `null` in every world this build produces and in every world it migrates
// — exactly the route that shipped stairs and `unreachable` inert before G-038a-iii made them
// live. G-038b-ii owns the dial: it must DERIVE a capacity from a stated requirement (§2.1)
// against a workload in which one can bind, and it must decide whether a guest's patience with
// a lift belongs to the LIFT (here) or to the GUEST (content, beside `toleranceTicks`).
// **Until then every capacity in this repository is a TEST FIXTURE and is named as one.**
// ============================================================================
//
// I2 notes:
//   - two INTEGERS, checked on the way in from a command and on the way in from a save. No
//     float can enter hashed state through this field.
//   - no Set, no Map, no iteration of any kind. The declaration is two numbers.
//   - `null` is a rule and not a missing value: *no lift declared => the shaft is a stair and
//     the floor axis is unbounded*, which is what every build before this one did.
//
// This module imports NOTHING, so it closes no cycle and can be read on its own.

/**
 * A lift installed in this world's shaft, or the absence of one.
 *
 * TWO INTEGERS AND NO COORDINATES. Where the shaft is, is `world.stairs`; this says what
 * serves it. Folding the two together would make "where may a guest climb?" and "how fast may
 * it climb?" one question, and they are answered by different code in different phases —
 * `stairs.ts`'s header makes the same split against `corridors`.
 */
export type Lift = {
  /**
   * How many guests the shaft carries AT ONCE. At least 1.
   *
   * A FIXTURE EVERYWHERE IT APPEARS TODAY (see the header). ADR-0075 measured that a capacity
   * of 4 or more can never bind on any workload this project can produce, so no number here
   * would be derivable from a stated requirement yet, and inventing one would be the
   * superstition-with-CI-access §2.1 forbids.
   *
   * AT LEAST 1, REFUSED RATHER THAN CLAMPED, AND THAT BOUND IS LOAD-BEARING. A capacity of 0
   * is a severed building: no guest could ever change floor, `unreachable` would go on saying
   * every floor is reachable, and the two would disagree permanently. That is the ADR-0008
   * drift this design exists to avoid, so it is refused at both doors rather than documented.
   */
  readonly capacity: number;
  /**
   * How many ticks a guest stands in the line before it gives up and leaves. At least 1.
   *
   * A FIXTURE, AND ITS OWNERSHIP IS AN OPEN QUESTION THIS HALF DOES NOT ANSWER. Patience is
   * arguably a property of the GUEST — content already declares `toleranceTicks`, how long a
   * roomless guest waits in the lobby — rather than of the machine it is waiting for. It sits
   * here because this half may add no content dial, and because a number with no home would
   * otherwise have to be invented inside the simulation, which is worse (I3).
   *
   * G-038b-ii owns the choice. If patience moves to content, this field goes and
   * `assertLift` loses a clause; nothing else in the mechanism changes, because the give-up
   * branch reads a number rather than a location.
   */
  readonly waitToleranceTicks: number;
};

/**
 * The world has no lift: its shaft is a staircase and the floor axis is unbounded.
 *
 * A NAMED CONSTANT FOR A `null`, because the value is a RULE rather than an absence — the
 * distinction `createStairs`'s empty set makes one axis over, and the reason `migrateV22ToV23`
 * writes a frozen literal instead of calling anything live (ADR-0008 (1)).
 */
export const NO_LIFT = null;

/** Whether two lift declarations say the same thing. Two integer compares. */
export function liftsEqual(a: Lift | null, b: Lift | null): boolean {
  if (a === null || b === null) return a === b;
  return a.capacity === b.capacity && a.waitToleranceTicks === b.waitToleranceTicks;
}

/**
 * The declaration with this lift installed, or the SAME declaration by reference when it
 * already said exactly that.
 *
 * IDENTITY-RETURNING, FOR `withStair`'S REASON: `applyCommands` decides whether a tick
 * allocated a world by comparing the accumulator's fields to the world's BY IDENTITY, so a
 * host issuing `installLift` on a blind cadence must not manufacture a new object every tick
 * and cost the idle-tick guarantee.
 *
 * THE SPEC IS COPIED, NEVER HELD, exactly as `withStair` copies its cell: `worldToJson` is an
 * identity cast, so a caller that kept its object could re-size the lift after the fact and
 * the hash would follow it with nothing having staged the change.
 *
 * THROWS ON A NUMBER THIS SIMULATION CANNOT ADDRESS, and a throw is the right shape for the
 * same reason `withStair`'s is: a non-integer or non-positive capacity is not a player
 * decision the rules decline, it is a caller error in the same class as a cell off the plot.
 * There is no player-facing lift tool to record a refusal for yet; when M5 grows one it offers
 * a slider over legal values and cannot produce an illegal one.
 */
export function withLift(current: Lift | null, spec: Lift): Lift {
  assertPositiveInteger(spec.capacity, 'capacity');
  assertPositiveInteger(spec.waitToleranceTicks, 'waitToleranceTicks');
  if (current !== null && liftsEqual(current, spec)) return current;
  return { capacity: spec.capacity, waitToleranceTicks: spec.waitToleranceTicks };
}

/** One integer bound, spelled once, so the command door and the save door cannot drift. */
function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(
      `installLift: ${field} must be an integer of at least 1, got ${String(value)}. ` +
        'A capacity of 0 severs the building and a fractional one is a float in hashed state; see lift.ts.',
    );
  }
}

/**
 * Throws unless `lift` is a legal lift declaration or the absence of one.
 *
 * Called from `assertWorldShape`, so a save carrying a fractional, zero or over-specified lift
 * is refused at LOAD rather than producing a world whose guests can never change floor or
 * whose hash carries a float. The plot is not a parameter because a lift names no coordinate —
 * `assertStairs` takes bounds for exactly the reason this does not.
 *
 * THE PAIRING WITH THE SHAFT IS NOT CHECKED HERE, deliberately: this function sees the lift
 * and not the stairs. `assertWorldShape` owns the cross-field rule, beside the two fields it
 * relates, which is where every other cross-field law in that file already lives.
 */
export function assertLift(lift: unknown): asserts lift is Lift | null {
  if (lift === null) return;
  if (typeof lift !== 'object') {
    throw new Error('Save is corrupt: world.lift is missing, or is neither null nor an object');
  }
  const declared = lift as Lift;
  if (typeof declared.capacity !== 'number' || typeof declared.waitToleranceTicks !== 'number') {
    throw new Error(
      'Save is corrupt: world.lift must carry a numeric capacity and waitToleranceTicks, or be null',
    );
  }
  if (!Number.isInteger(declared.capacity) || declared.capacity < 1) {
    throw new Error(
      `Save is corrupt: world.lift.capacity is ${String(declared.capacity)}; a lift carries at least one guest ` +
        'and carries a whole number of them (a capacity of 0 severs the building — see lift.ts)',
    );
  }
  if (!Number.isInteger(declared.waitToleranceTicks) || declared.waitToleranceTicks < 1) {
    throw new Error(
      `Save is corrupt: world.lift.waitToleranceTicks is ${String(declared.waitToleranceTicks)}; a guest waits ` +
        'at least one whole tick before it gives up',
    );
  }
  const keys = Object.keys(declared);
  if (keys.length !== 2) {
    throw new Error(
      `Save is corrupt: world.lift carries ${keys.length} key(s) (${keys.join(', ')}); a lift is exactly a ` +
        'capacity and a wait tolerance',
    );
  }
}
