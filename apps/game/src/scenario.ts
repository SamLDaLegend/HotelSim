// THE SHIPPED HOTEL — the building the game opens on, and who walks into it (G-030).
//
// THIS IS A SCENARIO, NOT A DESIGN. Somebody has to say what stands on the plot at tick 0, and
// that somebody is the host, exactly as it is for the CLI.
//
// ~~"There is no demand model until M4 … and how often somebody arrives. When the player can
// build (G-031) and when arrivals answer to reputation (M4), this file shrinks to an opening
// position and then to nothing."~~ **HALF STRUCK AT G-051b, AND THE STRUCK HALF ALREADY HAPPENED
// IN THIS SAME FILE 120 LINES DOWN.** There IS a demand model: `content.ts` injects the curve
// unconditionally and `createScenario` below no longer issues a single `guestArrives`, so THIS
// FILE NO LONGER SAYS HOW OFTEN SOMEBODY ARRIVES — the hotel's own star rating does.
//
// WHAT SURVIVES, AND IT IS WHY THE FILE HAS NOT SHRUNK TO NOTHING: the opening POSITION is still
// the host's, and arrivals answer to the STAR RATING rather than to reputation — ADR-0082 rules
// those two distinct systems and reputation is still unbuilt.
//
// EVERY COMMAND HERE IS AN EXISTING COMMAND, AND NONE OF IT IS A PLAYER ACTION.
// `spawnEntity` is the structural primitive — "reach for it to set up the state a scenario
// STARTS in, the hotel the player inherited" (`commands.ts:26-31`). A host acting FOR a
// player reaches for `buildRoom`, which charges the ledger; nothing here does, and nothing
// here is dispatched by anything the player touches. G-031 owns that.
//
// NOT ONE CONTENT ID IS NAMED (ADR-0003, and `check:content` scans `apps/game/src`). The
// room guests sleep in is asked for by WHAT IT PROVIDES — the two traps `report.ts:412-475`
// documents, both of which cost a whole need's worth of satisfaction when they were got
// wrong: `roomTypes[0]` builds a hotel of cafés, and `roomTypeProvides` drops the lounge
// (which provides nothing and requires an armchair that does), producing a need every guest
// forms and no run can satisfy.
//
// ~~"and the amenities by WHAT THEY SERVE"~~ **STRUCK AT G-061 — BY THE COMMIT THAT FALSIFIED
// IT, WHICH IS THE ONLY MOMENT ADR-0084's CLASS IS CHEAP TO CATCH.** Serving was the WHOLE test
// until this goal and it is now ONE ARM OF A UNION: the basement band is every non-lodging room
// type that serves a need **or that a star tier COUNTS**. It had to change because a FACILITY
// SERVES NOTHING, so under the old test the Spa, the Conference Hall and the Theatre could not
// be selected at any tick — and the ladder's top two tiers, which ask for one of exactly those
// three, had no picture on the one surface a human watches. `basementRoomTypesOf` argues the
// predicate and says what it beats.

import {
  entranceCell,
  firstRoomTypeProviding,
  lodgingNeedOf,
  needTypesInOrder,
  requiredItemsOf,
  roomTypeServes,
  starTiersInOrder,
} from '@hotelsim/sim';
import type { BoundContent, Cell, Command, ContentId, GridBounds, RoomTypeData } from '@hotelsim/sim';

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
const LODGING_ROOMS_PER_ROW = 3;
const LODGING_FLOORS = 2;

/**
 * HOW FAR BACK INTO THE PLOT THE HOTEL GOES (G-036a).
 *
 * ==========================================================================================
 * THE WHOLE REASON THIS FILE IS TOUCHED BY A `packages/sim` GOAL, AND IT IS WATCH #12's
 * FINDING RATHER THAN A TIDY-UP.
 *
 * *"THE HOTEL DOES NOT READ AS A BUILDING. IT READS AS A STRING OF HUTS ON A PATH."* Three
 * rooms marched down a diagonal ribbon of corridor paving with open plot on both sides. It was
 * geometrically correct — the shipped plot was ONE ROW DEEP — and G-036a opens that depth.
 *
 * **WIDENING THE PLOT ALONE WOULD HAVE CHANGED NOTHING ON SCREEN.** `view/camera.ts` frames
 * the cells that are OCCUPIED, not the plot that is legal, and every layout in the tree wrote
 * `row: bounds.minRow`. A recording taken after a one-line bound change would have been
 * pixel-for-pixel WATCH #12, and the goal would have failed while every test passed. **The
 * layout is the substance; the bound was only its cause.**
 *
 * THREE, WHICH IS THE SMALLEST DEPTH THAT ANSWERS THE TWO QUESTIONS THE RECORDING OWES. One
 * row is the picture being replaced. Two rows put a row behind another row but never a row
 * BETWEEN two others, so nothing is occluded from both sides and the wall-height question
 * (ADR-0047 amdt §1, still PROVISIONAL) cannot be looked at. Three is the first depth where a
 * middle row exists, which is exactly the reading the human deferred to this goal.
 * ==========================================================================================
 */
