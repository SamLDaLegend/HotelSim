// WHERE A GUEST IS BETWEEN TWO TICKS (G-047b). ADR-0095 as corrected by ADR-0096.
//
// ---------------------------------------------------------------------------------------
// THE HUMAN, WATCHING THE GAME: *"Movement is FAR too fast to my eye, people are zooming
// around all over the place… They also seem to jump through walls rather than looking for a
// door."* G-045 measured the first half — 72.1% of moving guest-ticks jump two or more cells
// between redraws, a guest crosses 9.34 of its own body widths with nothing drawn in between,
// and **px-per-redraw is 214.66 at EVERY rung**, so the speed dial was the wrong dial.
// G-047a shipped the sim half: `pathBetween` returns the cells a guest crossed. THIS FILE IS
// THE RENDERER'S HALF, and `view/scene.ts` draws what it records.
//
// RENDER READS STATE. Nothing here writes to a world, and nothing here is authoritative: a
// reload loses every record in this file and the hotel is unchanged, which is the same status
// `driver.carry`, the camera's floor and the selected rung already have. What it holds is a
// DERIVATION over two worlds the driver already had in its hands.
//
// ---------------------------------------------------------------------------------------
// ONCE PER TICK, NOT ONCE PER FRAME (ADR-0096 ruling 2), AND THAT IS WHY THIS IS A MODULE
// RATHER THAN A FEW LINES IN `scene.ts`.
//
// `scene.build` runs PER RENDERED FRAME — 145 FPS on the human's machine — and already
// constructs a `ValidityContext` each time. A path is CONSTANT between ticks, so computing it
// in the scene would pay a lattice search per guest per frame to get the same answer 145
// times a second, at up to 30 ticks per second. `advance` already calls `observe(before,
// after)` exactly once per tick with both worlds; `observeMotion` is that hook.
//
// AND G-047a's COST BOUND IS THE STEP'S, NOT A CONSTANT. `pathBetween` searches the rectangle
// its two endpoints span: two cells one tick apart span at most `guestCellsPerTick`, so the
// search is a handful of cells. Two cells N ticks apart span O(N^2) lattice cells. So the
// function is correct for `observe(t-1) -> observe(t)` and for nothing else, and this file is
// the only caller precisely so that stays true.
// ---------------------------------------------------------------------------------------

import {
  cellsEqual,
  createValidityContext,
  getGuest,
  pathBetween,
  roomIdAt,
  stairwellOf,
  storeEntities,
} from '@hotelsim/sim';
import type { BoundContent, Cell, GuestId, World } from '@hotelsim/sim';

/**
 * A cell, as a map key. All four coordinates, because two floors share column and row.
 *
 * EXPORTED, AND `scene.ts` IMPORTS IT RATHER THAN SPELLING ITS OWN. The slot a guest occupies
 * on a tile is decided by this key in BOTH files — here for the tick it came from, there for
 * the tick it is going to — and two spellings of one key is how the two ends of an
 * interpolation quietly stop describing the same tile.
 */
export const keyOf = (at: Cell): string => `${at.floor},${at.column},${at.row}`;

/**
 * WHICH OF THE GUESTS ON A TILE THIS ONE IS, AND HOW MANY THERE ARE.
 *
 * ==========================================================================================
 * THE CROWD LAYOUT REINTRODUCES THE JUMP IF NOBODY RULES IT (ADR-0096's fifth point, found by
 * the plan critic). Guests standing on one tile are laid out in a ROW: bucketed by
 * `keyOf(guest.at)` and offset by their index within the bucket, at a pitch driven by the need
 * vector's width. So a guest interpolated PERFECTLY in cell space still jumps by one pitch at
 * every tick boundary — because the offset it is drawn with changed, and nothing interpolated
 * THAT.
 *
 * **THE RULING: the slot is part of the position, and the position is interpolated whole.**
 * A guest is drawn at `route(carry) + lerp(offset(N-1), offset(N), carry)`. At `carry = 1` that
 * is exactly `cell(N) + offset(N)`, which is exactly what the next tick's `carry = 0` gives —
 * so the two ticks meet, by construction, at every boundary. The crowd is not a special case
 * bolted onto the tween; it is the second term of the same interpolation.
 *
 * SO THE SLOT IS RECORDED AT BOTH ENDS, AS AN INDEX AND A COUNT rather than as pixels. The
 * pitch depends on the camera's scale and on the widest need vector on the tile, neither of
 * which is known here and both of which are known per frame in `scene.ts`. Recording pixels
 * would freeze a scale into a per-tick record and put the guest in the wrong place the moment
 * the camera reframed.
 *
 * `crowdedOut` IS UNTOUCHED. It is still "guests the tile had no room to draw", still counted
 * in `scene.ts` from the tile's own bucket at `world.tick`, and the set of guests drawn is
 * exactly the set that was drawn before this goal. What changed is where a drawn guest is put.
 * ==========================================================================================
 */
