// THE SHIPPED HOTEL — the building the game opens on, and who walks into it (G-030).
//
// THIS IS A SCENARIO, NOT A DESIGN. There is no demand model until M4 and no build tool
// until G-031, so somebody has to say what stands on the plot at tick 0 and how often
// somebody arrives. That somebody is the host, exactly as it is for the CLI. When the
// player can build (G-031) and when arrivals answer to reputation (M4), this file shrinks
// to an opening position and then to nothing.
//
// EVERY COMMAND HERE IS AN EXISTING COMMAND, AND NONE OF IT IS A PLAYER ACTION.
// `spawnEntity` is the structural primitive — "reach for it to set up the state a scenario
// STARTS in, the hotel the player inherited" (`commands.ts:26-31`). A host acting FOR a
// player reaches for `buildRoom`, which charges the ledger; nothing here does, and nothing
// here is dispatched by anything the player touches. G-031 owns that.
//
// NOT ONE CONTENT ID IS NAMED (ADR-0003, and `check:content` scans `apps/game/src`). The
// room guests sleep in is asked for by WHAT IT PROVIDES and the amenities by WHAT THEY
// SERVE — the two traps `report.ts:412-475` documents, both of which cost a whole need's
// worth of satisfaction when they were got wrong: `roomTypes[0]` builds a hotel of cafés,
// and `roomTypeProvides` drops the lounge (which provides nothing and requires an armchair
// that does), producing a need every guest forms and no run can satisfy.

import {
  entranceCell,
  firstRoomTypeProviding,
  lodgingNeedOf,
  needTypesInOrder,
  requiredItemsOf,
  roomTypeServes,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, GridBounds, RoomTypeData } from '@hotelsim/sim';

/**
 * How many lodging rooms, and how they stack.
 *
 * A 3-WIDE, 2-HIGH BLOCK RATHER THAN A ROW OF SIX, and the reason is the question this
 * whole goal is the instrument for. ADR-0014 asks whether a SIDE-ON CROSS-SECTION reads
 * clearly at all; a hotel one storey tall answers nothing about the cross-section, because
 * a single row of rooms looks the same from any angle. Two storeys over a basement is the
 * smallest building that shows floors, a street line and something underground at once.
 *
 * Six lodging rooms is the configuration this project has already watched
 * (`--rooms 6 --amenities 5` in ADR-0017's measurements, `--rooms 6` in G-017's recording),
 * so the first play session is comparable with the observations that exist rather than
 * being a fresh configuration nobody has a prior on.
 */
const LODGING_ROOMS_PER_FLOOR = 3;
const LODGING_FLOORS = 2;

/** One of each amenity room type, in the basement. */
const AMENITIES_EACH = 1;

/**
 * A CORRIDOR CELL BETWEEN ROOMS, and it is a validity rule rather than a look.
 *
 * `roomInvalidity` returns `noDoor` when "every neighbouring cell on this floor is another
 * room, or off the plot" (`validity.ts:92`). Rooms packed shoulder to shoulder are
 * therefore invalid, serve nobody, and still cost upkeep. `report.ts:323` calls the same
 * stride "the corridor that gives each one a door".
 */
const COLUMNS_PER_ROOM = 2;

/**
 * How often somebody walks in. Two in-game hours, which is `TICKS_BETWEEN_ARRIVALS` in
 * `report.ts:108` — the cadence every existing report and recording was taken at.
 *
 * A FIXED CADENCE IS A STAND-IN FOR DEMAND AND IS LABELLED ONE. Arrivals answer to nothing
 * — not to reputation, not to price, not to whether there is a free bed — because none of
 * that exists before M4. A player watching this must not read the arrival rate as a
 * response to anything they can see.
 */
const TICKS_BETWEEN_ARRIVALS = 120;

/**
 * The room type guests sleep in: the lowest-id room type that PROVIDES the lodging need.
 * Throws rather than defaulting — content with no lodging room is content this host cannot
 * build a hotel from, and guessing is the silent fallback §6.1 warns about.
 */
function lodgingRoomTypeOf(content: BoundContent): RoomTypeData {
  const lodging = lodgingNeedOf(content);
  const roomType = lodging === undefined ? undefined : firstRoomTypeProviding(content, lodging.id);
  if (roomType === undefined) {
    throw new Error(
      'The shipped content defines no room type that provides its lodging need, so there is no hotel to open',
    );
  }
  return roomType;
}

/** The room types that are not lodging and that SERVE something, ascending by id. */
function amenityRoomTypesOf(content: BoundContent): readonly RoomTypeData[] {
  const lodging = lodgingRoomTypeOf(content);
  const amenities: RoomTypeData[] = [];
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === lodging.id) continue;
    let servesSomething = false;
    for (const needType of needTypesInOrder(content)) {
      if (roomTypeServes(content, roomType.id, needType.id)) servesSomething = true;
    }
    if (servesSomething) amenities.push(roomType);
  }
  return amenities;
}

