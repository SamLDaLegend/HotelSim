// G-017 — the replay viewer. Disposable (ADR-0013 §1). Delete it rather than defend it.
//
// It reads recorded frames from a COMPLETED run. There is no simulation on this page, so
// "it cannot act" is structural: there is nothing to send a command to. Nothing here
// imports packages/sim, and viewer.readonly.test.ts asserts that mechanically.
//
// Everything drawn is read out of the frame's own bytes. The only judgement this file
// makes that the simulation does not is COLOUR — see PALETTE.

// ---------------------------------------------------------------------------------
// PALETTE — the one thing here that is a viewer decision rather than a fact of the save.
//
// KEYED BY CONTENT ID, NOT BY CONTENT ORDER, and the difference is the point. Colour as a
// function of a type's position in room-types.json means a room type CHANGES COLOUR when
// somebody adds another one — which would silently invalidate every WATCH note in
// JOURNAL.md that says "the green room served nobody". Those notes are the artefact this
// viewer exists to produce, so their vocabulary has to be stable across content edits.
// (G-012's defect lived in exactly this coupling: a scenario built from sort order.)
//
// The literals are content IDs and they are deliberate. ADR-0003 bans them in
// packages/sim and apps/game; tools/viewer is neither, and check:content does not scan
// here. An id with no entry is drawn MAGENTA and announced in the header, so new content
// is loud rather than quietly grey.
//
// FINDING, recorded rather than worked around: content cannot express a colour for a room
// type, and adding one would move the content fingerprint, which this goal forbids. So
// this table lives in the viewer. M5 has to decide where it belongs for real.
const PALETTE = {
  standard_room: '#3f6fb5',
  hotel_lounge: '#7d5aa8',
  games_room: '#c1793a',
  hotel_cafe: '#3f9c72',
  single_bed: '#dfe4ea',
  arm_chair: '#c39ae0',
  vending_machine: '#e8bf46',
  night_rest: '#6fa8dc',
  guest_comfort: '#c39ae0',
  guest_entertainment: '#e8963a',
  guest_nourishment: '#5fc79a',
};
const UNKNOWN = '#ff00ff';

// TWO CONSTANTS COPIED FROM THE SIMULATION, RECORDED AS COUPLINGS RATHER THAN HIDDEN.
//
// The viewer may not import `packages/sim` — that is what makes "it cannot act"
// structural — so these are duplicated deliberately and cannot be kept in step by any
// mechanism. `viewer.readonly.test.ts` narrows its banned-identifier list to spare exactly
// these two names, and this note is what makes that justification true.
//
// If either moves in the sim, nothing goes red: the viewer just draws the wrong thing
// quietly, which for the clock means every recorded run is mislabelled by day and hour.

/** `NO_ENTITY` — packages/sim/src/entities.ts. Ids start at 1, so 0 means "no room yet". */
const NO_ENTITY = 0;
/** `TICKS_PER_DAY` — `packages/sim/src/world.ts`. One tick is one in-game minute. */
const TICKS_PER_DAY = 1440;

const el = (id) => document.getElementById(id);
const canvas = el('view');
const ctx = canvas.getContext('2d');

const unknownIds = new Set();
function colourOf(id) {
  const c = PALETTE[id];
  if (c !== undefined) return c;
  unknownIds.add(id);
  return UNKNOWN;
}

// ---------------------------------------------------------------------------------
// CONTENT. The need-type fields this file reads are `id`, `name`, `role` and `capacityTicks`,
// and they come from the shipped JSON rather than from literals here, so a balance edit cannot
// leave this file quietly disagreeing with the simulation that produced the recording. Colour
// does not, for the reason above.
//
// THAT LIST SAID "patience" UNTIL θ-a'S UNPINNED-CLAIM PASS, and ADR-0017 left no such field:
// a file header naming a field that `loadContent` directly below it does not read, in one of
// the four surfaces `packages/sim/src/needs.ts`'s header calls first-contact. It is no longer
// spelled on trust. `tools/headless/src/prose-citations.test.ts` reads the backticked names
// out of the line above, requires every one to be a key on every entry of `need-types.json`,
// and requires the list to be exactly the set of that file's keys this file names as a
// property — so a field added to the list, dropped from it, or renamed in content reddens.

const content = { rooms: new Map(), items: new Map(), needs: new Map(), lodgingNeedId: null, speeds: [] };

async function loadContent() {
  const [rooms, items, needs, speeds] = await Promise.all(
    ['room-types', 'item-types', 'need-types', 'speed-ladder'].map((n) =>
      fetch(`/content/${n}.json`).then((r) => r.json()),
    ),
  );
  for (const r of rooms) content.rooms.set(r.id, r);
  for (const i of items) content.items.set(i.id, i);
  for (const n of needs) {
    content.needs.set(n.id, n);
    if (n.role === 'lodging') content.lodgingNeedId = n.id;
  }
  // THE PLAY SPEEDS COME FROM CONTENT (G-021), LABELS AND ALL. This page does not validate
  // them — `packages/content`'s schema and `tools/gates/lib/speed-ladder.mjs` do that, and
  // the viewer is disposable. A ladder this cannot read renders no speed buttons, which is
  // visible rather than silent; a default invented here would be the defect the goal
  // removed, one directory over.
  content.speeds = speeds;
}

/**
 * HOW FULL THIS NEED'S STOCK IS, 0..1 (G-027b) — or `null` when the loaded content does not
 * define the need at all, which makes the question unanswerable.
 *
 * THE PICTURE IS THE SAME AND THE QUANTITY BEHIND IT IS NEW. It used to be patience remaining
 * over patience; a need is a LEVEL now, so it is `1 - deficit/capacity`. A full bar still means
 * a contented guest.
 *
 * IT WAS CALLED `patienceFractionOf` UNTIL θ-a SWEEP 3, and the name was the last thing in
 * either renderer still asserting the deleted model — a docstring can be fenced in the past
 * tense and an identifier cannot, so it was renamed rather than annotated. That is R1's own
 * lesson applied to the surface a reader meets FIRST.
 *
 * IT RETURNS null RATHER THAN 1, AND THE DIRECTION OF THE OLD BUG IS THE WHOLE POINT. It
 * used to be `patience ? remaining / patience : 1`, so a need whose id the content does not
 * carry — a recording made under different content — drew a FULL bar: a need with nothing left
 * rendered as the healthiest state on screen. Silent, and in the reassuring
 * direction, which is the worst direction for an instrument whose output becomes evidence.
 * The caller paints these magenta, exactly as `colourOf` paints an unknown id, and the id
 * is announced in the header.
 */
