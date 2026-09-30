/*
 * aperture.js: what an opening is when it is not a rectangle. Pure arithmetic,
 * no Three.js.
 *
 * A gate's hole is a rectangle, and everything that has ever been said about a
 * pass says so: the swept box in src/game/race.js clips a segment against a
 * half width and a half height. A hoop is round and a hex gate is six sided,
 * and the corner of the square that holds a hoop is not in the hoop: a line
 * through it goes past the ring, not through it, and must not score.
 *
 * SO A SHAPE IS INSCRIBED IN THE RECTANGLE. clearW and clearH stay what they
 * always were for every piece, the size of the box the opening fits in, so the
 * envelope, the rules, the build sheet and the cards all read a hoop the way
 * they read a gate. The shape is what is left of the box:
 *
 *   square   all of it
 *   circle   the ellipse that touches all four sides (a circle where the two
 *            sizes are equal, which is what a hoop is)
 *   hex      the hexagon with a point at each end of the width and a flat at
 *            the top and the bottom: vertices at (+-w/2, 0) and (+-w/4, +-h/2).
 *            It is regular when h is the width times the square root of three
 *            over two, which is what a hex gate is.
 *
 * ONE DEFINITION, THREE READERS. The pass test clips a segment against it, the
 * scene builds the frame's capsules on its outline, and the builder draws the
 * ring on the same points, so a hoop is drawn where it scores and is solid where
 * it is drawn. Every point on a circle is taken with ./trig.js, which is the
 * same bits in every engine, because the capsules made from it reach the
 * physics.
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

import { sincos } from './trig.js';

export const APERTURE_SHAPES = ['square', 'circle', 'hex'];

/* How many straight pieces a round frame is made of. A hoop in a room is 2.4 m across as built
 * and the pilot flies close to it, so sixteen straight tubes read as a polygon and twenty four
 * (a corner every fifteen degrees) read as a ring, and a capsule for each is cheap. A multiple
 * of four, so the ring has a corner at the top, the bottom and both ends of its width. */
export const CIRCLE_SEGMENTS = 24;

/* The height of a regular hexagon over its width: a point at each end of the width and a flat at the
 * top and bottom, so the width is twice a side and the height is a side times the square root of
 * three. Square root is correctly rounded everywhere, which is why it can be written here. */
export const HEX_HEIGHT_RATIO = Math.sqrt(3) / 2;

/* Any word that is not a shape this knows is a square, which is what every opening was. */
export function shapeOf(word) {
  return word === 'circle' || word === 'hex' ? word : 'square';
}

const TAU = 2 * Math.PI;
const SC = { s: 0, c: 1 };

/*
 * The corners of the opening's outline, in its own frame (x across, y up from
 * its centre), going round once and not repeating the first. A circle is `n`
 * points, the first at the right hand end of the width.
 */
export function outlineOf(shape, halfW, halfH, n = CIRCLE_SEGMENTS) {
  if (shape === 'circle') {
    const out = [];
    for (let i = 0; i < n; i += 1) {
      sincos((TAU * i) / n, SC);
      out.push([halfW * SC.c, halfH * SC.s]);
    }
    return out;
  }
  if (shape === 'hex') {
    return [
      [halfW, 0], [halfW / 2, halfH], [-halfW / 2, halfH], [-halfW, 0], [-halfW / 2, -halfH], [halfW / 2, -halfH],
    ];
  }
  return [[halfW, halfH], [-halfW, halfH], [-halfW, -halfH], [halfW, -halfH]];
}

/* The shape's own test, in coordinates where the rectangle is the unit square: u is x over
 * the half width and v is y over the half height. */
function insideUnit(shape, u, v) {
  if (shape === 'circle') {
    return u * u + v * v <= 1;
  }
  if (shape === 'hex') {
    return Math.abs(v) <= 1 && 2 * Math.abs(u) + Math.abs(v) <= 2;
  }
  return Math.abs(u) <= 1 && Math.abs(v) <= 1;
}

/* Whether a point of the opening's plane is in the opening. The edge is in. */
export function insideShape(shape, halfW, halfH, x, y) {
  if (!(halfW > 0) || !(halfH > 0)) {
    return false;
  }
  return insideUnit(shape, x / halfW, y / halfH);
}

/*
 * WHERE A STRAIGHT TRAVEL IS INSIDE THE SHAPE. The travel starts at (ax, ay) and moves
 * (dx, dy) as t goes from 0 to 1 (its third dimension is the caller's business), and only
 * t between t0 and t1 is asked about. Returns the part of that range spent inside, as
 * [from, to], or null if none of it is. Exact, not sampled: a circle is a quadratic and a
 * hexagon is four half planes, so a segment shorter than a step cannot slip through.
 *
 * A square is returned as it came, because the caller has already clipped it against the
 * rectangle, which is the same thing.
 */