/**
 * Where the nth lodging room stands: left to right along a floor, then up.
 *
 * IT STARTS ONE COLUMN RIGHT OF THE ENTRANCE, AND THAT IS THIS FILE'S ONE REAL DESIGN
 * DECISION. `entranceCell(bounds)` is `{ floor: clamp(0), column: minColumn }` and the
 * CLI's `roomCell(0, bounds)` is the same cell — so on the default plot "waiting at the
 * door" and "asleep in bedroom 1" are the same square, and a watcher cannot tell one from
 * the other. Leaving the entrance column empty makes it a lobby: guests with no room stand
 * in a place that is visibly not a bedroom.
 *
 * It is deliberately not a fix in the simulation. Where the entrance IS, is the sim's;
 * where this host chooses to build is the host's, and G-030 is allowed to make only the
 * second kind of decision. The renderer also draws the entrance cell as a marker in its own
 * right, so a LATER layout that does collide still says "door and room" rather than losing
 * one of them (`view/scene.ts`).
 *
 * Floors are ground-up so every room's floor-below chain terminates at the earth — support
 * is transitive (`validity.ts:372`), and a block that starts above ground is a tower of
 * invalid rooms that houses nobody.
 */
function lodgingCell(index: number, entrance: Cell): Cell {
  const column = index % LODGING_ROOMS_PER_FLOOR;
  const floor = Math.floor(index / LODGING_ROOMS_PER_FLOOR);
  return {
    floor: entrance.floor + floor,
    column: entrance.column + COLUMNS_PER_ROOM * column + 1,
  };
}

/**
 * Where the nth amenity stands: the first basement, left to right.
 *
 * THE BASEMENT FOR THE REASON `report.ts:305-330` PAID A BROKEN EXIT CRITERION TO LEARN.
 * Amenities on the ground floor sit in the middle of the building space and seal the rooms
 * between them — G-011's criterion went red exactly that way. Below ground they collide with
 * nothing, and a room at or below grade is grounded by the earth so it needs nothing built
 * under it.
 */
function amenityCell(index: number, bounds: GridBounds, entrance: Cell): Cell {
  return {
    floor: Math.max(bounds.minFloor, entrance.floor - 1),
    column: entrance.column + COLUMNS_PER_ROOM * index,
  };
}

/**
 * The commands that stand the hotel up, all at tick 0.
 *
 * Rooms carry their furniture, read from the injected content per room type — an amenity
 * that requires nothing seeds nothing. `report.ts:729-739` says why the host must do this:
 * a scenario that seeds unfurnished rooms is a scenario whose hotel does not work, and
 * every guest would leave unsatisfied for a reason that is the host's rather than the
 * game's.
 */
export function seedCommands(content: BoundContent, bounds: GridBounds): readonly Command[] {
  const entrance = entranceCell(bounds);
  const commands: Command[] = [];
  const place = (entityKind: string, at: Cell): void => {
    commands.push({ kind: 'spawnEntity', entityKind, at });
    for (const itemId of requiredItemsOf(content, entityKind)) {
      commands.push({ kind: 'spawnEntity', entityKind: itemId, at });
    }
  };
  const lodging = lodgingRoomTypeOf(content);
  for (let i = 0; i < LODGING_ROOMS_PER_FLOOR * LODGING_FLOORS; i += 1) {
    place(lodging.id, lodgingCell(i, entrance));
  }
  let amenityIndex = 0;
  for (const amenity of amenityRoomTypesOf(content)) {
    for (let i = 0; i < AMENITIES_EACH; i += 1) {
      place(amenity.id, amenityCell(amenityIndex, bounds, entrance));
      amenityIndex += 1;
    }
  }
  return commands;
}

/**
 * THE COMMANDS DUE ON ONE TICK — a pure function of the tick number and nothing else.
 *
 * That purity is what makes the driver's output independent of the frame rate: a frame that
 * runs seven ticks asks seven times and gets what the seventh tick was always going to get,
 * so the sequence of worlds is the sequence a headless run of the same length produces.
 * Nothing here reads a clock, a frame, a mouse or a world.
 */
export function createScenario(
  content: BoundContent,
  bounds: GridBounds,
): (tick: number) => readonly Command[] {
  const seed = seedCommands(content, bounds);
  const arrival: readonly Command[] = [{ kind: 'guestArrives' }];
  const none: readonly Command[] = [];
  return (tick: number): readonly Command[] => {
    if (tick === 0) return seed;
    if (tick >= 1 && (tick - 1) % TICKS_BETWEEN_ARRIVALS === 0) return arrival;
    return none;
  };
}