const LODGING_ROWS = 3;

/**
 * HOW DEEP ONE AMENITY ROOM IS, IN ROWS — AND SINCE G-036b IT IS ONE ROOM RATHER THAN THREE.
 *
 * ==========================================================================================
 * THIS IS THE FOOTPRINT THE RECORDING EXISTS TO SHOW, and it is a change of MODEL rather than
 * of layout: G-036a put three separate one-cell cafés in a column and WATCH #13 recorded the
 * result as *"three coloured slabs… the first frame in this project where a TYPE of space
 * reads as an area rather than as a dot"*. It read as an area and it was not one — three
 * rooms, three badges, three upkeep charges, three doors.
 *
 * IT IS NOW ONE ROOM, 1 COLUMN WIDE AND THIS MANY ROWS DEEP, drawn as one rectangle with one
 * badge and one outline. The cells occupied are exactly the cells the three copies occupied,
 * so the corridor lanes, the floor extent and the camera framing are unchanged — **the only
 * thing that changes is whether the hotel BELIEVES it is one room**, which is the mechanic
 * this goal ships and the thing a watcher has to be able to see.
 *
 * ALONG THE ROW AXIS RATHER THAN THE COLUMN AXIS, and that is forced rather than chosen: the
 * column axis carries the corridor lanes (`COLUMNS_PER_ROOM`), so a two-column amenity would
 * be drawn across the walkway that gives it its door. The row axis takes no stride
 * (`ROWS_PER_ROOM`), so it is the axis with room to grow.
 *
 * THE LODGING FLOORS ARE DELIBERATELY LEFT AT ONE CELL. A frame in which everything is wide
 * says nothing about whether width is legible; the contrast between one-cell bedrooms upstairs
 * and a three-cell café below is what a watcher reads the footprint FROM. It also keeps this
 * recording comparable with WATCH #13's item-visibility count, which was taken on floor 1.
 * ==========================================================================================
 */
const AMENITY_ROWS = LODGING_ROWS;

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
 * AND THE ROW AXIS TAKES NO STRIDE, WHICH IS THE SAME DECISION `report.ts` MAKES AND FOR THE
 * SAME REASON (G-036a).
 *
 * The door rule asks for ONE free neighbour on the floor. A lane every other COLUMN, running
 * the full depth of the band, already gives every room in the bank one — so a second lane every
 * other row would halve the plate and buy no verdict. Rooms therefore touch front and back and
 * never left and right: a double-loaded corridor, which is what a hotel floor is.
 */
const ROWS_PER_ROOM = 1;

// ==========================================================================================
// THE ARRIVAL CADENCE THAT USED TO LIVE HERE IS GONE (G-051b), AND THE PARAGRAPH IT CARRIED IS
// KEPT AS THE RECORD OF WHAT IT WAS FOR.
//
//     const TICKS_BETWEEN_ARRIVALS = 120;
//     "A FIXED CADENCE IS A STAND-IN FOR DEMAND AND IS LABELLED ONE. Arrivals answer to
//      nothing — not to reputation, not to price, not to whether there is a free bed —
//      because none of that exists before M4. A player watching this must not read the
//      arrival rate as a response to anything they can see."
//
// **THE STAND-IN'S CONDITION HAS EXPIRED.** A player watching this may now read the arrival
// rate as a response to something they can see — their star rating — because that is what it
// is. `createScenario` below says what replaced it and what a watcher should expect.
// ==========================================================================================

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