export type Slot = {
  /** Position in the tile's bucket, ascending by guest id. */
  readonly index: number;
  /** How many guests shared the tile. */
  readonly count: number;
};

/**
 * WHY A GUEST IS DRAWN STANDING STILL AT ITS NEW CELL INSTEAD OF WALKING TO IT.
 *
 * THREE REASONS, AND ONLY ONE OF THEM IS A FAILURE. The distinction is ADR-0095's second
 * binding condition ("a failed lookup is LOUD — never a silent straight line") crossed with
 * ADR-0096's withdrawal of the diagnostic argument: the marker says **"I cannot draw a walk
 * here"** and it never says *"the simulation did something illegal."*
 */
export type SnapReason =
  /**
   * The guest was not in the previous world — it arrived on this tick. There is no previous
   * position, so there is nothing to walk from. Not a failure and NOT marked.
   */
  | 'appeared'
  /**
   * The guest changed FLOOR. `stairLeg` moves a guest up to three floors in one tick at a
   * fixed column and row, and the camera draws ONE FLOOR AT A TIME — so a tween would carry
   * the figure through two ceilings on a picture that contains neither. `pathBetween` returns
   * this as its own verdict rather than as a failure precisely so the marker does not fire on
   * every ascent in the hotel (ADR-0096 ruling 1). Not a failure and NOT marked.
   */
  | 'climb'
  /**
   * `pathBetween` found no SHORTEST walk between the two cells. THE MARKER FIRES ON THIS ONE,
   * and what it means is exactly this file's job to state:
   *
   *   IT IS A STATEMENT ABOUT DRAWABILITY, NOT ABOUT LEGALITY. `stepTowards` (guests.ts)
   *   checks that the LANDING is walkable and says nothing whatever about the cells between —
   *   *"nothing in the simulation, in a save, in the state hash or in a recorded frame can
   *   observe a cell it passed through"*. `pathBetween` is monotone, so it refuses a route
   *   that exists only by doubling back, and its own docblock says `blocked` means "no
   *   SHORTEST walk" rather than "no walk"; `path.test.ts` pins that with a geometry where
   *   the long way round is open and the verdict is still `blocked`. A guest whose landing is
   *   perfectly legal can therefore be undrawable, and the honest thing to draw is the guest
   *   where the simulation put it, plus a mark saying the walk is missing.
   *
   * IT IS ALSO WHAT THE HUMAN SAW. *"They seem to jump through walls rather than looking for a
   * door"* — a landing chosen for itself, reached across cells nobody checked. This does not
   * repair that (G-046 is the door question and needs a human ruling); it makes it COUNTABLE
   * and VISIBLE instead of being smoothed over with a straight line through a wall, which is
   * the one thing ADR-0095 forbids by name.
   */
  | 'unwalkable';

/** What became of one guest between the previous tick and this one. */
export type GuestMotion = {
  /**
   * The cells crossed, `from` first and `to` last, one axis-step apart — or `null` when the
   * guest snaps. A stationary guest carries a single cell, which is a route of length zero and
   * needs no search.
   */
  readonly cells: readonly Cell[] | null;
  /** `null` for a guest that walked. See `SnapReason`. */
  readonly reason: SnapReason | null;
  /** The slot the guest occupied on the tile it came FROM. Equal to `to` for a snap. */
  readonly from: Slot;
  /** The slot it occupies on the tile it is going TO. */
  readonly to: Slot;
};

export type Motion = {
  /** Keyed by guest id. Rebuilt every tick; a guest that has left is gone from it. */
  readonly guests: Map<GuestId, GuestMotion>;
  /**
   * How many guests IN THE WHOLE WORLD could not have their walk drawn on this tick.
   *
   * WORLD-WIDE, where `SceneReport.unwalkable` is the drawn floor's. Both exist because they
   * answer different questions: the scene's is "how much of what I am looking at is marked",
   * this one is "is the instrument silent because there is nothing to say, or because I am on
   * the wrong floor" — the same split `guestsElsewhere` already makes.
   */
  unwalkable: number;
  /**
   * The tick these records describe the ARRIVAL of, or `UNOBSERVED` before the first one.
   *
   * `scene.ts` REFUSES A `Motion` THAT DOES NOT MATCH THE WORLD IT IS DRAWING, on the precedent
   * `commandsFor` (session.ts) sets by throwing when it is asked twice for one tick: a lockstep
   * contract that is only described is one that breaks quietly, and a stale record would draw
   * a guest along a route it took at some other moment.
   */
  tick: number;
};

