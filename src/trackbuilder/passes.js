/*
 * passes.js: pieces and passes, for a whoop track where a piece is flown more
 * than once.
 *
 * A PIECE STANDS IN THE ROOM AND A PASS IS A MOMENT IN THE LAP. The document
 * keeps them apart already (sequence.js: one object is not one sequence
 * entry), and the builder drew them together: every pass had its own arrow,
 * its own number and, on a pole, its own square of coloured glass, all on the
 * same spot, so RaceGOW5 Track 8's tall pole, flown six times, was a heap.
 * This module is the one place that knows how the passes group up, which of
 * them is in focus, and which stretch of the racing line belongs to it, so
 * the room, the strip along its foot and the card all say the same thing.
 *
 * PURE. No DOM, no Three.js, nothing stored: a track written before this file
 * existed reads exactly as it did, and the schema does not move. What is in
 * focus is the builder's own state and is never in the document.
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

import { KIND } from './elements.js';
import { elementById, kindOf, aperturesOf } from './model.js';
import { addToSequence, removeFromSequence, gateNumbers } from './sequence.js';

/* A lap this long is not a lap somebody flies. The tool that adds a pass with a
 * click has to stop somewhere, or a held key grows the document without end. The
 * longest shipped track is 40 entries. */
export const MAX_PASSES = 400;

/*
 * The flying order with each entry's piece looked up and the number the builder
 * shows for it, in order. An entry that points at nothing is not a pass, and
 * `index` stays the entry's place in doc.sequence so it can be found again.
 */
export function passList(doc) {
  const seqs = Array.isArray(doc && doc.sequence) ? doc.sequence : [];
  const numbers = gateNumbers(doc);
  const out = [];
  seqs.forEach((seq, index) => {
    const element = seq ? elementById(doc, seq.elementId) : null;
    if (!element) {
      return;
    }
    out.push({
      seq,
      index,
      number: numbers.get(seq.id) ?? null,
      element,
      apertureIndex: seq.apertureIndex ?? 0,
    });
  });
  return out;
}

/*
 * One tag for each OPENING that is flown, not one for each pass: a stack flown
 * low, high and low again has two, and a pole flown six times has one. A
 * waypoint has no number and no tag. They come in the order the lap first
 * reaches them.
 */
export function tagsOf(doc) {
  const tags = new Map();
  for (const p of passList(doc)) {
    if (p.number == null) {
      continue;
    }
    const key = `${p.element.id}#${p.apertureIndex}`;
    let tag = tags.get(key);
    if (!tag) {
      tag = { key, elementId: p.element.id, apertureIndex: p.apertureIndex, passes: [], numbers: [], first: p.number, count: 0 };
      tags.set(key, tag);
    }
    tag.passes.push(p);
    tag.numbers.push(p.number);
    tag.count += 1;
  }
  return [...tags.values()];
}

/*
 * How much of a lap is the same pieces again: the pieces that are flown, the
 * numbered passes through them, how many pieces are flown more than once (through
 * any opening), and the waypoints, which are passes that score nothing.
 */
export function reuseOf(doc) {
  const per = new Map();
  let waypoints = 0;
  let passes = 0;
  for (const p of passList(doc)) {
    if (p.number == null) {
      waypoints += 1;
      continue;
    }
    passes += 1;
    per.set(p.element.id, (per.get(p.element.id) ?? 0) + 1);
  }
  return {
    pieces: per.size,
    passes,
    reused: [...per.values()].filter((n) => n > 1).length,
    waypoints,
  };
}

/*
 * The ways a tag's opening is flown: -1 and 1 for a gate (which face it is
 * entered from), 'left' and 'right' for a pole or a cone (which side it is
 * passed on). One arrow is drawn for each, not one for each pass. A pass whose
 * face has not been decided yet has none.
 */
export function lanesOf(tag) {
  const set = new Set();
  for (const p of tag.passes) {
    if (kindOf(p.element) === KIND.APERTURE) {
      if (p.seq.entry === 1 || p.seq.entry === -1) {
        set.add(p.seq.entry);
      }
    } else if (p.seq.passSide === 'left' || p.seq.passSide === 'right') {
      set.add(p.seq.passSide);
    }
  }
  const out = [...set];
  return typeof out[0] === 'number' ? out.sort((a, b) => a - b) : out.sort();
}

