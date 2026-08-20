// THE HUD AND THE TRANSPORT CONTROL (G-030).
//
// Plain DOM, deliberately: this is text, and text in a WebGL scene graph costs more and
// reads worse. Nothing here holds simulation state — every field is recomputed from the
// world it is handed, and the only things that survive a frame are which rung is selected
// and whether the game is paused, both of which are transport rather than simulation.
//
// EVERY NUMBER IS DERIVED, NEVER STORED. The balance is a fold over the ledger (I4: "cash
// balance is derived by folding transactions, never stored and mutated"), the day and the
// clock are computed from the tick, and the counts are computed from the store. A HUD that
// cached any of them would be a second source of truth for the thing the player is watching.

import {
  balanceOf,
  BUILD_REFUSAL_REASONS,
  constructionCostOf,
  dayOf,
  departedGuests,
  departureCountOf,
  describeCell,
  GUEST_DEPARTURE_REASONS,
  guestCount,
  needTypesInOrder,
  needOutcomeOf,
  TICKS_PER_DAY,
  totalRefusals,
} from '@hotelsim/sim';
import type { BoundContent, Guest, RoomTypeData, World } from '@hotelsim/sim';
import type { SpeedRung } from '@hotelsim/content';
import { describeAction } from './session.js';
import type { ResolvedAction } from './session.js';
import type { Tool } from './input.js';

/** Where a guest is, as text, so a screenshot can be checked against the picture. */
export function describeGuestPosition(guest: Guest): string {
  return `#${guest.id} ${describeCell(guest.at)}`;
}

/** Integer minor units in one pound (ADR-0002: money is pence, never a float). */
const PENCE_PER_POUND = 100;
/** In-game minutes in an in-game hour. A clock face, not a play speed. */
const MINUTES_PER_HOUR = 60;

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * A camelCase code-level name as words — `gaveUp` becomes "gave up".
 *
 * These are NOT content ids (`guests.ts` is explicit: they are camelCase, decided by a
 * branch, and meaningless to a designer editing JSON), so there is nothing to look up and
 * no content to read them from. Splitting the identifier is the honest way to show a union
 * this layer must not enumerate — and it means a reason added tomorrow is legible tonight.
 */
export const wordsOf = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').toLowerCase();

/**
 * The tick as a day and a wall clock. `TICKS_PER_DAY` is IMPORTED from the simulation
 * rather than copied — `tools/viewer/viewer.js:43-56` had to duplicate it and recorded the
 * duplication as a coupling nothing could keep in step, because the viewer may not import
 * the sim. The renderer may, so it does, and the clock cannot drift from the tick.
 */
export function clockOf(world: World): string {
  const minutes = world.tick % TICKS_PER_DAY;
  return `day ${dayOf(world) + 1}  ${pad(Math.floor(minutes / MINUTES_PER_HOUR))}:${pad(minutes % MINUTES_PER_HOUR)}`;
}

/** Pence to pounds, for display only. The arithmetic below never re-enters the ledger. */
export function moneyOf(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const absolute = Math.abs(pence);
  return `${sign}£${Math.floor(absolute / PENCE_PER_POUND).toLocaleString('en-GB')}.${pad(absolute % PENCE_PER_POUND)}`;
}

export type HudState = {
  readonly world: World;
  /** Needed to name needs in the content's own words rather than by id (ADR-0003). */
  readonly content: BoundContent;
  readonly crowdedOut: number;
  readonly invalidRooms: number;
  readonly rooms: number;
  readonly fps: number;
  /** How many of the player's commands are clicked and not yet spent (G-031a). */
  readonly queued: number;
  /** The last one the simulation answered, or `null` if the player has not acted yet. */
  readonly lastAction: ResolvedAction | null;
  /**
   * Guests standing on a floor that is not the one being drawn (G-035).
   *
   * ONE FLOOR AT A TIME MEANS MOST OF THE HOTEL IS OFF SCREEN, and §6.1's first render defect
   * is "UI that cannot express a state the sim can reach". A guest nobody can see and nobody
   * is told about is exactly that. The floor switcher carries the per-floor counts; this cell
   * carries the total, so a watcher looking at an empty floor knows whether the hotel is empty
   * or whether they are on the wrong floor.
   */
  readonly guestsElsewhere: number;
};