/** No tick has been observed yet — the frames between `createMotion` and the first `stepTick`. */
export const UNOBSERVED = -1;

export function createMotion(): Motion {
  return { guests: new Map<GuestId, GuestMotion>(), unwalkable: 0, tick: UNOBSERVED };
}

/**
 * Record how every guest got from `before` to `after`. Called once per tick, from the driver's
 * `observe` hook, with the same two worlds `observeTick` gets.
 *
 * IT BUILDS ITS OWN `ValidityContext` AND DOES NOT BORROW THE SCENE'S. The scene's is built
 * per FRAME over the world of that frame; this one is built per TICK over `after`. Sharing
 * would mean one of the two got a context describing the other's world — and the context is
 * where walkability lives, so that is not a caching detail, it is a wrong answer.
 *
 * DETERMINISTIC, AND NOTHING HERE REACHES THE SIMULATION. `pathBetween` is `packages/sim`'s
 * own function under I1 and I2; the only mutation is to `motion`, which no tick can see. The
 * world is never written: `after` is read for its guest list, its grid, its corridors, its
 * stairs and its entities, and nothing else.
 */
export function observeMotion(motion: Motion, content: BoundContent, before: World, after: World): void {
  const ctx = createValidityContext(
    content,
    after.grid,
    after.corridors,
    after.stairs,
    storeEntities(after.entities),
  );
  const stairwell = stairwellOf(after.stairs);
  const wasAt = slotsOf(before);
  const isAt = slotsOf(after);

  motion.guests.clear();
  motion.unwalkable = 0;
  motion.tick = after.tick;

  for (const guest of after.guests.list) {
    const to = isAt.get(guest.id) ?? SOLE;
    const was = getGuest(before.guests, guest.id);
    if (was === undefined) {
      motion.guests.set(guest.id, { cells: null, reason: 'appeared', from: to, to });
      continue;
    }
    if (cellsEqual(was.at, guest.at)) {
      // NO SEARCH FOR A GUEST THAT DID NOT MOVE, and 96.22% of guest-ticks are stationary
      // (G-045). `pathBetween` would return exactly `[at]` here — the origin is admitted
      // without being asked — so this is the same answer without the call.
      motion.guests.set(guest.id, { cells: [guest.at], reason: null, from: wasAt.get(guest.id) ?? SOLE, to });
      continue;
    }
    const from = wasAt.get(guest.id) ?? SOLE;
    const route = pathBetween(ctx, was.at, guest.at, roomIdAt(ctx, guest.at), stairwell);
    if (route.verdict === 'walk') {
      motion.guests.set(guest.id, { cells: route.cells, reason: null, from, to });
      continue;
    }
    // A SNAP TAKES THE DESTINATION SLOT AT BOTH ENDS. The guest is not moving across the
    // screen, so neither is its place in the row: interpolating the offset would slide a
    // snapped figure sideways for a tick, which reads as motion the simulation did not make.
    const reason: SnapReason = route.verdict === 'climb' ? 'climb' : 'unwalkable';
    if (reason === 'unwalkable') motion.unwalkable += 1;
    motion.guests.set(guest.id, { cells: null, reason, from: to, to });
  }
}

/**
 * The slot of every guest in a world, keyed by id.
 *
 * TWO PASSES, BECAUSE A SLOT NEEDS THE BUCKET'S FINAL SIZE. Ascending guest id in both, which
 * is `GuestStore.list`'s order and therefore the order `scene.ts` lays the row out in — so
 * index `i` here is the same guest as index `i` there, without the two files sharing anything
 * but `keyOf`.
 */
function slotsOf(world: World): Map<GuestId, Slot> {
  const counts = new Map<string, number>();
  for (const guest of world.guests.list) {
    const key = keyOf(guest.at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const slots = new Map<GuestId, Slot>();
  for (const guest of world.guests.list) {
    const key = keyOf(guest.at);
    const index = seen.get(key) ?? 0;
    seen.set(key, index + 1);
    slots.set(guest.id, { index, count: counts.get(key) ?? 1 });
  }
  return slots;
}

/** A guest alone on its tile. The only slot a lookup that cannot fail could still miss. */
const SOLE: Slot = Object.freeze({ index: 0, count: 1 });