/**
 * EVERY ROOM TYPE A STAR TIER COUNTS — the ids named by any clause of any tier, as a lookup.
 *
 * NOT ONE ID IS NAMED HERE (ADR-0003, and `check:content` scans `apps/game/src`).
 * `starTiersInOrder` is the simulation's own content-derived iteration and `roomTypeIds` is
 * the clause's own field, so the answer moves when `star-tiers.json` moves and this file
 * never learns a spelling.
 *
 * THE SET IS A LOOKUP AND IS NEVER ITERATED — the same disclaimer `tallyValidRooms` carries in
 * `rating.ts`, and for the same reason. Every ORDER that decides anything in this file comes
 * from `content.content.roomTypes`; insertion order here decides nothing.
 */
function starTierRoomTypeIdsOf(content: BoundContent): ReadonlySet<ContentId> {
  const ids = new Set<ContentId>();
  for (const tier of starTiersInOrder(content)) {
    for (const requirement of tier.requires) {
      for (const id of requirement.roomTypeIds) ids.add(id);
    }
  }
  return ids;
}

/**
 * ==========================================================================================
 * THE NON-LODGING ROOM TYPES THIS HOTEL STANDS UP, ascending by id: everything that SERVES a
 * guest need, plus everything a STAR TIER COUNTS (G-061).
 *
 * WHAT THIS REPLACED, AND WHY IT WAS A DEFECT RATHER THAN A CHOICE. Until this goal the test
 * was SERVES-SOMETHING alone, so the set was exactly the three amenities. **A facility serves
 * nothing — that is what makes it a facility** (`report.ts`'s `facilityRoomTypesOf` carries the
 * evidence for that being a decision) — so the Spa, the Conference Hall and the Theatre could
 * not be selected at any tick, in any recording, by any seed. The FOUR-STAR tier's third clause
 * asks for one of exactly those three, so **the shipped hotel was permanently capped at THREE STARS
 * and the ladder's top two tiers had no picture.** M4's sign-off states that qualification and
 * names this as M5's first goal.
 *
 * THE PREDICATE IS A UNION OF TWO POSITIVE TESTS, AND BOTH HALVES ARE LOAD-BEARING:
 *
 *   1. **A STAR TIER COUNTS IT.** This is the half that ships the facilities. It is the honest
 *      reading of what the basement is FOR — the hotel exists to be inspected, and a room type
 *      an inspector counts is a room type the player must be able to see. It is derivable from
 *      content with no id literal, which "facility" as a category is not.
 *   2. **IT SERVES A GUEST NEED.** This is the half that was already here, kept unchanged.
 *
 * WHY NOT THE NEGATION — `!servesSomething`, which is what the headless harness uses to find
 * facilities. **"Serves nothing and provides nothing" is the ABSENCE of properties and does not
 * distinguish a facility from a MIS-AUTHORED ROOM TYPE.** A room type added to
 * `room-types.json` with an empty `provides`, an empty `requires` and no tier naming it is
 * almost certainly a mistake; under the negation it would silently appear in the basement of
 * the shipped game as scenery, cost upkeep every night, and buy nothing. Under this predicate
 * it is not selected, because nothing positive is true of it. The harness may use the negation
 * — it is measuring a PARTITION of the room table and wants the residue by construction; this
 * host is deciding what a player looks at and wants a reason.
 *
 * WHY NOT CLAUSE 1 ALONE, which is the predicate G-060's parked note named. On the shipped
 * tables the two agree exactly, so the difference is entirely in the failure mode: clause 1
 * alone DROPS any room type that serves a need and that no tier happens to name, and the
 * dropped room is invisible — the hotel simply never builds it and every guest forms a need
 * nothing can meet. **That is this file's own documented and expensive defect class**, the one
 * the header records costing "a whole need's worth of satisfaction" when `roomTypeProvides`
 * dropped the lounge. A union re-opens it on no axis, and clause 1 alone re-opens it on the
 * ladder's.
 *
 * WHY NOT A `category` FIELD IN `room-types.json` — a `kind: "facility"` an author declares,
 * which would make the distinction POSITIVE and EXPLICIT rather than inferred. It is the best
 * answer and it is not this goal's to give: it is a schema change in `packages/content` and a
 * structural type in `packages/sim`, neither of which the render layer owns. Reported as a
 * finding, not taken.
 * ==========================================================================================
 */
