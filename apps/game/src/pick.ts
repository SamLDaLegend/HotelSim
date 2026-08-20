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

import { footprintCovers, isPlaced, isRoomKind } from '@hotelsim/sim';
import type { BoundContent, Cell, Entity, World } from '@hotelsim/sim';

/** Whether this entity is a placed ROOM (as opposed to an item, or an unplaced entity). */
export function isRoomEntity(content: BoundContent, entity: Entity): boolean {
  return isPlaced(entity) && isRoomKind(content, entity.kind);
}

/**
 * The room COVERING `cell`, or `undefined`.
 *
 * FIRST MATCH IN STORE ORDER, which is stable and hashed (`entitiesInOrder`), so two frames
 * of the same world pick the same room. Rooms do not overlap — `spawnEntity` throws and
 * `drawRoom` refuses on a rectangle that intersects a standing one — so "first" and "only"
 * are the same answer; stating the order is what keeps that true anyway.
 *
 * COVERING RATHER THAN ORIGINATING SINCE G-036b, and it is the same repair `validity.ts`'s
 * placement index made. This asked `cellsEqual(entity.at, cell)`, which is a question about a
 * room's ORIGIN — so a player clicking anywhere in a 3x2 room except its top-left corner
 * would have picked NOTHING, on five tiles out of six, with the room plainly drawn under the
 * cursor. `footprintCovers` is the simulation's own rectangle test, so this third spelling of
 * the rule reads the same predicate the other two do rather than reimplementing it.
 */
export function roomEntityAt(world: World, content: BoundContent, cell: Cell): Entity | undefined {
  for (const entity of world.entities.list) {
    if (isRoomEntity(content, entity) && isPlaced(entity) && footprintCovers(entity.at, entity.footprint, cell)) {
      return entity;
    }
  }
  return undefined;
}