function stockFractionOf(need) {
  const capacity = content.needs.get(need.needId)?.capacityTicks;
  if (typeof capacity !== 'number' || capacity <= 0) {
    unknownIds.add(need.needId);
    return null;
  }
  return clamp(1 - need.deficit / capacity, 0, 1);
}

/** A need nothing has left in it. The stock-model successor to "patience ran out". */
function isEmpty(need) {
  const capacity = content.needs.get(need.needId)?.capacityTicks;
  return typeof capacity === 'number' && need.deficit >= capacity;
}

/**
 * `isNeedWanted(needType, need, wantAtBasisPoints, true)` — the sim's predicate at the ONE arm
 * this file asks it on: a need something is already serving.
 *
 * ALL THREE BRANCHES, because a transcription that quotes two of three is one a reader cannot
 * check (θ-a sweep 3 — both transcriptions in this file quoted the first and the last). Quoted
 * to the byte, INCLUDING the parameter name, because that is what lets a test compare them
 * against the sim's own source: `prose-citations.test.ts` lifts the branch lines out of
 * `isNeedWanted` and requires both transcriptions in this file to contain each one.
 *
 *     if (need.deficit <= 0) return false;
 *     if (needType === undefined) return true;
 *     return beingServed || need.deficit >= wantLineOf(needType, wantAtBasisPoints);
 *
 * Reading them in order: full is never wanted; an unknown id always is; and the last is the
 * trigger itself.
 *
 * With `beingServed` true, the second and third branches both answer TRUE for any need that got
 * past the first — so the whole of it is exactly "not full", and the middle branch changes no
 * answer at this arm. It is quoted anyway: the reader checking that claim has to be able to see
 * the branch they are checking. The want line is deliberately absent from the body rather than
 * computed and ignored: a line this file could get wrong is a line this file should not hold.
 * See the block at the call site in `drawGuest` for why it is transcribed rather than imported,
 * and for what would make it wrong.
 */
function isWantedWhileServed(need) {
  return need.deficit > 0;
}

const isRoom = (kind) => content.rooms.has(kind);
const nameOf = (kind) => content.rooms.get(kind)?.name ?? content.items.get(kind)?.name ?? kind;
const initialsOf = (kind) =>
  nameOf(kind)
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

// ---------------------------------------------------------------------------------
// THE RECORDING. Held as TEXT and parsed one frame at a time.
//
// A 30-day recording at --record-every 10 is 55.7 MB and 4,321 frames. Parsing all of it
// up front would hold thousands of worlds in memory for no reason; parsing the displayed
// frame costs well under a millisecond, so the scrubber and the speed control both stay
// smooth on a file this size. The cache is small and exists only to stop a slow scrub
// re-parsing the same frame every animation frame.

const rec = { lines: [], cache: new Map(), everyTicks: 1, extent: null };

// A RAW `JSON.parse`, AND IT DOES NOT MIGRATE (G-015). `deserialise` lives in the sim and
// runs the v1->v8 chain; this reads the `world` object straight out of the line. So a
// recording made by an older build shows whatever fields that build wrote, and the HUD
// below — which reads the v8 outcome TABLE — will show em-dashes for a pre-v8 recording
// rather than counts. That is the honest failure and it is not worth fixing: recordings are
// disposable, the viewer is disposable (§9), and wiring a migration chain into it is the
// first sentence of the story where this becomes a second renderer.
/**
 * The save schema this viewer reads (G-027b).
 *
 * A LITERAL, NOT AN IMPORT, and that is the viewer's whole relationship with the sim: it is a
 * plain script served to a browser with no build step, so it cannot import `SAVE_SCHEMA_VERSION`
 * and must not pretend otherwise. The cost is that this number is a SECOND COPY and can go
 * stale — which is exactly what `frameAt` turns into a loud refusal rather than a silent
 * mis-draw. A stale copy here refuses every recording, including the good ones, which is a
 * five-minute repair with a message pointing at it.
 */
const VIEWER_SCHEMA_VERSION = 19;

function frameAt(i) {
  const hit = rec.cache.get(i);
  if (hit !== undefined) return hit;
  const blob = JSON.parse(rec.lines[i]);
  // THE VERSION IS READ BEFORE THE FIELDS, AND THE FAILURE STAYS LOUD (G-027b). Under v13 a
  // need carries `deficit`; a v12 frame carries `progressRemaining`, so `n.deficit` reads
  // `undefined`, every threshold comparison is false, and the whole need table renders
  // PLAUSIBLY AND WRONG in silence. There are v12 recordings in this repo and they are a
  // goal's baseline evidence. One comparison, one message, and NO migration chain: wiring one
  // in is the first sentence of the story where this becomes a second renderer (§9).
  if (blob.schemaVersion !== VIEWER_SCHEMA_VERSION) {
    throw new Error(
      `that recording is save schema ${blob.schemaVersion}, and this viewer reads ${VIEWER_SCHEMA_VERSION}. ` +
        'Re-record it; the fields a need carries changed, and drawing it anyway would show a plausible hotel ' +
        'that is not the hotel that ran.',
    );
  }
  const world = blob.world;
  rec.cache.set(i, world);
  if (rec.cache.size > 24) rec.cache.delete(rec.cache.keys().next().value);
  return world;
}

function loadRecording(text) {
  rec.lines = text.split('\n').filter((l) => l.length > 0);
  rec.cache.clear();
  if (rec.lines.length === 0) throw new Error('that file has no frames in it');
  const first = frameAt(0);
  rec.everyTicks = rec.lines.length > 1 ? frameAt(1).tick - first.tick : 1;
  rec.extent = extentOf(first, frameAt(rec.lines.length - 1));
  el('scrub').max = String(rec.lines.length - 1);
  el('scrub').disabled = false;
  // THE FINGERPRINT IS DISPLAYED AND CANNOT BE CHECKED, AND THE LABEL SAYS SO.
  //
  // Every frame carries `contentHash`, but recomputing it needs the simulation, which this
  // page may not import. So a recording made under DIFFERENT content loads silently: room
  // types get the wrong names, and every need bar is drawn against the wrong denominator.
  // A JOURNAL.md note taken from that is wrong with no warning anywhere — so the warning is
  // here, permanently, rather than implied. Reported as a serialiser finding; not fixable
  // from inside the viewer.
  el('status').textContent =
    `${rec.lines.length} frames · every ${rec.everyTicks} tick(s) · ` +
    `${(text.length / 1048576).toFixed(1)} MB · content ${first.contentHash} ` +
    `(UNVERIFIED — the viewer cannot recompute a fingerprint, so it cannot tell you this ` +
    `recording was made under the content now loaded)`;
  setFrame(0);
}

