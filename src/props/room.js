/*
 * room.js: the furniture of a living room, as boxes. Pure data and
 * arithmetic, no Three.js, no JS trigonometry.
 *
 * WHY THESE ARE NOT IN CATALOG.JS. A RaceGOW track is flown round and under
 * the furniture of the room it is set in, and a sofa was the only piece on the
 * whoop palette that stood for all of it. A table, a chair and a banner are
 * three more solid obstacles, and they are made the way every solid in
 * src/props is made: a short list of boxes, which is the drawing AND the
 * physics AND the builder's warning AND the picture on the plan, so the four
 * cannot disagree about where a table's leg is.
 *
 * WHAT ELSE THEY SHARE WITH A BARRIER. The document holds `dims` of width,
 * depth and height and nothing more, exactly as a barrier's, so no reader of a
 * track, no importer and no exporter has a new shape of number to learn. Every
 * other proportion (how thick a top is, how far a leg is set in) is derived
 * from those three HERE, in fractions and never in metres, which is the
 * property that matters: src/game/trackdoc.js hands the game the same dims
 * multiplied by the room's scale, and a table whose parts are fractions of its
 * size is the same table at any scale. A part in metres would be a top that is
 * paper thin in the room and thick in the builder.
 *
 * QUARTER TURNS ONLY. The physics world holds axis aligned boxes and nothing
 * else (src/native/world.c, sim_world_box), and a box turned by a quarter turn
 * is still one, with its extents swapped, exactly and with no sine taken. So
 * these turn in quarter turns like a building does (turns: 'quarter' in
 * elements.js), the heading is snapped to the nearest quarter by everything
 * that draws or flies them (placedYaw in ./solids.js), and a document that
 * says 40 degrees is drawn and solid at 0, never drawn at 40 and solid at 0.
 * Nothing here needs the physics, the module ABI or the build to change, and
 * that is checked rather than believed: see suiteRoomParts in
 * src/trackbuilder/selftest.js.
 *
 * TWO FRAMES, and both are written down because a sign here is a chair that
 * faces the wrong way:
 *
 *   the DOCUMENT's, which the builder, the warnings and the plan speak: +x the
 *   piece's heading, +y its LEFT, +z up, the origin the middle of its
 *   footprint on the floor. roomBoxes gives boxes in this frame.
 *
 *   the PROPS', which ./parts.js and ./solids.js speak: +x the heading, +y up,
 *   +z its RIGHT. roomParts gives parts in this frame. A document box goes to a
 *   part by propsBox, which is the whole of the conversion.
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

import { Parts } from './parts.js';
import { placeSolids } from './solids.js';
import { quarterTurns, quarterSinCos } from './trig.js';

export const ROOM_TYPES = ['table', 'chair', 'banner'];

export function isRoomType(type) {
  return ROOM_TYPES.includes(type);
}

/*
 * What a new one is, in metres, as the document holds it: width along the
 * heading, depth across it, height overall. A dining table, a kitchen chair
 * and a stand up banner on two feet, which are what a living room has in it.
 * For a chair the heading is the way it faces, so its back is on the minus x
 * side; for a banner it is the way the panel runs, so its face looks along
 * plus and minus y.
 */
export const ROOM_SIZES = {
  table: { width: 1.2, depth: 0.7, height: 0.75 },
  chair: { width: 0.45, depth: 0.45, height: 0.9 },
  banner: { width: 1.2, depth: 0.3, height: 1.6 },
};

/*
 * The most and the least a document may hold for any one of a piece's three
 * sizes, which the reader repairs to and the inspector's fields hold to. They
 * are the DOCUMENT's metres. roomBoxes itself does not clamp to them: it is
 * handed the game's scaled sizes as well, and a clamp in metres would change
 * a scaled table's proportions.
 */
export const ROOM_SIZE_MIN = 0.05;
export const ROOM_SIZE_MAX = 6;

export function clampRoomSize(v) {
  return Math.min(ROOM_SIZE_MAX, Math.max(ROOM_SIZE_MIN, v));
}

/*
 * What each material is painted, as a colour the drawings read: the builder's
 * room, the game's scene and the animation. Oak, walnut, a slate blue cloth,
 * cream vinyl and dark plastic: what these are made of in a real room, and
 * none of them the mint or the amber the tool keeps for its own furniture.
 */
