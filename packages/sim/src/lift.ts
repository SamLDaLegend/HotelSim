// A lift: a declaration that the world's stairwell shaft (`stairs.ts`) is served by a car of
// limited capacity, so guests queue for it. It is not a second connector: it adds no cells,
// and `stairLeg`/`climbsFrom` do not consult it, so reachability is unchanged (capacity >= 1
// means a lift can delay a guest but never sever a floor).
//
// A lift replaces the stair in its shaft rather than sitting beside it; a stair has unbounded
// capacity, so with both present nobody would ever queue. A lift therefore requires a shaft.
//
// The car's position and trip time are deliberately not modelled: they would manufacture queues
// at any occupancy. The model is only "at most `capacity` guests climbing at once; the rest wait".
//
// `null` means no lift: the shaft is a stair and the floor axis is unbounded.

/** A lift installed in this world's shaft. No coordinates: where the shaft is, is `world.stairs`. */
export type Lift = {
  /** How many guests the shaft carries at once. At least 1; 0 would sever the building, so it is refused, not clamped. */
  readonly capacity: number;
  /** How many ticks a guest waits in the line before giving up and leaving. At least 1. */
  readonly waitToleranceTicks: number;
};

/** No lift: the shaft is a staircase. A named constant because `null` here is a rule, not a missing value. */
export const NO_LIFT = null;

/** Whether two lift declarations say the same thing. Two integer compares. */
export function liftsEqual(a: Lift | null, b: Lift | null): boolean {
  if (a === null || b === null) return a === b;
  return a.capacity === b.capacity && a.waitToleranceTicks === b.waitToleranceTicks;
}

/**
 * The declaration with this lift installed, or the same object when it already said that —
 * `applyCommands` detects an unchanged world by identity. Copies the spec rather than holding it.
 * Throws on a non-integer or non-positive number: that is a caller error, not a player decision.
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
 * Throws unless `lift` is a legal lift declaration or `null`. Called at load. Whether a shaft
 * exists for it is checked by `assertWorldShape`, which sees both fields.
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
