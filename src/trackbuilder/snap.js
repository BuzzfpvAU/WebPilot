/*
 * snap.js: the pure rules the plan and the room share for where a thing goes
 * and what is in frame.
 *
 * No DOM and no Three.js, like the rest of the builder's data modules, so the
 * self test can run all of it in Node and the two views cannot disagree about
 * it: each asks this file and draws what it is told.
 *
 * This file is part of WebFPVSimulator.
 *
 * WebFPVSimulator is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or (at
 * your option) any later version.
 *
 * WebFPVSimulator is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY, without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with WebFPVSimulator. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  ELEMENTS, KIND, MICRO_PALETTE_ORDER, trackClassOf, docModeOf, defaultDims, defaultPitch, defaultZ,
} from './elements.js';
import {
  envelopeFor, GATE_OPENING_DEFAULT, GATE_SPACING_MIN, GATE_SPACING_MAX, GATE_SPACING_NOMINAL, inches,
  POLE_FROM_GATE_MIN, POLE_FROM_POLE_MIN,
} from './racegow.js';
import {
  apertureCenter, aperturesOf, createElement, deepClone, elementById, entryAnchor, isSequenceable, kindOf,
  newElementId, setSideBuilt,
} from './model.js';
import { addToSequence, gateNumbers, moveInSequence, removeFromSequence } from './sequence.js';
import { applyFigure, defaultFigure } from './figures.js';
import { applyAutoFaces, defaultYawFor, lastAnchorOf } from './faces.js';
import { apertureFrame, wrapAngle } from './geometry.js';

/* ------------------------------------------------------------------ */
/* What is in frame                                                    */
/* ------------------------------------------------------------------ */

/* Metres of floor round a whoop track, and the least it is ever framed
 * across, so a single gate is a gate and not a wall filling the screen. */
const FRAME_MARGIN = 0.45;
const FRAME_LEAST = 1.6;

/*
 * How far an element reaches from its own middle across the floor: half its
 * widest opening or footprint, or the clearance a flag or a cone is passed at,
 * whichever is more. Enough to frame it, not a collision test.
 */
function reachOf(el) {
  const d = el.dims || {};
  return Math.max(0.05, (d.clearW || 0) / 2, (d.width || 0) / 2, (d.depth || 0) / 2, d.clearance || 0);
}

/* The floor rectangle that holds every element, or null for a track with none. */
export function trackBounds(doc) {
  let box = null;
  for (const el of doc.elements || []) {
    const r = reachOf(el);
    const b = { minX: el.position.x - r, maxX: el.position.x + r, minY: el.position.y - r, maxY: el.position.y + r };
    box = box
      ? {
        minX: Math.min(box.minX, b.minX), maxX: Math.max(box.maxX, b.maxX),
        minY: Math.min(box.minY, b.minY), maxY: Math.max(box.maxY, b.maxY),
      }
      : b;
  }
  return box;
}

/*
 * THE FLOOR RECTANGLE BOTH VIEWS FRAME, for Fit and for every document that
 * arrives.
 *
 * A whoop track is a metre or two across and the hall it stands in is 10 by
 * 12, so framing the field, which is what every canvas did, opened it as a
 * small cluster in the middle of a big empty rectangle. On a whoop canvas the
 * frame is the track's own extent and a margin; on an empty one it is the
 * RaceGOW envelope at the default gate, centred on the middle of the room
 * because that is where the game puts a track (trackdoc.js maps a position to
 * the world from the field's middle). Every other canvas still frames its
 * whole field, as it always did: a sixty metre course is not a room.
 */
export function frameRectFor(doc) {
  const f = doc.field;
  if (trackClassOf(doc) !== 'micro' || docModeOf(doc) === 'freestyle') {
    return { minX: 0, minY: 0, maxX: f.width, maxY: f.depth };
  }
  let box = trackBounds(doc);
  if (!box) {
    const env = envelopeFor(GATE_OPENING_DEFAULT);
    box = {
      minX: f.width / 2 - env.width / 2, maxX: f.width / 2 + env.width / 2,
      minY: f.depth / 2 - env.depth / 2, maxY: f.depth / 2 + env.depth / 2,
    };
  }
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  const halfX = Math.max((box.maxX - box.minX) / 2 + FRAME_MARGIN, FRAME_LEAST / 2);
  const halfY = Math.max((box.maxY - box.minY) / 2 + FRAME_MARGIN, FRAME_LEAST / 2);
  return { minX: cx - halfX, maxX: cx + halfX, minY: cy - halfY, maxY: cy + halfY };
}