/**
 * The rectangle of plot worth drawing, fixed for the whole recording.
 *
 * NOT A CAMERA — there is no control and no state, and a camera is out of scope. The plot
 * is 80 columns wide and these hotels use twelve of them, so drawing all 80 would put the
 * whole building in a corner. Computed from the first and last frames together so it
 * covers anything built during the run, and it never moves while watching, which a
 * per-frame fit would.
 *
 * IT COVERS GUEST POSITIONS TOO SINCE G-023a, and not only rooms. A guest can now stand
 * somewhere nothing is built — the entrance is `minColumn`, and a hotel built at column 30
 * would have put its waiting guests outside the drawn rectangle and shown a watcher an empty
 * lobby. THE RESIDUAL LIMIT, STATED RATHER THAN LEFT TO BE FOUND: only the first and last
 * frames are sampled, so a guest who stands somewhere unique in the MIDDLE of a run is still
 * off-view. That is the same sampling the room extent has always used, and widening it is a
 * camera, which is out of scope.
 */
function extentOf(first, last) {
  let minC = Infinity, maxC = -Infinity, minF = 0, maxF = 0;
  for (const world of [first, last]) {
    for (const e of world.entities.list) {
      if (e.at === null) continue;
      minC = Math.min(minC, e.at.column);
      maxC = Math.max(maxC, e.at.column);
      minF = Math.min(minF, e.at.floor);
      maxF = Math.max(maxF, e.at.floor);
    }
    for (const guest of world.guests.list) {
      const at = guest.at;
      if (at === undefined || at === null) continue;
      minC = Math.min(minC, at.column);
      maxC = Math.max(maxC, at.column);
      minF = Math.min(minF, at.floor);
      maxF = Math.max(maxF, at.floor);
    }
  }
  if (minC === Infinity) { minC = 0; maxC = 8; }
  const g = first.grid;
  return {
    minC: Math.max(g.minColumn, minC - 1),
    maxC: Math.min(g.maxColumn, maxC + 1),
    minF: Math.max(g.minFloor, minF - 1),
    maxF: Math.min(g.maxFloor, maxF + 1),
  };
}

// ---------------------------------------------------------------------------------
// DRAWING. Side-on cross-section: columns left to right, floors bottom to top.

const MARGIN = 10;
// THE STRIP BELOW THE BUILDING IS GONE (G-023a), along with the height it reserved and the
// `bottom` coordinate that positioned it. It existed because a guest holding nothing had no
// position in the save and had to be drawn SOMEWHERE; `Guest.at` is now non-nullable, so
// every guest is drawn on the plot and there is nothing left for a strip to hold. Deleted
// rather than kept empty: this instrument is disposable, and a feature nobody can reach is
// the first thing to remove (§9).
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function geometry() {
  const { minC, maxC, minF, maxF } = rec.extent;
  const cols = maxC - minC + 1;
  const rows = maxF - minF + 1;
  const cw = clamp((canvas.width - 2 * MARGIN) / cols, 10, 120);
  const ch = clamp((canvas.height - 2 * MARGIN) / rows, 16, 130);
  return {
    cw, ch, minC, maxC, minF, maxF,
    x: (col) => MARGIN + (col - minC) * cw,
    y: (floor) => MARGIN + (maxF - floor) * ch,
  };
}