const cell = (key: string, value: string): string =>
  `<span><span class="k">${key}</span> <span class="v">${value}</span></span>`;

/**
 * THE GUEST LOOP'S OUTCOME — arrived, satisfied, gave up, evicted.
 *
 * ---------------------------------------------------------------------------------------
 * IT WAS NOT ON SCREEN AT ALL, AND THE SCREEN ACTIVELY MISLED. `render-critic` measured the
 * shipped scenario at tick 4,320, seed 7: every departure read `satisfied`, while
 * `guest_comfort` read **15 met / 17 unmet / 11 abandoned** — over half that need's
 * instances failing. A watcher reading this HUD concluded the hotel was healthy on the need
 * the simulation says it is worst at.
 *
 * A guest vanishing with nothing said about why is §6.1's "UI that cannot express a state
 * the sim can reach", pointed at the terminal state of the loop the whole milestone exists
 * to get feedback on. Deferring it to M4 was available and was refused: ADR-0018 opened this
 * directory to get feedback on THIS loop, and a renderer that cannot show the loop's outcome
 * fails its own reason for existing.
 *
 * BOTH HALVES ARE SHOWN, AND THE SECOND IS WHY. The ruling asked for one cell folding
 * `guestOutcomes`; on its own that would have reported "12 satisfied, 0 gave up" and still
 * hidden the failing needs, because the two disagree — which is exactly the disagreement
 * that produced the finding. The need tally is what makes the departures readable.
 *
 * EVERY FIGURE IS DERIVED AT READ TIME from hashed state (`world.guestOutcomes`,
 * `world.needOutcomes`) and nothing is accumulated here. The HUD holds no counter of its own,
 * which is the same rule the balance follows (I4).
 * ---------------------------------------------------------------------------------------
 */
function outcomeCells(world: World, content: BoundContent): readonly string[] {
  const outcomes = world.guestOutcomes;
  const left = departedGuests(outcomes);
  // EVERY REASON THE SIMULATION DEFINES, READ FROM THE SIMULATION'S OWN LIST — no reason is
  // named in this file.
  //
  // IT WAS NAMED HERE FOR ABOUT TEN MINUTES AND TRACK B RENAMED IT UNDERNEATH. ADR-0017
  // replaces "a stay ends when a need completes" with two terminators, so `satisfied` became
  // `checkedOut` and `gaveUpWaiting` became `gaveUp` while this HUD was being written. A
  // renderer that spells the sim's unions out is a renderer that goes red every time the sim
  // renames one — and worse, a renderer that MISSES one silently when a reason is ADDED,
  // which is §6.1's "UI that cannot express a state the sim can reach" arriving by omission
  // rather than by design. Folding the exported list means a new terminator gets a visual the
  // day it exists, with no edit here.
  const rows = GUEST_DEPARTURE_REASONS.map((reason) => ({
    reason,
    count: departureCountOf(outcomes, reason),
  })).filter((row) => row.count > 0);
  const stays = [
    `${outcomes.arrived} arrived`,
    ...rows.map((row) => `${row.count} ${wordsOf(row.reason)}`),
    ...(left === 0 ? ['none left yet'] : []),
  ].join(' · ');

  // One entry per need, in the content's own ascending order — the same order the guests'
  // vectors are drawn in, so a column on screen and a word here are the same need.
  //
  // THE DENOMINATOR IS `met + unmet` AND `abandoned` IS NOT IN IT, because they are counted
  // in DIFFERENT UNITS and the first draft of this line added them together. `met` and
  // `unmet` are INSTANCES, tallied once per need per departing guest — they sum to the
  // departed-guest count for every need, which is how the error was caught. `abandoned` is
  // an EVENT, incremented every time a guest walks out on a provider, so one guest can
  // contribute several. Adding them produced "Comfort 15/43" for a need with 32 instances:
  // a figure with no referent, reading worse than the truth. §4.1's rule — ANY COUNT NAMES
  // ITS UNIT — is written about digests and applies exactly here.
  const needs = needTypesInOrder(content)
    .map((needType) => {
      const row = needOutcomeOf(world.needOutcomes, needType.id);
      if (row === undefined) return '';
      const instances = row.met + row.unmet;
      const walkouts = row.abandoned > 0 ? ` (${row.abandoned} walk-outs)` : '';
      return `${needType.name} ${row.met}/${instances}${walkouts}`;
    })
    .filter((text) => text !== '')
    .join(' · ');

  return [cell('stays', stays), needs === '' ? '' : cell('needs met', needs)];
}

