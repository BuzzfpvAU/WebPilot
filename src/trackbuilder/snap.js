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

import { ELEMENTS, KIND, trackClassOf, docModeOf } from './elements.js';
import {
  envelopeFor, GATE_OPENING_DEFAULT, GATE_SPACING_MIN, GATE_SPACING_MAX, GATE_SPACING_NOMINAL, inches,
} from './racegow.js';
import {
  apertureCenter, aperturesOf, createElement, deepClone, elementById, entryAnchor, isSequenceable, kindOf,
  newElementId,
} from './model.js';
import { addToSequence, gateNumbers, moveInSequence } from './sequence.js';
import { applyFigure, defaultFigure } from './figures.js';
import { defaultYawFor, lastAnchorOf } from './faces.js';
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