/* ------------------------------------------------------------------ */
/* Where a gate faces                                                  */
/* ------------------------------------------------------------------ */

export const QUARTER = Math.PI / 2;
const FREE_STEP = Math.PI / 12;

/*
 * The multiple of a quarter turn nearest an angle, in (-pi, pi]. RaceGOW's
 * gates are straight pipe and right angle fittings, so a gate faces along one
 * of two axes and nothing between. Half a turn is spelled pi and never -pi,
 * because a document that reads back with the other spelling is a different
 * document (see wrapAngle).
 */
export function nearestQuarter(yaw) {
  if (!Number.isFinite(yaw)) {
    return 0;
  }
  const q = wrapAngle(Math.round(wrapAngle(yaw) / QUARTER) * QUARTER);
  return q <= -Math.PI + 1e-9 ? Math.PI : q;
}

/*
 * HOW FAR ONE STEP OF A TURN IS. A gate on a whoop canvas goes in quarter
 * turns, which is what RaceGOW can build; everything else keeps the fifteen
 * degrees it always had.
 */
export function turnStepFor(doc, el) {
  const def = ELEMENTS[el.type];
  return def && def.kind === KIND.APERTURE && trackClassOf(doc) === 'micro' && docModeOf(doc) !== 'freestyle'
    ? QUARTER
    : FREE_STEP;
}

/* An angle pulled to by hand, put on the step, or left where it is when the
 * modifier says the author knows better. */
export function snapTurn(doc, el, raw, free) {
  if (free) {
    return wrapAngle(raw);
  }
  const step = turnStepFor(doc, el);
  return wrapAngle(Math.round(raw / step) * step);
}

/*
 * WHAT A NEW ELEMENT IS PLACED WITH: { yaw, pin, pinPrevious }.
 *
 * On a whoop canvas a new gate takes the quarter turn nearest the line from
 * the last place the course has been, and KEEPS it (`pin` sets yawOverridden),
 * so gates turn only when the author turns them, and never to a diagonal. The
 * direction THROUGH the gate is still derived from the flying order: that is
 * the pass's own flag, and nothing here sets it.
 *
 * The first gate has no line to take a heading from, so it faces east and is
 * left unpinned; the second one then gives it its heading (`pinPrevious`),
 * because a gate that never learned which way the track goes leaves the line
 * running along its own plane. Only while it is the only gate: a later gate
 * that is still on the auto rule belongs to a document that was written that
 * way, and placing another does not change how it was built.
 *
 * Everything that is not a gate on a whoop canvas keeps the old rule: a
 * pole's yaw is a pass direction once it is turned by hand, and a five inch
 * gate turns along the line at any angle. Nothing here reads or writes the
 * document, so it can be asked where a gate WOULD go, for a ghost.
 */
export function placementFor(doc, position, type) {
  const plain = { yaw: defaultYawFor(doc, position), pin: false, pinPrevious: null };
  const def = ELEMENTS[type];
  if (!def || def.kind !== KIND.APERTURE || trackClassOf(doc) !== 'micro' || docModeOf(doc) === 'freestyle') {
    return plain;
  }
  /* A gate put exactly where a side by side pair goes faces the way the gate it
   * stands beside faces, and keeps it: a pair is two gates in one plane, and the
   * line from the last gate has nothing to say about that. */
  const beside = sideBySideYaw(doc, position);
  if (beside != null) {
    const lastGate = lastAnchorOf(doc);
    const prev0 = lastGate && lastGate.seq ? elementById(doc, lastGate.seq.elementId) : null;
    const sole = doc.sequence.filter((q) => {
      const e = elementById(doc, q.elementId);
      return e && kindOf(e) === KIND.APERTURE;
    }).length === 1;
    return {
      yaw: beside,
      pin: true,
      pinPrevious: prev0 && kindOf(prev0) === KIND.APERTURE && !prev0.yawOverridden && sole ? { id: prev0.id, yaw: prev0.yaw } : null,
    };
  }
  const last = lastAnchorOf(doc);
  if (!last) {
    return { yaw: 0, pin: false, pinPrevious: null };
  }
  const dx = position.x - last.pos.x;
  const dy = position.y - last.pos.y;
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) {
    return { yaw: 0, pin: false, pinPrevious: null };
  }
  const yaw = nearestQuarter(Math.atan2(dy, dx));
  let pinPrevious = null;
  const prev = last.seq ? elementById(doc, last.seq.elementId) : null;
  const gates = doc.sequence.filter((s) => {
    const e = elementById(doc, s.elementId);
    return e && kindOf(e) === KIND.APERTURE;
  }).length;
  if (prev && kindOf(prev) === KIND.APERTURE && !prev.yawOverridden && gates === 1) {
    pinPrevious = { id: prev.id, yaw };
  }
  return { yaw, pin: true, pinPrevious };
}

