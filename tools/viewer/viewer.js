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
/** `TICKS_PER_DAY` — packages/sim/src/world.ts:33. One tick is one in-game minute. */
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
// CONTENT. Names, roles and patience come from the shipped JSON rather than from
// literals here, so a balance edit cannot leave this file quietly disagreeing with the
// simulation that produced the recording. Colour does not, for the reason above.

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
 * How much of this need's patience is left, 0..1 — or `null` when the loaded content does
 * not define the need at all, which makes the question unanswerable.
 *
 * IT RETURNS null RATHER THAN 1, AND THE DIRECTION OF THE OLD BUG IS THE WHOLE POINT. It
 * used to be `patience ? remaining / patience : 1`, so a need whose id the content does not
 * carry — a recording made under different content — drew a FULL bar: a need with zero
 * patience left rendered as the healthiest state on screen. Silent, and in the reassuring
 * direction, which is the worst direction for an instrument whose output becomes evidence.
 * The caller paints these magenta, exactly as `colourOf` paints an unknown id, and the id
 * is announced in the header.
 */
function patienceFractionOf(need) {
  const patience = content.needs.get(need.needId)?.patienceTicks;
  if (typeof patience !== 'number' || patience <= 0) {
    unknownIds.add(need.needId);
    return null;
  }
  return clamp(need.patienceRemaining / patience, 0, 1);
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
function frameAt(i) {
  const hit = rec.cache.get(i);
  if (hit !== undefined) return hit;
  const world = JSON.parse(rec.lines[i]).world;
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
const STRIP_H = 84;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function geometry() {
  const { minC, maxC, minF, maxF } = rec.extent;
  const cols = maxC - minC + 1;
  const rows = maxF - minF + 1;
  const cw = clamp((canvas.width - 2 * MARGIN) / cols, 10, 120);
  const ch = clamp((canvas.height - 2 * MARGIN - STRIP_H) / rows, 16, 130);
  return {
    cw, ch, minC, maxC, minF, maxF,
    x: (col) => MARGIN + (col - minC) * cw,
    y: (floor) => MARGIN + (maxF - floor) * ch,
    bottom: MARGIN + rows * ch,
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

  // Where each entity stands, and who is inside it.
  const cells = new Map();
  const placed = new Map();
  for (const e of world.entities.list) {
    placed.set(e.id, e);
    if (e.at === null) continue;
    const key = `${e.at.floor},${e.at.column}`;
    if (!cells.has(key)) cells.set(key, { at: e.at, room: null, items: [] });
    const cell = cells.get(key);
    if (isRoom(e.kind)) cell.room = e; else cell.items.push(e);
  }

  // WHERE TO DRAW A GUEST, AND THE REASON THAT QUESTION HAS NO GOOD ANSWER.
  //
  // A guest holds a bedroom AND an engagement at the same time, and its lodging need
  // advances while it sits in the basement — so the save says it is in two places at
  // once. The viewer has to pick one, and picks the ENGAGEMENT, because that is what the
  // guest is doing. The bedroom it is simultaneously asleep in would then look empty,
  // which is a state the viewer could not express, so a let bedroom also gets an
  // occupancy pip. See the WATCH note: this is a finding about the simulation, and the
  // pip is how a watcher sees it rather than a fix for it.
  const occupants = new Map();
  const holders = new Map();
  const outside = [];
  for (const guest of world.guests.list) {
    if (guest.roomEntityId !== NO_ENTITY) {
      holders.set(guest.roomEntityId, (holders.get(guest.roomEntityId) ?? 0) + 1);
    }
    const host = guest.engagement !== null ? guest.engagement.entityId : guest.roomEntityId;
    const entity = host === NO_ENTITY ? undefined : placed.get(host);
    if (entity === undefined || entity.at === null) { outside.push(guest); continue; }
    const key = `${entity.at.floor},${entity.at.column}`;
    if (!occupants.has(key)) occupants.set(key, []);
    occupants.get(key).push(guest);
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
    drawGuests(occupants.get(key) ?? [], x + 3, y + g.ch - 6, g.cw - 6, g.ch);
  }

  // OUTSIDE. A guest with no room and no provider has NO POSITION IN THE SAVE — see the
  // findings; the sim has no notion of where such a guest is standing. This strip is a
  // viewer convention, labelled as one, and not a claim about the simulation.
  const sy = g.bottom + 14;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#3a4150';
  ctx.lineWidth = 1;
  ctx.strokeRect(MARGIN + 0.5, sy + 0.5, right - MARGIN - 1, STRIP_H - 24);
  ctx.setLineDash([]);
  ctx.fillStyle = '#8b93a1';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`OUTSIDE — no room, no provider (${outside.length}) · viewer convention, not sim state`, MARGIN + 4, sy + 12);
  drawGuests(outside, MARGIN + 6, sy + STRIP_H - 30, right - MARGIN - 12, 60);

  return { outside: outside.length };
}

/**
 * A row of guests along `width`, their feet on `baseY`, sized to the cell they stand in.
 *
 * THE PITCH IS DRIVEN BY THE NEED VECTOR, not by the body. The need bars are drawn above
 * the guest and are `needs.length` segments wide, which is wider than the body; a pitch
 * chosen from the body alone made adjacent guests' vectors overlap into a smear. Measured
 * on `--days 30 --seed 7 --rooms 2 --arrivals 20`, frame 2600: seven guests roomless AND
 * idle, drawn in the OUTSIDE strip, their vectors one unreadable stripe of colour.
 *
 * That invocation is worth naming rather than calling "the oversubscribed hotel", because
 * the strip only ever holds the roomless AND IDLE. A hotel with spare amenities keeps its
 * roomless guests busy and the strip stays empty at any pressure — which is why the
 * homeless mark is on the BODY (see drawGuest) and not on the strip.
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
    if (n.progressRemaining === 0) continue;
    const frac = patienceFractionOf(n);
    if (n.patienceRemaining === 0) failed = true;
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
  // Note what this means for the OUTSIDE strip: it holds only the roomless AND idle, so a
  // roomless guest that is being served is drawn hollow AT ITS PROVIDER. Homelessness is
  // now legible wherever the guest happens to be standing, which the strip alone could
  // never have made it.
  const lodging = needs.find((n) => n.needId === content.lodgingNeedId);
  const filled = guest.roomEntityId !== NO_ENTITY;
  let colour = '#77808f';
  if (guest.engagement !== null) {
    colour = colourOf(guest.engagement.needId);
  } else if (filled && lodging !== undefined && lodging.progressRemaining > 0) {
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
    const frac = patienceFractionOf(n);
    ctx.fillStyle = '#20242c';
    ctx.fillRect(sx, sy, segW, NEED_H);
    if (n.progressRemaining === 0) {
      // Met. Terminal, so patience stopped mattering: a full block with a pale cap, which
      // is what tells it apart from a fresh need that merely still has all its patience.
      ctx.fillStyle = colourOf(n.needId);
      ctx.fillRect(sx, sy, segW, NEED_H);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx, sy, segW, 2);
    } else if (frac === null) {
      // Unmeasurable, and therefore drawn LOUD rather than healthy. See patienceFractionOf.
      ctx.fillStyle = UNKNOWN;
      ctx.fillRect(sx, sy, segW, NEED_H);
    } else {
      const h = Math.round(frac * NEED_H);
      ctx.fillStyle = n.patienceRemaining === 0 ? '#e5484d' : colourOf(n.needId);
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
  const idx = Number(el('scrub').value);
  el('hud').innerHTML = row([
    ['frame', `${idx} / ${rec.lines.length - 1}`],
    ['tick', String(world.tick)],
    ['balance', money(balance)],
    ['ledger', `${world.ledger.length} txns`],
    ['rooms / items', `${rooms} / ${items}`],
    ['in hotel', String(world.guests.list.length)],
    ['outside', String(extra.outside)],
    ['arrived', String(o.arrived)],
    // FIVE LITERAL ROWS, NOT A LOOP OVER THE TABLE (G-015). A loop would render whatever a
    // recording happened to contain, which is how a disposable viewer grows a feature; these
    // are the five reasons this build writes, spelled out, and `left` returns an em-dash for
    // a recording that predates them rather than a plausible 0.
    ['satisfied', left(o, 'satisfied')],
    ['gave up', left(o, 'gaveUpWaiting')],
    ['room gone', left(o, 'evictedRoomGone')],
    ['room broke', left(o, 'evictedRoomUnusable')],
    ['evicted (old save)', left(o, 'evictedCauseUnrecorded')],
  ]);

  // Departed-guest tally from the frame, beside what the guests standing here right now
  // are doing with the same need — the two halves of "met or failing".
  const live = new Map();
  for (const guest of world.guests.list) {
    for (const n of guest.needs) {
      if (!live.has(n.needId)) live.set(n.needId, { met: 0, pending: 0, failed: 0 });
      const r = live.get(n.needId);
      if (n.progressRemaining === 0) r.met += 1;
      else if (n.patienceRemaining === 0) r.failed += 1;
      else r.pending += 1;
    }
  }
  let html = '<table><tr><td></td><td class="n">met</td><td class="n">unmet</td><td class="n">byItem</td><td class="n">live</td></tr>';
  for (const n of world.needOutcomes) {
    const l = live.get(n.needId) ?? { met: 0, pending: 0, failed: 0 };
    html +=
      `<tr><td><span class="sw" style="background:${colourOf(n.needId)}"></span>${nameOfNeed(n.needId)}</td>` +
      `<td class="n">${n.met}</td><td class="n">${n.unmet}</td><td class="n">${n.metByItem}</td>` +
      `<td class="n">${l.met}/${l.pending}/${l.failed}</td></tr>`;
  }
  el('needs').innerHTML = `${html}</table><div style="color:#8b93a1">live = met / pending / failed</div>`;

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