export function clipToShape(shape, halfW, halfH, ax, ay, dx, dy, t0, t1) {
  if (!(halfW > 0) || !(halfH > 0) || t0 > t1) {
    return null;
  }
  if (shape !== 'circle' && shape !== 'hex') {
    return [t0, t1];
  }
  /* Into the unit square's coordinates, where both shapes are simple. */
  const au = ax / halfW;
  const av = ay / halfH;
  const du = dx / halfW;
  const dv = dy / halfH;
  let lo = t0;
  let hi = t1;
  /* a t + b <= 0 keeps the part of the range on the inside of one boundary. */
  const keep = (a, b) => {
    if (Math.abs(a) < 1e-12) {
      return b <= 0;
    }
    const at = -b / a;
    if (a > 0) {
      if (at < hi) {
        hi = at;
      }
    } else if (at > lo) {
      lo = at;
    }
    return lo <= hi;
  };
  if (shape === 'circle') {
    const A = du * du + dv * dv;
    const B = 2 * (au * du + av * dv);
    const C = au * au + av * av - 1;
    if (A < 1e-24) {
      return C <= 0 ? [lo, hi] : null;
    }
    const D = B * B - 4 * A * C;
    if (D < 0) {
      return null;
    }
    const root = Math.sqrt(D);
    const r0 = (-B - root) / (2 * A);
    const r1 = (-B + root) / (2 * A);
    lo = Math.max(lo, r0);
    hi = Math.min(hi, r1);
    return lo <= hi ? [lo, hi] : null;
  }
  /* The hexagon: |v| <= 1, and |2u| + |v| <= 2 is four half planes, one for each slanted edge. */
  if (!keep(dv, av - 1) || !keep(-dv, -av - 1)) {
    return null;
  }
  for (const su of [-1, 1]) {
    for (const sv of [-1, 1]) {
      if (!keep(2 * su * du + sv * dv, 2 * su * au + sv * av - 2)) {
        return null;
      }
    }
  }
  return lo <= hi ? [lo, hi] : null;
}

/*
 * The point where two lines meet, each given as a unit normal n and the distance c of the line
 * from the origin along it (n . x = c). Parallel lines have no such point: the caller keeps
 * away from them, and this hands back the first line's own foot so nothing is ever NaN.
 */
function meet(n1x, n1y, c1, n2x, n2y, c2) {
  const det = n1x * n2y - n1y * n2x;
  if (Math.abs(det) < 1e-12) {
    return [n1x * c1, n1y * c1];
  }
  return [(c1 * n2y - c2 * n1y) / det, (n1x * c2 - n2x * c1) / det];
}

/*
 * A convex polygon (counter clockwise) with every edge pushed `d` further out along its own
 * normal: the corners of the run of tubes that stands round it. Two adjacent offset edges meet
 * where the corner of the offset polygon is, which is further than `d` from the old corner.
 */
function offsetPolygon(poly, d) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    /* The outward normals of the two edges that meet at q, for a counter clockwise run. */
    const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    const n1x = (q[1] - p[1]) / l1;
    const n1y = -(q[0] - p[0]) / l1;
    const l2 = Math.hypot(r[0] - q[0], r[1] - q[1]) || 1;
    const n2x = (r[1] - q[1]) / l2;
    const n2y = -(r[0] - q[0]) / l2;
    out.push(meet(n1x, n1y, n1x * q[0] + n1y * q[1] + d, n2x, n2y, n2x * q[0] + n2y * q[1] + d));
  }
  return out;
}

/*
 * THE FRAME OF AN OPENING: the corners of the closed run of straight tubes whose axes stand
 * `tube` (the tube's radius) outside the opening, so the tubes' inner surfaces are the hole
 * and nothing more. The tubes are the edges between one corner and the next, the last back to
 * the first.
 *
 * A square gives the four corners a gate's frame has always had, at half a width plus a tube
 * on each side. A hex is its outline pushed out by the tube.
 *
 * A round frame is CIRCUMSCRIBED: each of its CIRCLE_SEGMENTS straight tubes lies along the
 * tangent of the ellipse at the middle of its step, pushed out by the tube, and a corner is
 * where two neighbours meet. Every tube is therefore at least a tube's radius from the hole,
 * whatever the two sizes are, and no chord of a polygon cuts into the hole the pass scores. A
 * circle's corners are one over the cosine of half a step further out than the ring (0.9
 * percent at twenty four), which is the price of straight tubes and is all on the outside.
 */
export function frameOutline(shape, halfW, halfH, tube, n = CIRCLE_SEGMENTS) {
  if (shape !== 'circle') {
    return offsetPolygon(outlineOf(shape === 'hex' ? 'hex' : 'square', halfW, halfH), tube);
  }
  /* The unit normal and the offset of the tangent line, for the tangent at each half step. */
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    sincos((TAU * (i + 0.5)) / n, SC);
    const nx = SC.c / halfW;
    const ny = SC.s / halfH;
    const len = Math.hypot(nx, ny);
    lines.push([nx / len, ny / len, 1 / len + tube]);
  }
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = lines[(i + n - 1) % n];
    const b = lines[i];
    out.push(meet(a[0], a[1], a[2], b[0], b[1], b[2]));
  }
  return out;
}