/*
 * PUT A NEW ELEMENT ON A TRACK, and into the flying order if it belongs there.
 * The body of App.placeAt for a race track, moved here so that the rule above
 * and the sequence it feeds are one function the self test can run in Node.
 * Returns the element, already in the document.
 */
export function placeOnTrack(doc, type, position) {
  const def = ELEMENTS[type];
  const plan = placementFor(doc, position, type);
  const el = createElement(doc, type, position, def.kind === KIND.ANNOTATION ? 0 : plan.yaw);
  if (plan.pin) {
    el.yawOverridden = true;
  }
  if (plan.pinPrevious) {
    const prev = elementById(doc, plan.pinPrevious.id);
    if (prev) {
      /* Six decimals, as createElement keeps them, so the two gates of one
       * heading hold one value. */
      prev.yaw = Math.round(wrapAngle(plan.pinPrevious.yaw) * 1e6) / 1e6;
      prev.yawOverridden = true;
    }
  }
  doc.elements.push(el);
  if (isSequenceable(el)) {
    addToSequence(doc, el.id, 0);
    const fig = defaultFigure(el);
    if (fig !== 'single') {
      applyFigure(doc, el.id, fig);
    }
  }
  return el;
}

/* ------------------------------------------------------------------ */
/* Distances                                                           */
/* ------------------------------------------------------------------ */

/*
 * WHAT A DISTANCE BETWEEN TWO GATES MEANS, as the rule reads it (see the long
 * comment in warnings.js). Adjacent gates are 27 to 33 in centre to centre, and
 * only a pair CLOSER than 27 in can break it, because a pair that close is
 * unavoidably adjacent and unavoidably out of band. Between 33 in and a quarter
 * more is a pair that is nearly a side by side pair. Past that it is a distance
 * and nothing more, which is nearly every distance on a track: colouring those
 * would make the whole track look wrong.
 */
export function spacingTone(d) {
  if (d < GATE_SPACING_MIN - 1e-6) {
    return 'close';
  }
  if (d <= GATE_SPACING_MAX + 1e-6) {
    return 'legal';
  }
  if (d < GATE_SPACING_MAX * 1.25) {
    return 'near';
  }
  return 'plain';
}

/* ------------------------------------------------------------------ */
/* Copying, and the order                                              */
/* ------------------------------------------------------------------ */

const round6 = (v) => Math.round(v * 1e6) / 1e6;

/*
 * WHERE A COPY GOES: beside what it copies, a gate's width on, because that is
 * where a side by side pair stands (30 in centre to centre on a whoop canvas).
 * One gate goes along its own width, the way it faces; a group goes to the
 * right of all of it, past its whole width and a gap, so the copy does not
 * land inside the original.
 */
function copyOffsetFor(doc, sources) {
  const micro = trackClassOf(doc) === 'micro';
  if (sources.length === 1 && kindOf(sources[0]) === KIND.APERTURE) {
    const el = sources[0];
    const f = apertureFrame(el.yaw, el.pitch);
    let x = f.widthAxis.x;
    let y = f.widthAxis.y;
    if (Math.abs(x) >= Math.abs(y) ? x < 0 : y < 0) {
      x = -x;
      y = -y;
    }
    const gap = micro ? GATE_SPACING_NOMINAL : Math.max(1, (el.dims.clearW || 1) + 1.5);
    return { x: x * gap, y: y * gap };
  }
  const box = trackBounds({ elements: sources });
  return { x: (box.maxX - box.minX) + (micro ? GATE_SPACING_NOMINAL : 1.5), y: 0 };
}