export const ROOM_COLOURS = {
  top: 0xb8874f,
  leg: 0x7a5636,
  seat: 0x506f8c,
  panel: 0xefe4cd,
  foot: 0x2e3542,
};

/* The thinnest a box is allowed to be. The same floor ./parts.js gives a part,
 * so a box dropped here would have been dropped there. */
const THIN = 0.002;

/* A size the document holds, or the piece's own default for one that is not a
 * length. Zero is not a size: a table nothing wide has no top. */
function sized(type, dims) {
  const base = ROOM_SIZES[type];
  const out = {};
  for (const key of ['width', 'depth', 'height']) {
    const v = dims == null ? undefined : dims[key];
    out[key] = typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : base[key];
  }
  return out;
}

/*
 * THE PIECES. Each takes a `box(name, material, x0, y0, z0, x1, y1, z1)` and
 * the three sizes, and adds what it is made of in the document's frame.
 */
const MAKERS = {
  /*
   * A top on four legs, with the room under it a whoop can be flown through.
   * The top is a sixteenth of the height, the legs a little under a tenth of
   * the shorter side and set in by half as much again, so the span between two
   * legs is most of the table and never a trap.
   */
  table(box, { width: w, depth: d, height: h }) {
    const top = 0.06 * h;
    const s = Math.min(w, d);
    const leg = 0.07 * s;
    const inset = 0.05 * s;
    box('table top', 'top', -w / 2, -d / 2, h - top, w / 2, d / 2, h);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx * (w / 2 - inset);
        const y = sy * (d / 2 - inset);
        box('table leg', 'leg', x, y, 0, x - sx * leg, y - sy * leg, h - top);
      }
    }
  },

  /*
   * A seat on four legs, at half the chair's height, and a back on the far
   * side of it. It faces along +x, so its back is at -x: the back is a plain
   * panel, because a whoop does not fly through the slats of a real one and a
   * slotted back would be a gap nobody could use.
   */
  chair(box, { width: w, depth: d, height: h }) {
    const s = Math.min(w, d);
    const seat = 0.5 * h;
    const thick = 0.06 * h;
    const leg = 0.08 * s;
    const inset = 0.03 * s;
    box('chair seat', 'seat', -w / 2, -d / 2, seat - thick, w / 2, d / 2, seat);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const x = sx * (w / 2 - inset);
        const y = sy * (d / 2 - inset);
        box('chair leg', 'leg', x, y, 0, x - sx * leg, y - sy * leg, seat - thick);
      }
    }
    box('chair back', 'seat', -w / 2, -d / 2 + inset, seat, -w / 2 + 0.09 * w, d / 2 - inset, h);
  },

  /*
   * A panel from the floor to its height, as wide as the banner is, thin, and
   * a foot at each end that runs out across it to stand it up. The panel goes
   * to the floor on purpose: raised on its feet it would leave a slot a whoop
   * cannot fit and a pilot cannot tell from a gap.
   */
  banner(box, { width: w, depth: d, height: h }) {
    const thick = 0.1 * d;
    const run = 0.14 * w;
    const foot = 0.03 * h;
    box('banner', 'panel', -w / 2, -thick / 2, 0, w / 2, thick / 2, h);
    for (const sx of [-1, 1]) {
      box('banner foot', 'foot', sx * w / 2, -d / 2, 0, sx * (w / 2 - run), d / 2, foot);
    }
  },
};

/*
 * The boxes a piece is made of, in the document's frame and its own: the
 * origin the middle of the footprint on the floor, +x the heading, +y the left,
 * +z up. Each is { name, m, lo: [x, y, z], hi: [x, y, z] } with `m` the
 * material key ROOM_COLOURS knows. A type that is not a piece of furniture
 * has none.
 */
export function roomBoxes(type, dims) {
  const make = MAKERS[type];
  if (!make) {
    return [];
  }
  const out = [];
  make((name, m, x0, y0, z0, x1, y1, z1) => {
    const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)];
    const hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    if (hi[0] - lo[0] >= THIN && hi[1] - lo[1] >= THIN && hi[2] - lo[2] >= THIN) {
      out.push({ name, m, lo, hi });
    }
  }, sized(type, dims));
  return out;
}

/*
 * The ground a piece covers, in its own frame: { x0, x1, y0, y1 }. It is what
 * the plan picks by, and it is the bounds of the boxes, so it can never be
 * a different size from what is drawn and solid.
 */