function basementRoomTypesOf(content: BoundContent): readonly RoomTypeData[] {
  const lodging = lodgingRoomTypeOf(content);
  const countedByATier = starTierRoomTypeIdsOf(content);
  const wanted: RoomTypeData[] = [];
  for (const roomType of content.content.roomTypes) {
    if (roomType.id === lodging.id) continue;
    // ONE SPELLING OF "SERVES SOMETHING", SHARED WITH `basementColumnsOf`. Two copies of this
    // test is two chances for the selector and the layout to disagree about the same room type,
    // and the disagreement would be silent — a room selected as an amenity and then laid out as
    // a facility, or the reverse.
    if (countedByATier.has(roomType.id) || servesAnything(content, roomType)) wanted.push(roomType);
  }
  return wanted;
}

/** Whether this room type meets any guest need at all, directly or through an item it requires. */
function servesAnything(content: BoundContent, roomType: RoomTypeData): boolean {
  for (const needType of needTypesInOrder(content)) {
    if (roomTypeServes(content, roomType.id, needType.id)) return true;
  }
  return false;
}

/**
 * ==========================================================================================
 * HOW MANY OF EACH SERVING ROOM TYPE THE HOTEL OPENS WITH (G-061, human ruling).
 *
 * IT WAS ONE, AND ONE IS THE DENSITY AT WHICH THE FOURTH STAR PUNISHES THE PLAYER. Seeding the
 * facilities takes the rating 3 -> 4, which is what this goal is for, and the demand curve
 * answers by DOUBLING arrivals — 240 -> 480 over 30 days. One Games Room and one armchair
 * cannot serve sixteen guests a day. Measured on this scenario at seed 7 over 30 days, one
 * copy each: **245 `leftDissatisfied` departures against 0 before**, `guest_comfort` met 50 /
 * unmet 417, `guest_entertainment` met 76 / unmet 391, revenue DOWN 85,000p and balance down
 * 280,000p. At two copies each: **464 checked out, ZERO dissatisfied**, every need met, revenue
 * 3,944,000p and balance 2,629,000p.
 *
 * SO THE NUMBER IS BOUNDED AT BOTH ENDS AND CHOSEN INSIDE THE RANGE, which is the shape
 * `DEFAULT_MAX_ROW` uses in `grid.ts` and for the same reason — a bound that is forced is
 * stated as forced, and a preference inside it is stated as a preference:
 *
 *   - **AT LEAST 2.** One is measured insufficient, above. This end is forced by a reading.
 *   - **AT MOST 5**, and this end is forced by arithmetic rather than by a run: the hotel holds
 *     at most `18 bedrooms x 2` = 36 guests at once, so `ceil(36 / 8)` copies of a capacity-8
 *     room can serve every guest the building can physically contain. Past that a copy cannot
 *     bind on anything and is pure upkeep.
 *   - **2 IS A PREFERENCE INSIDE `2..5`, and what recommends it is that it is the SMALLEST
 *     SUFFICIENT ONE at today's rating.** Nothing anybody has stated derives 2 over 3 or 4; what
 *     can be said without inventing a requirement is that 2 takes the dissatisfied count to zero
 *     and 1 does not, and that every copy past the first that binds is upkeep the player pays
 *     for nothing. The reading is offered as a reading, not as a derivation.
 *
 * IT IS NOT A TUNE OF THE LADDER. `star-tiers.json` and `demand.json` are untouched (G-060 owns
 * both, and picking a threshold to make one run look good is the thing that would be). This is
 * the HOST deciding what stands on the plot at tick 0, which is the only kind of decision this
 * file has ever been allowed to make.
 *
 * WHAT IS DEFERRED RATHER THAN DELETED, AND IT IS THE POINT OF SHIPPING B: the overrun is real,
 * it is the build loop working, and a player WILL reach it — by building a twelfth bedroom, or
 * a fourth amenity type, or anything else that moves the rating. **It is deferred to the moment
 * the PLAYER causes it, which is the first moment the game can explain it.** Today it cannot:
 * G-062 has not put the rating on screen and no refusal reason is displayed, so an overrun the
 * HOST handed the player at tick 0 would be invisible punishment — a hotel quietly getting worse
 * with nothing saying why, introduced by a goal whose whole purpose is legibility.
 * ==========================================================================================
 */
const SERVING_ROOM_COPIES = 2;