function draw(world) {
  const g = geometry();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The building's shell: one band per floor, the earth below street level tinted, and a
  // heavy line at grade. A room with nothing between it and the earth is then visibly
  // floating, which is the G-009 defect the charter says would have been obvious on sight.
  const right = g.x(g.maxC) + g.cw;
  for (let f = g.minF; f <= g.maxF; f += 1) {
    const yy = g.y(f);
    if (f < 0) { ctx.fillStyle = '#1b1712'; ctx.fillRect(MARGIN, yy, right - MARGIN, g.ch); }
    ctx.strokeStyle = '#232833';
    ctx.lineWidth = 1;
    ctx.strokeRect(MARGIN + 0.5, yy + 0.5, right - MARGIN - 1, g.ch - 1);
    ctx.fillStyle = '#4c5563';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(String(f), MARGIN - 2 + 0, yy + g.ch / 2 + 3);
  }
  ctx.strokeStyle = '#6b5a3a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(MARGIN, g.y(0) + g.ch);
  ctx.lineTo(right, g.y(0) + g.ch);
  ctx.stroke();

  // WHERE THE PLAN SAYS PEOPLE WALK (G-034b). Drawn BEFORE the entities, so a room built over
  // a declared corridor covers it — which is what the simulation says about that cell too
  // (a declared cell with a room standing on it is not somewhere anybody can walk).
  //
  // It is here rather than on the exemption list in `viewer.readonly.test.ts` because this
  // field decides a VERDICT a watcher can see: a room reported invalid for `noCorridor` looks
  // identical to a working one unless the corridors are on screen, which is the G-019 shape
  // that check was written for — an instrument blind to the subject of the question being
  // asked of it.
  ctx.fillStyle = '#2a3340';
  for (const at of world.corridors) {
    if (at.floor < g.minF || at.floor > g.maxF) continue;
    ctx.fillRect(g.x(at.column) + 1, g.y(at.floor) + 1, g.cw - 2, g.ch - 2);
  }

  // Where each entity stands, and who is inside it.
  const cells = new Map();
  for (const e of world.entities.list) {
    if (e.at === null) continue;
    const key = `${e.at.floor},${e.at.column}`;
    if (!cells.has(key)) cells.set(key, { at: e.at, room: null, items: [] });
    const cell = cells.get(key);
    if (isRoom(e.kind)) cell.room = e; else cell.items.push(e);
  }

  // WHERE TO DRAW A GUEST: WHERE THE SAVE SAYS IT IS (G-023a).
  //
  // The viewer used to answer this itself — engagement first, else the bedroom, else a
  // strip below the building for guests the save placed nowhere — because a guest had no
  // position and the question had no good answer. `Guest.at` is now hashed, saved state and
  // non-nullable, so the viewer READS it. That is one answer instead of two that can
  // disagree, and it is what makes this instrument able to show a movement defect at all.
  //
  // THE PIP STAYS, AND SO DOES THE FINDING BEHIND IT. A guest's lodging need advances while
  // it stands in the café, so the save still says it is asleep in one place and standing in
  // another; the guest is drawn where it stands and the bedroom keeps an occupancy pip, so a
  // watcher sees both halves. That is a finding about the SIMULATION which G-023a makes
  // visible rather than introduces — see the WATCH note. It is not the viewer's to fix.
  // NOT DRAWN, COUNTED IN TWO KINDS, AND THE SECOND IS THE ONE THAT CAN HAPPEN (G-023a,
  // `sim-critic` MINOR 5). Deleting the OUTSIDE strip took away the guarantee that every
  // guest in a frame appears somewhere, so the count that replaced it has to be one that can
  // actually be non-zero — otherwise it is a reassuring zero that inspects nothing, in the
  // instrument whose output becomes JOURNAL.md evidence.
  //
  //   unplaced  a guest with no `at` at all. Impossible for this build — `Guest.at` is
  //             non-nullable and `assertWorldShape` refuses a save without it — so this is
  //             non-zero only for an ndjson recorded before G-023a. Kept for the reason
  //             `left()` keeps an em-dash for a pre-G-015 table: an old recording must read
  //             as unreadable rather than as an empty hotel.
  //   offView   a guest standing outside the drawn rectangle. THIS ONE IS REACHABLE TODAY:
  //             `extentOf` samples the first and last frames only, so a guest that stands
  //             somewhere neither of them covers — the doorway of a hotel built away from
  //             the plot edge, or anywhere a G-023b corridor goes — is drawn off-canvas.
  //             Fixing the extent is a camera; SAYING SO is a counter.
  const occupants = new Map();
  const holders = new Map();
  let unplaced = 0;
  let offView = 0;
  for (const guest of world.guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) {
      holders.set(guest.roomEntityId, (holders.get(guest.roomEntityId) ?? 0) + 1);
    }
    const at = guest.at;
    if (at === undefined || at === null) { unplaced += 1; continue; }
    if (at.column < g.minC || at.column > g.maxC || at.floor < g.minF || at.floor > g.maxF) {
      offView += 1;
      continue;
    }
    const key = `${at.floor},${at.column}`;
    if (!occupants.has(key)) occupants.set(key, { at, guests: [] });
    occupants.get(key).guests.push(guest);
  }

  for (const [key, cell] of cells) {
    const x = g.x(cell.at.column);
    const y = g.y(cell.at.floor);
    if (cell.room !== null) {
      ctx.fillStyle = colourOf(cell.room.kind);
      ctx.fillRect(x + 1, y + 1, g.cw - 2, g.ch - 2);
      ctx.strokeStyle = '#0d0f12';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1.5, y + 1.5, g.cw - 3, g.ch - 3);
      if (g.cw >= 26) {
        ctx.fillStyle = 'rgba(0,0,0,.65)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${initialsOf(cell.room.kind)}${cell.room.id}`, x + 4, y + 12);
      }
      // Let to somebody, whether or not that somebody is standing here.
      const held = holders.get(cell.room.id) ?? 0;
      for (let n = 0; n < held; n += 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4 + n * 6, y + 16, 4, 4);
      }
    }
    cell.items.forEach((item, i) => {
      ctx.fillStyle = colourOf(item.kind);
      ctx.fillRect(x + g.cw - 9 - i * 8, y + 4, 6, 6);
    });
    drawGuests(occupants.get(key)?.guests ?? [], x + 3, y + g.ch - 6, g.cw - 6, g.ch);
  }

  // GUESTS STANDING WHERE NOTHING IS BUILT (G-023a) — the doorway, and at G-023b whatever
  // lies between two rooms. The loop above only visits cells that hold an entity, and the
  // entrance need not hold one, so without this a waiting guest would be invisible: the
  // exact "UI that cannot express a state the sim can reach" the deleted strip was itself a
  // workaround for.
  for (const [key, spot] of occupants) {
    if (cells.has(key)) continue;
    drawGuests(spot.guests, g.x(spot.at.column) + 3, g.y(spot.at.floor) + g.ch - 6, g.cw - 6, g.ch);
  }

  return { unplaced, offView };
}

/**
 * A row of guests along `width`, their feet on `baseY`, sized to the cell they stand in.
 *
 * THE PITCH IS DRIVEN BY THE NEED VECTOR, not by the body. The need bars are drawn above
 * the guest and are `needs.length` segments wide, which is wider than the body; a pitch
 * chosen from the body alone made adjacent guests' vectors overlap into a smear. Measured
 * on `--days 30 --seed 7 --rooms 2 --arrivals 20`, frame 2600: seven guests roomless AND
 * idle, crowded into one place, their vectors one unreadable stripe of colour.
 *
 * THE PLACE THEY WERE CROWDED INTO WAS THE OUTSIDE STRIP, WHICH NO LONGER EXISTS (G-023a).
 * The crowding does: those seven guests now stand on the entrance cell, which is one cell
 * wide, so the pitch still has to keep their vectors apart. The reading that produced this
 * rule is unchanged; only the name of the place is.
 */
function drawGuests(guests, x0, baseY, width, cellH) {
  if (guests.length === 0) return;
  const scale = clamp(cellH / 130, 0.55, 1.9);
  const gh = Math.round(22 * scale);
  const needH = Math.round(16 * scale);
  const segW = Math.max(2, Math.round(3 * scale));
  const widest = Math.max(...guests.map((g) => g.needs.length)) * (segW + 1);
  const gw = Math.max(3, Math.round(9 * scale));
  const pitch = Math.min(Math.max(gw, widest) + 4, width / guests.length);
  guests.forEach((guest, i) => {
    const x = x0 + i * pitch;
    if (x + gw > x0 + width) return; // more guests than room to draw them; the HUD carries the count
    drawGuest(guest, x, baseY, gw, gh, needH, segW);
  });
}

