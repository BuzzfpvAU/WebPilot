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

import { trackClassOf, docModeOf } from './elements.js';
import { envelopeFor, GATE_OPENING_DEFAULT } from './racegow.js';

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