/**
 * ==========================================================================================
 * ONE ENTRY PER BASEMENT COLUMN, LEFT TO RIGHT — the band as it actually stands, duplicates and
 * all. `basementRoomTypesOf` answers WHICH types; this answers HOW MANY of each and IN WHAT
 * ORDER, and the two are separate because they are decided by different things.
 *
 * SERVING ROOMS FIRST, AND THAT IS A MEASUREMENT RATHER THAN A TIDY-UP. The band is laid out
 * from the entrance, and the stairwell stands at the entrance's own column — so column 0 is the
 * nearest room to the door and every column after it is a longer walk. Under a plain ascending-id
 * order the Conference Hall sorts first and takes the nearest slot, pushing all three serving
 * rooms two columns further from the stairs. Measured at seed 7 over 30 days, one copy each, that
 * ordering alone is worth 102,000p of balance and 11 dissatisfied departures. **A facility serves
 * nobody, so it has nothing to lose by standing at the far end.**
 *
 * A FACILITY GETS EXACTLY ONE COPY, AND THIS ONE IS DERIVED RATHER THAN PREFERRED. Every star
 * tier clause that names a facility counts `distinctTypes`, so a second copy cannot raise the
 * rating; a facility serves no need, so a second copy cannot serve a guest. It would be upkeep
 * with no upside on either channel the hotel has.
 *
 * WITHIN EACH GROUP THE ORDER IS `content.content.roomTypes`, which is the total, content-derived
 * order this file has always used (ADR-0003) — the grouping re-orders, it does not sort.
 * ==========================================================================================
 */
function basementColumnsOf(content: BoundContent): readonly RoomTypeData[] {
  const serving: RoomTypeData[] = [];
  const rest: RoomTypeData[] = [];
  for (const roomType of basementRoomTypesOf(content)) {
    if (!servesAnything(content, roomType)) {
      rest.push(roomType);
      continue;
    }
    for (let copy = 0; copy < SERVING_ROOM_COPIES; copy += 1) serving.push(roomType);
  }
  return [...serving, ...rest];
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
  const perFloor = LODGING_ROOMS_PER_ROW * LODGING_ROWS;
  const onFloor = index % perFloor;
  return {
    floor: entrance.floor + Math.floor(index / perFloor),
    column: entrance.column + COLUMNS_PER_ROOM * (onFloor % LODGING_ROOMS_PER_ROW) + 1,
    // BACK INTO THE PLOT WHEN A ROW OF THE PLATE IS FULL (G-036a). Measured from the
    // ENTRANCE's row rather than written as `0`, so this host stays on whatever plot the sim
    // hands it — the same rule the column above follows.
    //
    // AND ONE ROW FURTHER BACK STILL SINCE G-039b-alpha, because the entrance's own ROW is now
    // the spine (`corridorCommands`). The column above has started one right of the entrance
    // since G-030 for the same reason on the other axis; the two clauses now say the same thing
    // twice, which is what the entrance being a CELL rather than a column always implied.
    row: entrance.row + 1 + ROWS_PER_ROOM * Math.floor(onFloor / LODGING_ROOMS_PER_ROW),
  };
}