/*
 * THE ONE PASS IN FOCUS, or null. The pass under the pointer comes first, so a
 * chip on the strip or a number on a tag can be looked at without letting go of
 * what is selected. After that the pass the pilot pinned, as long as it belongs
 * to what is selected (or nothing is), and then the first pass of the one piece
 * that is selected, which is what a click on a piece means.
 */
export function focusFor(doc, { selection = new Set(), pinned = null, hover = null } = {}) {
  const seqs = Array.isArray(doc && doc.sequence) ? doc.sequence : [];
  const find = (id) => (id == null ? null : seqs.find((q) => q && q.id === id) ?? null);
  const over = find(hover);
  if (over) {
    return over.id;
  }
  const picked = [...selection].filter((id) => elementById(doc, id));
  const held = find(pinned);
  if (held && (!picked.length || (picked.length === 1 && picked[0] === held.elementId))) {
    return held.id;
  }
  if (picked.length === 1) {
    const first = seqs.find((q) => q && q.elementId === picked[0]);
    return first ? first.id : null;
  }
  return null;
}

/* The pass before and the pass after one, and its place, or null. */
export function aroundPass(doc, seqId) {
  const seqs = Array.isArray(doc && doc.sequence) ? doc.sequence : [];
  const index = seqs.findIndex((q) => q && q.id === seqId);
  if (index < 0) {
    return null;
  }
  return {
    prev: index > 0 ? seqs[index - 1] : null,
    next: index < seqs.length - 1 ? seqs[index + 1] : null,
    index,
  };
}

/*
 * THE STRETCH OF RACING LINE THAT BELONGS TO A PASS: the segment that arrives
 * at its knot and the one that leaves it, as a range of the path's samples,
 * plus the sample that closes the last of them (a segment's samples stop just
 * short of its far knot, and the next segment's first sample is that knot).
 * It is what is drawn bright when a pass is in focus. Null when there is no
 * line, or the pass has no knot on it.
 */
export function stretchOf(path, seqId) {
  if (!path || !Array.isArray(path.knots) || !Array.isArray(path.samples) || !path.samples.length) {
    return null;
  }
  const knotIndex = path.knots.findIndex((k) => k.seq && k.seq.id === seqId);
  if (knotIndex < 0) {
    return null;
  }
  let from = -1;
  let to = -1;
  path.samples.forEach((s, i) => {
    if (s.segment >= knotIndex - 1 && s.segment <= knotIndex) {
      if (from < 0) {
        from = i;
      }
      to = i;
    }
  });
  if (from < 0) {
    return null;
  }
  if (to + 1 < path.samples.length) {
    to += 1;
  }
  return { knotIndex, from, to };
}

/*
 * Which opening of a piece a click at this height landed on: the nearest, so a
 * click on the bar between two openings goes to one of them and a click above
 * or below goes to the end one. A gate, a pole and anything that is not there
 * have only the first.
 */