export function roomFootprint(type, dims) {
  const boxes = roomBoxes(type, dims);
  if (!boxes.length) {
    return { x0: 0, x1: 0, y0: 0, y1: 0 };
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.lo[0]);
    x1 = Math.max(x1, b.hi[0]);
    y0 = Math.min(y0, b.lo[1]);
    y1 = Math.max(y1, b.hi[1]);
  }
  return { x0, x1, y0, y1 };
}

/*
 * A document box as a box in the props' frame: the props' up is the
 * document's z, and the props' right is minus the document's left. The whole of
 * the conversion between the two, so it is read once and tested once.
 */
export function propsBox(b) {
  return {
    lo: [b.lo[0], b.lo[2], -b.hi[1]],
    hi: [b.hi[0], b.hi[2], -b.lo[1]],
  };
}

/*
 * A piece as the parts ./solids.js places: every box solid, of the wall kind
 * a barrier is, in the props' frame. `m` carries the material through so the
 * drawing that follows the solids can paint them.
 */
export function roomParts(type, dims) {
  const parts = new Parts();
  for (const b of roomBoxes(type, dims)) {
    const q = propsBox(b);
    parts.box(b.m, q.lo[0], q.lo[1], q.lo[2], q.hi[0], q.hi[1], q.hi[2], { kind: 'wall', name: b.name });
  }
  return parts.list;
}

/*
 * A piece as the solids the physics holds, in the scene's axes: Three's y up,
 * (x, y, z) the middle of its footprint on the floor. The list placeSolids
 * makes, with the material of each box put back on it, and nothing else, so
 * the drawing that follows it and the colliders built from it are the same
 * boxes to the bit.
 */
export function roomSolids(type, dims, x, y, z, yaw) {
  const parts = roomParts(type, dims);
  const solids = placeSolids(parts, x, y, z, yaw, 'quarter', []);
  for (let i = 0; i < solids.length; i += 1) {
    solids[i].m = parts[i].m;
  }
  return solids;
}

const SC = { s: 0, c: 1 };

/*
 * A piece's boxes in the document's frame, in the world: turned by the nearest
 * quarter turn and put at `position` (the middle of its footprint, and its
 * base). Each is { name, m, x0, y0, z0, x1, y1, z1 }, and each is still axis
 * aligned, which is why this needs no sine. The warnings test the line against
 * these and the plan draws them.
 */
export function roomWorldBoxes(type, dims, position, yaw) {
  quarterSinCos(quarterTurns(yaw), SC);
  const { s, c } = SC;
  const px = Number.isFinite(position?.x) ? position.x : 0;
  const py = Number.isFinite(position?.y) ? position.y : 0;
  const pz = Number.isFinite(position?.z) ? position.z : 0;
  return roomBoxes(type, dims).map((b) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const lx of [b.lo[0], b.hi[0]]) {
      for (const ly of [b.lo[1], b.hi[1]]) {
        const wx = px + lx * c - ly * s;
        const wy = py + lx * s + ly * c;
        x0 = Math.min(x0, wx);
        x1 = Math.max(x1, wx);
        y0 = Math.min(y0, wy);
        y1 = Math.max(y1, wy);
      }
    }
    return { name: b.name, m: b.m, x0, y0, z0: pz + b.lo[2], x1, y1, z1: pz + b.hi[2] };
  });
}

/*
 * A test of one point against a piece, made once for a piece and asked many
 * times, because the warnings ask it four times between every two samples of
 * the line. `pad` is the clearance the line is given, so a point is in the piece
 * if it is in a box grown by that on every side, the same way a barrier is
 * tested.
 */
export function roomHitTest(el, pad = 0) {
  if (!el || !isRoomType(el.type)) {
    return () => false;
  }
  const boxes = roomWorldBoxes(el.type, el.dims, el.position, el.yaw);
  return (p) => {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
      return false;
    }
    for (const b of boxes) {
      if (p.x >= b.x0 - pad && p.x <= b.x1 + pad
        && p.y >= b.y0 - pad && p.y <= b.y1 + pad
        && p.z >= b.z0 - pad && p.z <= b.z1 + pad) {
        return true;
      }
    }
    return false;
  };
}

export function roomHit(el, point, pad = 0) {
  return roomHitTest(el, pad)(point);
}