/**
 * Where the nth basement room stands: the first basement, left to right.
 *
 * `index` IS A COLUMN AND NOT A ROOM TYPE SINCE G-061, and the two stopped being the same
 * number when the band started carrying two copies of each serving type. `basementColumnsOf`
 * is what feeds this, one entry per column, and it is where the count and the order are argued.
 *
 * THE NAME SAYS `amenity` AND THE BAND HOLDS MORE THAN AMENITIES — the three facilities stand
 * in it too, on the same stride, for the same reason. The name is kept because what it describes
 * is the BAND's geometry, which did not move.
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
    // THE NEAR EDGE, because the room now reaches back from here rather than being one of
    // three copies stacked into the depth (G-036b). `Entity.at` is a rectangle's ORIGIN — its
    // smallest column and smallest row — so an amenity's origin is its front-left cell and its
    // footprint carries the rest.
    //
    // ONE ROW BACK OF THE NEAR EDGE SINCE G-039b-alpha: the near row is the spine here too. The
    // basement gets one for the same reason the lodging floors do — its lanes were parallel and
    // unjoined, so an amenity was reachable only from the one lane it happened to stand beside.
    row: entrance.row + 1,
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
function corridorCommands(
  entrance: Cell,
  bounds: GridBounds,
  amenityColumns: number,
): readonly Command[] {
  const commands: Command[] = [];
  const lay = (floor: number, column: number, row: number): void => {
    if (column < bounds.minColumn || column > bounds.maxColumn) return;
    if (row < bounds.minRow || row > bounds.maxRow) return;
    if (floor < bounds.minFloor || floor > bounds.maxFloor) return;
    commands.push({ kind: 'layCorridor', at: { floor, column, row } });
  };
  // EVERY LANE RUNS THE FULL DEPTH OF THE PLATE SINCE G-036a. A lane one cell deep would leave
  // every room behind the front row with no declared walkway anywhere near it, and the whole
  // building would report `noCorridor` on the first frame — which is a thing the HUD says out
  // loud, so it would be seen rather than missed, but it would be seen instead of the picture
  // this recording is for.
  const rows = (count: number): readonly number[] =>
    Array.from({ length: count }, (_, row) => entrance.row + 1 + ROWS_PER_ROOM * row);
  /**
   * ========================================================================================
   * THE SPINE — the run of corridor along the ENTRANCE'S OWN ROW that joins the lanes to each
   * other and to the door (G-039b-alpha).
   *
   * **THE LANES WERE PARALLEL AND UNJOINED, IN THIS FILE AS WELL AS IN `report.ts`.** The loop
   * below has laid a lane down every even column since G-036a, and every one of them was a
   * closed strip between two banks of rooms: a guest standing in the lane at the entrance's
   * column could reach the two room columns beside it and NOTHING ELSE, because the only cells
   * joining one lane to the next are the rooms between them and `isWalkableFor` admits a room
   * only when it is the guest's own destination. G-038a-i measured the consequence on the
   * harness layouts — journeys with a fully walkable path 34/88 at six rooms — and recorded
   * that joining them requires MOVING ROOMS. This is the row the rooms moved to make.
   *
   * IT IS THE ENTRANCE'S ROW BECAUSE THAT IS THE ROW THAT BUYS BOTH THINGS AT ONCE: the lanes
   * are joined, and `entranceCell` — which is `(clamp(0), minColumn, minRow)` and therefore the
   * spine's own first cell — stands on circulation rather than on undeclared floor. G-030's
   * one-column shift did the same job on the column axis and its docblock is still the reason
   * the shift exists; this is that decision finished on the axis it did not have.
   *
   * IT RUNS THE FULL WIDTH OF THE BAND, room columns included, because nothing stands on it —
   * the plate starts one row back — so declaring the lot costs no verdict and makes the run
   * contiguous instead of a comb of stubs.
   * ========================================================================================
   */
  const spine = (floor: number, columns: number): void => {
    for (let column = 0; column <= columns; column += 1) lay(floor, entrance.column + column, entrance.row);
  };
  // THE LODGING FLOORS: rooms sit on the ODD offsets (`lodgingCell` adds 1), so the walkway is
  // every EVEN one — including the entrance's own column, which is the lobby.
  for (let floor = 0; floor < LODGING_FLOORS; floor += 1) {
    for (let i = 0; i <= LODGING_ROOMS_PER_ROW; i += 1) {
      for (const row of rows(LODGING_ROWS)) lay(entrance.floor + floor, entrance.column + COLUMNS_PER_ROOM * i, row);
    }
    spine(entrance.floor + floor, COLUMNS_PER_ROOM * LODGING_ROOMS_PER_ROW);
  }
  // THE AMENITY FLOOR: amenities sit on the EVEN offsets (`amenityCell` adds none), so the
  // walkway is every ODD one. Mirrored, and derived from the same stride rather than written
  // out — a change to `COLUMNS_PER_ROOM` moves the rooms and the corridors together.
  const amenityFloor = Math.max(bounds.minFloor, entrance.floor - 1);
  // THE LANE RUNS THE FULL DEPTH OF THE AMENITY ROOM (G-036b). It used to run the depth of the
  // amenity PLATE — `ceil(copies / perRow)` rows of one-cell rooms — and the two happen to be
  // the same number, because the plate's depth is exactly what one wide room now occupies.
  // Derived from `AMENITY_ROWS` rather than from a copy count, so widening the room moves the
  // room and its walkway together; a lane one cell short would leave the back of every amenity
  // with no declared walkway beside it and the whole basement would read `noCorridor`.
  for (let i = 0; i < amenityColumns; i += 1) {
    for (const row of rows(AMENITY_ROWS)) lay(amenityFloor, entrance.column + COLUMNS_PER_ROOM * i + 1, row);
  }
  // AND THE BASEMENT GETS A SPINE TOO, one column short of the lodging floors' because the
  // amenity band is `amenityColumns` rooms wide with its lanes on the ODD offsets rather than
  // the even ones. ~~Whether a guest can get DOWN to it is a different question and this goal
  // does not answer it: no harness in this project declares a stairwell, so the basement is a
  // joined floor that the ground floor cannot reach.~~ **ANSWERED AT G-038a-iii-b**, which is
  // where G-038a-ii-beta's block said the answer belonged: `shaftCommands` below declares the
  // stairwell, and the basement is reached down the same column the lodging floors are reached
  // up. The spine is what it stands on.
  spine(amenityFloor, COLUMNS_PER_ROOM * amenityColumns - 1);
  return commands;
}