/**
 * THE BUILD LOOP'S OWN OUTCOME — built, demolished, and every refusal by reason (G-031a).
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS HALF OF "A REFUSAL IS VISIBLE", AND IT IS THE HALF THAT SURVIVES A RELOAD.
 *
 * Every figure is derived at read time from `world.buildOutcomes`, which is hashed, saved
 * state — so the tally is the simulation's own count of what it refused, not a number this
 * layer accumulated while watching. The other half is the last-action line below, which says
 * WHICH move was refused and where; that one is render-side and ephemeral, because the
 * simulation does not record it (`build.ts:140-149` — per-command acknowledgement is parked,
 * and this goal may not add it).
 *
 * Between them the player can answer both questions a refusal raises: what just happened to
 * the thing I clicked, and how often has this been happening.
 *
 * NO REASON IS SPELLED IN THIS FILE. `BUILD_REFUSAL_REASONS` is folded, exactly as
 * `GUEST_DEPARTURE_REASONS` is folded above and for the reason recorded there: a reason
 * added to the simulation tomorrow gets a visual the day it exists, and one renamed on
 * another track does not silently vanish from the screen.
 * ---------------------------------------------------------------------------------------
 */
function buildCells(world: World): readonly string[] {
  const outcomes = world.buildOutcomes;
  const refused = totalRefusals(outcomes);
  const reasons = BUILD_REFUSAL_REASONS.filter((reason) => outcomes.refused[reason] > 0)
    .map((reason) => `${outcomes.refused[reason]} ${wordsOf(reason)}`)
    .join(' · ');
  return [
    cell('built', `${outcomes.built} · ${outcomes.demolished} demolished`),
    refused === 0 ? '' : cell(`refused ${refused}`, reasons),
  ];
}

export function renderHud(host: HTMLElement, state: HudState): void {
  const { world } = state;
  host.innerHTML = [
    cell('', clockOf(world)),
    cell('cash', moneyOf(balanceOf(world.ledger))),
    cell('guests', String(guestCount(world.guests))),
    cell('rooms', `${state.rooms - state.invalidRooms}/${state.rooms} valid`),
    ...outcomeCells(world, state.content),
    ...buildCells(world),
    cell('tick', String(world.tick)),
    cell('fps', String(Math.round(state.fps))),
    state.crowdedOut > 0 ? cell('not drawn', `${state.crowdedOut} guest(s) — tile too narrow`) : '',
    state.guestsElsewhere > 0 ? cell('off this floor', `${state.guestsElsewhere} guest(s)`) : '',
    state.queued > 0 ? cell('queued', `${state.queued} waiting for the next tick`) : '',
    // THE LAST MOVE, AND IT NEVER EXPIRES. A message that fades is a message a player can
    // miss by looking at the building instead of the bar — and the one thing they most need
    // to see is the refusal they did not expect. It is superseded by the next action and by
    // nothing else.
    state.lastAction === null ? '' : cell('last', describeAction(state.lastAction, wordsOf)),
  ].join('');
}

/**
 * WHERE EACH GUEST IS, AS TEXT.
 *
 * IT IS HERE TO MAKE A PERCEPTUAL CRITERION CHECKABLE, which is ADR-0013's whole subject.
 * G-030's criterion is "a guest is drawn at `guest.at`" — a claim about pixels that no test
 * in this repository can reach, because `apps/game` is playtested rather than unit tested
 * (§3) and vitest excludes it. A screenshot alone is an assertion; a screenshot in which the
 * HUD names the floor and column of a guest, beside a picture with a guest in that square,
 * is EVIDENCE a reader who was not there can check.
 *
 * Truncated, because a full hotel would fill the strip and the point is checkability rather
 * than a census.
 */
export function renderGuestPositions(host: HTMLElement, world: World, limit: number): void {
  const guests = world.guests.list;
  if (guests.length === 0) {
    host.textContent = 'no guests yet';
    return;
  }
  const shown = guests.slice(0, limit).map(describeGuestPosition).join('   ');
  host.textContent = guests.length > limit ? `${shown}   … +${guests.length - limit} more` : shown;
}

