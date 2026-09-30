/*
 * importfpv.js: a track from the FPV Events designer, read into ours.
 *
 * That designer saves a track as { arena: { w, d, h }, gates: [ { typeId, x, z,
 * height, rotY, dir, prop } ], measurements }, and its public share of one is
 * the same wrapped in { id, name, data }. A pilot who has drawn a whoop track
 * there should not have to draw it again to fly it here, or to check it against
 * RaceGOW's rules, so this reads what maps and says what did not.
 *
 * WHAT MAPS, from the plan (WHOOP-BUILDER-PLAN.md 5.3), which was worked out on a
 * real track in a scratch script:
 *
 *   Floor position. x is kept. Their plan has z running down the screen and ours
 *   has y running up it, so y is the arena's depth minus z, and the arena is
 *   centred in our hall (where the game puts a track). Getting this sign wrong
 *   turns a converted course the wrong way, so the test says which way round it
 *   is with a gate whose place is known.
 *   Heading. Their gate faces (sin rotY, cos rotY) in (x, z); in ours that is
 *   (sin rotY, -cos rotY), a yaw of rotY minus a quarter turn. It is pinned, so
 *   the auto rule does not take it back.
 *   Height is the bottom of the opening. Gates at one spot and heading at even
 *   heights, two or three of them, are one stack, flown in their order; any other
 *   set at one spot is separate gates, as the shipped RaceGOW tracks have them.
 *   Direction. "back" is flown the other way through the gate.
 *   Poles are poles, in the flying order where they stand in theirs.
 *
 * WHAT DOES NOT, said in the report and never silently: a type this does
 * not know is dropped by name, and so is their start marker; the tape
 * measurements are not kept (a layout fact belongs in the build sheet); a gate
 * outside our 10 by 12 m hall is dropped.
 *
 * A CUBE is ours now (src/trackbuilder/cube.js): five gates in one group, or six when it stands
 * clear of the floor, laid where the faces of a cube are, at the size and the height it had and
 * the way it faced, and flown in at the face the file names first and out at the second ("top>right").
 * Their file names faces and does not say from which side its left and right are seen, so that is
 * read as ours (left is to the left of the way the cube faces) and the report says so.
 *
 * HOOPS AND HEXES are ours now (src/props/aperture.js): a hoop and a hex gate, where they
 * stood, at the width and the height they had, with the direction they were flown. A hoop is
 * round. A hex gate is as high as a hexagon of that width is; their file gives one number and
 * does not say whether it is measured across the points or across the flats, so it is read as
 * across the points, and the report says so.
 *
 * TABLES, CHAIRS AND BANNERS are ours now (src/props/room.js), and are kept where
 * they stood, on the floor, at the quarter turn nearest their heading, and never in
 * the flying order. Their file carries ONE size for each (a table's length, a
 * chair's seat, a banner's width), so the rest is ours, in the proportion of ours,
 * and the report says so, and says that which way one faces is a reading of their
 * rotY that no real file was there to check. A gate bigger than RaceGOW allows is
 * KEPT at its size and left for the rules to flag, because changing a size the
 * designer chose is not this file's decision.
 *
 * The real track that this was worked out on belongs to whoever drew it and is
 * not in the repository; the test uses a synthetic one with the same shapes.
 *
 * Pure: no DOM, no fetch (their API sends no CORS headers, so a page here cannot
 * read a link; a track is imported from a file or from pasted text).
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

import { createTrack, createElement, normalize } from './model.js';
import { addToSequence } from './sequence.js';
import { applyAutoFaces } from './faces.js';
import { GATE_OPENING_MAX, GATE_OPENING_MIN, inches } from './racegow.js';
import { nearestQuarter, placeCube } from './snap.js';
import { ROOM_SIZES, clampRoomSize } from '../props/room.js';
import { HEX_HEIGHT_RATIO } from '../props/aperture.js';

/* Their gate types by id, from the public list their designer serves: the shape,
 * and the inside measurement in metres (a square's clear opening, a pole's
 * height, a cube's edge). An id that is not here is read from a `types` list in
 * the text if there is one, and from its own name if it says a size. */