function drawGuest(guest, x, baseY, w, GUEST_H, NEED_H, segW) {
  const needs = guest.needs;
  let failing = false;
  let failed = false;
  for (const n of needs) {
    if (n.deficit === 0) continue;
    const frac = stockFractionOf(n);
    if (isEmpty(n)) failed = true;
    else if (frac !== null && frac <= 0.25) failing = true;
  }

  // TWO ORTHOGONAL MARKS, BECAUSE THEY ANSWER TWO INDEPENDENT QUESTIONS.
  //
  //   COLOUR  = what the guest is DOING: the need its provider is serving, or the lodging
  //             colour while it is resting, or grey while it is doing nothing at all.
  //   FILL    = whether it HAS A BED: filled if it holds a room, hollow if it does not.
  //
  // THEY USED TO BE ONE CHAIN, AND THAT WAS A DEFECT OF EXACTLY THE KIND THIS INSTRUMENT
  // EXISTS TO CATCH. `engagement !== null` was tested first, so a guest with NO BEDROOM
  // that happened to be eating was drawn filled, in the need's colour — pixel-identical to
  // a guest with a room. In an oversubscribed hotel (`--rooms 1 --arrivals 120`, 10 days)
  // that is 19,619 roomless guest-ticks, 100% of them engaged: a watcher saw a basement of
  // contented eaters and NO SIGNAL AT ALL that three quarters of them would never get a
  // bed, while 89 of 120 guests left unsatisfied. §6.1's "UI that cannot express a state
  // the sim can reach", on the instrument whose output is JOURNAL.md evidence.
  //
  // THIS CUE OUTLIVES THE OUTSIDE STRIP AND IS THE REASON DELETING THE STRIP COSTS NOTHING
  // (G-023a). The strip could only ever show the roomless AND idle; the fill shows
  // homelessness wherever the guest is standing, which is every roomless guest including the
  // ones being served. It was earned by the finding above and it stays.
  //
  // THE RESTING COLOUR ASKS THE SIM'S OWN PREDICATE, SPELLED OUT (θ-a sweep 2). The renderer
  // one directory over calls `isNeedWanted` from its own `isWanted`, in
  // `apps/game/src/view/guest.ts`; this file cannot import it — it is a plain browser module
  // with no bundler — so the predicate is transcribed, with the arm it is being called on
  // named. BY SYMBOL AND NOT BY LINE: this citation carried a LINE NUMBER in `guest.ts` until
  // θ-a's unpinned-claim pass, by which time the line it named was the middle of an unrelated
  // function. `prose-citations.test.ts` holds both ends of it now, and holds this file to
  // citing by symbol.
  //
  // AT `beingServed === true` THE SCHMITT TRIGGER COLLAPSES TO `deficit > 0`. `isNeedWanted` has
  // THREE branches, and all three are quoted because two of three is not checkable (θ-a sweep 3),
  // to the byte for the reason `isWantedWhileServed`'s block gives:
  //
  //     if (need.deficit <= 0) return false;
  //     if (needType === undefined) return true;
  //     return beingServed || need.deficit >= wantLineOf(needType, wantAtBasisPoints);
  //
  // A guest that is at home and not engaged IS being served its lodging need, so the last branch
  // short-circuits on `beingServed` and the want line never enters; the middle branch answers
  // TRUE at this arm too, for a need the content does not define, so it changes no answer here
  // and is not a hole in the collapse. **This is therefore the same drawing as before, not a new one**; the
  // reading was already correct and what it lacked was the derivation. Said here because the
  // viewer is the instrument a WATCH is ruled against, and "these two agree today" is a fact a
  // reader should not have to re-derive to trust the picture.
  //
  // IF `isNeedWanted` EVER STOPS COLLAPSING — a served need that is not wanted, say — this line
  // is wrong and the file to read is `packages/sim/src/needs.ts`.
  const lodging = needs.find((n) => n.needId === content.lodgingNeedId);
  const filled = guest.roomEntityId !== NO_ENTITY;
  const atHome = filled && guest.engagement === null;
  let colour = '#77808f';
  if (guest.engagement !== null) {
    colour = colourOf(guest.engagement.needId);
  } else if (atHome && lodging !== undefined && isWantedWhileServed(lodging)) {
    colour = colourOf(lodging.needId);
  }

  const top = baseY - GUEST_H;
  ctx.lineWidth = 1;
  if (filled) { ctx.fillStyle = colour; ctx.fillRect(x, top, w, GUEST_H); }
  else { ctx.strokeStyle = colour; ctx.strokeRect(x + 0.5, top + 0.5, w - 1, GUEST_H - 1); }
  if (failed) { ctx.strokeStyle = '#e5484d'; ctx.strokeRect(x - 1.5, top - 1.5, w + 3, GUEST_H + 3); }
  else if (failing) { ctx.fillStyle = '#e5484d'; ctx.fillRect(x, top, w, 3); }

  // THE NEED VECTOR, one segment per need THE GUEST ACTUALLY CARRIES — `guest.needs.length`,
  // never a constant. A guest's vector is fixed when it arrives, from the content of that
  // era, and M6's archetypes are expected to make it vary between guests. A hardcoded
  // width would keep drawing four bars and lose the fifth in silence.
  const total = needs.length * (segW + 1);
  let sx = x + w / 2 - total / 2;
  const sy = top - NEED_H - 2;
  for (const n of needs) {
    const frac = stockFractionOf(n);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(sx, sy, segW, NEED_H);
    if (n.deficit === 0) {
      // FULL, WHICH IS NOT THE SAME AS FINISHED (G-027b): a full block with a pale cap, which
      // is what tells it apart from a nearly-full one. It decays again next tick — nothing is
      // terminal — so the cap says "at the top right now", not "done". (It read "Met. Terminal,
      // so patience stopped mattering" until θ-a sweep 2, which is the model this goal deleted.)
      ctx.fillStyle = colourOf(n.needId);
      ctx.fillRect(sx, sy, segW, NEED_H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, segW, 2);
    } else if (frac === null) {
      // Unmeasurable, and therefore drawn LOUD rather than healthy. See stockFractionOf.
      ctx.fillStyle = UNKNOWN;
      ctx.fillRect(sx, sy, segW, NEED_H);
    } else {
      const h = Math.round(frac * NEED_H);
      ctx.fillStyle = isEmpty(n) ? '#e5484d' : colourOf(n.needId);
      ctx.fillRect(sx, sy + NEED_H - Math.max(h, 1), segW, Math.max(h, 1));
    }
    sx += segW + 1;
  }
}

