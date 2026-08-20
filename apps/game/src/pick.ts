// WHAT THE PLAYER IS POINTING AT (G-031a).
//
// Two questions, both answered by READING state and neither by deciding anything:
//
//   which cell is under this point   -> `cellAt` in `view/camera.ts`, the projection's own
//                                       inverse, because a second description of where a
//                                       cell is would drift from the first
//   which room stands on that cell   -> here
//
// ONE PREDICATE FOR "A ROOM STANDS HERE", USED BY THE PICKER AND BY THE SCENE. `scene.ts`
// builds its cell -> room map with the same function, so the room the player clicks is by
// construction the room the player can see. The simulation has its own `roomAt` (`build.ts`)
// and it is the same rule again — but it takes an `EntityDraft`, which exists only inside a
// tick, so it is not reachable from a frame. That is why this is a third spelling of a rule
// rather than a second; what makes it safe is that the SIMULATION never trusts this one. A
// mis-picked cell produces a command the sim then judges by its own rule, and the worst case
// is a refusal the player can see. The render layer never gets the casting vote.

import { isPlaced, isRoomKind, cellsEqual } from '@hotelsim/sim';
import type { BoundContent, Cell, Entity, World } from '@hotelsim/sim';

/** Whether this entity is a placed ROOM (as opposed to an item, or an unplaced entity). */
export function isRoomEntity(content: BoundContent, entity: Entity): boolean {
  return isPlaced(entity) && isRoomKind(content, entity.kind);
}

/**
 * The room standing on `cell`, or `undefined`.
 *
 * FIRST MATCH IN STORE ORDER, which is stable and hashed (`entitiesInOrder`), so two frames
 * of the same world pick the same room. Rooms do not overlap — `spawnEntity` throws and
 * `buildRoom` refuses on an occupied cell — so "first" and "only" are the same answer today;
 * stating the order is what keeps that true if footprints (G-009) ever share cells.
 */
export function roomEntityAt(world: World, content: BoundContent, cell: Cell): Entity | undefined {
  for (const entity of world.entities.list) {
    if (isRoomEntity(content, entity) && isPlaced(entity) && cellsEqual(entity.at, cell)) {
      return entity;
    }
  }
  return undefined;
}