/*
 * THE FRAME AS PARTS, in the obstacle's own frame (x across the opening, y up from the base, z
 * through it), which is what the game draws, what it makes solid and what a flight check flies
 * against, so the three cannot disagree. Nothing here knows about Three.js.
 *
 *   ring    the corners of the run of tubes, in the plane of the opening
 *   tubes   the ones that are built, each a pair of corners
 *   joints  the corners a joint is put on
 *   posts   what stands a frame that hangs in the air on the floor, one under each lowest corner
 *   caps    the solids: a capsule for every tube and post, and the stub each post stands on
 *   foot    the size of that stub, the one every micro gate stands on
 *   top     the highest thing, a tube above the highest corner
 *
 * THE FLOOR IS THE SILL. A tube wholly below the floor is not built, as an upright gate builds no
 * bottom member at a sill of zero, so a hoop on the floor is a ring set into it and a hex gate is
 * an open bottomed frame. A frame whose lowest tube is more than two centimetres above the floor
 * hangs in the air and is stood on a post under each of its lowest corners. The opening is tilted
 * about its own middle by `pitch`, which is how a dive gate leans, so the hole stays where the
 * document put it and the corners move.
 *
 * An unbuilt opening has no frame at all, and still says where its corners would be, because it
 * still scores and still lights.
 */
export function frameParts(shape, halfW, halfH, tubeR, sillH, pitch = 0, unbuilt = false) {
  const centreY = sillH + halfH;
  sincos(pitch, SC);
  const cp = SC.c;
  const sp = SC.s;
  const ring = frameOutline(shape, halfW, halfH, tubeR).map(([x, y]) => ({ x, y: centreY + y * cp, z: y * sp }));
  const out = {
    centreY,
    ring,
    tubes: [],
    joints: [],
    posts: [],
    caps: [],
    foot: { w: tubeR * 2, h: tubeR * 1.6, d: tubeR * 4 },
    top: Math.max(...ring.map((p) => p.y)) + tubeR,
  };
  if (unbuilt) {
    return out;
  }
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.max(a.y, b.y) <= 1e-6) {
      continue;
    }
    out.tubes.push([a, b]);
    out.caps.push({ kind: 'gate', ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: tubeR });
  }
  for (const p of ring) {
    if (!(p.y < -tubeR)) {
      out.joints.push(p);
    }
  }
  const lowest = Math.min(...ring.map((p) => p.y));
  if (lowest - tubeR > 0.02) {
    for (const p of ring) {
      if (Math.abs(p.y - lowest) > 1e-6) {
        continue;
      }
      out.posts.push({ x: p.x, y: p.y, z: p.z });
      out.caps.push({ kind: 'gate', ax: p.x, ay: 0, az: p.z, bx: p.x, by: p.y, bz: p.z, r: tubeR });
      out.caps.push({
        kind: 'obstacle',
        ax: p.x, ay: out.foot.h * 0.5, az: p.z - out.foot.d * 0.5,
        bx: p.x, by: out.foot.h * 0.5, bz: p.z + out.foot.d * 0.5,
        r: out.foot.w * 0.5,
      });
    }
  }
  return out;
}

/*
 * BARS ALONG A CLOSED RUN OF POINTS, for a renderer that draws a straight length as a box: one for
 * each side, `thickness` across, each lengthened at both ends by half a thickness times the tangent
 * of half the turn there, so a corner is filled to its point and not left as a notch. The run goes
 * counter clockwise. Returns the middle of each bar, its length and its angle about the plane's
 * normal (a bar built along x is turned by it).
 */
export function barsAlong(poly, thickness) {
  const n = poly.length;
  if (n < 3) {
    return [];
  }
  const turn = (i) => {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    const cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
    const dot = (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]);
    return Math.atan2(cross, dot);
  };
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % n];
    const len = Math.hypot(bx - ax, by - ay);
    if (!(len > 0)) {
      continue;
    }
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    const e0 = thickness * 0.5 * Math.tan(turn(i) * 0.5);
    const e1 = thickness * 0.5 * Math.tan(turn((i + 1) % n) * 0.5);
    /* From e0 before the start to e1 past the end: the middle is half way between. */
    const along = (len + e1 - e0) * 0.5;
    out.push({ x: ax + dx * along, y: ay + dy * along, len: len + e0 + e1, angle: Math.atan2(dy, dx) });
  }
  return out;
}

/*
 * A PANE ACROSS AN OPENING, as data: a fan of triangles from the middle to each corner of the
 * outline of a shape in a box `w` by `h`, with the uv a rectangle's pane has (the box is 0 to 1),
 * so a shader written for the rectangle reads the same on it. Both renderers wrap it in their own
 * geometry.
 */
export function paneFan(shape, w, h) {
  const pts = outlineOf(shape, w * 0.5, h * 0.5);
  const position = [0, 0, 0];
  const uv = [0.5, 0.5];
  for (const [x, y] of pts) {
    position.push(x, y, 0);
    uv.push(x / w + 0.5, y / h + 0.5);
  }
  const index = [];
  for (let i = 0; i < pts.length; i += 1) {
    index.push(0, 1 + i, 1 + ((i + 1) % pts.length));
  }
  return { position, uv, index };
}