// ---------------------------------------------------------------------------------
// HUD. Every number is folded out of the frame; nothing is carried between frames.

const money = (p) => `${(p / 100).toLocaleString('en-GB', { style: 'currency', currency: 'GBP' })}`;

function hud(world, extra) {
  const day = Math.floor(world.tick / TICKS_PER_DAY);
  const m = world.tick % TICKS_PER_DAY;
  el('clock').textContent =
    `day ${day} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  // Balance is a FOLD over the ledger, never a stored number — I4's shape, honoured by
  // the viewer because a viewer that cached it would be holding authoritative state.
  let balance = 0;
  for (const t of world.ledger) balance += t.amount;

  let rooms = 0;
  let items = 0;
  const byType = new Map();
  for (const e of world.entities.list) {
    if (isRoom(e.kind)) { rooms += 1; byType.set(e.kind, (byType.get(e.kind) ?? 0) + 1); }
    else { items += 1; byType.set(e.kind, (byType.get(e.kind) ?? 0) + 1); }
  }

  const o = world.guestOutcomes;
  /**
   * One row of the schema-8 outcome table, or an em-dash.
   *
   * NEVER `?? 0`. A recording from before G-015 has no `departures` at all, and a zero here
   * would read as "nobody was ever satisfied" — a plausible catastrophe rather than a
   * missing field. The same reasoning `assertSummarySchema` applies to the JSON report.
   */
  const left = (outcomes, reason) => {
    const rows = outcomes.departures;
    if (!Array.isArray(rows)) return '—';
    const row = rows.find((r) => r.reason === reason);
    return row === undefined ? '—' : String(row.count);
  };

  /**
   * ONE ROW PER REASON THE RECORDING ACTUALLY CARRIES — folded, not spelled out (θ-b1).
   *
   * IT WAS FIVE LITERAL ROWS UNTIL θ-b1, under a comment arguing that a loop "would render
   * whatever a recording happened to contain, which is how a disposable viewer grows a
   * feature". **The cost of that came due immediately.** θ-b1 added `leftDissatisfied` and this
   * panel had no row for it: on the critic's own recording the final frame printed `arrived 60`
   * and `in hotel 7` over rows summing to 47 — SIX GUESTS VANISHED WITH NOTHING SAID — and on
   * the I5 bench workload it is 66 of 75. ADR-0026 restored the WATCH criterion for *a guest
   * walking out mid-stay* and pointed it at a panel that could not show one.
   *
   * `apps/game/src/hud.ts` had already settled this the other way, in the same week, folding
   * `GUEST_DEPARTURE_REASONS` precisely because spelling them out gives "a renderer that misses
   * one silently when a reason is added". This is that decision, one instrument over.
   *
   * IT FOLDS THE FRAME'S OWN TABLE RATHER THAN A COPY OF THE UNION, because this file is plain
   * browser JavaScript with no build step and cannot import from `packages/sim` — and a copy of
   * the list here would be the duplicated constant ADR-0021 is about. A recording is a
   * `serialise(world)` and its table is the one that world had, which is the honest subject: a
   * viewer showing a row a RECORDING does not carry would be inventing it.
   *
   * A RECORDING WITH NO TABLE AT ALL still gets the pre-G-015 em-dash rows, so nothing that
   * loaded before loads differently.
   */
  const DEPARTURE_LABELS = {
    checkedOut: 'checked out',
    gaveUp: 'gave up',
    leftDissatisfied: 'walked out',
    evictedRoomGone: 'room gone',
    evictedRoomUnusable: 'room broke',
    evictedCauseUnrecorded: 'evicted (old save)',
  };
  const departureRows = (outcomes) => {
    const rows = outcomes.departures;
    if (!Array.isArray(rows)) {
      return Object.entries(DEPARTURE_LABELS).map(([reason, label]) => [label, left(outcomes, reason)]);
    }
    return rows.map((row) => [DEPARTURE_LABELS[row.reason] ?? row.reason, String(row.count)]);
  };
  const idx = Number(el('scrub').value);
  el('hud').innerHTML = row([
    ['frame', `${idx} / ${rec.lines.length - 1}`],
    ['tick', String(world.tick)],
    ['balance', money(balance)],
    ['ledger', `${world.ledger.length} txns`],
    ['rooms / items', `${rooms} / ${items}`],
    ['in hotel', String(world.guests.list.length)],
    // GUESTS THIS FRAME DOES NOT SHOW, IN THE TWO WAYS THAT IS POSSIBLE (G-023a). `off-view`
    // is the reachable one and the reason this row exists at all: the drawn rectangle is
    // fitted to the first and last frames, so a guest standing somewhere neither covers is
    // drawn off-canvas, and a watcher would otherwise see a hotel with a guest missing and no
    // sign of it. `no position` can only be an ndjson recorded before `Guest.at` existed.
    // A row that could only ever read 0 would be a reassurance rather than a measurement.
    ['not drawn', `${extra.offView} off-view · ${extra.unplaced} no position`],
    ['arrived', String(o.arrived)],
    // THE FIRST TWO ROWS WERE RENAMED AT G-027a, AND THE FOLD BELOW CHANGED WHAT A STALE
    // RECORDING LOOKS LIKE — this paragraph described the behaviour the same hunk replaced.
    //
    // It said every committed `watch-*.ndjson` "shows an em-dash against those two rows,
    // because their tables say `satisfied` / `gaveUpWaiting`". TEN of the twelve do carry those
    // spellings and two carry today's — counted, because "every" was doing work here. It was
    // true while the rows were
    // five literals looked up BY NAME. `departureRows` walks the recording's OWN table, so a
    // pre-G-027a ndjson now renders `satisfied` and `gaveUpWaiting` **with their counts**, under
    // their era's names — which is a better answer than an em-dash: the number was never
    // unknown, only spelled differently.
    //
    // `left()` IS STILL REACHED, and only from the no-table fallback: an ndjson recorded before
    // G-015 has no `departures` at all, and there the em-dash keeps its one meaning — "this
    // recording predates the row" — rather than reading as a plausible 0.
    ...departureRows(o),
  ]);

  // Departed-guest tally from the frame, beside what the guests standing here right now
  // are doing with the same need.
  //
  // **THE TWO `met` COLUMNS ANSWER DIFFERENT QUESTIONS SINCE G-028b, AND THIS IS THE INSTRUMENT
  // THE HUMAN WATCH RUNS THROUGH.** The tally's `met` is the per-need BAND — the hotel served
  // this need for all but a fifth of that guest's stay (ADR-0037). The `live` column below is
  // "full RIGHT NOW", a reading at one instant. They can differ by an order of magnitude on one
  // row, which is precisely the confusion the summary schema bump exists to prevent, so the
  // header says which is which rather than letting a watcher assume they are the same number.
  const live = new Map();
  for (const guest of world.guests.list) {
    for (const n of guest.needs) {
      if (!live.has(n.needId)) live.set(n.needId, { met: 0, pending: 0, failed: 0 });
      const r = live.get(n.needId);
      if (n.deficit === 0) r.met += 1;
      else if (isEmpty(n)) r.failed += 1;
      else r.pending += 1;
    }
  }
  let html =
    '<table><tr><td></td><td class="n">met (stay)</td><td class="n">unmet</td>' +
    '<td class="n">byItem</td><td class="n">live (now)</td></tr>';
  for (const n of world.needOutcomes) {
    const l = live.get(n.needId) ?? { met: 0, pending: 0, failed: 0 };
    html +=
      `<tr><td><span class="sw" style="background:${colourOf(n.needId)}"></span>${nameOfNeed(n.needId)}</td>` +
      `<td class="n">${n.met}</td><td class="n">${n.unmet}</td><td class="n">${n.metByItem}</td>` +
      `<td class="n">${l.met}/${l.pending}/${l.failed}</td></tr>`;
  }
  el('needs').innerHTML =
    `${html}</table><div style="color:#8b93a1">` +
    'met (stay) = departed guests whose need was served for all but a band of their stay &middot; ' +
    'live (now) = full / pending / failed for guests still here' +
    '</div>';

  /**
   * WHAT THE DEPARTED GUESTS THOUGHT OF THE PLACE (G-019).
   *
   * ADDED BY `ai-critic` AT THE FINAL ROUND, AND THE REASON IS WORTH THE PARAGRAPH. The
   * field was in every recorded frame from the day it existed — `frameAt` is a raw
   * `JSON.parse` of the serialised world — and this file drew `guestOutcomes` and
   * `needOutcomes` and nothing for it. So G-019's WATCH entry asked a human *"does the wait
   * penalty read as fair?"* and pointed them at an instrument that could not show a single
   * review. **A perceptual criterion aimed at an instrument blind to its subject** is
   * ADR-0013 §3's own shape, one level up from the prompt that ruling amended.
   *
   * A LOOP HERE, WHERE THE OUTCOME TABLE ABOVE IS FIVE LITERAL ROWS, AND THE DIFFERENCE IS
   * NOT AN INCONSISTENCY. Those five are a closed union in code, so spelling them out is
   * what makes a missing one visible. A review SCORE is content — the scale is two integers
   * in `guest-rules.json` — so there is no fixed set to spell out, and the sim's own table is
   * sparse. `—` for a recording that predates the field, never `0`, for the reason `left`
   * gives above: a zero would read as "nobody reviewed", which is a plausible catastrophe
   * rather than a missing field.
   *
   * THE MEAN IS IN HUNDREDTHS, integer, computed here and stored nowhere — the same call
   * `report.ts` makes, and for the same reason.
   */
  const reviews = world.reviewOutcomes;
  if (!Array.isArray(reviews)) {
    el('reviews').innerHTML = '<div style="color:#8b93a1">— (recording predates reviews)</div>';
  } else if (reviews.length === 0) {
    el('reviews').innerHTML = '<div style="color:#8b93a1">nobody has left yet</div>';
  } else {
    let total = 0;
    let count = 0;
    for (const r of reviews) {
      total += r.score * r.count;
      count += r.count;
    }
    const widest = Math.max(...reviews.map((r) => r.count));
    let rows = '<table>';
    for (const r of reviews) {
      // A bar as well as a number: the shape of a distribution is the thing being judged,
      // and four counts in a column do not have one.
      const bar = '█'.repeat(Math.max(1, Math.round((r.count / widest) * 12)));
      rows +=
        `<tr><td>${r.score}</td><td class="n">${r.count}</td>` +
        `<td style="color:#6ea8fe">${r.count === 0 ? '' : bar}</td></tr>`;
    }
    const mean = Math.round((total * 100) / count);
    el('reviews').innerHTML =
      `${rows}</table><div style="color:#8b93a1">mean ${Math.floor(mean / 100)}.${String(mean % 100).padStart(2, '0')} over ${count}</div>`;
  }

  let legend = '<table>';
  for (const [kind, count] of [...byType].sort()) {
    legend += `<tr><td><span class="sw" style="background:${colourOf(kind)}"></span>${nameOf(kind)}</td><td class="n">${count}</td></tr>`;
  }
  el('legend').innerHTML = `${legend}</table>`;
  el('warn').textContent = unknownIds.size > 0 ? `unknown content ids (magenta): ${[...unknownIds].join(', ')}` : '';
}

const nameOfNeed = (id) => content.needs.get(id)?.name ?? id;
const row = (pairs) =>
  `<table>${pairs.map(([k, v]) => `<tr><td>${k}</td><td class="n">${v}</td></tr>`).join('')}</table>`;

// ---------------------------------------------------------------------------------
// TRANSPORT. A scrubber and a speed control, and nothing else.

let frame = 0;
function setFrame(i) {
  frame = clamp(i, 0, rec.lines.length - 1);
  el('scrub').value = String(frame);
  const world = frameAt(frame);
  hud(world, draw(world));
}

// SPEED IS IN SIM TICKS PER REAL SECOND, never ticks per rendered frame (HOTELSIM.md
// §2.1.1 — a speed defined per frame is the frame-rate-dependent defect in §6.1's
// catalogue). The loop accumulates REAL elapsed milliseconds and spends them; a 144Hz
// monitor and a 60Hz monitor watch the same hotel at the same rate.
//
// THE LADDER IS CONTENT NOW (G-021), AND THIS FILE IS WHY THE GOAL SAID SO. It used to hold
// `const SPEEDS = [1, 5, 30, 120]` with `let ticksPerSecond = 30` one line below — a whole
// hardcoded ladder, containing the dead 1x the human killed after watching a recording made
// with THIS viewer, under a comment naming itself the discharge point for the figure. The
// buttons are now built from `speed-ladder.json`: the label travels with the value, so a
// rebalance renames the button it moves.
//
// The discharge is done: 30 ticks/s was watched and reads brisk (the human's own prediction
// of "sluggish" was scored and was wrong), and 1x was killed. What survives here is the
// UNIT — ticks/s, shown beside each label — because a button that says only "Fast" cannot
// be checked against §2.1.2's arithmetic by anyone reading the screen.
// `null` until the ladder has been read, and there is deliberately no number here to fall
// back to. A default in this file would be exactly the constant the goal removed, wearing
// the word "default" — and `speed-ladder.scan.test.ts` fires on it, which is how the first
// draft of this line (`= 0`) was caught.
let ticksPerSecond = null;
let playing = false;
let carry = 0;

// REVIEW SPEED IS NOT A PLAY SPEED, AND IT IS NOT A RUNG (G-021 ruling). Removing the old
// hardcoded 120 would have cost the WATCH instrument its fast scrub — a 30-day recording is
// 43,200 ticks, minutes of watching at the top rung — and G-019 owes a watched recording,
// so that cost would have landed on a human two goals from here.
//
// It is a different QUANTITY rather than a differently-labelled rung, which is why it can
// live here without contradicting "the ladder is content": a play speed is simulated ticks
// per real second over a live simulation, and this is RECORDED FRAMES PER STEP over a
// finished recording. It advances the scrubber faster; it does not make the hotel run
// faster, and the clock still reads the frame it lands on. So it is not in the JSON, it
// takes no rung's name, and it multiplies nothing the ladder declares.
const REVIEW_FRAME_STRIDE = 4;
let reviewing = false;
// The timestamp of the last frame that was allowed to spend time, or `null` for "playback
// has just started, so there is no elapsed interval yet". The null state is not decoration:
// without it the first frame after a resume spends the whole time the viewer sat PAUSED,
// and the recording jumps. Caught by driving `loop` with synthetic timestamps rather than
// by watching, which is the only way a timing bug this shape ever shows up.
let last = null;

function loop(now) {
  if (playing) {
    const dt = last === null ? 0 : Math.min(Math.max(now - last, 0), 250);
    carry += (dt / 1000) * (ticksPerSecond ?? 0);
    // The stride multiplies FRAMES, not ticks/s: the selected rung still means what it says
    // and `carry` is still spent at that rate. Reviewing skips recorded frames rather than
    // pretending the simulation ran faster.
    const step = Math.floor(carry / rec.everyTicks) * (reviewing ? REVIEW_FRAME_STRIDE : 1);
    if (step > 0) {
      carry -= (step / (reviewing ? REVIEW_FRAME_STRIDE : 1)) * rec.everyTicks;
      if (frame + step >= rec.lines.length - 1) { setFrame(rec.lines.length - 1); setPlaying(false); }
      else setFrame(frame + step);
    }
  }
  last = playing ? now : null;
  requestAnimationFrame(loop);
}

function setPlaying(on) {
  playing = on && rec.lines.length > 1;
  carry = 0;
  last = null;
  el('play').textContent = playing ? 'pause' : 'play';
  el('play').classList.toggle('on', playing);
}

/** One button per rung, in the order content declares them, labelled by content. */
function buildSpeedButtons() {
  // THE FASTEST RUNG IS THE DEFAULT, AND THAT IS A NEW POLICY RATHER THAN A PRESERVED ONE.
  // An earlier version of this comment justified it as "the top rung was 30 then and is 30
  // now" — false, and git says so: the old hardcoded ladder was [1, 5, 30, 120], so its top
  // rung was 120 and 30 was merely the DEFAULT. What is true is that the default playback
  // rate is unchanged at 30 ticks/s, which is what matters for comparing recordings watched
  // before and after this change; it is now reached by a rule ("the fastest rung") rather
  // than by a constant, and a retune of the ladder will move it.

  ticksPerSecond = content.speeds.reduce((top, r) => Math.max(top, r.ticksPerRealSecond), 0);
  el('speeds').innerHTML = content.speeds
    .map((r) => `<button data-s="${r.ticksPerRealSecond}" title="${r.ticksPerRealSecond} ticks/s">${r.name}` +
      ` <span class="u">${r.ticksPerRealSecond}/s</span></button>`)
    .join(' ');
  for (const b of el('speeds').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      ticksPerSecond = Number(b.dataset.s);
      carry = 0;
      for (const o of el('speeds').querySelectorAll('button')) o.classList.toggle('on', o === b);
    });
    if (Number(b.dataset.s) === ticksPerSecond) b.classList.add('on');
  }
}

// The stride is stated in ONE place and the button's tooltip is written from it. `index.html`
// used to carry its own copy of the number, which is the duplicated-constant defect this goal
// exists to remove, inside the goal that removes it.
el('review').title = `scrub ${REVIEW_FRAME_STRIDE} recorded frames per step — a review speed over the recording, not a play speed`;
el('review').addEventListener('click', () => {
  reviewing = !reviewing;
  carry = 0;
  el('review').classList.toggle('on', reviewing);
});
el('play').addEventListener('click', () => setPlaying(!playing));
el('scrub').addEventListener('input', () => { setPlaying(false); setFrame(Number(el('scrub').value)); });
window.addEventListener('keydown', (e) => {
  if (rec.lines.length === 0) return;
  if (e.key === 'ArrowRight') { setPlaying(false); setFrame(frame + (e.shiftKey ? 60 : 1)); }
  if (e.key === 'ArrowLeft') { setPlaying(false); setFrame(frame - (e.shiftKey ? 60 : 1)); }
  if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
});
el('file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file === undefined) return;
  setPlaying(false);
  el('status').textContent = `reading ${file.name} …`;
  try {
    loadRecording(await file.text());
  } catch (err) {
    el('status').textContent = `could not read that recording: ${err.message}`;
  }
});

await loadContent();
// After the content, not before it: the speed buttons ARE content now (G-021).
buildSpeedButtons();
requestAnimationFrame(loop);