/*
 * COPY ELEMENTS, and put what belongs in the flying order at the end of it.
 * Copies are made in the order the originals are flown, whatever order the
 * caller named them in, so a copied run is flown as it was. Start pads are not
 * copied (a track has one set). Returns the new ids in that order; an id that
 * is not there is nothing.
 */
export function copyElements(doc, ids, offset = null) {
  const wanted = new Set(ids);
  const sources = [];
  for (const s of doc.sequence) {
    const el = wanted.has(s.elementId) ? elementById(doc, s.elementId) : null;
    if (el && !sources.includes(el)) {
      sources.push(el);
    }
  }
  for (const el of doc.elements) {
    if (wanted.has(el.id) && !sources.includes(el)) {
      sources.push(el);
    }
  }
  const copyable = sources.filter((el) => kindOf(el) !== KIND.START);
  if (!copyable.length) {
    return [];
  }
  const shift = offset ?? copyOffsetFor(doc, copyable);
  const made = [];
  for (const src of copyable) {
    const copy = deepClone(src);
    copy.id = newElementId(doc);
    copy.name = '';
    copy.position.x = round6(src.position.x + shift.x);
    copy.position.y = round6(src.position.y + shift.y);
    doc.elements.push(copy);
    made.push(copy.id);
    if (isSequenceable(copy)) {
      addToSequence(doc, copy.id, 0);
      const fig = defaultFigure(copy);
      if (fig !== 'single') {
        applyFigure(doc, copy.id, fig);
      }
    }
  }
  return made;
}

/*
 * MOVE A PASS TO THE PLACE ITS NUMBER NAMES. The number on a gate is what a
 * pilot counts, and a waypoint has none (gateNumbers), so "3" means the third
 * gate, not the third row of the list. A place past the end is the end and one
 * before the start is the start; something that is not a number, or a
 * waypoint, is left alone. Returns whether the order changed.
 */
export function moveToPlace(doc, seqId, place) {
  if (String(place).trim() === '') {
    return false;
  }
  const n = Math.round(Number(place));
  const from = doc.sequence.findIndex((s) => s.id === seqId);
  if (!Number.isFinite(n) || from < 0) {
    return false;
  }
  const numbers = gateNumbers(doc);
  if (numbers.get(seqId) == null) {
    return false;
  }
  const numbered = doc.sequence.filter((s) => numbers.get(s.id) != null);
  const target = doc.sequence.indexOf(numbered[Math.max(1, Math.min(numbered.length, n)) - 1]);
  return moveInSequence(doc, from, target);
}

/*
 * THE DISTANCES TO SHOW WHILE A GATE IS PLACED OR DRAGGED, each measured
 * between the middles of two openings because that is what the rule says
 * ("centre to centre", in three dimensions: warnings.js has the account of a
 * track that a flat distance got wrong).
 *
 * `centre` is where the gate's opening would be, and `id` the element being
 * dragged, or null for one that is about to be placed. The list is the gate
 * before it in the flying order, the gate after it, and any other gate close
 * enough to be nearly a pair with it; nothing is listed twice and nothing is
 * measured to itself. Each is { from, to, d, tone, text }, with `from` at the
 * neighbour and `to` at `centre`, and the text in both units.
 */