const KNOWN = {
  'square-75': { shape: 'square', size: 0.75 },
  'square-gate-0-6m': { shape: 'square', size: 0.6 },
  'whoop-square-50': { shape: 'square', size: 0.5 },
  'tall-pole-2m': { shape: 'pole', size: 2 },
  'pole-150': { shape: 'pole', size: 1.5 },
  'tinywhoop-cube': { shape: 'cube', size: 0.75 },
  'gemfan-cube-gate': { shape: 'cube', size: 0.8 },
  'whoop-cube-50': { shape: 'cube', size: 0.5 },
  'cube-wop': { shape: 'cube', size: 0.6 },
  'whoop-hex-50': { shape: 'hex', size: 0.5 },
  'whoop-hoop-50': { shape: 'circle', size: 0.5 },
  'big-hoop-1m': { shape: 'circle', size: 1 },
  'devon-banner': { shape: 'banner', size: 1.5 },
  'banner-200': { shape: 'banner', size: 2 },
  '1-2m-banner': { shape: 'banner', size: 1.2 },
  'menacerc-banner-1-2m': { shape: 'banner', size: 1.2 },
  'table-120': { shape: 'table', size: 1.2 },
  'chair-standard': { shape: 'chair', size: 0.45 },
  'start-gate': { shape: 'start', size: 1 },
  start: { shape: 'start', size: 1 },
};

const NAMES = {
  banner: 'banner', table: 'table', chair: 'chair', start: 'start marker',
};

/* The three of theirs that are furniture in ours. */
const FURNITURE = ['table', 'chair', 'banner'];

/* The faces of a cube by the words their file uses for them ("top>right" is in at the top and out at
 * the right), and ours. Forward and back are the two a plain gate's direction uses. */
const CUBE_WORDS = {
  top: 'top', bottom: 'bottom', left: 'left', right: 'right', front: 'front', forward: 'front', back: 'back', backward: 'back',
};

/* The two faces a cube is flown through, from the file's direction, and whether the file said. */
function cubePasses(dir) {
  const parts = String(dir ?? '').toLowerCase().split('>').map((w) => CUBE_WORDS[w.trim()]);
  if (parts.length === 2 && parts[0] && parts[1] && parts[0] !== parts[1]) {
    return { faces: parts, said: true };
  }
  return { faces: ['back', 'front'], said: false };
}

/*
 * The three sizes of one of ours, from the one number of theirs: a table's length,
 * a chair's seat, a banner's width. The rest is ours, kept in the proportion ours
 * has, so a 1.2 m table is 700 mm by 750 mm and a smaller or a larger one is the
 * same table.
 */
function furnitureDims(shape, size) {
  const base = ROOM_SIZES[shape];
  const width = clampRoomSize(size);
  const k = width / base.width;
  if (shape === 'table') {
    return { width, depth: clampRoomSize(base.depth * k), height: base.height };
  }
  if (shape === 'chair') {
    return { width, depth: width, height: clampRoomSize(base.height * k) };
  }
  return { width, depth: base.depth, height: base.height };
}

/* The most gates a text may list: a whoop track is a few dozen pieces. */
const MAX_GATES = 400;

const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const mm = (m) => `${Math.round(m * 1000)} mm`;

/* What a text or an object is, or null: an object with a gates list and an arena
 * (or the API's wrapper round one). */
function dataOf(input) {
  let obj = input;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input);
    } catch (e) {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return null;
  }
  const inner = obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data) ? obj.data : obj;
  if (!Array.isArray(inner.gates) || !inner.arena || typeof inner.arena !== 'object') {
    return null;
  }
  return { data: inner, name: typeof obj.name === 'string' ? obj.name : '', types: Array.isArray(obj.types) ? obj.types : (Array.isArray(inner.types) ? inner.types : []) };
}