export type TransportHandlers = {
  readonly onSelect: (rungId: string) => void;
  readonly onTogglePause: () => void;
};

/**
 * ONE BUTTON PER RUNG, IN THE ORDER CONTENT DECLARES THEM, LABELLED BY CONTENT.
 *
 * ---------------------------------------------------------------------------------------
 * THIS IS THE CRITERION, SO IT IS WORTH BEING EXPLICIT ABOUT WHAT IS AND IS NOT HAPPENING.
 *
 *   The label is `rung.name`. It is not assembled here, and no string in this file is a
 *   speed. Format rule 1 (§2.1.1) is that a rung carries its own name so LABELS TRAVEL WITH
 *   VALUES: rename a rung in JSON and this button renames itself.
 *
 *   The unit is `rung.ticksPerRealSecond` printed as itself. Not scaled, not compared to
 *   another rung, not turned into an "x". Format rule 2 is that NOTHING MAY COMPUTE ONE
 *   RUNG FROM ANOTHER, and the failure the human's ruling actually names is "M5 hardcodes
 *   1x/2x/3x against content that does not mean that, and the first rebalance produces a UI
 *   that lies about itself". `pnpm check:ladder` is the instrument that stops that coming
 *   back; this is the code it is watching.
 *
 *   Showing the raw ticks/s beside the name is the viewer's finding and it survives the
 *   move: a button that says only "Fast" cannot be checked against §2.1.2's arithmetic by
 *   anybody reading the screen.
 *
 * PAUSE IS NOT A RUNG AND IS DRAWN APART FROM THEM. §2.1.1: "Pause is BENEATH the ladder and
 * is NOT a rung: it is a transport state, not a rate. M5 must not read this table as the
 * complete set of transport states." So it is a separate control, it has no id in the JSON,
 * and selecting a rung does not un-pause by accident.
 * ---------------------------------------------------------------------------------------
 */
export function renderTransport(
  host: HTMLElement,
  rungs: readonly SpeedRung[],
  selectedId: string | null,
  paused: boolean,
  handlers: TransportHandlers,
): void {
  host.replaceChildren();

  const pause = document.createElement('button');
  pause.textContent = paused ? 'play' : 'pause';
  pause.classList.toggle('on', paused);
  pause.title = 'a transport state, not a speed (HOTELSIM.md §2.1.1)';
  pause.addEventListener('click', handlers.onTogglePause);
  host.append(pause);

  for (const rung of rungs) {
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = rung.name;
    const unit = document.createElement('span');
    unit.className = 'u';
    unit.textContent = `${rung.ticksPerRealSecond}/s`;
    button.append(name, ' ', unit);
    button.title = `${rung.ticksPerRealSecond} simulated ticks per real second`;
    button.classList.toggle('on', rung.id === selectedId);
    button.addEventListener('click', () => handlers.onSelect(rung.id));
    host.append(button);
  }

  const note = document.createElement('span');
  note.className = 'k';
  note.textContent = 'one tick = one in-game minute';
  host.append(note);
}

export type ToolHandlers = {
  readonly onPick: (tool: Tool) => void;
  readonly onExport: () => void;
};

/**
 * THE BUILD TOOLS — one button per room type the content defines, plus demolish (G-031a).
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE SPEED CONTROL'S RULE APPLIED TO A SECOND TABLE, AND DELIBERATELY SO.
 *
 *   The label is `roomType.name`, read from content. No room is named in this file, no id
 *   is spelled anywhere in `apps/game` (ADR-0003, `check:content`), and a room renamed in
 *   JSON renames its button with no edit here.
 *
 *   The price is `constructionCostPence` printed as itself — the simulation's own
 *   `constructionCostOf`, not a copy of the JSON field and not arithmetic over it. It is
 *   shown because a player deciding what to build is spending money they can see in the
 *   HUD, and a button that hides its price makes `insufficientFunds` look like a bug.
 *
 *   EVERY room type gets a button, including the ones that provide nothing. A hotel of
 *   lounges is a bad hotel and the player is allowed to build one — `build.ts` is explicit
 *   that "the player is allowed to build a bad room, finds out that it houses nobody while
 *   still costing upkeep, and is told why". A toolbar that offered only the good rooms
 *   would be this layer making a balance decision.
 *
 * NO TOOL IS SELECTED AT START. A game whose first stray click spends a quarter of the
 * opening capital is a game that punishes looking around.
 * ---------------------------------------------------------------------------------------
 */