export function measuresFor(doc, centre, id = null) {
  const out = [];
  const seen = new Set();
  const add = (at) => {
    if (!at) {
      return;
    }
    const key = `${at.x.toFixed(4)},${at.y.toFixed(4)},${at.z.toFixed(4)}`;
    const d = Math.hypot(at.x - centre.x, at.y - centre.y, at.z - centre.z);
    if (seen.has(key) || d < 1e-6) {
      return;
    }
    seen.add(key);
    out.push({ from: { x: at.x, y: at.y, z: at.z }, to: { ...centre }, d, tone: spacingTone(d), text: inches(d) });
  };
  if (id == null) {
    const last = lastAnchorOf(doc);
    add(last ? last.pos : null);
  } else {
    doc.sequence.forEach((s, i) => {
      if (s.elementId !== id) {
        return;
      }
      for (const j of [i - 1, i + 1]) {
        const other = doc.sequence[j];
        if (other && other.elementId !== id) {
          add(entryAnchor(doc, other));
        }
      }
    });
  }
  const reach = GATE_SPACING_MAX * 1.25;
  for (const el of doc.elements) {
    if (el.id === id || kindOf(el) !== KIND.APERTURE) {
      continue;
    }
    for (let i = 0; i < aperturesOf(el).length; i += 1) {
      const c = apertureCenter(el, i);
      if (Math.hypot(c.x - centre.x, c.y - centre.y, c.z - centre.z) < reach) {
        add(c);
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Magnets                                                             */
/* ------------------------------------------------------------------ */

const IN = 0.0254;

/* How near, on the floor, a piece has to be to a legal spot for the magnet to
 * take it: a few inches, which is a few dozen pixels in the room and enough to
 * feel it, and not so many that a gate cannot be put anywhere else. */
export const MAGNET_RADIUS = 3 * IN;

/* The direction along the width of a gate, on the floor. */
function widthAxisOf(el) {
  const f = apertureFrame(el.yaw, el.pitch);
  return { x: f.widthAxis.x, y: f.widthAxis.y };
}

/*
 * THE FACING OF A GATE PUT EXACTLY BESIDE ANOTHER, or null when it is not. A
 * side by side pair is 30 in centre to centre along the width of a gate, which
 * is a place a magnet takes a gate to and a place a hand can put one by typing;
 * either way the two are in one plane and face one way. A millimetre is the
 * width of "exactly", because a snapped position is computed and not typed.
 */
export function sideBySideYaw(doc, at, ignore = []) {
  const skip = new Set(ignore);
  for (const g of doc.elements) {
    if (skip.has(g.id) || kindOf(g) !== KIND.APERTURE) {
      continue;
    }
    const w = widthAxisOf(g);
    for (const sign of [-1, 1]) {
      const cx = g.position.x + sign * w.x * GATE_SPACING_NOMINAL;
      const cy = g.position.y + sign * w.y * GATE_SPACING_NOMINAL;
      if (Math.hypot(cx - at.x, cy - at.y) < 0.002) {
        return g.yaw;
      }
    }
  }
  return null;
}

/* What is being moved, as far as the rules care: a gate, a pole, or something
 * the rules have no distance for. */
function movingKind(type) {
  const def = ELEMENTS[type];
  if (def && def.kind === KIND.APERTURE) {
    return 'gate';
  }
  return type === 'pole' ? 'pole' : 'other';
}

/* Whether a piece of `kind` may stand at `c`: inside the room, at least 27 in
 * from another gate, at least 14 in from a gate or a pole where one is a pole,
 * and at least 36 in from another pole. The magnets only ever offer such a spot,
 * which is what "never snaps to a spot the rules forbid" means. */
function legalSpot(doc, kind, c, skip) {
  const f = doc.field;
  if (c.x < 0 || c.y < 0 || c.x > f.width || c.y > f.depth) {
    return false;
  }
  for (const e of doc.elements) {
    if (skip.has(e.id)) {
      continue;
    }
    const gate = kindOf(e) === KIND.APERTURE;
    const pole = e.type === 'pole';
    const d = Math.hypot(e.position.x - c.x, e.position.y - c.y);
    if (kind === 'gate' && ((gate && d < GATE_SPACING_MIN - 1e-6) || (pole && d < POLE_FROM_GATE_MIN - 1e-6))) {
      return false;
    }
    if (kind === 'pole' && ((gate && d < POLE_FROM_GATE_MIN - 1e-6) || (pole && d < POLE_FROM_POLE_MIN - 1e-6))) {
      return false;
    }
  }
  return true;
}

/*
 * WHERE A PIECE LANDS. `at` is where it was put, already on the grid; the answer
 * is { x, y, snapped, guides }. Near a legal position it is that position:
 *
 *   a gate     30 in centre to centre from another along its width, either side
 *              (a side by side pair, which RaceGOW names as its own element);
 *   a pole     14 in off a gate along its width, either side, and 36 in from
 *              another pole along an axis (the two distances the diagrams
 *              dimension);
 *   anything   the same x, or the same y, as another piece, which is how a track
 *              is squared up.
 *
 * A slot beats a line, the nearest wins, and a candidate the rules forbid is
 * never offered. `guides` say why it landed, each { kind, a, b, text }, for a
 * view to draw. `off` (Alt) turns all of it off, and `ignore` names the pieces
 * being moved, which are not things to land beside. A pure function of the
 * document and a point, used by both views, so the plan and the room cannot
 * disagree; snapping what it returned changes nothing more.
 */
export function magnetFor(doc, at, opts = {}) {
  const none = { x: at.x, y: at.y, snapped: false, guides: [] };
  if (opts.off) {
    return none;
  }
  const radius = opts.radius ?? MAGNET_RADIUS;
  const skip = new Set(opts.ignore ?? []);
  const kind = movingKind(opts.type);
  const others = doc.elements.filter((e) => !skip.has(e.id));

  const slots = [];
  for (const g of others) {
    if (kindOf(g) !== KIND.APERTURE) {
      continue;
    }
    const w = widthAxisOf(g);
    const reach = kind === 'gate' ? GATE_SPACING_NOMINAL : POLE_FROM_GATE_MIN;
    if (kind === 'gate' || kind === 'pole') {
      for (const sign of [-1, 1]) {
        slots.push({
          kind: kind === 'gate' ? 'pair' : 'pole',
          from: g.position,
          x: g.position.x + sign * w.x * reach,
          y: g.position.y + sign * w.y * reach,
          text: kind === 'gate' ? '30 in' : '14 in',
        });
      }
    }
  }
  if (kind === 'pole') {
    for (const q of others) {
      if (q.type !== 'pole') {
        continue;
      }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        slots.push({ kind: 'pole', from: q.position, x: q.position.x + dx * POLE_FROM_POLE_MIN, y: q.position.y + dy * POLE_FROM_POLE_MIN, text: '36 in' });
      }
    }
  }
  let best = null;
  for (const c of slots) {
    const d = Math.hypot(c.x - at.x, c.y - at.y);
    if (d <= radius && legalSpot(doc, kind, c, skip) && (!best || d < best.d)) {
      best = { ...c, d };
    }
  }
  if (best) {
    return {
      x: best.x,
      y: best.y,
      snapped: true,
      guides: [{ kind: best.kind, a: { x: best.from.x, y: best.from.y }, b: { x: best.x, y: best.y }, text: best.text }],
    };
  }

  let bx = null;
  let by = null;
  for (const e of others) {
    const dx = Math.abs(e.position.x - at.x);
    const dy = Math.abs(e.position.y - at.y);
    if (dx <= radius && (!bx || dx < bx.d)) {
      bx = { d: dx, e };
    }
    if (dy <= radius && (!by || dy < by.d)) {
      by = { d: dy, e };
    }
  }
  for (const [ax, ay] of [[bx, by], [bx, null], [null, by]]) {
    if (!ax && !ay) {
      continue;
    }
    const c = { x: ax ? ax.e.position.x : at.x, y: ay ? ay.e.position.y : at.y };
    if (!legalSpot(doc, kind, c, skip)) {
      continue;
    }
    const guides = [];
    if (ax) {
      guides.push({ kind: 'align-x', a: { x: ax.e.position.x, y: ax.e.position.y }, b: { x: c.x, y: c.y }, text: '' });
    }
    if (ay) {
      guides.push({ kind: 'align-y', a: { x: ay.e.position.x, y: ay.e.position.y }, b: { x: c.x, y: c.y }, text: '' });
    }
    return { x: c.x, y: c.y, snapped: true, guides };
  }
  return none;
}

/* ------------------------------------------------------------------ */
/* The row of gates                                                    */
/* ------------------------------------------------------------------ */

/* RaceGOW's side by side gates are two or three in a row. */
export const ROW_MAX = 3;

/*
 * WHAT A DRAG ALONG THE FLOOR MEANS AS A ROW OF GATES: from where it starts to
 * where it ends, along the nearer axis, as many gates 30 in apart as the drag
 * is long, two at the least and three at the most, each facing across the row
 * the way the course is going. Returns { count, dir, items: [{ x, y, yaw }] },
 * the first item where the drag began. Pure, so the ghost that follows the drag
 * and the gates it places are the same answer.
 *
 * WHICH WAY THEY FACE. Across the row there are two ways, and the one that
 * points the way the course is heading, from the last place it has been to the
 * middle of the row, is taken; with nothing before it, the one that points
 * north or east.
 */
export function rowPlan(doc, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const dir = alongX ? { x: dx < 0 ? -1 : 1, y: 0 } : { x: 0, y: dy < 0 ? -1 : 1 };
  const along = alongX ? Math.abs(dx) : Math.abs(dy);
  const count = Math.max(2, Math.min(ROW_MAX, Math.round(along / GATE_SPACING_NOMINAL) + 1));
  const centre = {
    x: a.x + (dir.x * GATE_SPACING_NOMINAL * (count - 1)) / 2,
    y: a.y + (dir.y * GATE_SPACING_NOMINAL * (count - 1)) / 2,
  };
  const n1 = { x: -dir.y, y: dir.x };
  const n2 = { x: dir.y, y: -dir.x };
  const last = lastAnchorOf(doc);
  let across = n1.x + n1.y > 0 ? n1 : n2;
  if (last) {
    const h = { x: centre.x - last.pos.x, y: centre.y - last.pos.y };
    const d1 = n1.x * h.x + n1.y * h.y;
    const d2 = n2.x * h.x + n2.y * h.y;
    if (Math.abs(d1 - d2) > 1e-9) {
      across = d1 > d2 ? n1 : n2;
    }
  }
  const yaw = Math.atan2(across.y, across.x);
  const items = [];
  for (let i = 0; i < count; i += 1) {
    items.push({ x: a.x + dir.x * GATE_SPACING_NOMINAL * i, y: a.y + dir.y * GATE_SPACING_NOMINAL * i, yaw });
  }
  return { count, dir, items };
}

/*
 * LAY THE ROW: ordinary gates, pinned to their heading, joined to the flying
 * order in the order along the row and each flown along the way it faces (the
 * chord between two gates side by side is square to both, so the rule that
 * reads a direction off the chord has nothing to read, and this says it). Each
 * gate after the first gives up the side that faces the one before it, so the
 * shared vertical is built once: `unbuiltSides` is what already means that.
 * Returns the new ids, in row order.
 */
export function placeRow(doc, a, b) {
  const plan = rowPlan(doc, a, b);
  const ids = [];
  for (const it of plan.items) {
    const el = createElement(doc, 'gate', { x: it.x, y: it.y, z: 0 }, it.yaw);
    el.yawOverridden = true;
    doc.elements.push(el);
    addToSequence(doc, el.id, 0);
    ids.push(el.id);
  }
  for (let i = 1; i < ids.length; i += 1) {
    const el = elementById(doc, ids[i]);
    const w = widthAxisOf(el);
    const towardPrevious = { x: -plan.dir.x, y: -plan.dir.y };
    setSideBuilt(doc, el.id, w.x * towardPrevious.x + w.y * towardPrevious.y > 0 ? 'right' : 'left', false);
  }
  for (const id of ids) {
    const seq = doc.sequence.find((q) => q.elementId === id);
    if (seq && !seq.overridden) {
      seq.entry = 1;
    }
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* The ruler                                                           */
/* ------------------------------------------------------------------ */

/* How near, on the floor, the pointer has to be to the middle of a piece for the
 * ruler to take the middle. */
export const RULER_REACH = 6 * IN;

/*
 * WHERE THE RULER LANDS: on the middle of the nearest piece within reach, since
 * the question is nearly always how far one gate is from another, and otherwise
 * on the inch. Alt takes exactly what it is given. `on` is the piece it landed
 * on, or null. Pure: nothing is written to the track, and nothing about a ruler
 * is ever stored in it (a layout fact belongs in the build sheet).
 */
export function rulerPoint(doc, at, opts = {}) {
  if (opts.off) {
    return { x: at.x, y: at.y, on: null };
  }
  let best = null;
  for (const el of doc.elements) {
    const kind = kindOf(el);
    if (kind === KIND.DECAL || kind === KIND.ZONE || kind === KIND.ROAD || kind === KIND.VEHICLE || kind === KIND.ANNOTATION) {
      continue;
    }
    const d = Math.hypot(el.position.x - at.x, el.position.y - at.y);
    if (d <= RULER_REACH && (!best || d < best.d)) {
      best = { d, el };
    }
  }
  if (best) {
    return { x: best.el.position.x, y: best.el.position.y, on: best.el.id };
  }
  const g = doc.field.gridSize;
  return { x: Math.round(at.x / g) * g, y: Math.round(at.y / g) * g, on: null };
}

/* What the ruler says between two floor points: the distance and its words, in
 * inches with the millimetres beside them. */
export function rulerReading(a, b) {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  return { d, text: inches(d) };
}

/* ------------------------------------------------------------------ */
/* Replace with                                                        */
/* ------------------------------------------------------------------ */

/*
 * WHAT CAN STAND IN FOR WHAT. A gate can be a stack, a tower or a horizontal
 * gate and still be flown through, so a swap keeps its place in the order; a pole
 * can be a cone; a bar across the room can be a barrier. A gate cannot become a
 * pole, because a pass through an opening and a pass round a marker are not the
 * same entry in the flying order (one has a direction, the other a side and a
 * clearance), so what would "keep its place" mean. A waypoint is not a piece.
 */
const SWAP_GROUPS = [
  ['gate', 'doubleStack', 'ladder', 'tower', 'diveGate'],
  ['pole', 'cone'],
  ['horizontalPole', 'barrier'],
];

/*
 * WHAT A SELECTION CAN BE REPLACED WITH, in the palette's order: the types that
 * every selected piece can become, other than the one they all already are. A
 * selection of pieces from different groups, or of something with no group, has
 * no answer, so the menu is not offered.
 */
export function replacementsFor(doc, ids) {
  const pieces = [...new Set(ids)].map((id) => elementById(doc, id));
  if (!pieces.length || pieces.some((el) => !el)) {
    return [];
  }
  const group = SWAP_GROUPS.find((g) => g.includes(pieces[0].type));
  if (!group || pieces.some((el) => !group.includes(el.type))) {
    return [];
  }
  const same = pieces.every((el) => el.type === pieces[0].type);
  return MICRO_PALETTE_ORDER.filter((t) => group.includes(t) && !(same && t === pieces[0].type));
}

/*
 * REPLACE WITH: change what a piece is and leave where it is. The id, the name,
 * the position, the turn and whether the turn is pinned stay, so every other piece
 * that refers to it, and the place in the flying order, are undisturbed. The size
 * of a gate's opening stays too, because RaceGOW wants every gate on a track the
 * same size; the rest of what a piece is (how many openings, how high off the
 * floor, how it is tilted, how big a cone is) is the new type's own, except where
 * the old one had been moved off its type's default, which is somebody's
 * decision and is left alone. A pass at an opening the new piece does not have is
 * dropped from the order (a stack of three that becomes a gate has one opening to
 * fly through), and the faces are derived again. Returns the ids that changed.
 * Pieces that are not in the type's group are left as they are.
 */
export function replaceWith(doc, ids, type) {
  const to = ELEMENTS[type];
  const group = SWAP_GROUPS.find((g) => g.includes(type));
  if (!to || !group) {
    return [];
  }
  const cls = trackClassOf(doc);
  const changed = [];
  for (const id of new Set(ids)) {
    const el = elementById(doc, id);
    if (!el || el.type === type || !group.includes(el.type)) {
      continue;
    }
    const from = el.type;
    const opening = kindOf(el) === KIND.APERTURE ? { clearW: el.dims.clearW, clearH: el.dims.clearH } : null;
    const pitchIsDefault = Math.abs((el.pitch ?? 0) - defaultPitch(from, cls)) < 1e-9;
    const zIsDefault = Math.abs((el.position.z ?? 0) - defaultZ(from, cls)) < 1e-9;
    el.type = type;
    el.dims = defaultDims(type, cls);
    if (opening && opening.clearW > 0 && opening.clearH > 0) {
      el.dims.clearW = opening.clearW;
      el.dims.clearH = opening.clearH;
    }
    if (pitchIsDefault) {
      el.pitch = defaultPitch(type, cls);
    }
    if (zIsDefault) {
      el.position.z = defaultZ(type, cls);
    }
    if (kindOf(el) === KIND.APERTURE) {
      const openings = aperturesOf(el).length;
      for (const q of doc.sequence.filter((x) => x.elementId === id && (x.apertureIndex ?? 0) >= openings)) {
        removeFromSequence(doc, q.id);
      }
    }
    changed.push(id);
  }
  if (changed.length) {
    applyAutoFaces(doc);
  }
  return changed;
}