/* Whether some text or object is one of their tracks, without reading it into a
 * document: the Import button asks this to choose which reader to use. */
export function looksLikeFpvEvents(input) {
  return dataOf(input) !== null;
}

/* One gate's type: the shape and inside measurement, or null when not known. */
function typeOf(g, table) {
  const own = table.get(g.typeId);
  if (own) {
    return own;
  }
  if (typeof g.typeId === 'string') {
    const sq = /^square-(\d{2,3})$/.exec(g.typeId);
    if (sq) {
      return { shape: 'square', size: Number(sq[1]) / 100 };
    }
  }
  return KNOWN[g.typeId] ?? null;
}

/*
 * THE TRACK, AS OURS. Returns { doc, report: { kept, approximated, dropped } } and
 * never throws: a text that is not one of their tracks is { error }. Each line of
 * the report says which gate, by its place in their list, and what became of it.
 */
export function importFpvEvents(input) {
  const read = dataOf(input);
  if (!read) {
    return { error: 'That is not a track from the FPV Events designer: it has no arena and no list of gates.' };
  }
  const { data } = read;
  if (data.gates.length > MAX_GATES) {
    return { error: `That track has ${data.gates.length} gates, more than any whoop room holds (${MAX_GATES} at the most).` };
  }
  const arena = {
    w: finite(data.arena.w) && data.arena.w > 0 ? data.arena.w : 6,
    d: finite(data.arena.d) && data.arena.d > 0 ? data.arena.d : 6,
  };
  const table = new Map();
  for (const t of read.types) {
    if (t && typeof t.id === 'string' && typeof t.shape === 'string' && finite(t.innerSize)) {
      table.set(t.id, { shape: t.shape, size: t.innerSize });
    }
  }

  const name = read.name ? `${read.name} (from the FPV Events designer)` : 'Track from the FPV Events designer';
  const doc = createTrack(name.slice(0, 80), 'micro');
  const report = { kept: [], approximated: [], dropped: [] };
  const offX = (doc.field.width - arena.w) / 2;
  const offY = (doc.field.depth - arena.d) / 2;
  const place = (g) => ({ x: offX + g.x, y: offY + (arena.d - g.z) });
  const inHall = (p) => p.x >= 0 && p.y >= 0 && p.x <= doc.field.width && p.y <= doc.field.depth;

  /* Each entry of theirs, in their order, with what it is. */
  const entries = data.gates.map((g, i) => ({ n: i + 1, g, def: null, skip: '' }));
  for (const e of entries) {
    const g = e.g;
    if (!g || typeof g !== 'object' || !finite(g.x) || !finite(g.z)) {
      e.skip = 'has no place on the floor';
      continue;
    }
    e.g = { ...g, height: finite(g.height) ? g.height : 0, rotY: finite(g.rotY) ? g.rotY : 0 };
    e.def = typeOf(e.g, table);
    if (!e.def) {
      e.skip = `is a "${String(g.typeId).slice(0, 40)}", which this does not know`;
    } else if (e.def.shape === 'start' || (g.prop === true && !FURNITURE.includes(e.def.shape))) {
      e.skip = `is a ${NAMES[e.def.shape] ?? 'prop'}, which a whoop room has no element for yet`;
    } else if (!inHall(place(e.g))) {
      e.skip = `stands outside the ${doc.field.width} by ${doc.field.depth} m hall`;
    }
  }
  for (const e of entries.filter((x) => x.skip)) {
    report.dropped.push(`#${e.n} ${e.skip}, so it was left out.`);
  }
  const live = entries.filter((e) => !e.skip);

  /* Squares at one spot and heading, at even heights: a stack. */
  const spot = (e) => `${e.g.x.toFixed(3)}|${e.g.z.toFixed(3)}|${e.g.rotY.toFixed(3)}|${e.def.size}`;
  const groups = new Map();
  for (const e of live.filter((x) => x.def.shape === 'square')) {
    groups.set(spot(e), [...(groups.get(spot(e)) ?? []), e]);
  }
  const stackOf = new Map();
  for (const list of groups.values()) {
    if (list.length < 2 || list.length > 3) {
      continue;
    }
    const heights = list.map((e) => e.g.height).sort((a, b) => a - b);
    const pitch = heights[1] - heights[0];
    const even = heights.every((h, i) => i === 0 || Math.abs((h - heights[i - 1]) - pitch) < 0.01);
    if (!even || pitch < 0.05) {
      continue;
    }
    const first = list[0];
    const type = list.length === 2 ? 'doubleStack' : 'ladder';
    const el = createElement(doc, type, place(first.g), first.g.rotY - Math.PI / 2);
    el.dims.clearW = first.def.size;
    el.dims.clearH = first.def.size;
    el.dims.sillH = heights[0];
    el.dims.levels = list.length;
    el.dims.levelPitch = pitch;
    el.yawOverridden = true;
    doc.elements.push(el);
    for (const e of list) {
      stackOf.set(e, { el, level: heights.indexOf(e.g.height) });
    }
    report.kept.push(`#${list.map((e) => e.n).join(', #')} became one ${list.length === 2 ? 'double' : 'triple'} stack, ${mm(pitch)} between the openings.`);
  }

  let keptGates = 0;
  let keptHoops = 0;
  let keptPoles = 0;
  const tooBig = [];
  for (const e of live) {
    const g = e.g;
    const shape = e.def.shape;
    const p = place(g);
    const yaw = g.rotY - Math.PI / 2;
    let target = null;
    if (stackOf.has(e)) {
      target = stackOf.get(e);
    } else if (shape === 'square' || shape === 'hex' || shape === 'circle') {
      const el = createElement(doc, shape === 'hex' ? 'hexGate' : (shape === 'circle' ? 'hoop' : 'gate'), p, yaw);
      el.dims.clearW = e.def.size;
      el.dims.clearH = shape === 'hex' ? e.def.size * HEX_HEIGHT_RATIO : e.def.size;
      el.dims.sillH = g.height;
      el.yawOverridden = true;
      doc.elements.push(el);
      target = { el, level: 0 };
      if (shape === 'square') {
        keptGates += 1;
      } else if (shape === 'circle') {
        keptHoops += 1;
      } else {
        report.approximated.push(`#${e.n} is a hexagon, ${mm(e.def.size)} across: it became a hex gate ${mm(e.def.size)} across the points and ${mm(el.dims.clearH)} across the flats. The file does not say which of the two its size is, so it was read as across the points: check it against the real one.`);
      }
    } else if (shape === 'pole') {
      const el = createElement(doc, 'pole', p, 0);
      el.dims.height = e.def.size;
      doc.elements.push(el);
      target = { el, level: 0 };
      keptPoles += 1;
    } else if (FURNITURE.includes(shape)) {
      const dims = furnitureDims(shape, e.def.size);
      /* Their gate faces (sin rotY, cos rotY), which is our yaw of rotY less a quarter
       * turn. A chair faces the way it looks; a table and a banner run ACROSS the way
       * a flat piece faces, so a quarter turn on. Then the nearest quarter, which is
       * where the physics builds it. */
      const facing = g.rotY - Math.PI / 2;
      const el = createElement(doc, shape, { x: p.x, y: p.y, z: 0 }, nearestQuarter(shape === 'chair' ? facing : facing + Math.PI / 2));
      Object.assign(el.dims, dims);
      doc.elements.push(el);
      if (shape === 'table') {
        report.approximated.push(`#${e.n} is a table, ${mm(e.def.size)} long: it became a table ${mm(dims.width)} long by ${mm(dims.depth)} across and ${mm(dims.height)} high, at the nearest quarter turn to its heading. The file does not say how deep or high it is, or which way its long side runs, so check them.`);
      } else if (shape === 'chair') {
        report.approximated.push(`#${e.n} is a chair, ${mm(e.def.size)} across: it became a chair ${mm(dims.width)} across and ${mm(dims.height)} high, facing the nearest quarter turn to its heading. The file does not say how high it is or which way it faces, so check them.`);
      } else {
        report.approximated.push(`#${e.n} is a banner, ${mm(e.def.size)} wide: it became a banner ${mm(dims.width)} wide and ${mm(dims.height)} high, at the nearest quarter turn to its heading. The file does not say how tall it is or which way its face looks, so check both.`);
      }
    } else if (shape === 'cube') {
      /* Two passes, in the order of their list, through the two faces the file names. */
      const want = cubePasses(g.dir);
      const cube = placeCube(doc, { x: p.x, y: p.y }, {
        yaw, lift: Math.max(0, g.height), edge: e.def.size, passes: want.faces,
      });
      const flown = cube.passes;
      const asked = flown.join() === want.faces.join();
      report.approximated.push(`#${e.n} is a cube, ${mm(e.def.size)}: it became a cube of gates ${mm(e.def.size)} across, ${want.said && asked
        ? `flown in at the ${flown[0]} and out at the ${flown[1]}`
        : `flown straight through, in at the back and out at the front, because ${want.said ? 'this cube has no such face' : 'the file names no faces'}`}. The file does not say which side of the cube its left and right are seen from, so check them.`);
      if (e.def.size > GATE_OPENING_MAX + 1e-6 || e.def.size < GATE_OPENING_MIN - 1e-6) {
        if (!tooBig.includes(e.def.size)) {
          tooBig.push(e.def.size);
        }
      }
      continue;
    }
    if (!target) {
      continue;
    }
    const seq = addToSequence(doc, target.el.id, target.level);
    if (seq && shape !== 'pole') {
      seq.entry = g.dir === 'back' ? -1 : 1;
      seq.overridden = true;
    }
    const size = target.el.dims.clearW;
    if (size && (size > GATE_OPENING_MAX + 1e-6 || size < GATE_OPENING_MIN - 1e-6) && !tooBig.includes(size)) {
      tooBig.push(size);
    }
  }
  if (keptGates) {
    report.kept.push(`${keptGates} square gate${keptGates === 1 ? '' : 's'} placed with the position, heading, height, size and direction they had.`);
  }
  if (keptHoops) {
    report.kept.push(`${keptHoops} hoop${keptHoops === 1 ? '' : 's'} placed with the position, heading, height, size and direction they had.`);
  }
  if (keptPoles) {
    report.kept.push(`${keptPoles} pole${keptPoles === 1 ? '' : 's'}, in the flying order where they stood.`);
  }
  for (const size of tooBig) {
    report.approximated.push(`Gates ${mm(size)} across were kept at that size. RaceGOW's are ${inches(GATE_OPENING_MIN)} to ${inches(GATE_OPENING_MAX)}, so the rules will say so.`);
  }
  if (Array.isArray(data.measurements) && data.measurements.length) {
    report.dropped.push(`${data.measurements.length} tape measurement${data.measurements.length === 1 ? '' : 's'} were not kept: a layout fact belongs in the build sheet, which measures every piece from a corner.`);
  }
  if (arena.w > doc.field.width || arena.d > doc.field.depth) {
    report.approximated.push(`The arena is ${arena.w} by ${arena.d} m and the hall is ${doc.field.width} by ${doc.field.depth} m, so what stood outside was dropped.`);
  }

  applyAutoFaces(doc);
  return { doc: normalize(JSON.parse(JSON.stringify(doc))).doc, report };
}

/* The report as lines of plain text, in the order a person reads it: what was kept,
 * what was changed and what was left out. */
export function reportLines(report) {
  const lines = [];
  for (const [heading, list] of [['Kept', report.kept], ['Changed', report.approximated], ['Left out', report.dropped]]) {
    for (const item of list) {
      lines.push(`${heading}: ${item}`);
    }
  }
  return lines;
}

