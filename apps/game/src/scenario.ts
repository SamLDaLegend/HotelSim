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
    // The entrance's own row (G-034a) — the shipped plot has exactly one, and reading it
    // from the entrance rather than writing `0` keeps this host on whatever plot the sim
    // hands it. Minimal change: `apps/game` is not this goal's subject.
    row: entrance.row,
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
    row: entrance.row,
  };
}

/**
 * THE CORRIDORS THE PLAN DECLARES, on every floor this scenario builds on (G-035, G-034b).
 *
 * ---------------------------------------------------------------------------------------
 * THEY WERE ALWAYS THERE AND NOBODY HAD WRITTEN THEM DOWN. `COLUMNS_PER_ROOM` above puts an
 * empty column between every pair of rooms and calls it a corridor in prose — `report.ts` has
 * said the same since G-009: *"the empty column between them IS the corridor until M3 gives
 * corridors an identity of their own."* G-034b gave them one. This is the host saying out
 * loud what its layout has always meant.
 *
 * WHY IT MATTERS TO THE VIEW, WHICH IS THIS GOAL'S SUBJECT. G-034b's REFLECT records that **a
 * room reported `noCorridor` looks identical to a working one unless the plan is on screen**,
 * and a WATCH surface that cannot show why a room is invalid is not doing its job. A hotel
 * that declares no corridors is OPEN PLAN — every floor walkable everywhere, the rule
 * dormant, nothing to draw and nothing to learn. Declaring them turns the rule on, gives the
 * renderer something to draw, and makes `noCorridor` a state a player can reach by building
 * somewhere silly and can fix by building somewhere sensible.
 *
 * IT CHANGES NO EXISTING VERDICT ON THE SHIPPED LAYOUT, and that is checkable rather than
 * hoped for: every room this file places has a declared corridor beside it by construction —
 * the corridors go exactly in the gaps the room stride leaves. If that ever stopped being
 * true, every room on the floor would report `noCorridor` at once and the HUD would say so on
 * the first frame.
 *
 * `layCorridor` IS AN EXISTING COMMAND AND NO SIMULATION BEHAVIOUR IS ADDED HERE. It is
 * idempotent, it costs nothing (a corridor's price is a designer's number and there is none
 * yet), and it takes no entity id — so it moves no id and changes nobody's provider choice,
 * which is the property `corridors.ts` was designed around.
 * ---------------------------------------------------------------------------------------
 */
function corridorCommands(entrance: Cell, bounds: GridBounds, amenities: number): readonly Command[] {
  const commands: Command[] = [];
  const lay = (floor: number, column: number): void => {
    if (column < bounds.minColumn || column > bounds.maxColumn) return;
    if (floor < bounds.minFloor || floor > bounds.maxFloor) return;
    commands.push({ kind: 'layCorridor', at: { floor, column, row: entrance.row } });
  };
  // THE LODGING FLOORS: rooms sit on the ODD offsets (`lodgingCell` adds 1), so the walkway is
  // every EVEN one — including the entrance's own column, which is the lobby.
  for (let floor = 0; floor < LODGING_FLOORS; floor += 1) {
    for (let i = 0; i <= LODGING_ROOMS_PER_FLOOR; i += 1) {
      lay(entrance.floor + floor, entrance.column + COLUMNS_PER_ROOM * i);
    }
  }
  // THE AMENITY FLOOR: amenities sit on the EVEN offsets (`amenityCell` adds none), so the
  // walkway is every ODD one. Mirrored, and derived from the same stride rather than written
  // out — a change to `COLUMNS_PER_ROOM` moves the rooms and the corridors together.
  const amenityFloor = Math.max(bounds.minFloor, entrance.floor - 1);
  for (let i = 0; i < amenities; i += 1) {
    lay(amenityFloor, entrance.column + COLUMNS_PER_ROOM * i + 1);
  }
  return commands;
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
  // AFTER THE ROOMS, AND THE ORDER IS STATED BECAUSE IT IS ASKED. It makes no difference to
  // the result — a corridor is a declaration about a cell and says nothing about what stands
  // there — but a reader should not have to work that out from `corridors.ts` to be sure.
  commands.push(...corridorCommands(entrance, bounds, amenityIndex));
  return commands;
}

/**
 * THE SCENARIO'S COMMANDS DUE ON ONE TICK — a pure function of the tick number.
 *
 * STILL PURE, AND THE SCOPE OF THAT WORD IS NARROWED AT G-031a. This function is pure; the
 * command source the DRIVER sees no longer is, because `session.ts` composes this with a
 * drained queue of the player's commands. G-030's version of this paragraph went on to say
 * that purity was "what makes the driver's output independent of the frame rate" — which
 * described the whole source, not this function, and stopped being true the moment a player
 * could click. Amended here in the same change that broke it rather than left to be found:
 * the twin sentence in `driver.ts` carried the identical claim and is amended with it.
 *
 * What survives, and it is this function's own contract: nothing here reads a clock, a
 * frame, a mouse or a world, so tick N's scenario commands are the same on every run.
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