export function renderTools(
  host: HTMLElement,
  content: BoundContent,
  roomTypes: readonly RoomTypeData[],
  tool: Tool,
  handlers: ToolHandlers,
): void {
  host.replaceChildren();

  const label = document.createElement('span');
  label.className = 'k';
  label.textContent = 'build';
  host.append(label);

  for (const roomType of roomTypes) {
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = roomType.name;
    const price = document.createElement('span');
    price.className = 'u';
    price.textContent = moneyOf(constructionCostOf(content, roomType.id));
    button.append(name, ' ', price);
    button.classList.toggle('on', tool?.kind === 'build' && tool.roomType.id === roomType.id);
    button.addEventListener('click', () => handlers.onPick({ kind: 'build', roomType }));
    host.append(button);
  }

  const demolish = document.createElement('button');
  demolish.textContent = 'demolish';
  demolish.title = 'click a room to demolish it; the refund is a content number';
  demolish.classList.toggle('on', tool?.kind === 'demolish');
  demolish.addEventListener('click', () => handlers.onPick({ kind: 'demolish' }));
  host.append(demolish);

  const none = document.createElement('button');
  none.textContent = 'none';
  none.title = 'put the tool down (Escape)';
  none.classList.toggle('on', tool === null);
  none.addEventListener('click', () => handlers.onPick(null));
  host.append(none);

  // THE SESSION LOG, ON DEMAND. G-031b replays this file headless and compares hashes; it
  // is a button rather than an automatic write because `hashState` canonicalises the whole
  // world and nothing should pay that once a frame.
  const save = document.createElement('button');
  save.textContent = 'export session';
  save.title = 'the seed, the command log and the state hash — G-031b replays it headless';
  save.addEventListener('click', handlers.onExport);
  host.append(save);
}

export type FloorHandlers = {
  readonly onSelect: (floor: number) => void;
};

/**
 * THE FLOOR SWITCHER (G-035) — one button per floor, with how many guests are standing on it.
 *
 * ---------------------------------------------------------------------------------------
 * "MULTI-FLOOR, ONE FLOOR RENDERED AT A TIME, FLOORS SWITCHABLE" (`HOTELSIM.md` §1). This is
 * the control that makes the second half of that sentence true, and it carries a second job
 * that is not decoration.
 *
 * THE GUEST COUNT IS ON THE BUTTON BECAUSE OF §6.1'S FIRST ENTRY. Drawing one floor hides
 * every guest on every other one, and "a UI that cannot express a state the sim can reach" is
 * the defect this layer is judged against. With the count, an empty-looking hotel is
 * distinguishable from a hotel the player is looking at the wrong floor of — one glance,
 * no arithmetic.
 *
 * THE FLOORS COME FROM `floorsOf`, WHICH READS THE WORLD. Not from `DEFAULT_MIN_FLOOR`, and
 * not from a range this file picks: a save carries its own plot, and the shipped constants do
 * not describe every world (G-023a's own defect, kept as a rule).
 *
 * DESCENDING, so the top of the building is at the top of the list. That is the one place
 * this control is allowed to have an opinion, and it is the same opinion a lift panel has.
 * ---------------------------------------------------------------------------------------
 */
export function renderFloors(
  host: HTMLElement,
  floors: readonly number[],
  selected: number,
  guestsOn: (floor: number) => number,
  handlers: FloorHandlers,
): void {
  host.replaceChildren();

  const label = document.createElement('span');
  label.className = 'k';
  label.textContent = 'floor';
  host.append(label);

  for (const floor of [...floors].sort((a, b) => b - a)) {
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = String(floor);
    const count = guestsOn(floor);
    button.append(name);
    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'u';
      badge.textContent = ` ${count}`;
      badge.title = `${count} guest(s) standing on floor ${floor}`;
      button.append(badge);
    }
    button.title = floor < 0 ? `basement ${-floor}` : `floor ${floor}`;
    button.classList.toggle('on', floor === selected);
    button.addEventListener('click', () => handlers.onSelect(floor));
    host.append(button);
  }
}