/**
 * ==========================================================================================
 * THE STAIRWELL (G-038a-iii-b) — the column a guest changing floor has to walk to.
 *
 * TWO SHIPPED RULES WERE INERT UNTIL SOMETHING DECLARED ONE. `stairs.ts` made the floor axis
 * cost a walk to a declared stairwell (G-038a-ii-alpha) and `unreachable` made a room no fill
 * can reach invalid (G-038a-ii-beta), and both read an EMPTY stair set as *"the floor axis
 * spends unconditionally"*. So until this function is called, a guest in this scenario rose
 * through the ceiling from wherever it stood — which on a two-storey building over a basement
 * is the single most visible thing the renderer could have been getting wrong, and WATCH #16
 * recorded exactly that class of defect one axis over.
 *
 * WHERE IT GOES IS THE SPINE'S SECOND CELL, AND BOTH HALVES OF THAT ARE DERIVED.
 *
 *   ON THE SPINE, because a stairwell is ALIGNED — one `(column, row)` through the whole plot
 *   (`stairs.ts`) — so the one cell has to be circulation on BOTH lodging floors and on the
 *   amenity floor at once. `corridorCommands` runs `spine()` along `entrance.row` on all three
 *   and neither `lodgingCell` (row + 1 or deeper) nor `amenityCell` (row + 1) ever stands on
 *   it, so the entrance's row is the only run of corridor common to every floor this scenario
 *   builds on.
 *
 *   THE SECOND CELL AND NOT THE FIRST, because the first is `entranceCell` itself — the lobby,
 *   where every guest with no room stands. Putting the stairs under the waiting crowd would
 *   make the two states one square on screen, which is the defect `lodgingCell`'s own docblock
 *   records G-030 fixing on the column axis: *"a watcher cannot tell one from the other"*.
 *   `report.ts`'s `shaftCell` takes the second cell too, for the reachability reason — the
 *   entrance is charity-seeded by the fill whatever stands on it — and the two hosts agreeing
 *   is worth more than either argument alone.
 *
 * FULL HEIGHT OF THE PLOT, clamped by `lay`'s own bounds check, for the reason `report.ts`
 * gives: `stairLeg` reads only the stairwell's column and row, so which floors declared a
 * stair changes nothing about travel (ADR-0059) — what it changes is which cells
 * `isDeclaredWalkway` admits. A shaft that stopped at the top of today's hotel would be a
 * building whose stairs end where the current floor count does, and G-031 lets the player
 * build above it.
 *
 * `layStair` IS AN EXISTING COMMAND AND NO SIMULATION BEHAVIOUR IS ADDED HERE, exactly as
 * `corridorCommands` says of its own. It is idempotent, it costs nothing (what a stair costs
 * is a designer's number and there is none yet), and it takes no entity id — so it moves no
 * id and changes nobody's provider choice.
 * ==========================================================================================
 */
