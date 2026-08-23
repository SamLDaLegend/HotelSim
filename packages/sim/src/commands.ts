// Commands are the ONLY way the outside world changes the simulation. The render
// layer dispatches these; it never mutates state directly (§6.1 render-critic).
//
// A command log plus a seed fully determines the run (I2). Anything that cannot be
// expressed as a command cannot be replayed, and therefore cannot exist.
//
// Commands are applied at ONE point in the tick — the `applyCommands` phase, first of
// the three in `tick.ts` — not wherever they happen to arrive.

import type { ContentId, EntityId } from './entities.js';
import type { Cell, Footprint } from './grid.js';

export type Command =
  /** Does nothing, deterministically. Pins that a no-effect command is still a defined
   *  point in the tick rather than a special case that skips the phase. */
  | { readonly kind: 'noop' }
  /**
   * Creates one entity at one cell. The id is allocated by the store, not chosen by the
   * caller; the CELL is chosen by the caller, because where a thing stands is the
   * caller's decision and where it sits in the id space is not.
   *
   * The cell is REQUIRED (G-007). An optional one would leave every entity in the repo
   * unplaced and make "positions are part of hashed, saved state" a claim no test could
   * reach through the real path.
   *
   * THIS IS THE PRIMITIVE, NOT THE PLAYER'S BUILD (G-008). A cell off the plot throws,
   * and so does a cell where a room already stands: both are caller bugs, the same class
   * as an unknown `entityKind`, because the caller is holding the world whose plot and
   * contents it just ignored. It charges nothing. Reach for it in tests, in the
   * determinism harness, and to set up the state a scenario STARTS in — the hotel the
   * player inherited. **A host acting for a player reaches for `buildRoom` instead.**
   */
  | {
      readonly kind: 'spawnEntity';
      readonly entityKind: ContentId;
      readonly at: Cell;
      /**
       * HOW BIG THE THING IS, or absent for one cell (G-036b).
       *
       * OPTIONAL, AND ABSENCE IS THE STRUCTURAL READING RATHER THAN A DEFAULT: every entity
       * this project ever spawned before v19 took up exactly its own cell, and every ITEM
       * still does. So the hundreds of existing call sites keep meaning what they meant and
       * every recorded command log keeps replaying to the same world — the property that made
       * `drawRoom` a new command rather than a wider `buildRoom`, applied to the primitive.
       *
       * IT EXISTS BECAUSE THE STRUCTURAL DOOR MUST BE ABLE TO DESCRIBE ANY WORLD A SAVE CAN
       * HOLD. A save can hold a 3x2 room; a scenario that seeds "the hotel the player
       * inherited" has to be able to seed one, and `apps/game/src/scenario.ts` now does. A
       * primitive that could not express a legal state would push scenario authors onto the
       * player verb, which charges money and refuses — the wrong tool with the wrong failure
       * mode.
       *
       * A footprint that is not a pair of positive integers THROWS, and so does one that
       * reaches off the plot, and so does one that overlaps a standing room. Caller bugs, all
       * three, for the reason the cell already is: the caller is holding the world it ignored.
       */
      readonly footprint?: Footprint;
    }
  /** Removes one entity. Unknown or already-removed ids are a deterministic no-op. The
   *  primitive beneath `demolishRoom`, which records a refusal instead. */
  | { readonly kind: 'despawnEntity'; readonly id: EntityId }
  /**
   * THE PLAYER BUILDS A ROOM (G-008). The build loop's entry point, and the command a
   * UI dispatches at M5.
   *
   * It charges the room type's `constructionCostPence` to the ledger, and it REFUSES —
   * recording the reason in `World.buildOutcomes`, never throwing — when the cell is off
   * the plot, when a room already stands there, or when the charge would take the balance
   * below zero. That is the whole difference from `spawnEntity` above: same rule about
   * what a legal placement is, opposite response, because the fault is the player's move
   * rather than the caller's bug. See the header of `build.ts` for the table.
   *
   * `roomType` rather than `entityKind`, because this command is about rooms
   * specifically: occupancy is defined over rooms so that an item inside a room (M2) can
   * share its cells.
   */
  | { readonly kind: 'buildRoom'; readonly roomType: ContentId; readonly at: Cell }
  /**
   * THE PLAYER DRAWS A ROOM (G-036b, ADR-0046 §4.2). The primary building verb.
   *
   * `buildRoom` above is THIS COMMAND AT ONE CELL — `applyBuildRoom` is a one-line call to
   * `applyDrawRoom` — so the two are not two rules and there is no 1x1 special case to keep
   * exercised. What made it a second command rather than a wider `buildRoom` is that a command
   * log is a durable artefact (I2): adding a command leaves every recorded log meaning exactly
   * what it meant, and widening one silently changes all of them.
   *
   * It refuses, recording the reason in `World.buildOutcomes` and never throwing, when any
   * cell of the rectangle is off the plot, when the rectangle is smaller or larger than the
   * ROOM TYPE allows (both are content numbers — `minFootprintCells`, `maxFootprintCells`),
   * when it OVERLAPS a standing room, or when the charge would take the balance below zero.
   * **Overlap is rectangle against rectangle**: a draw whose origin is free and whose body
   * lies across an existing room is refused, which a per-cell test could not express.
   *
   * A footprint that is not a pair of positive integers THROWS. A 2.5-column rectangle is not
   * a small room, it is not a room, and a player dragging over a grid cannot produce one —
   * `assertCell`'s reasoning about a fractional coordinate, one field over.
   */
  | {
      readonly kind: 'drawRoom';
      readonly roomType: ContentId;
      /** The rectangle's origin: its smallest column and smallest row. */
      readonly at: Cell;
      readonly footprint: Footprint;
    }
  /**
   * THE PLAYER PUTS AN ITEM IN A ROOM (G-036b). Promoted out of M6 by ADR-0046 §4.2, which
   * makes it "the primary player verb" alongside the drawing one: a drawn room is an empty
   * rectangle until something stands in it, and G-037 scores a room on exactly that.
   *
   * BY CELL, NOT BY ROOM ID, and the two are not equivalent once a room is a rectangle: WHERE
   * in the room an item stands is the player's choice and is the thing G-036c's editing verbs
   * will move. The host room is derived from the cell by the same footprint-aware lookup
   * `validity.ts` uses, so an item placed at any cell of a multi-cell room is inside it.
   *
   * REFUSED, RECORDED, NEVER THROWN when the cell is off the plot or when NO ROOM COVERS IT.
   * The second is a player rule rather than a structural one — `spawnEntity` will still put a
   * bed in a corridor, because a scenario must be able to describe any world a save can hold —
   * and it exists because an item's provision is entirely borrowed from its host room, so an
   * unhosted item is furniture that can never serve anybody.
   *
   * IT COSTS NOTHING YET, and that is a gap with a name rather than a design: an item price is
   * a designer's number and `ItemTypeData` has no such field. See `applyPlaceItem` for the
   * parked question and what would falsify it.
   */
  | { readonly kind: 'placeItem'; readonly itemType: ContentId; readonly at: Cell }
  /**
   * THE PLAYER REDRAWS A ROOM THEY ALREADY BUILT (G-036c, ADR-0047 B4). A room's footprint is
   * mutable world state, and this is the verb that changes it.
   *
   * A THIRD COMMAND RATHER THAN A RE-ISSUED `drawRoom`, and G-036b's reason applies here MORE
   * strongly rather than inverting. There, widening `buildRoom` would have changed a signature;
   * here, teaching `drawRoom` to mean "resize whatever is in the way" would change a MEANING —
   * every recorded log in this project contains draws aimed at occupied cells on purpose (that
   * is how `occupied` is exercised inside the I2 gate), and every one of those refusals would
   * silently become an edit. **The bytes would not change and the hotel they describe would.**
   * A resize is not expressible as a draw in any case: it must keep the ENTITY ID, which is the
   * handle every guest reservation and every hosted item holds.
   *
   * IT CARRIES AN ORIGIN AS WELL AS AN EXTENT, because dragging a room's left or back edge
   * inward moves the origin — half of all resizes are inexpressible without it. So this is
   * "re-draw this room's rectangle", one rule, rather than two verbs distinguished by which
   * edge the player grabbed.
   *
   * REFUSED, RECORDED, NEVER THROWN when the id is not a live room, when the rectangle leaves
   * the plot, when it is outside the room TYPE's size band, when it OVERLAPS another room, or
   * when it would make a room OTHER THAN THIS ONE invalid — `breaksAnotherRoom`. A player may
   * still break the room they are editing; that is `drawRoom`'s standing permission and this
   * verb keeps it. See `applyResizeRoom` for why those two are not the same rule.
   *
   * ITEMS THE SHRINK CUTS OFF ARE DROPPED, and the drop is counted in
   * `World.buildOutcomes.displaced` — a recorded effect rather than silence. `applyDemolishRoom`
   * already removes a room's furniture with it, and a shrink is a partial demolition.
   *
   * IT COSTS NOTHING, which is a stated gap rather than a design: a per-cell price is a
   * designer's number and there is no such field. See `applyResizeRoom` for what would falsify
   * that. A footprint that is not a pair of positive integers THROWS, as it does for `drawRoom`.
   */
  | {
      readonly kind: 'resizeRoom';
      readonly id: EntityId;
      /** The rectangle's new origin: its smallest column and smallest row. */
      readonly at: Cell;
      readonly footprint: Footprint;
    }
  /**
   * THE PLAYER MOVES A PIECE OF FURNITURE (G-036c, ADR-0047 B4). The other half of B4: a room's
   * CONTENTS are mutable world state too.
   *
   * BY ENTITY ID AND A DESTINATION CELL — the id because that is the simulation's own handle
   * (`demolishRoom`'s reasoning), the cell because where in a room a thing stands is the
   * player's choice.
   *
   * REFUSED, RECORDED, NEVER THROWN when the id is not a live item (a live ROOM id lands here
   * too: a room is redrawn, not carried), when the cell is off the plot, when NO ROOM COVERS IT
   * — `placeItem`'s rule word for word, because an item's provision is borrowed entirely from
   * its host room — or when carrying it out would leave the room behind `missingItem`.
   *
   * It is also the player's recovery route for a shrink: move the furniture, then resize. That
   * is what makes dropping the cut-off items a choice rather than a forfeit.
   */
  | { readonly kind: 'moveItem'; readonly id: EntityId; readonly to: Cell }
  /**
   * THE PLAYER DEMOLISHES A ROOM (G-008), AND GETS PART OF THE BUILD COST BACK (G-011).
   *
   * The refund is `demolitionRefundBasisPoints` of the room type's construction cost — a
   * designer's number, therefore content — and it is spendable in the same tick, so
   * demolish-then-build is a real move. `bindContent` refuses content whose refund would
   * make demolishing before midnight a way to dodge upkeep; see `build.ts`.
   *
   * BY ENTITY ID, not by cell: the id is the simulation's own handle, and a cell does not
   * identify an entity uniquely once items (M2) or footprints (G-009) share cells. An id
   * that is not a live room is a RECORDED REFUSAL rather than the silent no-op
   * `despawnEntity` gives, because a player action that did nothing is exactly what this
   * goal exists to make observable.
   *
   * A guest resting in the room is evicted on the same tick, by G-004's existing path.
   */
  | { readonly kind: 'demolishRoom'; readonly id: EntityId }
  /**
   * THE PLAN SAYS PEOPLE WALK HERE (G-034b, ADR-0047 B2).
   *
   * Declares one cell a corridor. Idempotent — declaring a cell that is already declared is
   * a deterministic no-op, not a refusal and not a throw — and it costs nothing: what a
   * corridor COSTS is a designer's number and therefore content, and there is none yet
   * (`PARKING.md`).
   *
   * THIS IS THE PRIMITIVE, NOT THE PLAYER'S DRAWING, and the split is `spawnEntity`'s
   * exactly. A cell off the plot THROWS, because the caller is holding the world whose plot
   * it just ignored; a player-facing verb that RECORDS that as a refusal lands with the
   * other drawing verbs (G-036), where a UI exists to dispatch it. Reach for this in tests,
   * in the determinism harness, and to declare the circulation a scenario STARTS with —
   * which is what the CLI's inherited hotel has always had implicitly, in the empty column
   * between two rooms.
   *
   * IT DOES NOT ASK WHAT IS STANDING THERE. A corridor is a DECLARATION about a cell, not a
   * thing placed in it, so there is nothing to collide with: the validity walk in
   * `validity.ts` is the one place that asks whether a room is in the way, and it asks on
   * every query rather than once at the moment of drawing. Two rules — a refusal here and a
   * predicate there — would be two definitions of the same fact, and the way that shows up
   * is a corridor that survives the demolition of the room built over it in one of them and
   * not the other. See the header of `corridors.ts`.
   *
   * THERE IS NO `clearCorridor` YET, deliberately, and `PARKING.md` carries it with its
   * test: a plan that can only grow is enough for a rule that only reads it, and removal
   * belongs with the editing verbs (G-036, ADR-0047 B4).
   */
  | { readonly kind: 'layCorridor'; readonly at: Cell }
  /**
   * THE PLAN SAYS PEOPLE CLIMB HERE (G-038a-ii-alpha).
   *
   * Declares one cell a stair. Idempotent — declaring a cell that is already declared is a
   * deterministic no-op returning the SAME array, which is what keeps the `ValidityCache`'s
   * seventh clause exact rather than conservative — and it costs nothing, for the reason
   * `layCorridor` costs nothing: what a stair COSTS is a designer's number and therefore
   * content, and there is none yet.
   *
   * IT THROWS ON A MISALIGNED CELL, AND THAT IS THIS COMMAND'S ONE DIFFERENCE FROM
   * `layCorridor`. Stairs are ALIGNED — one stairwell column through the plot — because that
   * is what makes the derived stair leg in `guests.ts` O(1) and the guest speed window
   * derivable at all (`stairs.ts` carries both halves of the arithmetic). A second stairwell
   * is therefore not a cell this world can address, which is the same class as a cell off the
   * plot, and `assertCell` already throws for that one line above.
   *
   * THERE IS NO `clearStair` YET, deliberately, and it is `layCorridor`'s reason exactly: a
   * plan that can only grow is enough for a rule that only reads it. Removal belongs with the
   * editing verbs, and it lands with the ruling on what happens to a stairwell somebody builds
   * over — which is G-038a-ii-beta's, where reachability gives it a rule to be derived from.
   */
  | { readonly kind: 'layStair'; readonly at: Cell }
  /**
   * THE SHAFT IS SERVED BY A LIFT (G-038b-i, ADR-0075).
   *
   * Declares that this world's stairwell carries at most `capacity` guests at a time, and that
   * a guest standing in the line outside the car gives up after `waitToleranceTicks`. It
   * declares no cell: WHERE the shaft is, is `layStair`'s; this says what serves it. See
   * `lift.ts` for why a lift is a rate on the existing shaft rather than a second connector.
   *
   * IDEMPOTENT — installing the lift that is already installed is a deterministic no-op
   * returning the SAME object, which is what keeps `applyCommands`' idle-tick guarantee exact
   * rather than conservative — and it costs nothing, for the reason `layStair` costs nothing:
   * what a lift COSTS is a designer's number and therefore content, and there is none yet.
   *
   * IT THROWS ON TWO THINGS, AND BOTH ARE "A WORLD THIS SIMULATION HAS NO READING OF" RATHER
   * THAN A REFUSED PLAYER DECISION — `layStair`'s misaligned cell, one axis over:
   *
   *   A CAPACITY BELOW ONE, OR NOT A WHOLE NUMBER. Zero severs the building permanently while
   *     `unreachable` goes on saying every floor is reachable, which is the ADR-0008 drift this
   *     whole design is arranged to avoid; a fraction is a float in hashed state (I2).
   *   NO STAIRWELL TO INSTALL IT IN. A lift with no shaft would be silently inert — there is no
   *     cell for a line to form at — and an inert mechanism nobody checked for is what ADR-0075
   *     spent a plan review on. Lay the shaft first, in the same tick's log if you like: the
   *     accumulator sees a `layStair` from earlier in the batch.
   *
   * **NEITHER NUMBER IS SHIPPED AND NEITHER IS DERIVED.** No content declares a lift and no
   * harness issues this command, so `world.lift` is `null` in every world this build produces.
   * Every capacity in this repository today is a TEST FIXTURE. G-038b-ii owns the dial, and
   * ADR-0075 says why it cannot be settled here: the congestion a lift manages does not occur at
   * any workload this project can currently produce, so no capacity would be derivable from a
   * stated requirement (§2.1).
   *
   * THERE IS NO `removeLift` YET, deliberately, and it is `layStair`'s reason exactly: a plan
   * that can only grow is enough for a rule that only reads it. Removal lands with the ruling on
   * what happens to the guests standing in the line when it goes.
   */
  | {
      readonly kind: 'installLift';
      readonly capacity: number;
      readonly waitToleranceTicks: number;
    }
  /**
   * One guest walks in (G-004).
   *
   * NO PAYLOAD. A guest has no archetype (M6) and no party size at M0, so there is
   * nothing for a caller to choose: every arrival is the same event. The needs it forms, the
   * capacities they decay through and the tolerance it waits under all come from content, and
   * the id it gets is allocated by the guest store, not by the caller — the same division
   * `spawnEntity` uses.
   *
   * Arrival is a COMMAND rather than something the simulation decides, because how
   * often guests turn up is demand, and demand is M4. Keeping it out here means the
   * command log fully describes who arrived and when (I2), and a test can put a guest
   * in the lobby on an exact tick without a demand model to argue with.
   */
  | { readonly kind: 'guestArrives' }
  /**
   * THE PLAYER BORROWS (G-011). The last exit from the dead state ADR-0011 closes.
   *
   * NO PAYLOAD. How much a loan is and what it costs are the economy's numbers, in
   * content, not the caller's choice — the same division `guestArrives` uses.
   *
   * REFUSED, RECORDED IN `World.loanOutcomes`, NEVER THROWN, when this content offers no
   * loan or when the hotel is not stuck — "stuck" being `balance + what every room would
   * refund < the cheapest room this content can build". A host may therefore issue this on
   * a blind cadence: it is refused harmlessly on every tick except the ones where it is
   * actually needed, which is what makes a schedule that cannot observe the balance safe.
   *
   * Deliberately available WHILE A DEBT IS OUTSTANDING. See the header of `loan.ts`: a
   * one-loan-at-a-time rule re-opens the absorbing state this goal exists to close.
   */
  | { readonly kind: 'drawLoan' };

export type ScheduledCommand = {
  /** Tick at which this command is applied. */
  readonly tick: number;
  readonly command: Command;
};