export function apertureAt(doc, elementId, z) {
  const el = elementById(doc, elementId);
  if (!el || kindOf(el) !== KIND.APERTURE) {
    return 0;
  }
  const levels = aperturesOf(el);
  let best = 0;
  let bestGap = Infinity;
  levels.forEach((ap, i) => {
    const gap = Math.abs(el.position.z + ap.centerH - z);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

/*
 * FLY IT AGAIN: another pass through a piece, at the end of the lap or at a
 * place. Its direction is worked out from the line like every other pass's
 * (addToSequence runs the face rule). This is the one way to fly a single gate
 * a second time: "Fly another level" is for stacks and "Add to the track" is
 * for a piece that is not in the order at all. Null for a piece that cannot be
 * flown or is not there, and at the cap, and the order is then as it was.
 */
export function flyAgain(doc, elementId, apertureIndex = 0, atIndex = null) {
  if ((Array.isArray(doc && doc.sequence) ? doc.sequence.length : 0) >= MAX_PASSES) {
    return null;
  }
  return addToSequence(doc, elementId, apertureIndex, atIndex);
}

/* Take the last pass off the lap and give it back, or null when there is none. */
export function removeLastPass(doc) {
  const seqs = Array.isArray(doc && doc.sequence) ? doc.sequence : [];
  const last = seqs[seqs.length - 1];
  if (!last) {
    return null;
  }
  removeFromSequence(doc, last.id);
  return last;
}

/*
 * TAGS THAT DO NOT LIE ON ONE ANOTHER. Every tag sits over the opening it names,
 * and on a track whose pieces stand close together (Track 8's towers are three
 * gates on one spot) their anchors are a few pixels apart on the screen, so tags
 * piled up and the number under another could not be read. This is the one
 * arithmetic that moves them: boxes are laid in the order of `priority` (the tag
 * the pointer is on first, then the pass in focus, then the selected piece), each
 * at the nearest of a few steps to its own anchor that is clear of the boxes
 * already laid, and one that had a place last frame tries it first so a tag does
 * not hop between two places as the camera turns.
 *
 *   boxes  [{ key, x, y, w, h, priority, prev }]  x, y the top left of the box at
 *          its anchor, prev the { dx, dy } it was given last time, if any
 *   gap    the space kept between two boxes
 *
 * Returns Map<key, { dx, dy }>, dy never positive. A box that finds no free step
 * stays where it is anchored, which is the honest answer where the screen is
 * simply full.
 */
export function spreadTags(boxes, gap = 3) {
  /* Up and to the sides, never down: a tag hangs above the opening it names, and
   * one pushed down lands on the gate, which is what a press on the gate must hit. */
  const steps = [];
  for (let iy = -3; iy <= 0; iy += 1) {
    for (let ix = -2; ix <= 2; ix += 1) {
      steps.push({ ix, iy });
    }
  }
  steps.sort((a, b) => (Math.abs(a.ix) + Math.abs(a.iy)) - (Math.abs(b.ix) + Math.abs(b.iy)) || Math.abs(a.iy) - Math.abs(b.iy) || a.ix - b.ix);
  const order = boxes.map((b, i) => ({ b, i })).sort((p, q) => (q.b.priority - p.b.priority) || (p.i - q.i));
  const laid = [];
  const out = new Map();
  const clear = (r) => laid.every((o) => r.x + r.w + gap <= o.x || r.x >= o.x + o.w + gap
    || r.y + r.h + gap <= o.y || r.y >= o.y + o.h + gap);
  for (const { b } of order) {
    const at = (dx, dy) => ({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h });
    let pick = { dx: 0, dy: 0 };
    let found = false;
    if (b.prev && clear(at(b.prev.dx, b.prev.dy))) {
      pick = { dx: b.prev.dx, dy: b.prev.dy };
      found = true;
    }
    for (const st of found ? [] : steps) {
      const dx = st.ix * (b.w + gap);
      const dy = st.iy * (b.h + gap);
      if (clear(at(dx, dy))) {
        pick = { dx, dy };
        found = true;
        break;
      }
    }
    laid.push(at(pick.dx, pick.dy));
    out.set(b.key, pick);
  }
  return out;
}

/*
 * ONE ARROW FOR EACH WAY AN OPENING IS FLOWN, and no more: the lanes the room
 * and the plan draw. `numbers` is what sequenceNumbers gives for one piece
 * ([{ apertureIndex, number, seq }]), and `openings` how many openings the piece
 * has, so a stack that lost a level keeps its arrows on the ones that are left.
 * An opening flown one way has one lane; flown both ways it has two, the backward
 * one first, and the two are drawn side by side and never on top of each other.
 * A pass whose face has not been decided has no lane.
 *
 * Returns [{ apertureIndex, entry, seqIds, lane, lanes }], lane the place of
 * this one among the lanes of its opening and lanes how many there are.
 */
export function arrowLanes(numbers, openings = Infinity) {
  const by = new Map();
  for (const n of Array.isArray(numbers) ? numbers : []) {
    const seq = n && n.seq;
    if (!seq || (seq.entry !== 1 && seq.entry !== -1)) {
      continue;
    }
    const at = Math.min(n.apertureIndex ?? 0, Math.max(0, openings - 1));
    const lanes = by.get(at) ?? new Map();
    const lane = lanes.get(seq.entry) ?? { apertureIndex: at, entry: seq.entry, seqIds: [] };
    lane.seqIds.push(seq.id);
    lanes.set(seq.entry, lane);
    by.set(at, lanes);
  }
  const out = [];
  for (const [, lanes] of by) {
    const list = [...lanes.values()].sort((a, b) => a.entry - b.entry);
    list.forEach((lane, i) => out.push({ ...lane, lane: i, lanes: list.length }));
  }
  return out;
}