function shaftCommands(entrance: Cell, bounds: GridBounds): readonly Command[] {
  const column = entrance.column + 1;
  if (column > bounds.maxColumn) return [];
  const commands: Command[] = [];
  for (let floor = bounds.minFloor; floor <= bounds.maxFloor; floor += 1) {
    commands.push({ kind: 'layStair', at: { floor, column, row: entrance.row } });
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
  /**
   * A ROOM AND THE FURNITURE ITS TYPE REQUIRES.
   *
   * THE FURNITURE STANDS AT `itemCell`, WHICH IS NOT THE ROOM'S ORIGIN FOR A WIDE ROOM
   * (G-036b), and that is the point rather than a detail. An item's provision is entirely
   * BORROWED from the room COVERING its cell (`isProviding` in `validity.ts`), so a vending
   * machine in the middle of a three-cell games room is a live test of the footprint-aware
   * placement index — running on every frame of every recording, on the shipped scenario,
   * rather than only in a unit test. Under the origin-keyed index this goal replaced, that
   * machine had no host and the games room would have shown `missingItem` on the first frame.
   */
  const place = (entityKind: string, at: Cell, footprint?: { columns: number; rows: number }, itemCell = at): void => {
    commands.push(
      footprint === undefined
        ? { kind: 'spawnEntity', entityKind, at }
        : { kind: 'spawnEntity', entityKind, at, footprint },
    );
    for (const itemId of requiredItemsOf(content, entityKind)) {
      commands.push({ kind: 'spawnEntity', entityKind: itemId, at: itemCell });
    }
  };
  const lodging = lodgingRoomTypeOf(content);
  for (let i = 0; i < LODGING_ROOMS_PER_ROW * LODGING_ROWS * LODGING_FLOORS; i += 1) {
    place(lodging.id, lodgingCell(i, entrance));
  }
  // ONE ROOM PER BASEMENT COLUMN, `AMENITY_ROWS` DEEP (G-036b). It was one room per column PER
  // ROW before that goal — three copies pretending to be a hall. Copies of a type still stand
  // together rather than interleaved, and the cells one room occupies are unchanged.
  //
  // THE BAND IS NINE COLUMNS WIDE SINCE G-061 RATHER THAN THREE — two each of the three serving
  // types and one each of the three facilities — and nothing in this loop needed to change for
  // it: `basementColumnsOf` returns the columns and every stride, corridor lane and spine below
  // is derived from `.length`. The geometry was already general; only the selector was not.
  const basementColumns = basementColumnsOf(content);
  for (let column = 0; column < basementColumns.length; column += 1) {
    const room = basementColumns[column];
    if (room === undefined) continue;
    const at = amenityCell(column, bounds, entrance);
    // THE MIDDLE ROW, so the furniture is inside the rectangle but NOT at its origin. A room
    // type that requires nothing seeds nothing here and this cell is computed and unused, which
    // is `place`'s existing contract rather than a new case — the Cafe has taken that branch
    // since G-036b, so the facilities arriving on it exercise no new path.
    const middle = { floor: at.floor, column: at.column, row: at.row + Math.floor(AMENITY_ROWS / 2) };
    place(room.id, at, { columns: 1, rows: AMENITY_ROWS }, middle);
  }
  // AFTER THE ROOMS, AND THE ORDER IS STATED BECAUSE IT IS ASKED. It makes no difference to
  // the result — a corridor is a declaration about a cell and says nothing about what stands
  // there — but a reader should not have to work that out from `corridors.ts` to be sure.
  commands.push(...corridorCommands(entrance, bounds, basementColumns.length));
  // AND THE STAIRWELL, LAST, FOR THE SAME REASON THE CORRIDORS ARE LAID AFTER THE ROOMS: it
  // makes no difference to the result — a stair is a declaration about a cell and says nothing
  // about what stands there — and a reader should not have to work that out to be sure. It goes
  // after the corridors rather than before because the cell it takes is one of theirs.
  commands.push(...shaftCommands(entrance, bounds));
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
  const none: readonly Command[] = [];
  return (tick: number): readonly Command[] => {
    if (tick === 0) return seed;
    // AND NOTHING AFTER TICK 0 (G-051b). THIS FUNCTION USED TO ISSUE `guestArrives` EVERY
    // `TICKS_BETWEEN_ARRIVALS` TICKS, and that line was the reason the build loop did not close
    // in the one place a human can watch it: a hotel that added a Spa got the same twelve
    // parties a day it got before, so nothing a player built changed how many guests arrived.
    //
    // The simulation decides now. `content.ts` injects the demand curve, `runDemand` derives the
    // hotel's star rating every demand window and puts the parties that rating earns in the
    // lobby. A SCENARIO THAT ALSO ISSUED A FIXED CADENCE WOULD BE A SECOND, SILENT SOURCE ON TOP
    // OF IT — the sum of two arrival streams, attributed to whichever the watcher had in mind,
    // which is exactly what `parseArgs` refuses in the headless runner.
    //
    // WHAT A WATCHER SHOULD EXPECT AS A RESULT, said plainly because it is a visible change: an
    // UNRATED hotel receives NOBODY. The seeded scenario opens with valid bedrooms, so this one
    // is rated from tick 0 — but a player who demolishes their way below the first tier will
    // watch the lobby empty, and that is the loop working rather than the game breaking.
    return none;
  };
}
