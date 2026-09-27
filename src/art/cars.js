/*
 * cars.js: every car in the freestyle worlds, drawn in the town's cel look.
 *
 * ONE MODEL, THREE CALLERS. The town's own parked cars (the vendored
 * world/traffic.js parks them with makeVehicle, which hands the drawing to
 * townVehicle here through the hook in PATCH-world-vehicles.diff, and the
 * kei trucks through PATCH-world-props.diff), a built map's parked car
 * (src/props/kit.js town('car')) and a built map's moving car (src/maps/
 * built/cars.js) all come out of buildCar, so a kei van in a yard is the kei
 * van outside the conbini and the drift car is the same car parked or
 * sliding. The vendored builders keep their tables and their placement;
 * only the drawing moved, into this file, which is ours and GPLv3, so an
 * upstream update of the town is a re-copy plus two small patches.
 *
 * THE DIMENSIONS ARE THE TOWN'S, TO THE CENTIMETRE, BECAUSE THEY ARE
 * PHYSICS. L, W, R, the axles, sill, waist, roof, cab, the rakes and the box
 * lorry's box come from the vendored SPEC table itself (imported, not
 * copied), which is what the town's colliders (vehicleSize) and the built
 * map's solids and moving boxes (CAR_KINDS in src/props/street.js, VEHICLE_
 * KINDS in src/maps/built/traffic.js) are sized from. What this file adds
 * is SHAPE, never size: the side profile, the arches, the glasshouse's
 * tumblehome, the lamps, the glass, the wheels. The drawn body is built
 * round the solid boxes, not inside them: a flank is on the box's face, a
 * bumper stands out past L / 2 as the vendored bumper bar did, and where a
 * chamfer rounds an edge the solid's corner is at most about 3 cm outside
 * the paint (the shoulder, the roof edge; 5 cm at the top of the steepest
 * noses). The kei truck keeps makeKeiTruck's own sizes, which is what its
 * collider was written from. The r32 and the e82 are ours, not the town's,
 * and their tables carry the real coupes' numbers, which src/props/street.js
 * CAR_KINDS restates for their solids.
 *
 * HOW A TOWN KIND'S BODY IS MADE. Two bevelled prisms and what is laid on them. The
 * lower body is the car's side profile (bumpers, bonnet, the waist under
 * the glasshouse, the boot or tailgate, and the two wheel arches cut out of
 * its lower edge) extruded across the car with a chamfer round both flanks,
 * deeper at the four plan corners, which is what turns a slab into a car in
 * the cel ramp: the chamfer takes its own band of light, so a white car has
 * a pale rim along its shoulder and a violet one under its sill, and the
 * screen space ink finds a crease there to draw. The glasshouse is a second
 * prism on the waist, narrower than the body by a shoulder and narrowing
 * again to the roof (the tumblehome). Glass, lamps, grilles, shut lines,
 * handles, mirrors and wheels are laid ON those faces, a few millimetres
 * proud, never inside them (the town's rule: depth is built outward).
 *
 * THE ART'S RULES, the town's. Materials are the vendored cel() and flat()
 * with the town's ramps and violet shadow tints, in the looks the vendored
 * cars already used, so the town's bake folds a car into the batches its
 * neighbours are in and a new car costs triangles, not draw calls. Glass is
 * the palette's dark glass with a pale streak or two across it, the way an
 * animator paints a windscreen. The lamps are the two colours the vendored
 * builder lit a car with (LAMP_FRONT, LAMP_REAR), because src/props/kit.js
 * and src/maps/built/cars.js find the lamps by them to keep them lit at
 * dusk. No badge, no maker's name, no model name anywhere: a car in the
 * art style, recognisable from its shapes.
 *
 * THE SECOND PASS (every town kind; their rows say p2): each kind its own
 * face (FACES), lamps, grilles and intakes set in rims so they read as
 * recessed (pod), bumpers that are pieces of their own wrapping the corners
 * and standing proud (bumperLoft), lips on the arches (archLipP2),
 * shoulders and roof edges lit as rounds (prism's smooth), a reflection
 * band across the glass, wipers lying on it, better mirrors, and a tyre's
 * inner face so a far wheel is a tyre. The flank stands in by the lip's
 * stand so what is proud of it stays within the car's width.
 *
 * THE TWO COUPES ARE SCULPTED (THE SCULPTED BODY, below). The r32 and the
 * e82 are known by shapes a prism cannot make: the r32's blistered arches
 * under a crisp waist line, its slim lamps and four round tail lamps; the
 * e82's rounded nose with its twin grilles and ringed lamps swept back
 * round the corners, its hollow flank between two lines, its kinked rear
 * side window and wedge tail lamps. So each is lofted from rows, lines of
 * the body measured off side views of the real cars, and what it carries is
 * laid onto that surface by projection. Their solids are the boxes CAR_KINDS
 * has always given them, and the drawing keeps to them as the town kinds'
 * does: where the rounded plan corners leave a box's corner outside the
 * paint it is by 3.8 to 5.1 cm on the r32 and 7.5 to 8.6 cm on the e82,
 * the most the old prisms' corner bevels left (about 4 and 7.7 cm).
 *
 * TWO LEVELS OF DETAIL. 'parked' (every parked car, the town's and a built
 * map's) draws the wheels at 12 sides with their outer faces only and
 * keeps a car within the vendored model's triangle count; 'full' (the
 * moving cars, a handful on a map) draws 16 sided wheels with both faces
 * and the rim's dish. A moving car's wheels are not in the body at all:
 * src/maps/built/cars.js draws them from carWheelGeometry as instances.
 *
 * THE CONVENTION, the vendored one: nose along +x, origin at ground level in
 * the middle of the footprint, y up; `ry` turns the nose to (cos ry, 0,
 * -sin ry). Render only: nothing here reaches the physics, which reads the
 * tables and never a mesh, so Math.sin and Math.cos are used freely.
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

import * as THREE from 'three';
import { PAL } from '../maps/city/vendored/core/palette.js';
import { cel, flat } from '../maps/city/vendored/core/toon.js';
import { platePlate } from '../maps/city/vendored/core/textures.js';
import { hullOutline } from '../maps/city/vendored/core/outline.js';
import { SPEC as TOWN_SPEC, CAR, vehicleSize } from '../maps/city/vendored/world/vehicles.js';

export { CAR };

/* The two lamp colours, the vendored builder's, which kit.js and the moving
 * cars recognise a lamp by. */
export const LAMP_FRONT = 0xfff2d4;
export const LAMP_REAR = 0xd8564e;

/* ------------------------------------------------------------------ *
 * THE MESHER. Faces written straight into one indexed buffer per material
 * role, with position, normal and uv, which is the attribute set every
 * BoxGeometry in the town has: a car whose buffers matched nothing would
 * open a bucket of its own in the town's merge (src/maps/city/bake.js keys
 * on the attribute list and on indexing) and cost a draw call a cell.
 *
 * A face's points are counter clockwise seen from the side it faces, and
 * its normal is worked out from them (Newell's), so a face cannot be lit
 * from the wrong side by a sign slip. `toward` turns a face whose winding
 * was not known to face a direction instead. Normals may also be handed in
 * a vertex at a time, which is how a tyre is smooth round its axle and
 * still flat across its tread.
 * ------------------------------------------------------------------ */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

class Mesher {
  constructor() {
    this.roles = new Map();
    this.matrix = null;
    this.normalMatrix = new THREE.Matrix3();
    this.triangles = 0;
  }

  /* Everything added until the next call is moved by `m` (a Matrix4), or
   * by nothing. */
  at(m) {
    this.matrix = m;
    /* A reflection turns a face's winding over: face() puts it back. */
    this.mirrored = Boolean(m) && m.determinant() < 0;
    if (m) {
      this.normalMatrix.getNormalMatrix(m);
    }
    return this;
  }

  buf(role) {
    let b = this.roles.get(role);
    if (!b) {
      b = { p: [], n: [], uv: [], idx: [] };
      this.roles.set(role, b);
    }
    return b;
  }

  /*
   * One planar face. `pts` are [x, y, z]; `tris` a flat list of index
   * triples into them (a fan when omitted, for a convex face); `normals`
   * one [x, y, z] a point when the face is not flat shaded; `uvs` one
   * [u, v] a point for a face that carries a map.
   */
  face(role, pts, { tris = null, normals = null, uvs = null, toward = null } = {}) {
    const k = pts.length;
    if (k < 3) {
      return;
    }
    const P = new Array(k);
    for (let i = 0; i < k; i += 1) {
      _a.set(pts[i][0], pts[i][1], pts[i][2]);
      if (this.matrix) {
        _a.applyMatrix4(this.matrix);
      }
      P[i] = [_a.x, _a.y, _a.z];
    }
    /* Newell's normal, which is right for any planar polygon however it
     * was cut. */
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < k; i += 1) {
      const p = P[i];
      const q = P[(i + 1) % k];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) {
      return;
    }
    nx /= len;
    ny /= len;
    nz /= len;
    if (this.mirrored) {
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    let flip = false;
    if (toward) {
      _n.set(toward[0], toward[1], toward[2]);
      if (this.matrix) {
        _n.applyMatrix3(this.normalMatrix);
      }
      flip = nx * _n.x + ny * _n.y + nz * _n.z < 0;
      if (flip) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
    }
    const b = this.buf(role);
    const base = b.p.length / 3;
    for (let i = 0; i < k; i += 1) {
      b.p.push(P[i][0], P[i][1], P[i][2]);
      if (normals) {
        _n.set(normals[i][0], normals[i][1], normals[i][2]);
        if (this.matrix) {
          _n.applyMatrix3(this.normalMatrix);
        }
        _n.normalize();
        if (flip) {
          _n.negate();
        }
        b.n.push(_n.x, _n.y, _n.z);
      } else {
        b.n.push(nx, ny, nz);
      }
      if (uvs) {
        b.uv.push(uvs[i][0], uvs[i][1]);
      } else {
        b.uv.push(0, 0);
      }
    }
    const T = tris ?? fan(k);
    for (let i = 0; i < T.length; i += 3) {
      if (flip !== Boolean(this.mirrored)) {
        b.idx.push(base + T[i], base + T[i + 2], base + T[i + 1]);
      } else {
        b.idx.push(base + T[i], base + T[i + 1], base + T[i + 2]);
      }
    }
    this.triangles += T.length / 3;
  }

  /* An axis aligned box in the current frame: six faces. `skip` names
   * faces nobody can see ('-y' under a thing standing on something). */
  box(role, x0, y0, z0, x1, y1, z1, skip = '') {
    const F = [
      ['+x', [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      ['-x', [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['+y', [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
      ['-y', [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]],
      ['+z', [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['-z', [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
    ];
    for (const [name, pts] of F) {
      if (!skip.includes(name)) {
        this.face(role, pts);
      }
    }
  }

  /* A box between two points of a side profile, `t` thick across the
   * profile and spanning z0 to z1: a strut, a wiper, a stanchion. */
  bar(role, ax, ay, bx, by, t, z0, z1) {
    const dx = bx - ax;
    const dy = by - ay;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1e-6) {
      return;
    }
    const ox = (-dy / l) * (t / 2);
    const oy = (dx / l) * (t / 2);
    const q = [[ax - ox, ay - oy], [bx - ox, by - oy], [bx + ox, by + oy], [ax + ox, ay + oy]];
    slab(this, role, q, z0, z1);
  }

  /* One BufferGeometry a role, indexed, with the town's attribute set. */
  geometry(role) {
    const b = this.roles.get(role);
    if (!b || !b.idx.length) {
      return null;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const n = b.p.length / 3;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

function fan(k) {
  const t = [];
  for (let i = 1; i < k - 1; i += 1) {
    t.push(0, i, i + 1);
  }
  return t;
}

/* ------------------------------------------------------------------ *
 * Plane polygons, [x, y] counter clockwise.
 * ------------------------------------------------------------------ */

function area2(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/* Keep the part of a convex polygon where a x + b y + c >= 0
 * (Sutherland and Hodgman, one plane). */
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const fp = a * p[0] + b * p[1] + c;
    const fq = a * q[0] + b * q[1] + c;
    if (fp >= 0) {
      out.push(p);
    }
    if ((fp >= 0) !== (fq >= 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/* The polygon moved in by `c[i]` at each corner along its mitre, which is
 * the offset of both edges by the same amount at a corner and a smooth
 * blend where neighbouring corners differ. */
function inset(poly, c) {
  const n = poly.length;
  const out = new Array(n);
  for (let i = 0; i < n; i += 1) {
    const p = poly[(i + n - 1) % n];
    const q = poly[i];
    const r = poly[(i + 1) % n];
    let ax = q[0] - p[0];
    let ay = q[1] - p[1];
    let bx = r[0] - q[0];
    let by = r[1] - q[1];
    const la = Math.sqrt(ax * ax + ay * ay) || 1;
    const lb = Math.sqrt(bx * bx + by * by) || 1;
    ax /= la; ay /= la; bx /= lb; by /= lb;
    /* Inward normals of a counter clockwise polygon are its left normals. */
    const n1x = -ay;
    const n1y = ax;
    const n2x = -by;
    const n2y = bx;
    const d = 1 + n1x * n2x + n1y * n2y;
    const k = d > 0.25 ? c[i] / d : c[i] / 0.25;
    out[i] = [q[0] + (n1x + n2x) * k, q[1] + (n1y + n2y) * k];
  }
  return out;
}

/* Triangles for a simple polygon, as index triples, counter clockwise. */
function triangulate(poly) {
  const contour = poly.map((p) => new THREE.Vector2(p[0], p[1]));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  const out = [];
  for (const [a, b, c] of faces) {
    const s = (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[c][0] - poly[a][0]) * (poly[b][1] - poly[a][1]);
    if (s >= 0) {
      out.push(a, b, c);
    } else {
      out.push(a, c, b);
    }
  }
  return out;
}

/* A plane polygon of a side profile, extruded from z0 to z1 with square
 * edges: a bumper insert, a lamp housing, a spoiler. */
function slab(M, role, poly, z0, z1, { ends = true } = {}) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const n = q.length;
  for (let i = 0; i < n; i += 1) {
    const p = q[i];
    const r = q[(i + 1) % n];
    M.face(role, [[p[0], p[1], z0], [r[0], r[1], z0], [r[0], r[1], z1], [p[0], p[1], z1]]);
  }
  if (ends) {
    const T = triangulate(q);
    M.face(role, q.map((p) => [p[0], p[1], z1]), { tris: T });
    M.face(role, q.map((p) => [p[0], p[1], z0]), { tris: T, toward: [0, 0, -1] });
  }
}

/*
 * THE BEVELLED PRISM: a side profile extruded across the car, its flanks
 * chamfered. `pts` are { x, y, c, d } counter clockwise seen from +z: c is
 * how far the flank's face is inset in the profile's own plane at that
 * corner, d how deep the chamfer runs across the car there. `hw(x, y)` is
 * the half width at a point, which a glasshouse narrows toward its roof.
 * `edgeRole(i)` names the material of the band face along edge i, so an
 * arch can be dark inside while the bonnet is paint; the flanks and the
 * chamfers take `role`. Returns the flank polygon, inset, for whatever is
 * laid on it.
 */
function prism(M, role, pts, hw, { edgeRole = null, sides = [1, -1], round = false, smooth = false, segs = 2 } = {}) {
  const n = pts.length;
  const P = pts.map((p) => [p.x, p.y]);
  const Q = inset(P, pts.map((p) => p.c ?? 0));
  const T = triangulate(Q);
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const pi = pts[i];
    const pj = pts[j];
    const r = edgeRole ? edgeRole(i) : role;
    if (r) {
      const zi = hw(pi.x, pi.y) - (pi.d ?? 0);
      const zj = hw(pj.x, pj.y) - (pj.d ?? 0);
      M.face(r, [[pi.x, pi.y, -zi], [pj.x, pj.y, -zj], [pj.x, pj.y, zj], [pi.x, pi.y, zi]]);
    }
  }
  /* The rings the chamfer runs through, from the band to the flank: one
   * flat bevel, or with `round` a quarter round in two facets, which the
   * cel ramp turns into two steps of light along a shoulder instead of
   * one. A ring is [its outline, how much of the depth is left at it]. */
  let K = round ? [[0, 1], [1 - Math.SQRT1_2, 1 - Math.SQRT1_2], [1, 0]] : [[0, 1], [1, 0]];
  if (round && segs !== 2) {
    /* A quarter round in `segs` facets: ring k at angle k / segs of the
     * quarter, as far in and as shallow as a circle through it. */
    K = [];
    for (let k = 0; k <= segs; k += 1) {
      const t = (k / segs) * (Math.PI / 2);
      K.push(k === 0 ? [0, 1] : (k === segs ? [1, 0] : [1 - Math.cos(t), 1 - Math.sin(t)]));
    }
  }
  /* With `smooth` each ring carries the normal of a round through it,
   * turning from the band's to the flank's, so the cel ramp's bands run
   * along a shoulder as smooth lines instead of breaking at each facet. */
  const angle = K.map((_, k) => (k / (K.length - 1)) * (Math.PI / 2));
  const rings = K.map(([ci, di]) => [
    ci === 0 ? P : (ci === 1 ? Q : inset(P, pts.map((p) => (p.c ?? 0) * ci))),
    di,
  ]);
  for (const s of sides) {
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const pi = pts[i];
      const pj = pts[j];
      if (!(pi.c || pi.d || pj.c || pj.d)) {
        continue;
      }
      const r = edgeRole ? edgeRole(i, true) ?? role : role;
      let ex = 0;
      let ey = 0;
      if (smooth) {
        /* The band's outward normal: the right hand normal of an edge of a
         * counter clockwise outline. */
        const dx = pj.x - pi.x;
        const dy = pj.y - pi.y;
        const l = Math.sqrt(dx * dx + dy * dy) || 1;
        ex = dy / l;
        ey = -dx / l;
      }
      for (let k = 0; k + 1 < rings.length; k += 1) {
        const [A, da] = rings[k];
        const [B, db] = rings[k + 1];
        const at = (R, idx, dk, p) => [R[idx][0], R[idx][1], s * (hw(R[idx][0], R[idx][1]) - (p.d ?? 0) * dk)];
        const a = at(A, i, da, pi);
        const b = at(A, j, da, pj);
        const c = at(B, j, db, pj);
        const d = at(B, i, db, pi);
        if (smooth) {
          const na = [Math.cos(angle[k]) * ex, Math.cos(angle[k]) * ey, Math.sin(angle[k]) * s];
          const nb = [Math.cos(angle[k + 1]) * ex, Math.cos(angle[k + 1]) * ey, Math.sin(angle[k + 1]) * s];
          if (s > 0) {
            M.face(r, [a, b, c, d], { normals: [na, na, nb, nb] });
          } else {
            M.face(r, [d, c, b, a], { normals: [nb, nb, na, na] });
          }
        } else if (s > 0) {
          M.face(r, [a, b, c, d]);
        } else {
          M.face(r, [d, c, b, a]);
        }
      }
    }
    const cap = Q.map((q) => [q[0], q[1], s * hw(q[0], q[1])]);
    M.face(role, cap, { tris: T, toward: [0, 0, s] });
  }
  return Q;
}

/* ------------------------------------------------------------------ *
 * The materials: the town's own looks, so a car costs no new program and,
 * in the town, no new bucket.
 * ------------------------------------------------------------------ */

/* The streak across the glass, and the indicator amber. */
const GLINT = 0x93aac2;
/* The second pass's reflection band on the glass, between the glass and
 * the glint. */
const GLASS_BAND = 0x6f82a0;
const AMBER = 0xeaa451;
/* A reversing lamp's clear lens: not LAMP_FRONT, so it is never lit. */
const CLEAR = 0xe9e6e2;

const MAT = {};
function mats() {
  if (MAT.dark) {
    return MAT;
  }
  MAT.dark = cel({ color: 0x36333e, bands: 2, tint: 0x4b4560 });
  MAT.brite = cel({ color: PAL.metal, bands: 3, tint: 0x666090 });
  MAT.briteDark = cel({ color: PAL.metalDark, bands: 3, tint: 0x5c5680 });
  MAT.glass = flat({ color: PAL.glassDark });
  MAT.glint = flat({ color: GLINT });
  MAT.band = flat({ color: GLASS_BAND });
  MAT.lampF = flat({ color: LAMP_FRONT });
  MAT.lampR = flat({ color: LAMP_REAR });
  MAT.amber = flat({ color: AMBER });
  MAT.clear = flat({ color: CLEAR });
  /* One plate material for every car, as the vendored builder kept one:
   * flat() does not cache a mapped material. */
  MAT.plate = flat({ color: 0xffffff, map: platePlate(), cache: false });
  return MAT;
}
const paint = (c) => cel({ color: c, bands: 3, tint: 0x6a6288 });
const deepOf = (c) => new THREE.Color(c).multiplyScalar(0.76).getHex();
const deepPaint = (c) => cel({ color: deepOf(c), bands: 3, tint: 0x5e5680 });

/* ------------------------------------------------------------------ *
 * THE TABLE. Each kind is the vendored row (its sizes, untouched) and a
 * row of shape here. Shape fields, all metres in the car's frame:
 *
 *   nose, tail   the side profile's two ends. edge: height of the bonnet's
 *                (the boot's, the tailgate's) leading edge; face: where the
 *                lamp face stands against L / 2; out: how far the bumper
 *                stands past L / 2; bumper and dam: the bumper's top and
 *                bottom; lean: how far the face leans back at its top;
 *                tuck: how far the bumper's foot is tucked under.
 *   arch         gap: the arch's radius over the tyre's; lift: its centre
 *                over the axle; lip: the flare's width, 0 for none.
 *   cham         [c, d] of the flank chamfer (e) and of the plan corners
 *                at either end (n), see prism().
 *   cabin        shoulder: the glasshouse's step in from the flank at the
 *                waist; tuck: how much more it narrows by the roof; roof:
 *                the roof edge's chamfer.
 *   glass        belt: the glass's sill over the waist; frame: the pillar
 *                and header round it; pillars: 'dark' for blacked out
 *                pillars, 'body' for painted ones, 'chrome' for a frame.
 *   front, rear  the lamps, grille and bumper furniture, by style.
 *   wheel        the rim: 'cap' a plastic trim, 'steel' a painted steel
 *                wheel and hub cap, 'alloy5', 'alloy6', 'truck', 'bus'
 *                (the coupes' own: 'gtr', 'double').
 * ------------------------------------------------------------------ */

const SHAPE = {
  kei: {
    p2: true, rearWiper: true,
    nose: { edge: 0.95, face: 0.0, out: 0.05, bumper: 0.64, dam: 0.30, lean: 0.07, tuck: 0.06, wrap: { rp: [0.16, 0.18], front: 0.055, side: 0.02 } },
    tail: { edge: 0.99, face: 0.0, out: 0.035, bumper: 0.56, dam: 0.36, lean: 0.03, tuck: 0.05, wrap: { rp: [0.12, 0.16], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.045, 0.045], n: [0.09, 0.12] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.09 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.80, 0.93], lampW: 0.36, grille: 'slim', intake: [0.36, 0.50, 0.70] },
    rear: { lamps: 'pillar', lampY: [0.64, 1.02], lampW: 0.13, spoiler: true, garnish: false },
    wheel: 'cap', bumpers: 'body',
  },
  keivan: {
    p2: true, rearWiper: true,
    nose: { edge: 1.00, face: 0.0, out: 0.045, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.05, wrap: { rp: [0.09, 0.10], front: 0.06, side: 0.022 } },
    tail: { edge: 1.01, face: 0.0, out: 0.045, bumper: 0.52, dam: 0.36, lean: 0.01, tuck: 0.04, wrap: { rp: [0.08, 0.09], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.035], n: [0.07, 0.09] },
    cabin: { shoulder: 0.025, tuck: 0.035, roof: 0.06 },
    glass: { belt: 0.04, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.78, 0.92], lampW: 0.30, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.56, 0.88], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  hatch: {
    p2: true, rearWiper: true,
    nose: { edge: 0.92, face: 0.0, out: 0.05, bumper: 0.62, dam: 0.27, lean: 0.10, tuck: 0.08, wrap: { rp: [0.22, 0.22], front: 0.05, side: 0.02 } },
    tail: { edge: 0.97, face: 0.0, out: 0.035, bumper: 0.60, dam: 0.32, lean: 0.05, tuck: 0.06, wrap: { rp: [0.16, 0.20], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.12, 0.15] },
    cabin: { shoulder: 0.035, tuck: 0.055, roof: 0.10 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.76, 0.90], lampW: 0.40, grille: 'slim', intake: [0.34, 0.50, 0.86] },
    rear: { lamps: 'corner', lampY: [0.74, 0.96], lampW: 0.26, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  sedan: {
    p2: true,
    nose: { edge: 0.93, face: 0.0, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.05, tuck: 0.07, wrap: { rp: [0.12, 0.14], front: 0.055, side: 0.022 } },
    tail: { edge: 0.95, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.32, lean: 0.05, tuck: 0.06, wrap: { rp: [0.12, 0.14], front: 0.05, side: 0.022 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.014 },
    cham: { e: [0.03, 0.035], n: [0.07, 0.09] },
    cabin: { shoulder: 0.04, tuck: 0.06, roof: 0.05 },
    glass: { belt: 0.03, frame: 0.05, pillars: 'chrome', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.72, 0.86], lampW: 0.40, grille: 'chrome', intake: [0.34, 0.44, 0.90] },
    rear: { lamps: 'wide', lampY: [0.70, 0.86], lampW: 0.46, spoiler: false, garnish: true },
    wheel: 'alloy6', bumpers: 'body', chromeStrip: true,
  },
  wagon: {
    p2: true, rearWiper: true,
    nose: { edge: 0.93, face: 0.0, out: 0.05, bumper: 0.60, dam: 0.28, lean: 0.07, tuck: 0.06, wrap: { rp: [0.10, 0.12], front: 0.06, side: 0.022 } },
    tail: { edge: 0.97, face: 0.0, out: 0.045, bumper: 0.56, dam: 0.34, lean: 0.02, tuck: 0.05, wrap: { rp: [0.09, 0.11], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.04], n: [0.09, 0.12] },
    cabin: { shoulder: 0.035, tuck: 0.045, roof: 0.06 },
    glass: { belt: 0.035, frame: 0.05, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.74, 0.88], lampW: 0.36, grille: 'slats', intake: [0.34, 0.46, 0.80] },
    rear: { lamps: 'pillar', lampY: [0.62, 0.96], lampW: 0.12, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  minivan: {
    p2: true, rearWiper: true,
    nose: { edge: 1.01, face: 0.0, out: 0.05, bumper: 0.70, dam: 0.28, lean: 0.08, tuck: 0.07, wrap: { rp: [0.20, 0.22], front: 0.06, side: 0.022 } },
    tail: { edge: 1.05, face: 0.0, out: 0.035, bumper: 0.60, dam: 0.36, lean: 0.03, tuck: 0.05, wrap: { rp: [0.14, 0.18], front: 0.045, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.035 },
    lip: { w: 0.04, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.12, 0.15] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.10 },
    glass: { belt: 0.04, frame: 0.055, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'swept', lampY: [0.82, 0.97], lampW: 0.40, grille: 'slats', intake: [0.36, 0.52, 0.84] },
    rear: { lamps: 'pillar', lampY: [0.70, 1.12], lampW: 0.14, spoiler: true },
    wheel: 'alloy5', bumpers: 'body',
  },
  van: {
    p2: true,
    nose: { edge: 1.10, face: 0.0, out: 0.045, bumper: 0.66, dam: 0.34, lean: 0.03, tuck: 0.05, wrap: { rp: [0.10, 0.12], front: 0.06, side: 0.022 } },
    tail: { edge: 1.11, face: 0.0, out: 0.05, bumper: 0.58, dam: 0.38, lean: 0.01, tuck: 0.04, wrap: { rp: [0.08, 0.10], front: 0.05, side: 0.02 } },
    arch: { gap: 0.05, lift: 0.03, lip: 0.03 },
    lip: { w: 0.035, proud: 0.012 },
    cham: { e: [0.035, 0.035], n: [0.08, 0.10] },
    cabin: { shoulder: 0.025, tuck: 0.03, roof: 0.08 },
    glass: { belt: 0.05, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.84, 0.98], lampW: 0.34, grille: 'slats', intake: null },
    rear: { lamps: 'low', lampY: [0.62, 0.96], lampW: 0.13, spoiler: false },
    wheel: 'steel', bumpers: 'dark',
  },
  boxtruck: {
    p2: true,
    nose: { edge: 1.18, face: 0.0, out: 0.06, bumper: 0.74, dam: 0.44, lean: 0.03, tuck: 0.04, wrap: { rp: [0.08, 0.10], front: 0.07, side: 0.025 } },
    tail: null,
    arch: { gap: 0.06, lift: 0.04, lip: 0.035 },
    lip: { w: 0.04, proud: 0.012 },
    cham: { e: [0.03, 0.03], n: [0.09, 0.11] },
    cabin: { shoulder: 0.03, tuck: 0.04, roof: 0.07 },
    glass: { belt: 0.06, frame: 0.06, pillars: 'body', band: [0.55, 0.78] },
    front: { lamps: 'bumper', lampY: [0.58, 0.70], lampW: 0.26, grille: 'panel', intake: null },
    rear: { lamps: 'bar' },
    wheel: 'truck', bumpers: 'steel',
  },
  minibus: {
    p2: true,
    nose: { edge: 1.24, face: 0.0, out: 0.06, bumper: 0.80, dam: 0.46, lean: 0.06, tuck: 0.05, wrap: { rp: [0.14, 0.16], front: 0.07, side: 0.025 } },
    tail: { edge: 1.24, face: 0.0, out: 0.06, bumper: 0.76, dam: 0.48, lean: 0.02, tuck: 0.05, wrap: { rp: [0.12, 0.14], front: 0.06, side: 0.025 } },
    arch: { gap: 0.06, lift: 0.04, lip: 0.04 },
    lip: { w: 0.045, proud: 0.014 },
    cham: { e: [0.05, 0.05], n: [0.14, 0.16] },
    cabin: { shoulder: 0.03, tuck: 0.05, roof: 0.14 },
    glass: { belt: 0.04, frame: 0.07, pillars: 'dark', band: [0.55, 0.78] },
    front: { lamps: 'rect', lampY: [0.88, 1.02], lampW: 0.40, grille: 'slats', intake: null },
    rear: { lamps: 'pillar', lampY: [0.80, 1.20], lampW: 0.14, spoiler: false },
    wheel: 'bus', bumpers: 'dark', band: 0x6f9a8c,
  },
};

/*
 * THE R32. Every size is the real coupe's: 4.50 m long, 1.76 m over its
 * flares, 1.34 m high, a 2.615 m wheelbase on 225 section tyres of 0.63 m,
 * lowered and on a touch of negative camber as a drift car stands. The
 * sill, waist, roof, cab, rakes, door, cw and bonnet are its solids'
 * numbers, which src/props/street.js CAR_KINDS restates (the step down to
 * the bonnet so the solid does not stand over the low nose, the cabin's
 * width at the roof); the drawing does not read them, it is built round
 * them.
 *
 * What says what it is, with no name on it: the long bonnet and the short
 * glasshouse set on a high waist, the thick sloping C pillar with its small
 * quarter window; slim headlamps under the bonnet's edge with the amber
 * running round the corners, the body coloured slatted grille between them;
 * the deep bumper with its wide mesh mouth, slatted ducts and dark lip; the
 * blistered flares under the waist's character line; four big round tail
 * lamps, two to a body coloured housing; the hoop wing on the high deck;
 * one fat tailpipe; five broad spokes swept round the wheel.
 */
const R32 = {
  L: 4.50, W: 1.76, R: 0.315, axle: [1.30, -1.315],
  sill: 0.30, waist: 0.86, roof: 1.34,
  cab: [-1.45, 0.55], rakeF: 0.62, rakeR: 0.50,
  door: 1.71, cw: 1.32,
  bonnet: { x: 0.55, y: 0.80 },
  tw: 0.225, camber: 0.05,
};
/*
 * THE R32'S BODY. Heights and half widths in metres, x from the middle of
 * the wheelbase's footprint (the table's), nose +x. Each row is one line
 * of the body and says what it is on the flank, at the nose and at the
 * tail, which are not the same line: the sill is the lip at the nose, the
 * bumper's top edge runs on along the doors unseen (the doors are flat
 * there), the character line over the flares comes down the front wing to
 * the lamp's foot.
 */
/* The top of the lower body along the car: the bonnet rising from its
 * front edge to the cowl, the waist under the glasshouse rising to the
 * rear, the high deck behind it, the boot lid. */
const R32_TOP = [
  [-2.4, 0.99], [-2.2, 1.0], [-1.85, 1.0], [-1.76, 0.998], [-1.6, 0.97], [-1.3, 0.93], [-1.08, 0.915], [-0.5, 0.895],
  [0.39, 0.878], [0.62, 0.905], [1.0, 0.895], [1.5, 0.87], [2.0, 0.828], [2.2, 0.805], [2.4, 0.798],
];
const R32_NOSE = [2.3, 0.13, 0.14];
const R32_LAMPS = [2.248, 0.035, 0.06];
const R32_TAIL = [-2.29, 0.1, 0.12];
const R32_PANEL = [-2.248, 0.035, 0.06];
const R32_BODY = {
  flare: { pad: 0.07, ramp: 0.1 },
  stations: {
    all: [
      -2.29, -2.275, -2.26, -2.246, -2.236, -2.222, -2.2, -2.18, -2.155, -2.0, -1.9, -1.83, -0.8,
      0.785, 1.815, 1.95, 2.08, 2.17, 2.198, 2.214, 2.228, 2.238, 2.246, 2.27, 2.29, 2.3, 2.33,
    ],
    high: [-1.76, -1.6, -1.3, -1.08, -0.5, 0.39, 0.62, 1.0, 1.5],
  },
  rows: [
    /* 0: the skirt's foot, the lip's underside at the nose, the valance's
     * at the tail. */
    { y: [[-2.4, 0.232], [1.72, 0.232], [1.95, 0.2], [2.12, 0.176], [2.4, 0.174]], z: 0.822, nose: [2.305, 0.13, 0.14], tail: [-2.255, 0.1, 0.12], arch: 0, fine: true },
    /* 1: the skirt's face, the lip's front edge. */
    { y: [[-2.4, 0.252], [1.72, 0.252], [1.95, 0.212], [2.12, 0.186], [2.4, 0.184]], z: 0.852, nose: [2.33, 0.14, 0.14], tail: [-2.27, 0.1, 0.12], arch: 0.012, fine: true, role: 'lip' },
    /* 2: the skirt's top, the lip's top. */
    { y: [[-2.4, 0.292], [-2.05, 0.33], [1.72, 0.33], [1.95, 0.228], [2.12, 0.202], [2.4, 0.2]], z: 0.852, nose: [2.326, 0.14, 0.14], tail: [-2.276, 0.1, 0.12], arch: 0.02, fine: true, crease: true, role: 'lip' },
    /* 3: the door's foot, stepping in over the skirt; the bumper's foot. */
    { y: [[-2.4, 0.305], [-2.05, 0.345], [1.72, 0.345], [1.95, 0.24], [2.12, 0.213], [2.4, 0.212]], z: 0.838, nose: [2.295, 0.13, 0.14], tail: [-2.284, 0.1, 0.12], arch: 0.022, fine: true, crease: true },
    /* 4, 5: the bumper's face and its top edge, a crease at either end;
     * on the doors a line nobody sees, where a two tone splits and its
     * stripe runs. */
    { y: [[-2.4, 0.565], [-2.05, 0.575], [2.4, 0.575]], z: 0.846, flare: 0.033, nose: R32_NOSE, tail: R32_TAIL, arch: 0.025, fine: true },
    { y: [[-2.4, 0.582], [-2.05, 0.59], [2.4, 0.59]], z: 0.846, flare: 0.033, nose: R32_NOSE, tail: R32_TAIL, arch: 0.025, fine: true, crease: true },
    /* 6: the bumper's top stepping back to the lamps, the ledge under them. */
    { y: [[-2.4, 0.598], [-2.05, 0.605], [2.4, 0.605]], z: 0.847, flare: 0.033, nose: R32_LAMPS, tail: R32_PANEL, arch: 0.025, fine: true, crease: true },
    /* 7: the character line along the flares' tops, which runs down the
     * front wing to the lamp's foot. */
    { y: [[-2.4, 0.62], [-2.1, 0.642], [-1.92, 0.705], [1.8, 0.705], [2.08, 0.628], [2.4, 0.622]], z: 0.847, flare: 0.033, nose: R32_LAMPS, tail: R32_PANEL, arch: 0.028, fine: true, crease: true },
    /* 8: over the line the body steps in, which over a flare is its top. */
    { y: [[-2.4, 0.632], [-2.1, 0.655], [-1.92, 0.716], [1.8, 0.716], [2.08, 0.64], [2.4, 0.634]], z: 0.838, nose: R32_LAMPS, tail: R32_PANEL, crease: true },
    /* 9: the upper door and wing. */
    { y: [[-2.4, 0.74], [-2.05, 0.77], [1.9, 0.782], [2.08, 0.778], [2.2, 0.7], [2.4, 0.7]], z: 0.838, nose: R32_LAMPS, tail: R32_PANEL },
    /* 10: the shoulder, a sharp edge; the lamps' top; the boot lid's foot. */
    { y: [[-2.4, 0.9], [-2.2, 0.915], [-1.85, 0.945], [-1.6, 0.93], [-1.3, 0.898], [-1.08, 0.883], [-0.5, 0.863], [0.39, 0.846], [0.62, 0.86], [1.0, 0.855], [1.5, 0.838], [1.9, 0.815], [2.1, 0.806], [2.21, 0.772], [2.4, 0.77]], z: 0.83, nose: [2.242, 0.035, 0.06], tail: [-2.244, 0.035, 0.06], crease: true },
    /* 11: the top's edge: the shoulder's top along the waist, rising over
     * the rear quarter to the high deck; the bonnet's front edge standing a
     * touch over the lamps; the boot lid's trailing edge. */
    { y: [[-2.4, 0.965], [-2.2, 0.98], [-1.85, 0.988], [-1.76, 0.986], [-1.6, 0.958], [-1.3, 0.918], [-1.08, 0.903], [-0.5, 0.883], [0.39, 0.866], [0.62, 0.893], [1.0, 0.883], [1.5, 0.858], [2.0, 0.81], [2.2, 0.79], [2.4, 0.785]], z: 0.81, nose: [2.244, 0.04, 0.07], tail: [-2.24, 0.04, 0.07], crease: true },
    /* 12, 13: the crown and the centre line: the bonnet up to the cowl,
     * the deck under the glasshouse, the boot lid. */
    { y: R32_TOP, z: 0.42, nose: [2.226, 0, 0], tail: [-2.238, 0, 0] },
    { y: R32_TOP.map(([x, y]) => [x, y + 0.004]), z: 0, nose: [2.224, 0, 0], tail: [-2.238, 0, 0] },
  ],
};

/* The glasshouse: its base buried in the waist, the belt (on the waist, so
 * the glass stands on the shoulder's top), the roof's side rail, the
 * roof's edge, its crown, the centre line. Its ends are the windscreen and
 * the backlight, from the belt to the rail. Measured off a side view of the
 * real coupe: the windscreen from the cowl at 0.62 to its header at -0.14,
 * the roof to -1.03, the backlight down to the high deck at -1.76. */
const R32_CABIN = {
  stations: { all: [-1.8, -1.76, -1.73, -1.6, -1.35, -1.08, -1.05, -1.02, -0.98, -0.8, -0.5, -0.12, -0.096, -0.078, 0.15, 0.4, 0.59, 0.62, 0.66] },
  rows: [
    { y: R32_TOP.map(([x, y]) => [x, y - 0.02]), z: 0.758, nose: [0.66, 0, 0.03], tail: [-1.8, 0, 0.03] },
    { y: R32_TOP.map(([x, y]) => [x, y - 0.002]), z: 0.748, nose: [0.62, 0.03, 0.05], tail: [-1.76, 0.03, 0.05] },
    { y: [[-1.03, 1.305], [-0.5, 1.325], [-0.08, 1.322]], z: 0.642, nose: [-0.078, 0.03, 0.04], tail: [-1.03, 0.07, 0.07], crease: true },
    { y: [[-1.03, 1.318], [-0.5, 1.335], [-0.08, 1.332]], z: 0.618, nose: [-0.088, 0.02, 0.05], tail: [-1.05, 0.035, 0.08] },
    { y: [[-1.05, 1.333], [-0.5, 1.34], [-0.1, 1.338]], z: 0.33, nose: [-0.096, 0, 0], tail: [-1.06, 0, 0] },
    { y: [[-1.05, 1.336], [-0.5, 1.343], [-0.1, 1.341]], z: 0, nose: [-0.096, 0, 0], tail: [-1.06, 0, 0] },
  ],
  /* The windscreen and the backlight: their frames and wipers. */
  screen: { frame: 0.042, bottom: 0.05, wipers: [[0.3, 0.012, -0.22, 0.06], [-0.19, 0.012, -0.64, 0.05]] },
  backlight: { frame: 0.04, bottom: 0.05 },
};
const R32_SHAPE = {
  sculpt: true, arch: { gap: 0.03, lift: 0.015 }, wheel: 'gtr',
  body: R32_BODY, cabin: R32_CABIN, dress: dressR32,
};

/*
 * THE E82: the compact rear drive coupe of the late 2000s in its six
 * cylinder turbo form. The real car's sizes: 4.36 m long, 1.75 m wide,
 * 1.41 m high, a 2.66 m wheelbase with the front axle well forward (0.72 m
 * of overhang) and 0.98 m behind, on 18 inch wheels of 0.315 m radius. As
 * with the r32, the sill, waist, roof, cab, rakes, cw and bonnet are its
 * solids' numbers (src/props/street.js CAR_KINDS), which the drawing keeps
 * to and does not read.
 *
 * What says what it is, with no roundel and no name on it: the two rounded
 * grilles side by side in bright surrounds; the headlamps under the
 * bonnet's edge, a ring round each of their two lamps, swept back round
 * the corners along the wings to a point; the bonnet's two creases running
 * down to the grilles; a bumper of three mouths; the long bonnet and the
 * glasshouse set back over the rear axle on a high waist, the rear side
 * window kinked forward at the pillar's foot (the kink the maker has used
 * since the sixties, drawn here as a shape); the lower line rising from
 * behind the front wheel and the shoulder rising to the tail, the side
 * hollow between them; wedge tail lamps wrapping onto the wings with a pale
 * strip along their foot; the plate on the boot lid; twin tips on the left;
 * double spoke wheels.
 */
const E82 = {
  L: 4.36, W: 1.75, R: 0.315, axle: [1.46, -1.20],
  sill: 0.33, waist: 0.92, roof: 1.41,
  cab: [-1.27, 0.63], rakeF: 0.50, rakeR: 0.50,
  cw: 1.32,
  bonnet: { x: 0.63, y: 0.83 },
  tw: 0.225,
};
/*
 * THE E82'S BODY, measured the same way off a side view of the real coupe:
 * a long bonnet falling to a nose whose edge is at 0.81 over lamps that
 * sweep back and down to a point on the wing at 0.74, the windscreen from
 * the cowl at 0.93 to its header at 0.25, an arched roof, the backlight
 * down to a high short deck at -1.65, and a high waist, 0.99 at the
 * windscreen rising to 1.045 at the kink. Its rows run as the R32's do;
 * what differs is the surfacing: the side's shoulder line rising from the
 * headlamp's point to the tail lamp, the lower line rising from behind the
 * front wheel, the hollow between them, and the round nose and tail, whose
 * corners carry the lamps back along the wings.
 */
const E82_TOP = [
  [-2.3, 1.02], [-2.1, 1.03], [-1.85, 1.034], [-1.65, 1.03], [-1.35, 1.035], [-1.1, 1.042], [-0.45, 1.018], [0.48, 1.0],
  [0.93, 0.99], [1.2, 0.957], [1.465, 0.91], [1.8, 0.855], [2.0, 0.826], [2.1, 0.816], [2.3, 0.812],
];
/* The shoulder line: from the headlamp's rear corner up the wing, across
 * the door, to the tail lamp's top. */
const E82_SHOULDER = [[-2.3, 0.95], [-1.7, 0.958], [-1.0, 0.944], [0, 0.918], [0.82, 0.903], [1.3, 0.83], [1.76, 0.745], [1.95, 0.785], [2.3, 0.797]];
const E82_NOSE = [2.2, 0.15, 0.22];
const E82_LAMPS = [2.182, 0.13, 0.19];
const E82_BROW = [2.16, 0.12, 0.18];
const E82_TAIL = [-2.205, 0.14, 0.2];
const E82_REAR = [-2.195, 0.14, 0.2];
const E82_BODY = {
  stations: {
    all: [
      -2.205, -2.195, -2.182, -2.16, -2.13, -2.1, -2.06, -2.0, -1.9, -1.8, -1.72, -1.6, -0.75,
      0.95, 1.86, 1.95, 2.02, 2.06, 2.1, 2.13, 2.15, 2.162, 2.172, 2.182, 2.192, 2.2,
    ],
    high: [-1.35, -1.1, -0.45, 0.48, 0.93, 1.2, 1.465, 1.6, 1.7, 1.78],
  },
  rows: [
    /* 0 to 3: the skirt's foot, its face, its top and the door's foot; the
     * lip and the bumper's foot at the nose; the diffuser at the tail. */
    { y: [[-2.3, 0.24], [-1.95, 0.24], [-1.6, 0.175], [1.2, 0.175], [1.9, 0.19], [2.3, 0.19]], z: 0.838, nose: [2.17, 0.14, 0.2], tail: [-2.09, 0.13, 0.19], arch: 0, fine: true, role: 'lip' },
    { y: [[-2.3, 0.26], [-1.95, 0.26], [-1.6, 0.195], [1.2, 0.195], [1.9, 0.205], [2.3, 0.205]], z: 0.86, nose: [2.198, 0.14, 0.2], tail: [-2.125, 0.13, 0.19], arch: 0.01, fine: true, role: 'lip' },
    { y: [[-2.3, 0.3], [-1.95, 0.3], [-1.6, 0.318], [1.2, 0.318], [1.9, 0.228], [2.3, 0.228]], z: 0.86, nose: [2.194, 0.14, 0.2], tail: [-2.165, 0.13, 0.19], arch: 0.02, fine: true, crease: true, role: 'lip' },
    { y: [[-2.3, 0.33], [-1.95, 0.33], [-1.6, 0.334], [1.2, 0.334], [1.9, 0.245], [2.3, 0.245]], z: 0.853, nose: [2.186, 0.14, 0.2], tail: [-2.19, 0.14, 0.2], arch: 0.022, fine: true, crease: true },
    /* 4: the lower line, rising from behind the front wheel toward the rear
     * one, a crisp edge standing out over the sill; the bumper's face. */
    { y: [[-2.3, 0.46], [-1.9, 0.47], [-0.85, 0.62], [1.05, 0.44], [1.8, 0.43], [2.3, 0.42]], z: 0.873, nose: E82_NOSE, tail: E82_TAIL, arch: 0.026, fine: true, crease: true },
    /* 5: the valley over it, where the side is hollow; the bumper's top
     * edge at either end. */
    { y: [[-2.3, 0.722], [-1.9, 0.725], [-1.6, 0.76], [0, 0.73], [1.3, 0.62], [1.8, 0.585], [2.3, 0.585]], z: 0.852, nose: E82_NOSE, tail: [-2.2, 0.14, 0.2], arch: 0.03, fine: true },
    /* 6: under the shoulder; the ledge under the lamps at either end. */
    { y: [[-2.3, 0.745], [-1.72, 0.745], [-1.6, 0.9], [0, 0.878], [0.82, 0.866], [1.3, 0.79], [1.76, 0.7], [2.05, 0.635], [2.3, 0.632]], z: 0.864, nose: E82_LAMPS, tail: E82_REAR, crease: true },
    /* 7: the shoulder line, the side's sharp edge, which becomes the
     * headlamps' top at the nose and the tail lamps' top at the tail. */
    { y: E82_SHOULDER, z: 0.874, nose: E82_BROW, tail: [-2.19, 0.14, 0.2], crease: true },
    /* 8: over the shoulder the body rolls in to the waist; the bonnet's
     * front edge; the boot lid's rear face. */
    { y: [[-2.3, 1.0], [-1.7, 1.012], [-1.1, 1.02], [0, 0.99], [0.93, 0.965], [1.3, 0.88], [1.76, 0.805], [2.0, 0.812], [2.3, 0.81]], z: 0.848, nose: [2.164, 0.12, 0.18], tail: [-2.186, 0.14, 0.2] },
    /* 9: the top's edge: the waist at the glass, the bonnet's sides, the
     * boot lid's trailing edge. */
    { y: E82_TOP.map(([x, y]) => [x, y - 0.008]), z: 0.8, nose: [2.168, 0.11, 0.16], tail: [-2.18, 0.12, 0.18], crease: true },
    /* 10: the bonnet's two creases, converging on the grilles, the dome
     * between them standing over the rest; on along the boot lid. */
    { y: E82_TOP.map(([x, y]) => [x, y - 0.004]), z: [[0.93, 0.44], [1.4, 0.38], [2.0, 0.3], [2.3, 0.28]], nose: [2.17, 0.06, 0.08], tail: [-2.18, 0.06, 0.08], crease: true },
    /* 11, 12: the dome's crown and the centre line. */
    { y: E82_TOP.map(([x, y]) => [x, y + (x > 1 ? 0.012 : 0.004)]), z: 0.15, nose: [2.172, 0.03, 0.04], tail: [-2.182, 0, 0] },
    { y: E82_TOP.map(([x, y]) => [x, y + (x > 1 ? 0.014 : 0.006)]), z: 0, nose: [2.174, 0, 0], tail: [-2.182, 0, 0] },
  ],
};

const E82_RAIL = [[-1.05, 1.362], [-0.8, 1.39], [-0.35, 1.402], [0, 1.398], [0.25, 1.372]];
const E82_CABIN = {
  stations: { all: [-1.7, -1.65, -1.62, -1.35, -1.1, -1.05, -1.01, -0.97, -0.8, -0.55, -0.3, 0, 0.19, 0.22, 0.25, 0.45, 0.7, 0.9, 0.93, 0.96] },
  rows: [
    { y: E82_TOP.map(([x, y]) => [x, y - 0.02]), z: 0.768, nose: [0.97, 0, 0.03], tail: [-1.7, 0, 0.03] },
    { y: E82_TOP.map(([x, y]) => [x, y - 0.002]), z: 0.758, nose: [0.93, 0.03, 0.06], tail: [-1.65, 0.03, 0.06] },
    { y: E82_RAIL, z: 0.64, nose: [0.25, 0.06, 0.08], tail: [-1.05, 0.08, 0.08], crease: true },
    { y: E82_RAIL.map(([x, y]) => [x, y + 0.012]), z: 0.605, nose: [0.235, 0.04, 0.1], tail: [-1.07, 0.04, 0.1] },
    { y: E82_RAIL.map(([x, y]) => [x, y + 0.02]), z: 0.3, nose: [0.225, 0, 0], tail: [-1.08, 0, 0] },
    { y: E82_RAIL.map(([x, y]) => [x, y + 0.022]), z: 0, nose: [0.225, 0, 0], tail: [-1.08, 0, 0] },
  ],
  screen: { frame: 0.04, bottom: 0.05, wipers: [[0.3, 0.012, -0.22, 0.06], [-0.19, 0.012, -0.64, 0.05]] },
  backlight: { frame: 0.04, bottom: 0.05 },
};
const E82_SHAPE = {
  sculpt: true, arch: { gap: 0.035, lift: 0.02 }, wheel: 'double',
  body: E82_BODY, cabin: E82_CABIN, dress: dressE82,
};

/* The kei truck: makeKeiTruck's own sizes, which its colliders are. */
const KEITRUCK = {
  L: 3.32, W: 1.46, R: 0.29, axle: [0.94, -1.06],
  sill: 0.51, waist: 0.85, roof: 1.91,
  cab: [0.35, 1.61],
  tw: 0.18,
  p2: true,
};

export const MODEL = Object.freeze(Object.fromEntries([
  ...Object.keys(SHAPE).map((k) => [k, Object.freeze({ kind: k, ...TOWN_SPEC[k], ...SHAPE[k] })]),
  ['r32', Object.freeze({ kind: 'r32', ...R32, ...R32_SHAPE })],
  ['e82', Object.freeze({ kind: 'e82', ...E82, ...E82_SHAPE })],
  ['keitruck', Object.freeze({ kind: 'keitruck', ...KEITRUCK, wheel: 'steel' })],
]));

/* The tyre's width: the vendored builder's two, and the kinds that carry
 * their own. */
function tyreWidth(s) {
  if (s.tw) {
    return s.tw;
  }
  if (s.kind === 'minibus') {
    return 0.215;
  }
  return s.R < 0.3 ? 0.165 : 0.195;
}

/* Where a wheel's middle stands across the car: its outer face 15 mm in
 * from the widest flank (the r32's flares), as the vendored track put it. */
function wheelZ(s) {
  return s.W / 2 - tyreWidth(s) / 2 - 0.015;
}

/* ------------------------------------------------------------------ *
 * THE LOWER BODY'S SIDE PROFILE, counter clockwise from the foot of the
 * rear bumper: along the underside and over both arches, up the nose, back
 * along the bonnet and the waist, down the tail. Each point carries its
 * chamfer (see prism) and the material of the edge that leaves it.
 * ------------------------------------------------------------------ */

/* The chamfer a point takes, by what it is. */
function chamferOf(s, tag) {
  if (tag === 'n') {
    return s.cham.n;
  }
  if (tag === 'e') {
    return s.cham.e;
  }
  if (tag === 'a') {
    return [0.022, 0.022];
  }
  return [0, 0];
}

/* The arch over one axle: from where it leaves the sill, over the top,
 * back down to the sill. Where the arch's centre stands above the sill (a
 * lowered car) it wraps past a half circle and hugs the tyre. */
function archPoints(s, ax, K) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  let sn = (s.sill - yc) / A;
  sn = sn < -0.5 ? -0.5 : (sn > 0.9 ? 0.9 : sn);
  const t0 = Math.asin(sn);
  const out = [];
  for (let k = 0; k <= K; k += 1) {
    const t = Math.PI - t0 + ((2 * t0 - Math.PI) * k) / K;
    out.push([ax + A * Math.cos(t), yc + A * Math.sin(t)]);
  }
  return out;
}

function lowerProfile(s) {
  const pts = [];
  const P = (x, y, tag, edge) => {
    const [c, d] = chamferOf(s, tag);
    pts.push({ x, y, c, d, edge });
  };
  return lowerProfileP2(s, P, pts);
}

/* The second pass's profile: the same, with no bumper in it, since the
 * bumpers are pieces of their own (bumperLoft) that wrap the corners. The
 * body's end runs down behind the bumper to its foot. */
function lowerProfileP2(s, P, pts) {
  const L2 = s.L / 2;
  const n = s.nose;
  const t = s.tail;
  P(-L2 - t.face + 0.03, t.dam + 0.04, 'n', 'under');
  for (const [x, y] of archPoints(s, s.axle[1], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  for (const [x, y] of archPoints(s, s.axle[0], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  const f0 = pts.length;
  P(L2 + n.face - 0.03, n.dam + 0.04, 'n', 'body');
  P(L2 + n.face, n.bumper - 0.03, 'n', 'body');
  const noseTop = L2 + n.face - n.lean;
  P(noseTop, n.edge, 'n', 'body');
  const front = pts.slice(f0).map((p) => [p.x, p.y]);
  const cowl = s.cab[1] + 0.03;
  if (noseTop - 0.14 > cowl + 0.05) {
    P(noseTop - 0.12, n.edge + 0.022, 'e', 'body');
  }
  P(cowl, s.waist + 0.004, 'e', null);
  const back = s.cab[0] - 0.03;
  P(back, s.waist + 0.004, 'e', 'body');
  const tailTop = -L2 - t.face + t.lean;
  if (tailTop + 0.12 < back - 0.05) {
    P(tailTop + 0.10, t.edge + 0.014, 'e', 'body');
  }
  const r0 = pts.length;
  P(tailTop, t.edge, 'n', 'body');
  P(-L2 - t.face, t.bumper - 0.03, 'n', 'body');
  const rear = [[pts[0].x, pts[0].y], ...pts.slice(r0).reverse().map((p) => [p.x, p.y])];
  pts.front = front;
  pts.rear = rear;
  return pts;
}

/* x of a chain of profile points at height y, the chain rising. */
function chainX(chain, y) {
  if (y <= chain[0][1]) {
    return chain[0][0];
  }
  for (let i = 0; i + 1 < chain.length; i += 1) {
    const a = chain[i];
    const b = chain[i + 1];
    if (y <= b[1]) {
      const u = (y - a[1]) / (b[1] - a[1] || 1);
      return a[0] + (b[0] - a[0]) * u;
    }
  }
  return chain[chain.length - 1][0];
}

/* ------------------------------------------------------------------ *
 * Laying things on a face.
 * ------------------------------------------------------------------ */

/* The front face of the lower body at height y, and the rear: where it is
 * in x, and its outward normal in the side view. */
function faceOf(chain, y, sign) {
  const x = chainX(chain, y);
  let i = 0;
  while (i + 2 < chain.length && y > chain[i + 1][1]) {
    i += 1;
  }
  const a = chain[i];
  const b = chain[i + 1] ?? chain[i];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.sqrt(dx * dx + dy * dy) || 1;
  let nx = dy / l;
  let ny = -dx / l;
  if (nx * sign < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x, nx, ny };
}

/*
 * A panel on the nose or the tail: y0 to y1 high, z0 to z1 across (z0 <
 * z1), following the face's rake, `lift` off it. sign +1 is the nose.
 * `raise` lifts the outer top corner, for a lamp that sweeps up round its
 * corner.
 */
function endQuad(chain, sign, y0, y1, z0, z1, lift, raise = 0) {
  const a = faceOf(chain, y0, sign);
  const b = faceOf(chain, y1, sign);
  const p0 = [a.x + a.nx * lift, y0 + a.ny * lift];
  const p1 = [b.x + b.nx * lift, y1 + b.ny * lift];
  const outerIs1 = (sign > 0) === (z1 > 0);
  return {
    pts: [
      [p0[0], p0[1], z0], [p0[0], p0[1], z1],
      [p1[0], p1[1] + (outerIs1 ? raise : 0), z1], [p1[0], p1[1] + (outerIs1 ? 0 : raise), z0],
    ],
    n: [sign * Math.abs(a.nx), a.ny, 0],
  };
}

function onEnd(M, role, chain, sign, y0, y1, z0, z1, lift, raise = 0) {
  /* Cut at every corner of the chain between y0 and y1, so a panel that
   * runs from a bumper up a raked face lies on both. */
  const cuts = [y0, ...chain.map((p) => p[1]).filter((y) => y > y0 + 1e-4 && y < y1 - 1e-4), y1];
  let q = null;
  for (let i = 0; i + 1 < cuts.length; i += 1) {
    const top = i + 2 === cuts.length;
    q = endQuad(chain, sign, cuts[i] + 1e-5, cuts[i + 1] - 1e-5, z0, z1, lift, top ? raise : 0);
    M.face(role, q.pts, { toward: q.n });
  }
  return q;
}

/* A block from a front quad and a back quad, corners in the same order:
 * the front and the four sides, each turned away from the block's middle.
 * A lamp's housing, so it has sides the ink can find. */
function hexa(M, role, f, k, back = false) {
  const c = [0, 0, 0];
  for (const p of [...f, ...k]) {
    c[0] += p[0] / 8;
    c[1] += p[1] / 8;
    c[2] += p[2] / 8;
  }
  const away = (pts) => {
    const m = [0, 0, 0];
    for (const p of pts) {
      m[0] += p[0] / pts.length;
      m[1] += p[1] / pts.length;
      m[2] += p[2] / pts.length;
    }
    return [m[0] - c[0], m[1] - c[1], m[2] - c[2]];
  };
  M.face(role, f, { toward: away(f) });
  if (back) {
    M.face(role, k, { toward: away(k) });
  }
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const side = [k[i], k[j], f[j], f[i]];
    M.face(role, side, { toward: away(side) });
  }
}

/* A point on the nose (sign 1) or the tail (-1): at height y, across at
 * z, `lift` off the face. */
function endPoint(chain, sign, y, z, lift) {
  const f = faceOf(chain, y, sign);
  return [f.x + f.nx * lift, y + f.ny * lift, z];
}

/* A plane polygon of [z, y] drawn on one face of the nose or the tail. */
function onEndPoly(M, role, chain, sign, poly, lift) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const f = faceOf(chain, q[0][1], sign);
  M.face(role, q.map(([z, y]) => endPoint(chain, sign, y, z, lift)), {
    tris: q.length > 4 ? triangulate(q) : null, toward: [sign * Math.abs(f.nx), f.ny, 0],
  });
}

/* A round lamp's ring (r0 to r1) or disc (r0 0) on the nose or the tail. */
function endRing(M, role, chain, sign, yc, zc, r0, r1, lift, N = 14) {
  const f = faceOf(chain, yc, sign);
  const toward = [sign * Math.abs(f.nx), f.ny, 0];
  if (r0 <= 0) {
    const pts = [];
    for (let k = 0; k < N; k += 1) {
      const t = (k / N) * TAU;
      pts.push(endPoint(chain, sign, yc + r1 * Math.sin(t), zc + r1 * Math.cos(t), lift));
    }
    M.face(role, pts, { toward });
    return;
  }
  for (let k = 0; k < N; k += 1) {
    const t0 = (k / N) * TAU;
    const t1 = ((k + 1) / N) * TAU;
    M.face(role, [
      endPoint(chain, sign, yc + r0 * Math.sin(t0), zc + r0 * Math.cos(t0), lift),
      endPoint(chain, sign, yc + r1 * Math.sin(t0), zc + r1 * Math.cos(t0), lift),
      endPoint(chain, sign, yc + r1 * Math.sin(t1), zc + r1 * Math.cos(t1), lift),
      endPoint(chain, sign, yc + r0 * Math.sin(t1), zc + r0 * Math.cos(t1), lift),
    ], { toward });
  }
}

/* A housing standing `depth` proud of the nose or the tail. */
function blockOnEnd(M, role, chain, sign, y0, y1, z0, z1, depth, raise = 0) {
  const f = endQuad(chain, sign, y0, y1, z0, z1, depth, raise);
  const k = endQuad(chain, sign, y0, y1, z0, z1, -0.01, raise);
  hexa(M, role, f.pts, k.pts);
  return f;
}

/* ------------------------------------------------------------------ *
 * WHEELS, drawn round the z axis with the outer face toward +z.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;

/* A band of quads round the axle from radius ra at za to rb at zb, `N`
 * sides, lit smooth round the axle and flat across it: (nr, nz) is the
 * normal in the profile's own plane. */
function lathe(M, role, ra, za, rb, zb, N, nr, nz, a0 = 0) {
  for (let k = 0; k < N; k += 1) {
    const t0 = a0 + (k / N) * TAU;
    const t1 = a0 + ((k + 1) / N) * TAU;
    const c0 = Math.cos(t0);
    const s0 = Math.sin(t0);
    const c1 = Math.cos(t1);
    const s1 = Math.sin(t1);
    const pts = [[ra * c0, ra * s0, za], [ra * c1, ra * s1, za], [rb * c1, rb * s1, zb], [rb * c0, rb * s0, zb]];
    const normals = [[nr * c0, nr * s0, nz], [nr * c1, nr * s1, nz], [nr * c1, nr * s1, nz], [nr * c0, nr * s0, nz]];
    M.face(role, pts, { normals, toward: [nr * (c0 + c1), nr * (s0 + s1), nz * 2] });
  }
}

function disc(M, role, r, z, N, nz, a0 = 0) {
  const pts = [];
  for (let k = 0; k < N; k += 1) {
    const t = a0 + (k / N) * TAU;
    pts.push([r * Math.cos(t), r * Math.sin(t), z]);
  }
  M.face(role, pts, { toward: [0, 0, nz] });
}

/* The dark windows between the spokes: n of them, each spanning the face
 * from r0 to r1 less a spoke `spoke` metres wide at every radius. */
function spokeWindows(M, n, r0, r1, spoke, z, a0 = 0) {
  for (let k = 0; k < n; k += 1) {
    const mid = a0 + ((k + 0.5) / n) * TAU;
    const half = Math.PI / n;
    const pts = [];
    const lo0 = mid - half + spoke / (2 * r0);
    const hi0 = mid + half - spoke / (2 * r0);
    const lo1 = mid - half + spoke / (2 * r1);
    const hi1 = mid + half - spoke / (2 * r1);
    if (hi0 <= lo0) {
      pts.push([r0 * Math.cos(mid), r0 * Math.sin(mid), z]);
    } else {
      pts.push([r0 * Math.cos(lo0), r0 * Math.sin(lo0), z], [r0 * Math.cos(hi0), r0 * Math.sin(hi0), z]);
    }
    pts.push([r1 * Math.cos(hi1), r1 * Math.sin(hi1), z]);
    pts.push([r1 * Math.cos(mid), r1 * Math.sin(mid), z]);
    pts.push([r1 * Math.cos(lo1), r1 * Math.sin(lo1), z]);
    M.face('dark', pts, { toward: [0, 0, 1] });
  }
}

/* Small dark openings in a steel wheel's face. */
function holes(M, n, r, size, z, a0 = 0) {
  for (let k = 0; k < n; k += 1) {
    const t = a0 + (k / n) * TAU;
    const cx = r * Math.cos(t);
    const cy = r * Math.sin(t);
    const pts = [];
    for (let j = 0; j < 6; j += 1) {
      const u = (j / 6) * TAU;
      pts.push([cx + size * Math.cos(u), cy + size * 0.8 * Math.sin(u), z]);
    }
    M.face('dark', pts, { toward: [0, 0, 1] });
  }
}

/*
 * One wheel. 'parked' draws what can be seen of a wheel standing under its
 * arch, which is its outer half; 'full' draws both faces and the rim's
 * dish, for a wheel that steers and can be seen from any side.
 */
function wheel(M, s, detail, rimRole) {
  const full = detail === 'full';
  const N = full ? 16 : 14;
  const R = s.R;
  const h = tyreWidth(s) / 2;
  const sh = Math.min(0.04, R * 0.13);
  const style = s.wheel;
  const rimR = R * ({ double: 0.72, gtr: 0.7, truck: 0.6, bus: 0.6 }[style] ?? 0.63);
  const lip = style === 'gtr' ? 0.02 : 0.013;
  /* The tyre: tread, shoulders, sidewalls. */
  lathe(M, 'dark', R, -(h - sh), R, h - sh, N, 1, 0);
  lathe(M, 'dark', R, h - sh, R - sh, h, N, 0.7071, 0.7071);
  lathe(M, 'dark', R - sh, h, rimR, h, N, 0, 1);
  if (full) {
    lathe(M, 'dark', R, -(h - sh), R - sh, -h, N, 0.7071, -0.7071);
    disc(M, 'dark', R - sh, -h, N, -1);
  } else if (s.p2 || s.sculpt) {
    /* The tyre's inner face, flat, so a wheel seen from the other side of
     * the car or from behind is a tyre and not the edge of its tread. */
    disc(M, 'dark', R, -(h - sh), N, -1);
  }
  /* The rim: its lip standing proud of the sidewall, the dish behind it,
   * the face. */
  const lipRole = style === 'steel' ? 'briteDark' : rimRole;
  lathe(M, lipRole, rimR, h + 0.004, rimR - lip, h + 0.004, N, 0, 1);
  const faceZ = full ? h - 0.01 : h + 0.001;
  const fr = rimR - lip;
  if (full) {
    lathe(M, 'briteDark', fr, h + 0.004, fr, faceZ, N, -1, 0);
  }
  const faceRole = {
    cap: 'brite', steel: 'briteDark', alloy5: rimRole, alloy6: rimRole, double: rimRole, gtr: rimRole, truck: 'brite', bus: 'brite',
  }[style] ?? rimRole;
  disc(M, faceRole, fr, faceZ, N, 1);
  const z = faceZ + 0.003;
  const hub = R * 0.13;
  if (style === 'alloy5') {
    spokeWindows(M, 5, hub + 0.02, fr - 0.012, 0.055, z, 0.3);
  } else if (style === 'alloy6') {
    spokeWindows(M, 6, hub + 0.02, fr - 0.014, 0.045, z, 0.1);
  } else if (style === 'gtr') {
    /* Five broad spokes swept round as they run out, the coupe's own
     * wheel: each window between them is turned a little further at the
     * rim than at the hub. */
    const r0 = hub + 0.03;
    const r1 = fr - 0.012;
    for (let k = 0; k < 5; k += 1) {
      const mid = 0.25 + ((k + 0.5) / 5) * TAU;
      const pts = [];
      const inner = 0.3;
      const outer = 0.44;
      const sweep = 0.22;
      for (const [r, a, w] of [[r0, mid - inner, 0], [r1, mid - outer + sweep, 0], [r1, mid + sweep * 0.5, 0], [r1, mid + outer + sweep, 0], [r0, mid + inner, 0]]) {
        void w;
        pts.push([r * Math.cos(a), r * Math.sin(a), z]);
      }
      M.face('dark', pts, { toward: [0, 0, 1] });
    }
  } else if (style === 'double') {
    /* Five pairs of spokes: five big windows between the pairs, and a
     * slot down the middle of each pair. */
    spokeWindows(M, 5, hub + 0.025, fr - 0.012, 0.085, z, 0.2);
    for (let k = 0; k < 5; k += 1) {
      const a = 0.2 + (k / 5) * TAU;
      const r0 = hub + 0.045;
      const r1 = fr - 0.02;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      const w0 = 0.004;
      const w1 = 0.011;
      M.face('dark', [
        [r0 * c + w0 * sn, r0 * sn - w0 * c, z], [r1 * c + w1 * sn, r1 * sn - w1 * c, z],
        [r1 * c - w1 * sn, r1 * sn + w1 * c, z], [r0 * c - w0 * sn, r0 * sn + w0 * c, z],
      ], { toward: [0, 0, 1] });
    }
  } else if (style === 'cap') {
    /* A plastic trim: short dark slots round its rim. */
    spokeWindows(M, 8, fr * 0.66, fr - 0.012, fr * 0.36, z, 0.2);
  } else if (style === 'steel') {
    holes(M, 5, fr * 0.66, fr * 0.13, z, 0.3);
  } else if (style === 'truck') {
    holes(M, 6, fr * 0.72, fr * 0.1, z, 0);
  } else if (style === 'bus') {
    holes(M, 8, fr * 0.74, fr * 0.08, z, 0);
  }
  /* The hub, or the cap over it. */
  const capR = style === 'steel' ? fr * 0.46 : (style === 'truck' || style === 'bus' ? fr * 0.38 : hub);
  disc(M, style === 'truck' || style === 'bus' ? 'dark' : 'brite', capR, z + 0.004, full ? 10 : 8, 1);
  if (style === 'truck' || style === 'bus') {
    disc(M, 'brite', capR * 0.5, z + 0.008, 8, 1);
  }
}

const _wm = new THREE.Matrix4();
const _wq = new THREE.Quaternion();
const _we = new THREE.Euler();
const _wp = new THREE.Vector3();
const _ws = new THREE.Vector3(1, 1, 1);

/* Every wheel of a car into its body, at its axle, turned out on its
 * side, and cambered if the car carries camber. */
function wheels(M, s, detail, rimRole) {
  const wz = wheelZ(s);
  const camber = s.camber ?? 0;
  for (const ax of s.axle) {
    for (const side of [1, -1]) {
      _we.set(side * -camber, side > 0 ? 0 : Math.PI, 0, 'XYZ');
      _wq.setFromEuler(_we);
      _wp.set(ax, s.R, side * wz);
      M.at(_wm.compose(_wp, _wq, _ws));
      wheel(M, s, detail, rimRole);
    }
    if (s.kind === 'boxtruck' && ax === s.axle[1]) {
      /* The lorry's rear axle is twinned: an inner wheel beside each. */
      for (const side of [1, -1]) {
        _we.set(0, side > 0 ? 0 : Math.PI, 0, 'XYZ');
        _wq.setFromEuler(_we);
        _wp.set(ax, s.R, side * (wz - tyreWidth(s) - 0.02));
        M.at(_wm.compose(_wp, _wq, _ws));
        lathe(M, 'dark', s.R, -tyreWidth(s) / 2, s.R, tyreWidth(s) / 2, 12, 1, 0);
      }
    }
  }
  M.at(null);
}

/* ------------------------------------------------------------------ *
 * GLASS.
 * ------------------------------------------------------------------ */

/*
 * Streaks of reflection across a pane, the way an animator paints glass:
 * a broad one and a thin one, slanting up to the right, clipped to the
 * pane. `poly` in some plane's [u, v] metres; drawn by `draw(poly)`.
 */
function glints(poly, slant, streaks, draw) {
  let u0 = Infinity;
  let u1 = -Infinity;
  for (const p of poly) {
    const u = p[0] - slant * p[1];
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
  }
  const span = u1 - u0;
  for (const [at, width] of streaks) {
    const a = u0 + span * at;
    const b = a + width;
    let q = clip(poly, 1, -slant, -a);
    q = clip(q, -1, slant, b);
    if (q.length >= 3 && Math.abs(area2(q)) > 1e-5) {
      draw(q);
    }
  }
}

/*
 * A screen on one of the glasshouse's raked faces, between two profile
 * points (a at the bottom, b at the top) whose half widths are za and zb.
 * A dark surround, the glass inside it, the streaks on the glass.
 */
function screen(M, a, b, za, zb, out, { frame: fr = 0.05, bottom = 0.05, streaks = [[0.2, 0.2], [0.52, 0.06]], chrome = false, band = null, wipers = null } = {}) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy);
  let nx = dy / len;
  let ny = -dx / len;
  if (nx * out[0] + ny * out[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  /* The face as a frame: u across the car in metres, v up the slope in
   * metres from a. */
  const P = (u, v, lift) => {
    const t = v / len;
    const x = a[0] + dx * t + nx * lift;
    const y = a[1] + dy * t + ny * lift;
    return [x, y, u];
  };
  const half = (v) => za + (zb - za) * (v / len);
  const pane = (inU, inBottom, inTop) => [
    [-(half(inBottom) - inU), inBottom], [half(inBottom) - inU, inBottom],
    [half(len - inTop) - inU, len - inTop], [-(half(len - inTop) - inU), len - inTop],
  ];
  const draw = (role, poly, lift) => {
    const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
    M.face(role, q.map((p) => P(p[0], p[1], lift)), { toward: [nx, ny, 0] });
  };
  draw(chrome ? 'brite' : 'dark', pane(fr * 0.5, bottom * 0.5, fr * 0.5), 0.006);
  const glass = pane(fr, bottom, fr);
  draw('glass', glass, 0.011);
  if (band) {
    /* The sky's reflection, a paler band across the upper glass with a
     * hard edge, as a painted windscreen has it. */
    const q = clip(clip(glass, 0, 1, -len * band[0]), 0, -1, len * band[1]);
    if (q.length >= 3) {
      draw('band', q, 0.0125);
    }
  }
  glints(glass, -0.55, streaks, (q) => draw('glint', q, 0.014));
  /* Wiper blades lying on the glass: each from its pivot at the foot
   * [u, v up the glass] to its tip, a dark blade on a thinner arm. */
  for (const [u0, v0, u1, v1] of wipers ?? []) {
    const du = u1 - u0;
    const dv = v1 - v0;
    const l = Math.sqrt(du * du + dv * dv);
    const nu = (-dv / l) * 0.007;
    const nv = (du / l) * 0.007;
    draw('dark', [[u0 - nu, bottom + v0 - nv], [u1 - nu, bottom + v1 - nv], [u1 + nu, bottom + v1 + nv], [u0 + nu, bottom + v0 + nv]], 0.017);
  }
}

/*
 * The side glass on a glasshouse flank. `cap` is the flank's polygon (the
 * prism's inset outline), `hw(y)` its half width, `s` the kind. The glass
 * reaches from the belt to under the roof's chamfer and between the
 * screens' pillars; pillars stand at the kind's seams; `side` limits it
 * (a van is glazed over its cab only).
 */
function sideGlass(M, s, cap, hw) {
  const g = s.glass;
  let dlo = inset(cap, cap.map(() => g.frame));
  dlo = clip(dlo, 0, 1, -(s.waist + g.belt));
  if (s.side) {
    dlo = clip(dlo, 1, 0, -s.side[0]);
    dlo = clip(dlo, -1, 0, s.side[1]);
  }
  if (dlo.length < 3) {
    return;
  }
  let xmin = Infinity;
  let xmax = -Infinity;
  for (const p of dlo) {
    xmin = Math.min(xmin, p[0]);
    xmax = Math.max(xmax, p[0]);
  }
  const pw = g.pillars === 'dark' ? 0.035 : 0.075;
  const cuts = (s.seams ?? []).filter((x) => x > xmin + 0.15 && x < xmax - 0.15).sort((p, q) => p - q);
  const panes = [];
  let from = -Infinity;
  for (const c of [...cuts, Infinity]) {
    let q = dlo;
    if (from > -Infinity) {
      q = clip(q, 1, 0, -(from + pw / 2));
    }
    if (c < Infinity) {
      q = clip(q, -1, 0, c - pw / 2);
    }
    if (q.length >= 3) {
      panes.push(q);
    }
    from = c;
  }
  for (const side of [1, -1]) {
    const at = (p, lift) => [p[0], p[1], side * (hw(p[1]) + lift)];
    const lay = (role, poly, lift) => {
      if (poly.length < 3) {
        return;
      }
      const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
      M.face(role, q.map((p) => at(p, lift)), { tris: q.length > 4 ? triangulate(q) : null, toward: [0, 0, side] });
    };
    if (g.pillars === 'dark') {
      lay('dark', inset(dlo, dlo.map(() => -0.012)), 0.006);
    }
    for (const q of panes) {
      if (g.pillars !== 'dark') {
        lay(g.pillars === 'chrome' ? 'brite' : 'dark', inset(q, q.map(() => -0.014)), 0.006);
      }
      const glass = inset(q, q.map(() => 0.012));
      lay('glass', glass, 0.01);
      if (g.band) {
        let y0 = Infinity;
        let y1 = -Infinity;
        for (const p of glass) {
          y0 = Math.min(y0, p[1]);
          y1 = Math.max(y1, p[1]);
        }
        lay('band', clip(clip(glass, 0, 1, -(y0 + (y1 - y0) * g.band[0])), 0, -1, y0 + (y1 - y0) * g.band[1]), 0.0115);
      }
      glints(glass, 0.9, [[0.3, 0.12]], (gq) => lay('glint', gq, 0.013));
    }
  }
}

/* ------------------------------------------------------------------ *
 * THE NOSE AND THE TAIL.
 * ------------------------------------------------------------------ */

function plate(M, chain, sign, y, clear = false) {
  const a = faceOf(chain, y - 0.0825, sign);
  const b = faceOf(chain, y + 0.0825, sign);
  const lift = 0.02;
  if (clear) {
    /* On a face that bulges between the plate's edges (a bumper's roll),
     * the plate is pushed out, square, to stand clear of all of it. */
    let out = 0;
    for (let k = 0; k <= 8; k += 1) {
      const u = k / 8;
      const x = chainX(chain, y - 0.0825 + 0.165 * u);
      const line = a.x + (b.x - a.x) * u;
      out = Math.max(out, sign * (x - line));
    }
    a.x += sign * out;
    b.x += sign * out;
  }
  /* u runs left to right as the plate is read: seen from ahead the
   * reader's right is -z, from behind it is +z. */
  const pz = sign > 0 ? [0.165, -0.165] : [-0.165, 0.165];
  const pts = [
    [a.x + a.nx * lift, y - 0.0825 + a.ny * lift, pz[0]],
    [a.x + a.nx * lift, y - 0.0825 + a.ny * lift, pz[1]],
    [b.x + b.nx * lift, y + 0.0825 + b.ny * lift, pz[1]],
    [b.x + b.nx * lift, y + 0.0825 + b.ny * lift, pz[0]],
  ];
  M.face('plate', pts, { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [sign * Math.abs(a.nx), a.ny, 0] });
}

/* ------------------------------------------------------------------ *
 * THE FLANKS: arch lips, sills, shut lines, handles, mirrors.
 * ------------------------------------------------------------------ */

/* A flat strip on a flank, x0 to x1 and y0 to y1, `lift` off it. */
function onFlank(M, role, hw, x0, y0, x1, y1, lift) {
  for (const side of [1, -1]) {
    const z = side * (hw + lift);
    M.face(role, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]], { toward: [0, 0, side] });
  }
}

/* The door mirrors: a dark foot on the door's top front
 * corner, a dark arm, and a housing in paint that is round at its front
 * and flat at its back, where the glass is, and narrower at its outer end
 * in plan, as a mirror's shell is. */
function mirrors(M, s, hw, role) {
  const mx = s.cab[1] - 0.12;
  const y0 = s.waist + 0.035;
  const y1 = s.waist + 0.14;
  const back = mx - 0.035;
  const front = mx + 0.045;
  /* The shell's side view, the back straight, the front rounded. */
  const prof = [[back, y0], [front - 0.03, y0], [front - 0.008, y0 + 0.02], [front, (y0 + y1) / 2], [front - 0.008, y1 - 0.02], [front - 0.03, y1], [back, y1]];
  for (const side of [1, -1]) {
    M.box('dark', mx - 0.06, s.waist - 0.004, side > 0 ? hw - 0.03 : -(hw + 0.012), mx + 0.05, s.waist + 0.03, side > 0 ? hw + 0.012 : -(hw - 0.03), '-y');
    M.box('dark', mx - 0.02, y0 + 0.005, side > 0 ? hw : -(hw + 0.07), mx + 0.02, y0 + 0.03, side > 0 ? hw + 0.07 : -hw, '-y');
    const zi = side * (hw + 0.05);
    const zo = side * (hw + 0.2);
    /* The inner end full height, the outer end drawn in at the front. */
    const outer = prof.map(([x, y]) => [back + (x - back) * 0.8, y0 + 0.008 + (y - y0) * 0.86]);
    const n = prof.length;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const quad = [[prof[i][0], prof[i][1], zi], [prof[j][0], prof[j][1], zi], [outer[j][0], outer[j][1], zo], [outer[i][0], outer[i][1], zo]];
      const mid = [(prof[i][0] + prof[j][0]) / 2 - mx, (prof[i][1] + prof[j][1]) / 2 - (y0 + y1) / 2, 0];
      M.face(i === n - 1 ? 'glass' : role, quad, { toward: mid });
    }
    M.face(role, outer.map(([x, y]) => [x, y, zo]), { tris: triangulate(outer), toward: [0, 0, side] });
  }
}

/* ------------------------------------------------------------------ *
 * THE SECOND PASS: bumpers that wrap, lips on the arches, lamps and
 * grilles set in rims. Every town kind is drawn with these (their rows
 * say p2); the two coupes are sculpted (THE SCULPTED BODY).
 * ------------------------------------------------------------------ */

/* A quad whose four normals are handed in, wound to face the way they
 * point (the mesher would turn the normals round with the winding). */
function quadN(M, role, pts, normals) {
  const [a, b, c, d] = pts;
  const ux = c[0] - a[0];
  const uy = c[1] - a[1];
  const uz = c[2] - a[2];
  const vx = d[0] - b[0];
  const vy = d[1] - b[1];
  const vz = d[2] - b[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (const n of normals) {
    sx += n[0];
    sy += n[1];
    sz += n[2];
  }
  if (nx * sx + ny * sy + nz * sz < 0) {
    M.face(role, [d, c, b, a], { normals: [normals[3], normals[2], normals[1], normals[0]] });
  } else {
    M.face(role, pts, { normals });
  }
}

/* A rounded rectangle [z, y] with `n` facets at each corner. */
function rrect(z0, y0, z1, y1, r, n = 2) {
  const out = [];
  const corners = [[z1 - r, y0 + r, -Math.PI / 2], [z1 - r, y1 - r, 0], [z0 + r, y1 - r, Math.PI / 2], [z0 + r, y0 + r, Math.PI]];
  for (const [cz, cy, a0] of corners) {
    for (let k = 0; k <= n; k += 1) {
      const a = a0 + (k * Math.PI) / (2 * n);
      out.push([cz + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  }
  return out;
}

/* A polygon [z, y] as the other side of the car has it. */
function mirrorZ(poly) {
  return poly.map(([z, y]) => [-z, y]).reverse();
}

/* A convex polygon cut to another convex polygon (both [z, y]). */
function clipTo(poly, bound) {
  const b = area2(bound) >= 0 ? bound : bound.slice().reverse();
  let q = poly;
  for (let i = 0; i < b.length && q.length >= 3; i += 1) {
    const p = b[i];
    const r = b[(i + 1) % b.length];
    /* Left of p to r is inside a counter clockwise bound. */
    const a = -(r[1] - p[1]);
    const c = r[0] - p[0];
    q = clip(q, a, c, -(a * p[0] + c * p[1]));
  }
  return q;
}

/*
 * THE BUMPER, a piece of its own that wraps the corner: a section (how far
 * it stands out at each height, `rows` of [share of its stand, y]) swept
 * along the body's plan from the arch round a rounded corner across the
 * end and back to the other arch. It stands `front` out of the body across
 * the end and `side` out of the flank, its foot tucked under and its top
 * rolling back into the body as a ledge, lit smooth round the corner.
 * Returns the chain of its section across the middle, rising, for what is
 * laid on its face. sign +1 is the nose.
 */
function bumperLoft(M, s, sign, hw, role) {
  const e = sign > 0 ? s.nose : s.tail;
  const b = e.wrap;
  const L2 = s.L / 2;
  const [rx, rz] = b.rp;
  const x0 = L2 + e.face - 0.005;
  const zb = hw - 0.004;
  const A = s.R + s.arch.gap + (s.lip ? s.lip.w : 0);
  const ax = sign > 0 ? s.axle[0] : -s.axle[1];
  const xw = Math.min(ax + A + 0.01, x0 - rx - 0.03);
  const top = e.bumper;
  const dam = e.dam;
  const rows = b.rows ?? [[0.35, dam], [1, dam + 0.07], [1, top - 0.045], [0.78, top - 0.008], [-0.5, top]];
  const m = b.segs ?? 3;
  /* Samples along the plan: [x, z, its normal, how much of the end it
   * is (0 on the flank, 1 across the end), how much of its stand it
   * keeps]. The stand eases off toward the arch, so the bumper dies into
   * the flank rather than stopping square. */
  const half = [[xw, zb, 0, 1, 0, 0.4], [x0 - rx, zb, 0, 1, 0, 1]];
  for (let k = 1; k <= m; k += 1) {
    const t = (k / m) * (Math.PI / 2);
    const nx = Math.sin(t) / rx;
    const nz = Math.cos(t) / rz;
    const l = Math.sqrt(nx * nx + nz * nz);
    half.push([x0 - rx + rx * Math.sin(t), zb - rz + rz * Math.cos(t), nx / l, nz / l, k / m, 1]);
  }
  const S = [...half, ...half.slice().reverse().map(([x, z, nx, nz, w, k]) => [x, -z, nx, -nz, w, k])];
  const stand = (a) => (b.side + (b.front - b.side) * a[4]) * a[5];
  const P = (a, o, y) => {
    const d = o * stand(a);
    return [sign * (a[0] + a[2] * d), y, a[1] + a[3] * d];
  };
  for (let k = 0; k + 1 < rows.length; k += 1) {
    const [o0, y0] = rows[k];
    const [o1, y1] = rows[k + 1];
    const nOf = (a) => {
      const dO = (o1 - o0) * stand(a);
      const dY = y1 - y0;
      const l = Math.sqrt(dO * dO + dY * dY) || 1;
      const no = dY / l;
      const ny = -dO / l;
      return [sign * a[2] * no, ny, a[3] * no];
    };
    for (let i = 0; i + 1 < S.length; i += 1) {
      const a = S[i];
      const c = S[i + 1];
      const na = nOf(a);
      const nc = nOf(c);
      quadN(M, role, [P(a, o0, y0), P(c, o0, y0), P(c, o1, y1), P(a, o1, y1)], [na, nc, nc, na]);
    }
  }
  /* Its two ends, square, facing the arches. */
  const sec = rows.map(([o, y]) => [o, y]);
  const T = triangulate(area2(sec) >= 0 ? sec : sec.slice().reverse());
  const ordered = area2(sec) >= 0 ? rows : rows.slice().reverse();
  for (const a of [S[0], S[S.length - 1]]) {
    M.face(role, ordered.map(([o, y]) => P(a, o, y)), { tris: T, toward: [-sign, 0, 0] });
  }
  /* Its face across the middle, as a chain. */
  return rows.slice(0, -1).map(([o, y]) => [sign * (x0 + o * b.front), y]);
}

/* The lip round an arch: a ring standing `proud` off the flank and `w`
 * wide, its outer edge in paint and its inner one dark where it meets the
 * wheel well. */
function archLipP2(M, s, hw, ax) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  const { w, proud } = s.lip;
  const inner = archPoints(s, ax, 5);
  const Ao = A + w;
  const outer = inner.map(([x, y]) => [ax + ((x - ax) * Ao) / A, yc + ((y - yc) * Ao) / A]);
  const dy = Math.max(0, s.sill - yc);
  const foot = Math.sqrt(Ao * Ao - dy * dy);
  outer[0] = [ax - foot, Math.max(s.sill, outer[0][1])];
  outer[outer.length - 1] = [ax + foot, Math.max(s.sill, outer[outer.length - 1][1])];
  /* The inner edge is left open: the wheel stands in front of it. */
  let pts = [...inner.map(([x, y]) => ({ x, y, edge: null })), ...outer.slice().reverse().map(([x, y]) => ({ x, y, edge: 'body' }))];
  pts[inner.length - 1].edge = 'body';
  if (area2(pts.map((p) => [p.x, p.y])) < 0) {
    /* Reversed, an edge's role moves to the point before it. */
    const rev = pts.slice().reverse();
    pts = rev.map((p, i) => ({ x: p.x, y: p.y, edge: rev[(i + 1) % rev.length].edge }));
  }
  const hwL = (proud + 0.012) / 2;
  const t = new THREE.Matrix4();
  for (const side of [1, -1]) {
    M.at(t.makeTranslation(0, 0, side * (hw - 0.012 + hwL)));
    prism(M, 'body', pts, () => hwL, { sides: [side], edgeRole: (i) => pts[i].edge });
  }
  M.at(null);
}

/*
 * A lamp, a grille or an intake set in a rim, on the nose (sign 1) or the
 * tail: the rim stands `h` off the face and `rim` wide round the outline
 * `poly` ([z, y]), its outer side standing up from the face (`outer`), its
 * inner side going down to the lens at `lens`, so the lens sits in a
 * recess the rim's shadow side reads as depth. `parts` are laid on the lens
 * (discs, rings, polygons), `bars` across it at half the rim's height.
 * Returns the lens outline.
 */
function pod(M, chain, sign, poly, o) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const n = q.length;
  const h = o.h ?? 0.02;
  const lens = o.lens ?? 0.006;
  const I = inset(q, q.map(() => o.rim ?? 0.02));
  let cz = 0;
  let cy = 0;
  for (const [z, y] of q) {
    cz += z / n;
    cy += y / n;
  }
  const f = faceOf(chain, cy, sign);
  const fn = [sign * Math.abs(f.nx), f.ny, 0];
  const C = endPoint(chain, sign, cy, cz, h);
  const at = (p, lift) => endPoint(chain, sign, p[1], p[0], lift);
  const rimRole = o.rimRole ?? 'dark';
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const oi = at(q[i], h);
    const oj = at(q[j], h);
    const ii = at(I[i], h);
    const ij = at(I[j], h);
    M.face(rimRole, [oi, oj, ij, ii], { toward: fn });
    const mid = [(oi[0] + oj[0]) / 2 - C[0], (oi[1] + oj[1]) / 2 - C[1], (oi[2] + oj[2]) / 2 - C[2]];
    if (o.outer ?? h >= 0.018) {
      M.face(o.wallRole ?? rimRole, [at(q[i], -0.004), at(q[j], -0.004), oj, oi], { toward: mid });
    }
    const li = at(I[i], lens);
    const lj = at(I[j], lens);
    M.face(o.innerRole ?? 'dark', [li, lj, ij, ii], { toward: [-mid[0], -mid[1], -mid[2]] });
  }
  if (o.lensRole) {
    M.face(o.lensRole, I.map((p) => at(p, lens)), { tris: n > 4 ? triangulate(I) : null, toward: fn });
  }
  let lift = lens + 0.002;
  for (const part of o.parts ?? []) {
    if (part.poly) {
      const pp = area2(part.poly) >= 0 ? part.poly : part.poly.slice().reverse();
      M.face(part.role, pp.map((p) => at(p, lift)), { tris: pp.length > 4 ? triangulate(pp) : null, toward: fn });
    } else if (part.disc || part.ring) {
      const [z, y, r0, r1, N = 10] = part.disc ? [part.disc[0], part.disc[1], 0, part.disc[2], part.disc[3]] : part.ring;
      endRing(M, part.role, chain, sign, y, z, r0, r1, lift, N);
    }
    lift += 0.002;
  }
  for (const bars of [].concat(o.bars ?? [])) {
    const { n: k, w, role, dir = 'h' } = bars;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [z, y] of I) {
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const bl = (lens + h) / 2;
    for (let i = 0; i < k; i += 1) {
      let bar;
      if (dir === 'h') {
        const y = y0 + ((y1 - y0) * (i + 1)) / (k + 1);
        bar = [[z0 - 1, y - w / 2], [z1 + 1, y - w / 2], [z1 + 1, y + w / 2], [z0 - 1, y + w / 2]];
      } else {
        const z = z0 + ((z1 - z0) * (i + 1)) / (k + 1);
        bar = [[z - w / 2, y0 - 1], [z + w / 2, y0 - 1], [z + w / 2, y1 + 1], [z - w / 2, y1 + 1]];
      }
      const cut = clipTo(bar, I);
      if (cut.length >= 3) {
        M.face(role, cut.map((p) => at(p, bl)), { toward: fn });
      }
    }
  }
  return { lens: I, centre: [cz, cy] };
}

/*
 * A second pass end: its pods (each mirrored to the other side when
 * `mirror`), its flat pieces, its lamps round the corner onto the flanks,
 * its plate. `spec` is the kind's FACES entry for this end.
 */
function endP2(M, s, chain, sign, hw, spec, lamps) {
  const list = sign > 0 ? lamps.front : lamps.rear;
  for (const p of spec.pods ?? []) {
    const polys = p.mirror ? [p.poly, mirrorZ(p.poly)] : [p.poly];
    polys.forEach((poly, side) => {
      const flip = (list0) => (side === 1 ? list0.map((part) => {
        if (part.poly) {
          return { ...part, poly: mirrorZ(part.poly) };
        }
        if (part.disc) {
          return { ...part, disc: [-part.disc[0], ...part.disc.slice(1)] };
        }
        return { ...part, ring: [-part.ring[0], ...part.ring.slice(1)] };
      }) : list0);
      const r = pod(M, chain, sign, poly, { ...p, parts: flip(p.parts ?? []) });
      if (p.lamp) {
        const [z, y] = p.lampAt ? [side === 1 ? -p.lampAt[0] : p.lampAt[0], p.lampAt[1]] : r.centre;
        list.push([chainX(chain, y) + sign * 0.03, y, z]);
      }
    });
  }
  for (const f of spec.flats ?? []) {
    for (const poly of f.mirror ? [f.poly, mirrorZ(f.poly)] : [f.poly]) {
      onEndPoly(M, f.role, chain, sign, poly, f.lift ?? 0.004);
    }
  }
  /* Round fog lamps, [z, y, r] on the +z side and mirrored. */
  for (const [z, y, r] of spec.fogs ?? []) {
    for (const zz of [z, -z]) {
      endRing(M, 'clear', chain, sign, y, zz, 0, r, 0.008, 8);
    }
  }
  /* A lamp that runs round the corner: a strip along the flank from the
   * corner back, tapering. */
  for (const w of spec.wraps ?? []) {
    const L2 = s.L / 2;
    const [cn, dn] = s.cham.n;
    for (const side of [1, -1]) {
      const z = side * (hw + 0.004);
      const xc = sign * (L2 + (sign > 0 ? s.nose.face : s.tail.face) - cn);
      const x1 = xc - sign * w.len;
      const [y0, y1] = w.y;
      const [t0, t1] = w.back ?? [y0, y1];
      M.face(w.role, [[xc, y0, z], [x1, t0, z], [x1, t1, z], [xc, y1, z]], { toward: [0, 0, side] });
      /* Across the corner's chamfer, from the face to the flank. */
      const a0 = endPoint(chain, sign, y0, side * (hw - dn), 0.004);
      const a1 = endPoint(chain, sign, y1, side * (hw - dn), 0.004);
      M.face(w.role, [a0, [xc, y0, z], [xc, y1, z], a1], { toward: [sign, 0, side] });
    }
  }
  if (spec.plate !== undefined) {
    plate(M, chain, sign, spec.plate, true);
  }
}

/*
 * EACH KIND'S OWN FACE, front and rear, for the second pass: the lamps,
 * grilles, intakes and fog lamps as pods (see pod), in [z, y] on the end,
 * each lamp given for the +z side and mirrored. What tells them apart at
 * ten metres, not only their size:
 *
 *   kei       a tall upright face, small rounded lamps high on its corners
 *             in painted rims, a slim bright ringed slot between them, a big
 *             painted bumper with a wide intake and two little fog lamps.
 *   keivan    a black band right across, square lamps at its ends in grey
 *             bezels and bars between them, a plain black bumper.
 *   hatch     lamps swept up and back round the corners into the flanks, a
 *             slim slot under the bonnet's edge, a big trapezoid mouth in
 *             the bumper with fog lamps in its corners.
 *   sedan     an upright bright framed grille with vertical bars, twin lamps
 *             in bright rims, amber round the corners, a rubbing strip.
 *   wagon     wedge lamps tapering to a painted barred grille, a plain black
 *             bumper: the shop's car.
 *   minivan   wide lamps with twin projectors joined by a bright barred
 *             upper grille, a deep bumper with a big lower grille and upright
 *             fog lamps: the school run's face.
 *   van       lamps sunk in painted rims at the corners, a bright framed
 *             grille between them and a second barred mouth below.
 *   boxtruck  a big black barred grille panel, the lamps in the bright steel
 *             bumper, amber markers on the cab's corners.
 *   minibus   twin square lamps each side in black housings, a bright framed
 *             barred grille, fog lamps in a black bumper.
 */
const FACES = {
  kei: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.355, 0.785, 0.585, 0.915, 0.05, 2), mirror: true, rim: 0.022, h: 0.022, lens: 0.006,
          rimRole: 'body', lensRole: 'clear', lamp: true, lampAt: [0.505, 0.85],
          parts: [{ role: 'lampF', disc: [0.505, 0.85, 0.048, 10] }, { role: 'amber', poly: rrect(0.382, 0.80, 0.418, 0.90, 0.012, 1) }],
        },
        {
          poly: rrect(-0.24, 0.805, 0.24, 0.872, 0.03, 1), rim: 0.012, h: 0.016, lens: 0.004,
          rimRole: 'brite', lensRole: 'dark', bars: { n: 1, w: 0.012, role: 'briteDark' },
        },
        {
          poly: [[-0.30, 0.335], [0.30, 0.335], [0.37, 0.47], [-0.37, 0.47]], rim: 0.018, h: 0.014, lens: 0.003,
          rimRole: 'body', lensRole: 'dark', bars: { n: 2, w: 0.008, role: 'briteDark' },
        },
      ],
      flats: [{ role: 'dark', poly: rrect(0.45, 0.375, 0.55, 0.44, 0.025, 1), mirror: true, lift: 0.004 }],
      fogs: [[0.50, 0.4075, 0.022]],
      plate: 0.555,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.47, 0.64, 0.585, 1.0, 0.035, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.49, 0.70, 0.565, 0.76, 0.01, 1) }, { role: 'amber', poly: rrect(0.49, 0.77, 0.565, 0.82, 0.01, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.2, 0.745, 0.2, 0.765, 0.008, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.44, 0.44], [0.55, 0.44], [0.55, 0.465], [0.44, 0.465]], mirror: true, lift: 0.006 }],
      plate: 0.65,
    },
  }),
  keivan: () => ({
    front: {
      pods: [
        { poly: rrect(-0.62, 0.72, 0.62, 0.90, 0.03, 1), rim: 0.014, h: 0.012, lens: 0.004, rimRole: 'dark', lensRole: 'dark' },
        {
          poly: rrect(-0.34, 0.735, 0.34, 0.885, 0.01, 1), rim: 0.006, h: 0.014, lens: 0.008, rimRole: 'briteDark',
          bars: { n: 3, w: 0.018, role: 'briteDark' },
        },
        {
          poly: rrect(0.37, 0.745, 0.60, 0.875, 0.02, 1), mirror: true, rim: 0.012, h: 0.024, lens: 0.016,
          rimRole: 'briteDark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.525, 0.76, 0.585, 0.86, 0.008, 1) }, { role: 'dark', poly: rrect(0.445, 0.76, 0.452, 0.86, 0.002, 1) }],
        },
      ],
      plate: 0.4725,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.50, 0.56, 0.625, 0.88, 0.02, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.515, 0.575, 0.61, 0.62, 0.008, 1) }, { role: 'amber', poly: rrect(0.515, 0.63, 0.61, 0.69, 0.008, 1) }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.18, 0.745, 0.18, 0.77, 0.01, 1), lift: 0.006 }],
      plate: 0.65,
    },
  }),
  hatch: () => ({
    front: {
      pods: [
        {
          poly: [[0.30, 0.715], [0.60, 0.70], [0.672, 0.745], [0.678, 0.86], [0.62, 0.875], [0.36, 0.785]], mirror: true,
          rim: 0.014, h: 0.02, lens: 0.006, rimRole: 'dark', lensRole: 'clear', lamp: true, lampAt: [0.56, 0.79],
          parts: [{ role: 'lampF', disc: [0.56, 0.79, 0.044, 10] },
            { role: 'lampF', poly: [[0.40, 0.772], [0.62, 0.842], [0.636, 0.852], [0.42, 0.786]] },
            { role: 'amber', poly: [[0.645, 0.76], [0.662, 0.765], [0.665, 0.84], [0.648, 0.84]] }],
        },
        {
          poly: [[-0.26, 0.745], [0.26, 0.745], [0.30, 0.79], [-0.30, 0.79]], rim: 0.01, h: 0.014, lens: 0.004,
          rimRole: 'dark', lensRole: 'dark',
        },
        {
          poly: [[-0.36, 0.30], [0.36, 0.30], [0.44, 0.52], [-0.44, 0.52]], rim: 0.02, h: 0.016, lens: 0.004,
          rimRole: 'body', lensRole: 'dark', bars: { n: 3, w: 0.01, role: 'briteDark' },
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.28, 0.80, 0.28, 0.812, 0.005, 1), lift: 0.005 },
        { role: 'dark', poly: [[0.50, 0.33], [0.60, 0.33], [0.60, 0.47]], mirror: true, lift: 0.004 }],
      fogs: [[0.568, 0.37, 0.02]],
      plate: 0.41,
    },
    rear: {
      pods: [
        {
          poly: [[0.44, 0.76], [0.66, 0.74], [0.67, 0.95], [0.52, 0.95], [0.44, 0.84]], mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: [[0.46, 0.775], [0.60, 0.765], [0.60, 0.80], [0.46, 0.81]] },
            { role: 'amber', poly: [[0.61, 0.765], [0.648, 0.762], [0.65, 0.80], [0.61, 0.80]] }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.16, 0.785, 0.16, 0.805, 0.008, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.48, 0.42], [0.60, 0.42], [0.60, 0.445], [0.48, 0.445]], mirror: true, lift: 0.006 }],
      wraps: [{ role: 'lampR', y: [0.76, 0.94], back: [0.80, 0.93], len: 0.16 }],
      plate: 0.69,
    },
  }),
  sedan: () => ({
    front: {
      pods: [
        {
          poly: rrect(-0.29, 0.655, 0.29, 0.865, 0.02, 1), rim: 0.024, h: 0.026, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 6, w: 0.012, role: 'brite', dir: 'v' },
        },
        {
          poly: rrect(0.33, 0.675, 0.66, 0.845, 0.012, 1), mirror: true, rim: 0.018, h: 0.022, lens: 0.006,
          rimRole: 'brite', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'dark', poly: rrect(0.49, 0.69, 0.50, 0.83, 0.002, 1) }, { role: 'clear', poly: rrect(0.36, 0.69, 0.475, 0.715, 0.004, 1) }],
        },
        {
          poly: rrect(-0.42, 0.33, 0.42, 0.40, 0.015, 1), rim: 0.012, h: 0.012, lens: 0.003, rimRole: 'body', lensRole: 'dark',
          bars: { n: 1, w: 0.01, role: 'briteDark' },
        },
      ],
      flats: [
        { role: 'dark', poly: rrect(0.50, 0.34, 0.62, 0.39, 0.01, 1), mirror: true, lift: 0.004 },
        { role: 'clear', poly: rrect(0.51, 0.35, 0.61, 0.38, 0.006, 1), mirror: true, lift: 0.008 },
        { role: 'dark', poly: rrect(-0.68, 0.495, 0.68, 0.53, 0.01, 1), lift: 0.006 },
        { role: 'brite', poly: rrect(-0.68, 0.53, 0.68, 0.538, 0.003, 1), lift: 0.007 },
      ],
      wraps: [{ role: 'amber', y: [0.70, 0.80], back: [0.72, 0.79], len: 0.05 }],
      plate: 0.44,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.28, 0.70, 0.725, 0.86, 0.012, 1), mirror: true, rim: 0.016, h: 0.02, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true, lampAt: [0.62, 0.80],
          parts: [{ role: 'amber', poly: rrect(0.30, 0.715, 0.44, 0.765, 0.004, 1) }, { role: 'clear', poly: rrect(0.45, 0.715, 0.57, 0.765, 0.004, 1) }],
        },
        {
          poly: rrect(-0.27, 0.72, 0.27, 0.85, 0.01, 1), rim: 0.012, h: 0.018, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 1, w: 0.012, role: 'brite' },
        },
      ],
      flats: [{ role: 'dark', poly: rrect(0.20, 0.47, 0.68, 0.505, 0.01, 1), mirror: true, lift: 0.006 }],
      wraps: [{ role: 'lampR', y: [0.70, 0.86], back: [0.72, 0.85], len: 0.14 }],
      plate: 0.475,
    },
  }),
  wagon: () => ({
    front: {
      pods: [
        {
          poly: [[0.30, 0.70], [0.67, 0.70], [0.685, 0.835], [0.33, 0.815]], mirror: true, rim: 0.014, h: 0.02, lens: 0.006,
          rimRole: 'dark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: [[0.60, 0.712], [0.665, 0.712], [0.672, 0.822], [0.605, 0.818]] },
            { role: 'dark', poly: [[0.45, 0.712], [0.458, 0.712], [0.462, 0.82], [0.454, 0.82]] }],
        },
        {
          poly: rrect(-0.27, 0.71, 0.27, 0.815, 0.015, 1), rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'body', lensRole: 'dark',
          bars: { n: 2, w: 0.016, role: 'deep' },
        },
      ],
      plate: 0.4625,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.585, 0.62, 0.705, 0.96, 0.015, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.60, 0.635, 0.69, 0.68, 0.006, 1) }, { role: 'amber', poly: rrect(0.60, 0.69, 0.69, 0.74, 0.006, 1) }],
        },
      ],
      flats: [{ role: 'dark', poly: rrect(-0.2, 0.76, 0.2, 0.785, 0.01, 1), lift: 0.006 }],
      plate: 0.66,
    },
  }),
  minivan: () => ({
    front: {
      pods: [
        {
          poly: [[0.31, 0.785], [0.64, 0.765], [0.675, 0.80], [0.678, 0.955], [0.31, 0.93]], mirror: true, rim: 0.016, h: 0.022, lens: 0.006,
          rimRole: 'dark', lensRole: 'clear', lamp: true, lampAt: [0.49, 0.855],
          parts: [{ role: 'lampF', disc: [0.42, 0.855, 0.045, 10] }, { role: 'lampF', disc: [0.55, 0.855, 0.045, 10] },
            { role: 'amber', poly: [[0.62, 0.78], [0.66, 0.775], [0.665, 0.81], [0.622, 0.812]] },
            { role: 'lampF', poly: [[0.33, 0.905], [0.66, 0.925], [0.66, 0.94], [0.33, 0.918]] }],
        },
        {
          poly: rrect(-0.30, 0.785, 0.30, 0.93, 0.02, 1), rim: 0.02, h: 0.024, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 3, w: 0.02, role: 'brite' },
        },
        {
          poly: [[-0.42, 0.33], [0.42, 0.33], [0.50, 0.57], [-0.50, 0.57]], rim: 0.022, h: 0.018, lens: 0.004,
          rimRole: 'body', lensRole: 'dark', bars: { n: 4, w: 0.01, role: 'briteDark' },
        },
        {
          poly: rrect(0.54, 0.36, 0.605, 0.60, 0.02, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'brite', lensRole: 'dark',
          parts: [{ role: 'clear', poly: rrect(0.553, 0.38, 0.592, 0.46, 0.01, 1) }],
        },
      ],
      plate: 0.45,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.54, 0.70, 0.672, 1.06, 0.03, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.555, 0.76, 0.657, 0.82, 0.01, 1) }, { role: 'amber', poly: rrect(0.555, 0.83, 0.657, 0.88, 0.01, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.25, 0.79, 0.25, 0.815, 0.01, 1), lift: 0.006 },
        { role: 'lampR', poly: [[0.50, 0.46], [0.62, 0.46], [0.62, 0.485], [0.50, 0.485]], mirror: true, lift: 0.006 }],
      plate: 0.69,
    },
  }),
  van: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.40, 0.855, 0.715, 1.00, 0.015, 1), mirror: true, rim: 0.016, h: 0.02, lens: 0.006,
          rimRole: 'body', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.62, 0.87, 0.70, 0.985, 0.006, 1) }, { role: 'dark', poly: rrect(0.52, 0.87, 0.528, 0.985, 0.002, 1) }],
        },
        {
          poly: rrect(-0.37, 0.87, 0.37, 0.985, 0.015, 1), rim: 0.014, h: 0.018, lens: 0.005, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 2, w: 0.014, role: 'briteDark' },
        },
        {
          poly: rrect(-0.52, 0.71, 0.52, 0.80, 0.02, 1), rim: 0.014, h: 0.014, lens: 0.004, rimRole: 'body', lensRole: 'dark',
          bars: { n: 1, w: 0.014, role: 'briteDark' },
        },
      ],
      plate: 0.50,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.585, 0.62, 0.72, 0.96, 0.015, 1), mirror: true, rim: 0.012, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.60, 0.64, 0.705, 0.70, 0.006, 1) }, { role: 'amber', poly: rrect(0.60, 0.72, 0.705, 0.77, 0.006, 1) }],
        },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.2, 0.80, 0.2, 0.822, 0.008, 1), lift: 0.006 }],
      plate: 0.69,
    },
  }),
  boxtruck: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.46, 0.575, 0.70, 0.70, 0.01, 1), mirror: true, rim: 0.014, h: 0.018, lens: 0.006,
          rimRole: 'dark', lensRole: 'lampF', lamp: true,
          parts: [{ role: 'amber', poly: rrect(0.47, 0.585, 0.54, 0.69, 0.004, 1) }],
        },
        {
          poly: rrect(-0.60, 0.84, 0.60, 1.10, 0.02, 1), rim: 0.02, h: 0.02, lens: 0.006, rimRole: 'dark', lensRole: 'dark',
          bars: { n: 5, w: 0.022, role: 'briteDark' },
        },
        { poly: rrect(0.64, 0.98, 0.71, 1.06, 0.01, 1), mirror: true, rim: 0.008, h: 0.012, lens: 0.004, rimRole: 'dark', lensRole: 'amber' },
      ],
      flats: [{ role: 'brite', poly: rrect(-0.62, 1.115, 0.62, 1.13, 0.006, 1), lift: 0.006 }],
      plate: 0.60,
    },
    rear: {},
  }),
  minibus: () => ({
    front: {
      pods: [
        {
          poly: rrect(0.45, 0.85, 0.83, 1.01, 0.015, 1), mirror: true, rim: 0.014, h: 0.02, lens: 0.006,
          rimRole: 'dark', lensRole: 'dark', lamp: true, lampAt: [0.64, 0.93],
          parts: [{ role: 'lampF', poly: rrect(0.48, 0.875, 0.62, 0.985, 0.02, 1) }, { role: 'lampF', poly: rrect(0.645, 0.875, 0.785, 0.985, 0.02, 1) },
            { role: 'amber', poly: rrect(0.798, 0.875, 0.813, 0.985, 0.003, 1) }],
        },
        {
          poly: rrect(-0.42, 0.85, 0.42, 1.03, 0.02, 1), rim: 0.02, h: 0.022, lens: 0.006, rimRole: 'brite', lensRole: 'dark',
          bars: { n: 4, w: 0.016, role: 'brite' },
        },
      ],
      flats: [{ role: 'clear', poly: rrect(0.56, 0.61, 0.67, 0.67, 0.015, 1), mirror: true, lift: 0.006 }],
      plate: 0.635,
    },
    rear: {
      pods: [
        {
          poly: rrect(0.72, 0.80, 0.855, 1.20, 0.02, 1), mirror: true, rim: 0.014, h: 0.016, lens: 0.005,
          rimRole: 'dark', lensRole: 'lampR', lamp: true,
          parts: [{ role: 'clear', poly: rrect(0.735, 0.82, 0.84, 0.88, 0.008, 1) }, { role: 'amber', poly: rrect(0.735, 0.90, 0.84, 0.96, 0.008, 1) }],
        },
      ],
      plate: 0.86,
    },
  }),
};

/* A second pass kind's two ends: the bumpers, then the faces on them and
 * on the body above them, the tailgate's shut line and the exhaust. */
function endsP2(M, s, prof, hw, lamps, ch) {
  const F = FACES[s.kind](s, hw);
  const role = s.bumpers === 'dark' ? 'dark' : (s.bumpers === 'steel' ? 'brite' : 'body');
  const above = (chain, y) => [[chainX(chain, y), y], ...chain.filter((p) => p[1] > y + 1e-4)];
  const fb = bumperLoft(M, s, 1, hw, role);
  ch.front = [...fb, ...above(prof.front, s.nose.bumper + 0.001)];
  endP2(M, s, ch.front, 1, hw, F.front, lamps);
  if (!s.tail) {
    return;
  }
  const rb = bumperLoft(M, s, -1, hw, role);
  ch.rear = [...rb, ...above(prof.rear, s.tail.bumper + 0.001)];
  endP2(M, s, ch.rear, -1, hw, F.rear, lamps);
  const zf = hw - s.cham.n[1] - 0.005;
  const gy = s.tail.bumper + 0.03;
  onEnd(M, 'dark', ch.rear, -1, gy, gy + 0.012, -(zf - 0.2), zf - 0.2, 0.004);
  const L2 = s.L / 2;
  const er = 0.03;
  const ez = -(hw - 0.35);
  const ex = -(L2 + s.tail.face + s.tail.wrap.front) + 0.05;
  _wp.set(ex, s.tail.dam + 0.03, ez);
  _wq.setFromEuler(_we.set(0, -Math.PI / 2, 0));
  M.at(_wm.compose(_wp, _wq, _ws));
  lathe(M, 'brite', er, -0.12, er, 0.02, 10, 1, 0);
  disc(M, 'dark', er * 0.8, 0.021, 10, 1);
  M.at(null);
}

/* ------------------------------------------------------------------ *
 * THE CAR.
 * ------------------------------------------------------------------ */

/*
 * THE R32'S LIVERIES, by the vehicle's variant: solid colours from the
 * town's car palette and a few two tones, none with a word on it. `lower`
 * paints the body's bands under row `lowerTo` (R32_BODY's rows: 4 is the
 * bumper's top line, which runs on along the doors), `stripe` paints the
 * bands listed in `stripes`, a pinstripe along that line, and `rim` is the
 * wheels' colour. The bands go round the nose and the tail with the body.
 */
export const R32_LIVERIES = [
  { name: 'gun grey', body: 0x8d8f98, rim: 0xb4b8c2 },
  { name: 'white', body: 0xf2eee6, rim: 0xb8bcc6 },
  { name: 'midnight', body: 0x5a7093, rim: 0xb8bcc6 },
  { name: 'red over charcoal', body: 0xb94a48, lower: 0x55535e, lowerTo: 4, stripe: 0xf0e7d2, stripes: [4], rim: 0xc9a45c },
  { name: 'white, blue stripe', body: 0xf2eee6, stripe: 0x4d6fa8, stripes: [4, 5], rim: 0x7a7985 },
  { name: 'silver over gun grey', body: 0xc9c8cc, lower: 0x7a7c86, lowerTo: 5, rim: 0xd2d4da },
  { name: 'mustard', body: 0xd9b45f, rim: 0x75747f },
]

/*
 * THE E82'S COLOURS, by variant: blue first, because blue is the one the
 * owner asked for. A bright mid metallic blue in the manner of the maker's
 * racing blue, lifted into the town's range so its shadow band stays a
 * violet blue rather than going to ink; a deeper blue; a grey blue; a
 * silver; a white. Its wheels are bright alloy in every one.
 */
export const E82_LIVERIES = [
  { name: 'racing blue', body: 0x4675c6, rim: 0xd2d5dc },
  { name: 'deep blue', body: 0x3c5aa2, rim: 0xd2d5dc },
  { name: 'grey blue', body: 0x6c8bb4, rim: 0xd2d5dc },
  { name: 'silver', body: 0xc4c6cc, rim: 0x9a9ea8 },
  { name: 'white', body: 0xf1efe9, rim: 0xc6cad2 },
];

const LIVERIES = { r32: R32_LIVERIES, e82: E82_LIVERIES };

/* A kind's livery by variant, or null for a kind that takes its colour
 * from its seed like the town's cars. */
export function carLivery(kind, variant) {
  const list = LIVERIES[kind];
  if (!list) {
    return null;
  }
  const v = Math.max(1, Math.round(Number(variant) || 1));
  return list[(v - 1) % list.length];
}

export function r32Livery(variant) {
  return carLivery('r32', variant);
}

function bodyOf(M, s) {
  const L2 = s.L / 2;
  /* The flank stands a little inside the car's width, so its bumpers and
   * arch lips stand proud of it and not of the solid. */
  const hw = s.W / 2 - s.lip.proud;
  const lamps = { front: [], rear: [] };
  const box = s.kind === 'boxtruck';

  /* ---- the lower body ---- */
  const prof = box ? truckCabProfile(s) : lowerProfile(s);
  prism(M, 'body', prof, () => hw, {
    round: true,
    smooth: true,
    edgeRole: (i, ch) => {
      const e = prof[i].edge;
      if (e === null) {
        return ch ? 'body' : null;
      }
      if (e === 'well' || e === 'under') {
        return ch ? 'body' : 'dark';
      }
      return 'body';
    },
  });
  /* The underside between the wheels, so a car seen low is not hollow. */
  const ux0 = s.axle[1] + s.R * 0.6;
  const ux1 = s.axle[0] - s.R * 0.6;
  M.box('dark', ux0, 0.13, -(hw - 0.08), ux1, s.sill + 0.01, hw - 0.08, '+y');

  /* ---- the glasshouse ---- */
  const cabBase = s.waist - 0.03;
  const rf = s.cab[1] - s.rakeF;
  const rr = s.cab[0] + s.rakeR;
  const run = s.roof - s.waist;
  const xFront = s.cab[1] + (0.03 * s.rakeF) / run;
  const xBack = s.cab[0] - (0.03 * s.rakeR) / run;
  const hwB = hw - s.cabin.shoulder;
  const hwC = (y) => hwB - s.cabin.tuck * Math.max(0, (y - s.waist) / run);
  const rc = s.cabin.roof;
  const cabPts = [
    { x: xBack, y: cabBase, c: 0.015, d: 0.015, edge: null },
    { x: xFront, y: cabBase, c: 0.015, d: 0.015, edge: 'body' },
    { x: rf, y: s.roof, c: rc, d: rc, edge: 'body' },
    { x: rr, y: s.roof, c: rc, d: rc, edge: 'body' },
  ];
  const ccap = prism(M, 'body', cabPts, (x, y) => hwC(y), {
    round: true, smooth: true, segs: 3, edgeRole: (i, ch) => (ch ? 'body' : cabPts[i].edge),
  });

  /* ---- glass ---- */
  const chrome = s.glass.pillars === 'chrome';
  const zs = hwC(s.waist) - 0.015;
  screen(M, [s.cab[1], s.waist], [rf, s.roof], zs, hwC(s.roof) - rc, [1, 1], {
    frame: s.glass.frame, bottom: 0.06, chrome, band: s.glass.band,
    wipers: [[0.42 * zs, 0.012, -0.3 * zs, 0.06], [-0.26 * zs, 0.012, -0.88 * zs, 0.05]],
  });
  screen(M, [s.cab[0], s.waist], [rr, s.roof], zs, hwC(s.roof) - rc, [-1, 1], {
    frame: s.glass.frame, bottom: s.kind === 'sedan' ? 0.05 : 0.08, streaks: [[0.3, 0.14]], chrome, band: s.glass.band,
    wipers: s.rearWiper ? [[0.04, 0.015, 0.62 * zs, 0.04]] : null,
  });
  sideGlass(M, s, ccap, hwC);

  /* ---- the nose and the tail ---- */
  endsP2(M, s, prof, hw, lamps, { front: prof.front, rear: prof.rear });

  /* ---- the flanks ---- */
  const A = s.R + s.arch.gap;
  for (const ax of s.box ? [s.axle[0]] : s.axle) {
    archLipP2(M, s, hw, ax);
  }
  /* The sill: a darker strip from arch to arch. */
  const sillX0 = s.axle[1] + A + 0.02;
  const sillX1 = s.axle[0] - A - 0.02;
  onFlank(M, 'deep', hw, sillX0, s.sill + 0.004, sillX1, s.sill + 0.06, 0.004);
  /* Shut lines: the front door's leading edge, then the kind's seams. */
  const top = s.waist - 0.015;
  const doorFront = Math.min(s.cab[1] - 0.03, s.axle[0] - A - 0.05);
  const lines = [doorFront, ...(s.seams ?? [])].filter((x) => x < s.axle[0] - A - 0.02 && x > s.axle[1] + A + 0.02 || x === doorFront);
  for (const x of lines) {
    onFlank(M, 'dark', hw, x - 0.009, s.sill + 0.07, x + 0.009, top, 0.005);
  }
  for (const x of s.handles ?? []) {
    onFlank(M, 'dark', hw, x - 0.08, s.waist - 0.15, x + 0.08, s.waist - 0.095, 0.005);
    onFlank(M, chrome ? 'brite' : 'body', hw, x - 0.07, s.waist - 0.135, x + 0.07, s.waist - 0.11, 0.009);
  }
  if (s.slider !== undefined) {
    onFlank(M, 'dark', hw, s.slider - 0.55, s.waist - 0.05, s.slider + 0.55, s.waist - 0.03, 0.006);
  }
  /* The side repeater behind the front arch. */
  onFlank(M, 'amber', hw, s.axle[0] - A - 0.13, s.waist - 0.2, s.axle[0] - A - 0.07, s.waist - 0.175, 0.006);
  if (s.chromeStrip) {
    onFlank(M, 'brite', hw, sillX0 + 0.05, s.waist - 0.3, sillX1 - 0.05, s.waist - 0.28, 0.007);
  }
  mirrors(M, s, hw, s.bumpers === 'dark' || s.bumpers === 'steel' ? 'dark' : 'body');

  /* ---- the bonnet's shut lines, where there is a bonnet ---- */
  const noseTop = L2 + s.nose.face - s.nose.lean;
  if (noseTop - s.cab[1] > 0.4) {
    for (const side of [1, -1]) {
      const z = side * (hw - 0.14);
      const y0 = s.nose.edge + 0.027;
      const y1 = s.waist + 0.009;
      M.face('dark', [[noseTop - 0.13, y0, z - 0.009], [noseTop - 0.13, y0, z + 0.009], [s.cab[1] + 0.04, y1, z + 0.009], [s.cab[1] + 0.04, y1, z - 0.009]], { toward: [0, 1, 0] });
    }
  }
  return { lamps, hwC, rf, rr };
}

/* The box lorry's cab: the lower body from the box's front to the nose. */
function truckCabProfile(s) {
  const x0 = s.box.x1 + 0.02;
  const pts = [];
  const P = (x, y, tag, edge) => {
    const [c, d] = chamferOf(s, tag);
    pts.push({ x, y, c, d, edge });
  };
  P(x0, s.sill, 's', 'under');
  for (const [x, y] of archPoints(s, s.axle[0], 7)) {
    P(x, y, 'a', 'well');
  }
  pts[pts.length - 1].edge = 'under';
  const L2 = s.L / 2;
  const n = s.nose;
  const f0 = pts.length;
  if (s.p2) {
    /* No bumper in the profile: it is a piece of its own (bumperLoft). */
    P(L2 + n.face - 0.03, n.dam + 0.04, 'n', 'body');
    P(L2 + n.face, n.bumper - 0.03, 'n', 'body');
  } else {
    P(L2 + n.out - n.tuck, n.dam, 'n', 'bumper');
    P(L2 + n.out, n.dam + 0.05, 'n', 'bumper');
    P(L2 + n.out, n.bumper, 'n', 'body');
    P(L2 + n.face, n.bumper + 0.015, 'n', 'body');
  }
  P(L2 + n.face - n.lean, n.edge, 'n', 'body');
  const front = pts.slice(f0).map((p) => [p.x, p.y]);
  P(s.cab[1] + 0.03, s.waist + 0.004, 'e', null);
  P(x0, s.waist + 0.004, 'e', 'body');
  pts.front = front;
  pts.rear = [[x0, s.sill], [x0, s.waist]];
  return pts;
}

/* The box lorry's chassis under its box, the box, its shutter and rails. */
function lorry(M, s, lamps) {
  const b = s.box;
  const hw = s.W / 2;
  const chassis = [{ x: b.x0 + 0.04, y: s.sill, c: 0, d: 0, edge: 'dark' }];
  for (const [x, y] of archPoints(s, s.axle[1], 7)) {
    chassis.push({ x, y, c: 0, d: 0, edge: 'dark' });
  }
  chassis.push({ x: b.x1 + 0.02, y: s.sill, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: b.x1 + 0.02, y: b.y0 + 0.01, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: b.x0 + 0.04, y: b.y0 + 0.01, c: 0, d: 0, edge: 'dark' });
  prism(M, 'dark', chassis, () => hw - 0.02);
  /* The side guard, a rail along the flank between the axles. */
  onFlank(M, 'brite', hw - 0.02, s.axle[1] + 0.5, 0.56, b.x1 - 0.05, 0.63, 0.012);
  /* Mudguards over the rear wheels. */
  const A = s.R + s.arch.gap;
  for (const side of [1, -1]) {
    M.box('dark', s.axle[1] - A, b.y0 - 0.04, side > 0 ? hw - 0.3 : -hw + 0.02, s.axle[1] + A, b.y0, side > 0 ? hw - 0.02 : -hw + 0.3);
  }
  /* The box, square with a small chamfer round both flanks. */
  const bw = (s.W + 0.06) / 2;
  const boxPts = [
    { x: b.x0, y: b.y0, c: 0.02, d: 0.02, edge: 'dark' },
    { x: b.x1, y: b.y0, c: 0.02, d: 0.02, edge: 'body' },
    { x: b.x1, y: b.y1, c: 0.03, d: 0.03, edge: 'body' },
    { x: b.x0, y: b.y1, c: 0.03, d: 0.03, edge: 'deep' },
  ];
  prism(M, 'body', boxPts, () => bw, { edgeRole: (i, ch) => (ch ? 'body' : boxPts[i].edge) });
  /* The ribs down each flank, the cant rail round the top, the floor rail. */
  for (let i = 0; i < 7; i += 1) {
    const x = b.x0 + 0.2 + i * ((b.x1 - b.x0 - 0.4) / 6);
    onFlank(M, 'deep', bw, x - 0.025, b.y0 + 0.08, x + 0.025, b.y1 - 0.08, 0.006);
  }
  onFlank(M, 'deep', bw, b.x0 + 0.03, b.y1 - 0.08, b.x1 - 0.03, b.y1 - 0.035, 0.006);
  onFlank(M, 'dark', bw, b.x0 + 0.03, b.y0 + 0.02, b.x1 - 0.03, b.y0 + 0.07, 0.006);
  /* The roller shutter at the back, its slats and its pull. */
  const sx = b.x0 - 0.012;
  M.face('deep', [[sx, b.y0 + 0.06, bw - 0.06], [sx, b.y0 + 0.06, -(bw - 0.06)], [sx, b.y1 - 0.06, -(bw - 0.06)], [sx, b.y1 - 0.06, bw - 0.06]], { toward: [-1, 0, 0] });
  for (let i = 1; i < 9; i += 1) {
    const y = b.y0 + 0.06 + ((b.y1 - b.y0 - 0.12) * i) / 9;
    M.face('dark', [[sx - 0.003, y - 0.006, bw - 0.08], [sx - 0.003, y - 0.006, -(bw - 0.08)], [sx - 0.003, y + 0.006, -(bw - 0.08)], [sx - 0.003, y + 0.006, bw - 0.08]], { toward: [-1, 0, 0] });
  }
  M.box('brite', sx - 0.04, b.y0 + 0.12, -0.3, sx, b.y0 + 0.17, 0.3);
  /* Marker lamps at the box's top corners. */
  for (const side of [1, -1]) {
    M.box('amber', b.x1 - 0.12, b.y1 - 0.06, side > 0 ? bw : -bw - 0.02, b.x1 - 0.04, b.y1 - 0.02, side > 0 ? bw + 0.02 : -bw);
  }
  /* The rear under run bar, and the lamps and plate on it. */
  const rx = b.x0 - 0.02;
  M.box('dark', rx - 0.08, 0.5, -(hw - 0.05), rx, 0.62, hw - 0.05);
  for (const side of [1, -1]) {
    const z = side * (hw - 0.2);
    M.face('lampR', [[rx - 0.082, 0.52, z + 0.12], [rx - 0.082, 0.52, z - 0.12], [rx - 0.082, 0.6, z - 0.12], [rx - 0.082, 0.6, z + 0.12]], { toward: [-1, 0, 0] });
    lamps.rear.push([rx - 0.1, 0.56, z]);
  }
  M.face('plate', [[rx - 0.083, 0.64, -0.165], [rx - 0.083, 0.64, 0.165], [rx - 0.083, 0.805, 0.165], [rx - 0.083, 0.805, -0.165]], { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [-1, 0, 0] });
}

/* Roof rails on their feet. */
function rails(M, s, rf, rr, hwC) {
  const z = hwC(s.roof) - 0.12;
  for (const side of [1, -1]) {
    M.bar(s.bumpers === 'body' ? 'deep' : 'dark', rr + 0.12, s.roof + 0.055, rf - 0.12, s.roof + 0.055, 0.03, side * z - 0.02, side * z + 0.02);
    for (const x of [rr + 0.16, rf - 0.16]) {
      M.box('dark', x - 0.04, s.roof - 0.01, side * z - 0.025, x + 0.04, s.roof + 0.05, side * z + 0.025);
    }
  }
}

/* A small spoiler over the tailgate glass, at the roof's rear edge. */
function roofSpoiler(M, s, rr, hwC) {
  const z = hwC(s.roof) - 0.03;
  const poly = [[rr - 0.1, s.roof - 0.055], [rr + 0.14, s.roof - 0.01], [rr + 0.14, s.roof + 0.012], [rr - 0.06, s.roof - 0.015]];
  slab(M, 'body', poly, -z, z);
}

/* The minibus's furniture: its doors, the destination box, the roof unit. */
function bus(M, s, hw) {
  for (const dx of s.doors ?? []) {
    const z = hw + 0.006;
    M.face('dark', [[dx - 0.45, s.sill + 0.04, z], [dx + 0.45, s.sill + 0.04, z], [dx + 0.45, s.waist + 0.62, z], [dx - 0.45, s.waist + 0.62, z]], { toward: [0, 0, 1] });
    for (const side of [-1, 1]) {
      const x0 = dx + (side < 0 ? -0.42 : 0.015);
      const x1 = dx + (side < 0 ? -0.015 : 0.42);
      M.face('glass', [[x0, s.sill + 0.3, z + 0.004], [x1, s.sill + 0.3, z + 0.004], [x1, s.waist + 0.58, z + 0.004], [x0, s.waist + 0.58, z + 0.004]], { toward: [0, 0, 1] });
    }
  }
  const rf = s.cab[1] - s.rakeF;
  M.box('dark', rf - 0.1, s.roof - 0.3, -0.62, rf + 0.08, s.roof - 0.1, 0.62);
  M.face('lampF', [[rf + 0.082, s.roof - 0.28, 0.58], [rf + 0.082, s.roof - 0.28, -0.58], [rf + 0.082, s.roof - 0.12, -0.58], [rf + 0.082, s.roof - 0.12, 0.58]], { toward: [1, 0, 0] });
  M.box('brite', -1.4, s.roof - 0.02, -0.55, -0.2, s.roof + 0.09, 0.55, '-y');
  /* The band along the flanks under the windows. */
  onFlank(M, 'accent', hw, -s.L / 2 + 0.12, s.waist - 0.26, s.L / 2 - 0.2, s.waist - 0.12, 0.004);
}

/* ------------------------------------------------------------------ *
 * THE SCULPTED BODY: the r32's and the e82's.
 *
 * The town's kinds are a side profile extruded across the car with its
 * edges rounded, which is right for a box on wheels and wrong for these
 * two, whose shapes are what they are known by: the r32's blistered
 * arches under a crisp waist, the e82's round nose with its lamps swept
 * back round the corners and its shoulder rising to the tail. So they are
 * modelled the way a car body is. ROWS run the length of the car, each a
 * line of the body (the sill, the character line, the shoulder, the
 * bonnet's edge, its crown, the centre line), each at its own height and
 * half width along the car and turning round its own plan corner at the
 * nose and at the tail. Row to row they are joined into bands of quads, and
 * at each end the rows' ends are joined across the car, which closes the
 * nose and the tail with the faces the lamps and grilles are laid on. The
 * glasshouse is a second loft standing on the waist, made the same way,
 * its ends the windscreen and the backlight.
 *
 * STATIONS are where the bands are cut. Every row is sampled at every
 * station, on its flank, round its corner, or held at its end, so the
 * rows that end first close to points and their bands to nothing, which
 * is not drawn. The arches cut the bottom rows: a row flagged `arch` keeps
 * that far over the arch's circle, so over a wheel the low rows stack on
 * the arch's edge and their bands become the edge's underside. The rows
 * that reach the arches are `fine`: they are cut at the arches' and the
 * flares' own stations as well as the ones every row is, and the rest at
 * the stations that shape the bonnet, the waist and the deck, so each kind
 * of station costs triangles only in the bands it shapes (stations()).
 *
 * LIGHT. A vertex's normal is the average of the faces round it, so the
 * cel ramp's bands run along the body as lines, except across a `crease`
 * row, an edge where the light breaks, and where two faces meet at more
 * than SMOOTH_LIMIT, which is a corner however it came to be drawn.
 *
 * WHAT IS LAID ON IT is placed by projection (Shell): a polygon drawn in a
 * view (the side's x and y, the front's or the rear's z and y, the top's x
 * and z, or a front or rear corner's, seen from 45 degrees) is cut along
 * the body's own facets under it and carried onto them, set off along the
 * surface's normal. So a lamp wraps round a corner in one piece, a window
 * follows the glasshouse's tumblehome, a pod sits on a curved face, what is
 * laid over something stays over it, and no surface is described twice.
 * Everything is drawn on the right of the car and reflected to the left by
 * the mesher (bothSides), or, seen from an end, laid again mirrored.
 * ------------------------------------------------------------------ */

const SMOOTH_LIMIT = Math.cos((48 * Math.PI) / 180);

/* A value along the car: a number, or [[x, v], ...] with x rising, eased
 * between its points by a monotone cubic (so it never overshoots what it
 * was given, and a level stretch stays level) and held past its ends. */
function along(c, x) {
  if (typeof c === 'number') {
    return c;
  }
  const n = c.length;
  if (n === 1 || x <= c[0][0]) {
    return c[0][1];
  }
  if (x >= c[n - 1][0]) {
    return c[n - 1][1];
  }
  let i = 0;
  while (x > c[i + 1][0]) {
    i += 1;
  }
  const d = (k) => (c[k + 1][1] - c[k][1]) / (c[k + 1][0] - c[k][0]);
  const tan = (k) => {
    if (k === 0 || k === n - 1) {
      return 0;
    }
    const a = d(k - 1);
    const b = d(k);
    return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  };
  const [x0, y0] = c[i];
  const [x1, y1] = c[i + 1];
  const h = x1 - x0;
  const t = (x - x0) / h;
  const m0 = tan(i) * h;
  const m1 = tan(i + 1) * h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * y1 + (t3 - t2) * m1;
}

/* How high the arch's edge is at x: the circle over either axle, or
 * nothing clear of both. */
function archAt(s, x) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  let y = -Infinity;
  for (const ax of s.axle) {
    const d = x - ax;
    if (d > -A && d < A) {
      y = Math.max(y, yc + Math.sqrt(A * A - d * d));
    }
  }
  return y;
}

/* How much of a flare stands out at x: all of it over an arch and `pad`
 * round it, easing out over `ramp`. */
function flareAt(s, f, x) {
  const A = s.R + s.arch.gap;
  let k = 0;
  for (const ax of s.axle) {
    const d = Math.abs(x - ax) - A - f.pad;
    if (d <= 0) {
      return 1;
    }
    const u = Math.min(1, d / f.ramp);
    k = Math.max(k, 1 - u * u * (3 - 2 * u));
  }
  return k;
}

/* Where row `w` is at station x: on its flank, round its plan corner at
 * the nose or the tail (a quarter ellipse, `rx` along the car and `rz`
 * across it, ending at the row's `nose` or `tail` x), or held at its end
 * past it. `out` stands the flank out, for a flare. */
function rowAt(w, x, out) {
  const [xn, rxn, rzn] = w.nose;
  const [xt, rxt, rzt] = w.tail;
  let px = x;
  let pz;
  if (x >= xn - rxn) {
    const x0 = xn - rxn;
    const u = rxn > 0 ? Math.min(1, (x - x0) / rxn) : 1;
    px = Math.min(x, xn);
    pz = along(w.z, x0) - rzn + rzn * Math.sqrt(Math.max(0, 1 - u * u));
  } else if (x <= xt + rxt) {
    const x0 = xt + rxt;
    const u = rxt > 0 ? Math.min(1, (x0 - x) / rxt) : 1;
    px = Math.max(x, xt);
    pz = along(w.z, x0) - rzt + rzt * Math.sqrt(Math.max(0, 1 - u * u));
  } else {
    pz = along(w.z, x) + out;
  }
  return [px, along(w.y, px), pz];
}

/*
 * THE STATIONS of a loft, each with the rows it cuts: `all` (every row: the
 * ends' plan corners and the flank's region bounds), `low` (the rows that
 * reach the arches, `fine`: the arches' circles and the flares' ramps),
 * `high` (the rest: the stations that shape the bonnet, the waist and the
 * deck). So a door is one quad a band from arch to arch, and the arches'
 * many stations cost triangles only in the bands they shape. Close ones
 * merge, keeping the wider level.
 */
function stations(spec, lows = []) {
  const all = [
    ...(spec.all ?? []).map((x) => ({ x, level: 'all' })),
    ...(spec.high ?? []).map((x) => ({ x, level: 'high' })),
    ...lows.map((x) => ({ x, level: 'low' })),
  ];
  all.sort((a, b) => a.x - b.x);
  const out = [];
  for (const p of all) {
    const last = out[out.length - 1];
    if (last && p.x - last.x < 0.012) {
      if (last.level !== p.level) {
        last.level = 'all';
      }
      continue;
    }
    out.push({ ...p });
  }
  out[0].level = 'all';
  out[out.length - 1].level = 'all';
  return out;
}

/* The low stations the arches and the flares ask for. */
function archStations(s, steps, flare) {
  const A = s.R + s.arch.gap;
  const xs = [];
  for (const ax of s.axle) {
    for (let k = 0; k <= steps; k += 1) {
      xs.push(ax + A * Math.cos((k / steps) * Math.PI));
    }
    if (flare) {
      for (const f of [0, 1]) {
        xs.push(ax - A - flare.pad - f * flare.ramp, ax + A + flare.pad + f * flare.ramp);
      }
    }
  }
  return xs;
}

/* The grid: P[i][r], row r at station i, on the right flank (+z). */
function loftGrid(s, rows, st, flare) {
  return st.map(({ x }) => {
    const col = [];
    for (let r = 0; r < rows.length; r += 1) {
      const w = rows[r];
      const out = w.flare && flare ? w.flare * flareAt(s, flare, x) : 0;
      const p = rowAt(w, x, out);
      if (w.arch !== undefined) {
        const a = archAt(s, p[0]);
        if (a > -Infinity) {
          p[1] = Math.max(p[1], a + w.arch);
        }
        if (r > 0) {
          p[1] = Math.max(p[1], col[r - 1][1]);
        }
      }
      col.push(p);
    }
    return col;
  });
}

const near3 = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
const mirror3 = (p) => [p[0], p[1], -p[2]];

/* Newell's normal of a polygon, and its size (twice its area). */
function newell(pts) {
  let nx = 0;
  let ny = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]);
    ny += (p[2] - q[2]) * (p[0] + q[0]);
    nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
  return l > 1e-12 ? { n: [nx / l, ny / l, nz / l], size: l } : { n: [0, 0, 0], size: 0 };
}

/*
 * THE SHELL: every triangle of the lofts, both flanks, for laying things
 * on the body by projection. A view is a picture's two axes, U across and
 * V up, and D toward the viewer: 'side' looks at the right flank from +z
 * (x, y), 'front' at the nose from +x (z, y), 'rear' at the tail from -x
 * (z, y), 'top' down from +y (x, z), and 'fr' and 'rr' at the right front
 * and rear corners from 45 degrees, so a lamp that wraps the corner is laid
 * as one piece. `near` keeps a view to the part of the body it is for: the
 * ends' views never land past the corner on a wing behind it, the side's
 * and the corners' never on the left flank. The triangles are sorted into
 * a grid of the picture once a view is first asked for.
 */
const VIEWS = {
  side: { U: [1, 0, 0], V: [0, 1, 0], D: [0, 0, 1] },
  front: { U: [0, 0, 1], V: [0, 1, 0], D: [1, 0, 0] },
  rear: { U: [0, 0, 1], V: [0, 1, 0], D: [-1, 0, 0] },
  top: { U: [1, 0, 0], V: [0, 0, 1], D: [0, 1, 0] },
  fr: { U: [-Math.SQRT1_2, 0, Math.SQRT1_2], V: [0, 1, 0], D: [Math.SQRT1_2, 0, Math.SQRT1_2] },
  rr: { U: [Math.SQRT1_2, 0, Math.SQRT1_2], V: [0, 1, 0], D: [-Math.SQRT1_2, 0, Math.SQRT1_2] },
};
const CELL = 0.05;
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class Shell {
  /* L2 and hw: the car's half length and half width. `reach`: how far in
   * from the end an end's view may land. */
  constructor(L2 = Infinity, hw = 1, reach = 0.55) {
    this.tris = [];
    this.grids = {};
    const corner = (L2 + hw) * Math.SQRT1_2 - 0.45;
    this.near = { front: L2 - reach, rear: L2 - reach, side: 0, top: 0, fr: corner, rr: corner };
  }

  /* One triangle: its corners, their shading normals, and their lift
   * normals (the average of every face round the corner, creases or not, so
   * what is laid across a crease does not part along it). */
  add(a, b, c, na, nb, nc, la = na, lb = nb, lc = nc) {
    /* Its facing, turned to agree with its shading normals whichever way
     * round its corners came (a mirrored flank's come the other way). */
    const { n } = newell([a, b, c]);
    if (n[0] * (na[0] + nb[0] + nc[0]) + n[1] * (na[1] + nb[1] + nc[1]) + n[2] * (na[2] + nb[2] + nc[2]) < 0) {
      n[0] = -n[0];
      n[1] = -n[1];
      n[2] = -n[2];
    }
    this.tris.push([a, b, c, na, nb, nc, la, lb, lc, n]);
  }

  grid(view) {
    if (this.grids[view]) {
      return this.grids[view];
    }
    const V = VIEWS[view];
    const g = new Map();
    const proj = [];
    this.tris.forEach((t, k) => {
      const pu = [dot3(t[0], V.U), dot3(t[1], V.U), dot3(t[2], V.U)];
      const pv = [dot3(t[0], V.V), dot3(t[1], V.V), dot3(t[2], V.V)];
      const pd = [dot3(t[0], V.D), dot3(t[1], V.D), dot3(t[2], V.D)];
      proj.push([pu, pv, pd]);
      const u0 = Math.min(...pu);
      const u1 = Math.max(...pu);
      const v0 = Math.min(...pv);
      const v1 = Math.max(...pv);
      for (let i = Math.floor(u0 / CELL); i <= Math.floor(u1 / CELL); i += 1) {
        for (let j = Math.floor(v0 / CELL); j <= Math.floor(v1 / CELL); j += 1) {
          const key = `${i},${j}`;
          let list = g.get(key);
          if (!list) {
            list = [];
            g.set(key, list);
          }
          list.push(k);
        }
      }
    });
    this.grids[view] = { g, proj };
    return this.grids[view];
  }

  /* The body under (u, v) in a view: the nearest point along the view,
   * its shading normal, its lift normal and which triangle it is on, or
   * null where the view misses it. */
  hit(view, u, v) {
    const { g, proj } = this.grid(view);
    const list = g.get(`${Math.floor(u / CELL)},${Math.floor(v / CELL)}`);
    if (!list) {
      return null;
    }
    let best = null;
    let bestD = this.near[view];
    for (const k of list) {
      const b = this.bary(proj[k], u, v);
      if (!b) {
        continue;
      }
      const pd = proj[k][2];
      const d = b[0] * pd[0] + b[1] * pd[1] + b[2] * pd[2];
      if (d > bestD) {
        bestD = d;
        best = [b, k];
      }
    }
    return best ? this.point(best[1], best[0]) : null;
  }

  /* Barycentric coordinates of (u, v) in a projected triangle, or null
   * outside it. */
  bary(pj, u, v, e = -1e-4) {
    const [pu, pv] = pj;
    const bx = pu[1] - pu[0];
    const by = pv[1] - pv[0];
    const cx = pu[2] - pu[0];
    const cy = pv[2] - pv[0];
    const den = bx * cy - by * cx;
    if (Math.abs(den) < 1e-12) {
      return null;
    }
    const px = u - pu[0];
    const py = v - pv[0];
    const l1 = (px * cy - py * cx) / den;
    const l2 = (bx * py - by * px) / den;
    const l0 = 1 - l1 - l2;
    return l0 < e || l1 < e || l2 < e ? null : [l0, l1, l2];
  }

  /* The point of triangle k at barycentric b. */
  point(k, b) {
    const t = this.tris[k];
    const mix = (i) => [0, 1, 2].map((a) => b[0] * t[i][a] + b[1] * t[i + 1][a] + b[2] * t[i + 2][a]);
    const unit = (w) => {
      const l = Math.hypot(w[0], w[1], w[2]) || 1;
      return [w[0] / l, w[1] / l, w[2] / l];
    };
    return { p: mix(0), n: unit(mix(3)), ln: unit(mix(6)), k };
  }

  /* A point of a view carried onto the body and `lift` off it. */
  at(view, u, v, lift = 0) {
    const h = this.hit(view, u, v);
    return h ? this.lifted(h, lift) : null;
  }

  lifted(h, lift) {
    return { p: [h.p[0] + h.ln[0] * lift, h.p[1] + h.ln[1] * lift, h.p[2] + h.ln[2] * lift], n: h.n };
  }

  /*
   * A convex polygon of a view cut along the body's own facets: one piece
   * for each visible triangle under it, each corner carried onto that
   * triangle and `lift` off it. So whatever is laid follows the body
   * exactly, and a lamp laid over its lens stays over it however the body
   * curves. Pieces share their corners along the triangles' shared edges.
   */
  cut(view, poly, lift) {
    const { g, proj } = this.grid(view);
    const V = VIEWS[view];
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (const [u, v] of poly) {
      u0 = Math.min(u0, u);
      u1 = Math.max(u1, u);
      v0 = Math.min(v0, v);
      v1 = Math.max(v1, v);
    }
    const seen = new Set();
    const out = [];
    for (let i = Math.floor(u0 / CELL); i <= Math.floor(u1 / CELL); i += 1) {
      for (let j = Math.floor(v0 / CELL); j <= Math.floor(v1 / CELL); j += 1) {
        for (const k of g.get(`${i},${j}`) ?? []) {
          if (seen.has(k)) {
            continue;
          }
          seen.add(k);
          if (dot3(this.tris[k][9], V.D) < 0.02) {
            continue;
          }
          const [pu, pv] = proj[k];
          const piece = clipTo(poly, [[pu[0], pv[0]], [pu[1], pv[1]], [pu[2], pv[2]]]);
          if (piece.length < 3 || Math.abs(area2(piece)) < 1e-9) {
            continue;
          }
          /* Only what the view sees: the nearest triangle at the piece's
           * middle is this one. */
          let cu = 0;
          let cv = 0;
          for (const [u, v] of piece) {
            cu += u / piece.length;
            cv += v / piece.length;
          }
          const h = this.hit(view, cu, cv);
          if (!h || h.k !== k) {
            continue;
          }
          const pts = [];
          const nrm = [];
          for (const [u, v] of piece) {
            const b = this.bary(proj[k], u, v, -1e-3) ?? [1 / 3, 1 / 3, 1 / 3];
            const q = this.lifted(this.point(k, b), lift);
            pts.push(q.p);
            nrm.push(q.n);
          }
          out.push({ pts, nrm });
        }
      }
    }
    return out;
  }
}

/* Everything `draw` lays on the right of the car, laid again on the left:
 * the mesher reflects it across the centre line. */
const MIRROR_Z = new THREE.Matrix4().makeScale(1, 1, -1);
function bothSides(M, draw) {
  draw();
  M.at(MIRROR_Z);
  draw();
  M.at(null);
}

/* A polygon's points in the order that faces `dir`, with their normals. */
function faceToward(M, role, pts, normals, dir) {
  const { n, size } = newell(pts);
  if (size < 1e-9) {
    return;
  }
  if (n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0) {
    M.face(role, pts.slice().reverse(), { normals: normals ? normals.slice().reverse() : null });
  } else {
    M.face(role, pts, { normals });
  }
}

/* The view's facing direction at a point: the surface normal, turned the
 * view's way if it had come out the back. */
function viewDir(view, n) {
  const d = VIEWS[view].D;
  return n && n[0] * d[0] + n[1] * d[1] + n[2] * d[2] > 0 ? n : d;
}

/* A point [u, v] of a view on the other side of the car: the same point
 * mirrored across the centre line. The side view sees one flank, and its
 * points are mirrored in the car instead. */
function mirrorUV(view, p) {
  return view === 'top' ? [p[0], -p[1]] : [-p[0], p[1]];
}

/*
 * A POLYGON LAID ON THE BODY: `poly` (convex, [u, v] in `view`) cut along
 * the body's facets and `lift` off it (Shell.cut). `both` lays it on the
 * other side too, mirrored: across the centre line for the ends and the
 * top, the left flank for the side and the corners. Smooth normals for a
 * cel role, which takes light; `flat` for a flat colour.
 */
function lay(M, sh, role, view, poly, lift, { both = true, flat = false } = {}) {
  const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const draw = (P) => {
    for (const { pts, nrm } of sh.cut(view, P, lift)) {
      faceToward(M, role, pts, flat ? null : nrm, viewDir(view, nrm[0]));
    }
  };
  if (!both) {
    draw(q);
  } else if (view === 'front' || view === 'rear' || view === 'top') {
    draw(q);
    draw(q.map((p) => mirrorUV(view, p)).reverse());
  } else {
    bothSides(M, () => draw(q));
  }
}

/*
 * A POD ON THE BODY: a lamp, a grille or an intake set in a rim, as pod()
 * does on a flat end, here on whatever the view finds. The rim stands `h`
 * off the surface and `rim` wide round `poly` ([u, v], convex); its outer
 * wall rises from the surface, its inner wall goes down to the lens at
 * `lens`, so the lens sits in a recess. `parts` are laid on the lens (a
 * polygon, a disc [u, v, r, N], a ring [u, v, r0, r1, N]), `bars` across
 * it at half the rim's height. Returns the lens outline and the pod's
 * middle.
 */
function podOn(M, sh, view, poly, o, other = false) {
  const q0 = area2(poly) >= 0 ? poly : poly.slice().reverse();
  const q = other ? mirrorZ(q0) : q0;
  const n = q.length;
  const h = o.h ?? 0.02;
  const lens = o.lens ?? 0.006;
  const I = inset(q, q.map(() => o.rim ?? 0.02));
  let cz = 0;
  let cy = 0;
  for (const [u, v] of q) {
    cz += u / n;
    cy += v / n;
  }
  const mid = sh.at(view, cz, cy, h);
  if (!mid) {
    return null;
  }
  const out = viewDir(view, mid.n);
  const at = (p, lift) => {
    const r = sh.at(view, p[0], p[1], lift);
    return r ? r.p : null;
  };
  const rimRole = o.rimRole ?? 'dark';
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const oi = at(q[i], h);
    const oj = at(q[j], h);
    const ii = at(I[i], h);
    const ij = at(I[j], h);
    if (!oi || !oj || !ii || !ij) {
      continue;
    }
    faceToward(M, rimRole, [oi, oj, ij, ii], null, out);
    const away = [(oi[0] + oj[0]) / 2 - mid.p[0], (oi[1] + oj[1]) / 2 - mid.p[1], (oi[2] + oj[2]) / 2 - mid.p[2]];
    if (o.outer ?? h >= 0.018) {
      const fi = at(q[i], -0.004);
      const fj = at(q[j], -0.004);
      if (fi && fj) {
        faceToward(M, o.wallRole ?? rimRole, [fi, fj, oj, oi], null, away);
      }
    }
    const li = at(I[i], lens);
    const lj = at(I[j], lens);
    if (li && lj) {
      faceToward(M, o.innerRole ?? 'dark', [li, lj, ij, ii], null, [-away[0], -away[1], -away[2]]);
    }
  }
  if (o.lensRole) {
    lay(M, sh, o.lensRole, view, I, lens, { both: false, flat: true });
  }

  let lift = lens + 0.002;
  for (const part0 of o.parts ?? []) {
    const part = other ? flipPart(part0) : part0;
    if (part.poly) {
      lay(M, sh, part.role, view, part.poly, lift, { both: false, flat: true });
    } else {
      const [u, v, r0, r1, N = 12] = part.disc ? [part.disc[0], part.disc[1], 0, part.disc[2], part.disc[3]] : part.ring;
      ringOn(M, sh, part.role, view, u, v, r0, r1, lift, N);
    }
    lift += 0.002;
  }
  for (const bars of [].concat(o.bars ?? [])) {
    const { n: k, w, role, dir = 'h' } = bars;
    let z0 = Infinity;
    let z1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [z, y] of I) {
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const bl = (lens + h) / 2;
    for (let i = 0; i < k; i += 1) {
      let bar;
      if (dir === 'h') {
        const y = y0 + ((y1 - y0) * (i + 1)) / (k + 1);
        bar = [[z0 - 1, y - w / 2], [z1 + 1, y - w / 2], [z1 + 1, y + w / 2], [z0 - 1, y + w / 2]];
      } else {
        const z = z0 + ((z1 - z0) * (i + 1)) / (k + 1);
        bar = [[z - w / 2, y0 - 1], [z + w / 2, y0 - 1], [z + w / 2, y1 + 1], [z - w / 2, y1 + 1]];
      }
      const cut = clipTo(bar, I);
      if (cut.length >= 3) {
        lay(M, sh, role, view, cut, bl, { both: false, flat: true });
      }
    }
  }
  return { lens: I, centre: [cz, cy], at: mid.p };
}

/* A part of a pod as the other side of the car has it. */
function flipPart(part) {
  if (part.poly) {
    return { ...part, poly: mirrorZ(part.poly) };
  }
  if (part.disc) {
    return { ...part, disc: [-part.disc[0], ...part.disc.slice(1)] };
  }
  return { ...part, ring: [-part.ring[0], ...part.ring.slice(1)] };
}

/* A round lamp's ring (r0 to r1) or disc (r0 0) laid on the body. */
function ringOn(M, sh, role, view, u, v, r0, r1, lift, N = 12) {
  if (r0 <= 0) {
    const poly = [];
    for (let k = 0; k < N; k += 1) {
      const t = (k / N) * TAU;
      poly.push([u + r1 * Math.cos(t), v + r1 * Math.sin(t)]);
    }
    lay(M, sh, role, view, poly, lift, { both: false, flat: true });
    return;
  }
  for (let k = 0; k < N; k += 1) {
    const t0 = (k / N) * TAU;
    const t1 = ((k + 1) / N) * TAU;
    lay(M, sh, role, view, [
      [u + r0 * Math.cos(t0), v + r0 * Math.sin(t0)], [u + r1 * Math.cos(t0), v + r1 * Math.sin(t0)],
      [u + r1 * Math.cos(t1), v + r1 * Math.sin(t1)], [u + r0 * Math.cos(t1), v + r0 * Math.sin(t1)],
    ], lift, { both: false, flat: true });
  }
}

/* A pod on both sides of the car (mirrored), or on one. The ends' views
 * see both sides and take the pod's mirror image as a polygon; the side's
 * and the corners' see one, and the mesher reflects what they drew. */
function podsOn(M, sh, view, poly, o) {
  if (view === 'front' || view === 'rear') {
    const a = podOn(M, sh, view, poly, o, false);
    const b = o.mirror ? podOn(M, sh, view, poly, o, true) : null;
    return [a, b].filter(Boolean);
  }
  let a = null;
  if (o.mirror) {
    let first = true;
    bothSides(M, () => {
      const r = podOn(M, sh, view, poly, o, false);
      if (first) {
        a = r;
        first = false;
      }
    });
  } else {
    a = podOn(M, sh, view, poly, o, false);
  }
  return [a].filter(Boolean);
}

/*
 * THE LOFT'S FACES. For each band, a quad between each pair of its
 * stations (the fine stations only where both its rows are fine; where one
 * is, the coarse face takes the fine row's points along its edge, so the
 * two meet with no crack). Degenerate faces are dropped. Then each face's
 * normal, and each vertex's, smoothed as the header says.
 */
function loftFaces(P, rows, st) {
  const faces = [];
  const n = P.length;
  const uses = (i, fine) => st[i].level === 'all' || st[i].level === (fine ? 'low' : 'high');
  const push = (band, v) => {
    const out = [];
    for (const k of v) {
      const p = P[k[0]][k[1]];
      if (!out.length || !near3(P[out[out.length - 1][0]][out[out.length - 1][1]], p)) {
        out.push(k);
      }
    }
    while (out.length > 1 && near3(P[out[0][0]][out[0][1]], P[out[out.length - 1][0]][out[out.length - 1][1]])) {
      out.pop();
    }
    if (out.length < 3) {
      return;
    }
    const pts = out.map((k) => P[k[0]][k[1]]);
    const nn = newell(pts);
    if (nn.size < 1e-7) {
      return;
    }
    faces.push({ band, v: out, n: nn.n });
  };
  for (let r = 0; r + 1 < rows.length; r += 1) {
    const fa = Boolean(rows[r].fine);
    const fb = Boolean(rows[r + 1].fine);
    if (fa === fb) {
      /* Both rows cut at the same stations: a quad between each pair. */
      const cols = [];
      for (let i = 0; i < n; i += 1) {
        if (uses(i, fa)) {
          cols.push(i);
        }
      }
      for (let k = 0; k + 1 < cols.length; k += 1) {
        push(r, [[cols[k], r], [cols[k + 1], r], [cols[k + 1], r + 1], [cols[k], r + 1]]);
      }
      continue;
    }
    /* A fine row under a coarse one (or over it): a face between each pair
     * of the stations both use, carrying each row's own stations along its
     * edge, so the two meet with no crack. */
    const both = [];
    for (let i = 0; i < n; i += 1) {
      if (st[i].level === 'all') {
        both.push(i);
      }
    }
    for (let k = 0; k + 1 < both.length; k += 1) {
      const a = both[k];
      const b = both[k + 1];
      const v = [[a, r]];
      for (let i = a + 1; i < b; i += 1) {
        if (uses(i, fa)) {
          v.push([i, r]);
        }
      }
      v.push([b, r], [b, r + 1]);
      for (let i = b - 1; i > a; i -= 1) {
        if (uses(i, fb)) {
          v.push([i, r + 1]);
        }
      }
      v.push([a, r + 1]);
      push(r, v);
    }
  }
  return faces;
}

/* Each face's normal at each of its vertices: the faces round the vertex
 * that share its band, or meet it across a row that is not a crease, and
 * are within SMOOTH_LIMIT of it. On the centre line the normal is kept in
 * the centre plane, so the two flanks meet with no seam of light. */
function loftNormals(P, rows, faces, ends) {
  const at = new Map();
  const key = (i, r) => i * 1000 + r;
  const note = (f) => {
    for (const [i, r] of f.v) {
      const k = key(i, r);
      let l = at.get(k);
      if (!l) {
        l = [];
        at.set(k, l);
      }
      l.push(f);
    }
  };
  faces.forEach(note);
  ends.forEach(note);
  const joined = (f, g, r) => {
    if (f.n[0] * g.n[0] + f.n[1] * g.n[1] + f.n[2] * g.n[2] < SMOOTH_LIMIT) {
      return false;
    }
    if (f.band === g.band) {
      return true;
    }
    return !rows[r].crease;
  };
  for (const f of [...faces, ...ends]) {
    f.vn = f.v.map(([i, r]) => {
      const p = P[i][r];
      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (const g of at.get(key(i, r))) {
        if (g === f || joined(f, g, r)) {
          sx += g.n[0];
          sy += g.n[1];
          sz += g.n[2];
        }
      }
      if (Math.abs(p[2]) < 1e-5) {
        sz = 0;
      }
      const l = Math.hypot(sx, sy, sz) || 1;
      return [sx / l, sy / l, sz / l];
    });
  }
}

/*
 * A LOFT DRAWN: its faces on both flanks and the bands across its ends,
 * each band's role from `role(r, face)`, every triangle handed to the
 * shell. `ends` says which ends to close: the body closes both, the
 * glasshouse too (its windscreen and backlight). Returns the grid.
 */
function loftDraw(M, sh, s, rows, st, { flare = null, role = () => 'body' } = {}) {
  const P = loftGrid(s, rows, st, flare);
  const faces = loftFaces(P, rows, st);
  const last = P.length - 1;
  /* The ends' bands, one a pair of rows, across the car. */
  const ends = [];
  for (const [i, sign] of [[last, 1], [0, -1]]) {
    for (let r = 0; r + 1 < rows.length; r += 1) {
      const a = P[i][r];
      const b = P[i][r + 1];
      if (near3(a, b) && Math.abs(a[2]) < 1e-5) {
        continue;
      }
      const pts = sign > 0 ? [a, mirror3(a), mirror3(b), b] : [mirror3(a), a, b, mirror3(b)];
      const nn = newell(pts.filter((p, k) => !near3(p, pts[(k + 1) % 4])));
      if (nn.size < 1e-7) {
        continue;
      }
      ends.push({ band: r, v: [[i, r], [i, r + 1]], n: nn.n, end: sign, pts });
    }
  }
  loftNormals(P, rows, faces, ends);
  /* Each corner's lift normal: every face round it, weighted by its size,
   * creases or not (Shell.add). On the centre line it keeps to the centre
   * plane, as the shading normals do. */
  const liftAt = new Map();
  for (const f of [...faces, ...ends]) {
    const w = newell(f.pts ?? f.v.map(([i, r]) => P[i][r])).size;
    for (const [i, r] of f.v) {
      const k = i * 1000 + r;
      const a = liftAt.get(k) ?? [0, 0, 0];
      liftAt.set(k, [a[0] + f.n[0] * w, a[1] + f.n[1] * w, a[2] + f.n[2] * w]);
    }
  }
  const ln = (i, r) => {
    const a = liftAt.get(i * 1000 + r);
    const z = Math.abs(P[i][r][2]) < 1e-5 ? 0 : a[2];
    const l = Math.hypot(a[0], a[1], z) || 1;
    return [a[0] / l, a[1] / l, z / l];
  };
  for (const f of faces) {
    const pts = f.v.map(([i, r]) => P[i][r]);
    const lns = f.v.map(([i, r]) => ln(i, r));
    const rl = role(f.band, pts.reduce((a, p) => a + p[0], 0) / pts.length);
    M.face(rl, pts, { normals: f.vn });
    M.face(rl, pts.map(mirror3).reverse(), { normals: f.vn.map(mirror3).reverse() });
    const T = fan(pts.length);
    for (let k = 0; k < T.length; k += 3) {
      const [a, b, c] = [T[k], T[k + 1], T[k + 2]];
      sh.add(pts[a], pts[b], pts[c], f.vn[a], f.vn[b], f.vn[c], lns[a], lns[b], lns[c]);
      sh.add(mirror3(pts[a]), mirror3(pts[b]), mirror3(pts[c]), mirror3(f.vn[a]), mirror3(f.vn[b]), mirror3(f.vn[c]), mirror3(lns[a]), mirror3(lns[b]), mirror3(lns[c]));
    }
  }
  for (const e of ends) {
    /* The band's own points and normals: the right flank's pair, and the
     * left's mirrored. */
    const [na, nb] = e.vn;
    const [la, lb] = e.v.map(([i, r]) => ln(i, r));
    const nrm = e.end > 0 ? [na, mirror3(na), mirror3(nb), nb] : [mirror3(na), na, nb, mirror3(nb)];
    const lft = e.end > 0 ? [la, mirror3(la), mirror3(lb), lb] : [mirror3(la), la, lb, mirror3(lb)];
    const keep = [];
    const kn = [];
    const kl = [];
    e.pts.forEach((p, k) => {
      if (!keep.length || !near3(keep[keep.length - 1], p)) {
        keep.push(p);
        kn.push(nrm[k]);
        kl.push(lft[k]);
      }
    });
    if (keep.length > 3 && near3(keep[0], keep[keep.length - 1])) {
      keep.pop();
      kn.pop();
      kl.pop();
    }
    if (keep.length < 3) {
      continue;
    }
    M.face(role(e.band, keep[0][0]), keep, { normals: kn });
    const T = fan(keep.length);
    for (let k = 0; k < T.length; k += 3) {
      const [a, b, c] = [T[k], T[k + 1], T[k + 2]];
      sh.add(keep[a], keep[b], keep[c], kn[a], kn[b], kn[c], kl[a], kl[b], kl[c]);
    }
  }
  return P;
}

/* The floor: the bottom row joined across the car at every station, dark,
 * which over an arch is the wheel well's roof. */
function loftFloor(M, P, st) {
  const cols = [];
  for (let i = 0; i < P.length; i += 1) {
    if (st[i].level !== 'high') {
      cols.push(i);
    }
  }
  for (let k = 0; k + 1 < cols.length; k += 1) {
    const a = P[cols[k]][0];
    const b = P[cols[k + 1]][0];
    if (near3(a, b)) {
      continue;
    }
    faceToward(M, 'dark', [a, b, mirror3(b), mirror3(a)], null, [0, -1, 0]);
  }
}

/* The role of a body band: a livery's lower colour or stripe by its band,
 * the lip at the ends in its own colour (dark, as a lip is, unless the
 * livery says), and the paint. */
function bandRole(rows, r, x, lv, atEnd) {
  if (rows[r].role === 'lip' && atEnd) {
    return lv && lv.lip ? lv.lip : 'dark';
  }
  if (lv) {
    if (lv.stripes && lv.stripes.includes(r)) {
      return 'stripe';
    }
    if (lv.lower && r < lv.lowerTo) {
      return 'body2';
    }
  }
  return 'body';
}

/* A sculpted coupe: the body, its floor and wells, the glasshouse, and
 * what its kind lays on them. Returns where its lamps are. */
function sculpted(M, s, lv) {
  const sh = new Shell(s.L / 2, s.W / 2);
  const lamps = { front: [], rear: [] };
  const B = s.body;
  const st = stations(B.stations, archStations(s, 8, B.flare));
  const atEnd = (x) => x > s.axle[0] + s.R + 0.35 || x < s.axle[1] - s.R - 0.35;
  const P = loftDraw(M, sh, s, B.rows, st, { flare: B.flare, role: (r, x) => bandRole(B.rows, r, x, lv, atEnd(x)) });
  loftFloor(M, P, st);
  const C = s.cabin;
  loftDraw(M, sh, s, C.rows, stations(C.stations), {});
  /* The windscreen and the backlight: the glasshouse's end bands from the
   * belt to the rail, glazed as the town's glass is. */
  for (const [end, sign, o] of [['nose', 1, C.screen], ['tail', -1, C.backlight]]) {
    const a = rowAt(C.rows[1], C.rows[1][end][0], 0);
    const b = rowAt(C.rows[2], C.rows[2][end][0], 0);
    screen(M, [a[0], a[1]], [b[0], b[1]], a[2], b[2], [sign, 1], {
      frame: o.frame, bottom: o.bottom, band: [0.55, 0.78], wipers: o.wipers ?? null,
      streaks: sign > 0 ? [[0.2, 0.2], [0.52, 0.06]] : [[0.3, 0.14]],
    });
  }
  wellWalls(M, s);
  s.dress(M, sh, s, lamps, lv);
  return { lamps };
}

/* ------------------------------------------------------------------ *
 * WHAT BOTH COUPES CARRY, laid on the shell.
 * ------------------------------------------------------------------ */

/* The plate, standing `lift` off the body at [0, y] in the front or the
 * rear view (its middle on the centre line), reading the right way round:
 * seen from ahead the reader's right is -z, from behind it is +z. */
function plateOn(M, sh, view, y, lift = 0.016, zc = 0) {
  const hw = 0.165;
  const hh = 0.0825;
  const sign = view === 'front' ? 1 : -1;
  let out = -Infinity;
  for (const [z, yy] of [[zc - hw, y - hh], [zc + hw, y - hh], [zc + hw, y + hh], [zc - hw, y + hh], [zc, y]]) {
    const h = sh.hit(view, z, yy);
    if (h) {
      out = Math.max(out, sign * h.p[0]);
    }
  }
  if (out === -Infinity) {
    return;
  }
  const x = sign * (out + lift);
  const pz = sign > 0 ? [zc + hw, zc - hw] : [zc - hw, zc + hw];
  const toward = [sign, 0, 0];
  M.face('plate', [[x, y - hh, pz[0]], [x, y - hh, pz[1]], [x, y + hh, pz[1]], [x, y + hh, pz[0]]], {
    uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward,
  });
  /* Its holder, a dark edge standing just behind it. */
  const e = sign * 0.012;
  const xb = x - sign * 0.006;
  M.face('dark', [[xb, y - hh - 0.012, pz[0] + e], [xb, y - hh - 0.012, pz[1] - e], [xb, y + hh + 0.012, pz[1] - e], [xb, y + hh + 0.012, pz[0] + e]], { toward });
}

/*
 * THE SIDE GLASS: `dlo`, the daylight opening in the side view (convex,
 * [x, y]), in a dark surround `frame` wide, cut into panes at `pillars`
 * ([x at the foot, x at the head, width] each, a dark pillar between two
 * panes), each pane glass with the sky's band over its upper part and a
 * streak across it. Both flanks.
 */
function sideGlassOn(M, sh, dlo, { frame = 0.018, pillars = [], band = [0.55, 0.78] } = {}) {
  const q = area2(dlo) >= 0 ? dlo : dlo.slice().reverse();
  lay(M, sh, 'dark', 'side', inset(q, q.map(() => -frame)), 0.005);
  let panes = [q];
  for (const [xa, xb, w] of pillars) {
    const next = [];
    /* The pillar's line runs from (xa, bottom) to (xb, top); a pane keeps
     * what is either side of it, less half its width. */
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [, y] of q) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const dx = xb - xa;
    const dy = y1 - y0;
    const l = Math.hypot(dx, dy);
    const nx = dy / l;
    const ny = -dx / l;
    const c = nx * xa + ny * y0;
    for (const p of panes) {
      const front = clip(p, nx, ny, -(c + w / 2));
      const back = clip(p, -nx, -ny, c - w / 2);
      for (const g of [front, back]) {
        if (g.length >= 3 && Math.abs(area2(g)) > 1e-4) {
          next.push(g);
        }
      }
    }
    panes = next;
  }
  for (const p of panes) {
    const glass = inset(p, p.map(() => 0.006));
    lay(M, sh, 'glass', 'side', glass, 0.009);
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [, y] of glass) {
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    const b = clip(clip(glass, 0, 1, -(y0 + (y1 - y0) * band[0])), 0, -1, y0 + (y1 - y0) * band[1]);
    if (b.length >= 3) {
      lay(M, sh, 'band', 'side', b, 0.0105);
    }
    glints(glass, 0.9, [[0.3, 0.12]], (g) => lay(M, sh, 'glint', 'side', g, 0.012));
  }
}

/* A strip from a to b, `w` wide, in a view (the flank's by default): a
 * shut line, a trim. */
function lineOn(M, sh, role, a, b, w, lift = 0.003, view = 'side') {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const ox = (-dy / l) * (w / 2);
  const oy = (dx / l) * (w / 2);
  lay(M, sh, role, view, [[a[0] - ox, a[1] - oy], [b[0] - ox, b[1] - oy], [b[0] + ox, b[1] + oy], [a[0] + ox, a[1] + oy]], lift);
}

/* The door mirrors of a coupe: a dark foot on the door's top front corner
 * at (x, y) standing out of the flank at z, an arm, and a shell in paint
 * round at its front, the glass on its back. `len` how far it reaches. */
function coupeMirrors(M, x, y, z, { len = 0.17, h = 0.1, d = 0.1, role = 'body' } = {}) {
  const back = x - d / 2;
  const front = x + d / 2;
  const y0 = y + 0.04;
  const y1 = y0 + h;
  const prof = [[back, y0], [front - 0.03, y0], [front - 0.006, y0 + h * 0.22], [front, (y0 + y1) / 2], [front - 0.006, y1 - h * 0.22], [front - 0.03, y1], [back, y1]];
  for (const side of [1, -1]) {
    M.box('dark', x - 0.055, y - 0.004, side > 0 ? z - 0.03 : -(z + 0.015), x + 0.045, y + 0.035, side > 0 ? z + 0.015 : -(z - 0.03), '-y');
    M.box('dark', x - 0.02, y0 + 0.005, side > 0 ? z : -(z + 0.06), x + 0.02, y0 + 0.028, side > 0 ? z + 0.06 : -z, '-y');
    const zi = side * (z + 0.04);
    const zo = side * (z + 0.04 + len);
    const outer = prof.map(([px, py]) => [back + (px - back) * 0.82, y0 + 0.006 + (py - y0) * 0.86]);
    const n = prof.length;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const quad = [[prof[i][0], prof[i][1], zi], [prof[j][0], prof[j][1], zi], [outer[j][0], outer[j][1], zo], [outer[i][0], outer[i][1], zo]];
      const mid = [(prof[i][0] + prof[j][0]) / 2 - x, (prof[i][1] + prof[j][1]) / 2 - (y0 + y1) / 2, 0];
      M.face(i === n - 1 ? 'glass' : role, quad, { toward: mid });
    }
    M.face(role, outer.map(([px, py]) => [px, py, zo]), { tris: triangulate(outer), toward: [0, 0, side] });
  }
}

/* An exhaust tip along x from `x` (its mouth) back into the body, at y, z:
 * a bright tube and its dark mouth. */
function tailpipe(M, x, y, z, r, len = 0.14) {
  _wp.set(x, y, z);
  _wq.setFromEuler(_we.set(0, -Math.PI / 2, 0));
  M.at(_wm.compose(_wp, _wq, _ws));
  lathe(M, 'brite', r, -len, r, 0, 12, 1, 0);
  lathe(M, 'briteDark', r, 0, r * 0.82, 0.002, 12, 0, 1);
  disc(M, 'dark', r * 0.82, 0.001, 12, 1);
  M.at(null);
}

/* The wheel wells' inner walls, so a car seen low through an arch shows
 * its wheel against the dark, not the far side of the road. */
function wellWalls(M, s) {
  const A = s.R + s.arch.gap;
  const yc = s.R + s.arch.lift;
  const zi = wheelZ(s) - tyreWidth(s) / 2 - 0.03;
  for (const ax of s.axle) {
    for (const side of [1, -1]) {
      const z = side * zi;
      M.face('dark', [[ax - A, 0.12, z], [ax + A, 0.12, z], [ax + A, yc + A, z], [ax - A, yc + A, z]], { toward: [0, 0, side] });
    }
  }
  /* The floor pan between the wheels, under the sill. */
  const hw = s.W / 2 - 0.12;
  M.box('dark', s.axle[1] + A, 0.12, -hw, s.axle[0] - A, 0.26, hw, '+y');
}

/*
 * THE R32 DRESSED. What it is known by, none of it a badge: slim lamps
 * under the bonnet's edge with their amber wrapping round the corners, the
 * slatted grille between them, the deep bumper with its wide mesh intake,
 * its slatted ducts and its lip; the blistered flares under the character
 * line; the short glasshouse with the thick sloping pillar; four round
 * tail lamps, two to a pod, over a bumper that carries the plate; the
 * hoop wing; one fat tailpipe, on the left.
 */
function dressR32(M, sh, s, lamps) {
  /* ---- the nose ---- */
  const head = [[0.352, 0.641], [0.652, 0.638], [0.656, 0.744], [0.358, 0.749]];
  for (const other of [false, true]) {
    podOn(M, sh, 'front', head, {
      rim: 0.012, h: 0.014, lens: 0.005, rimRole: 'dark', lensRole: 'glass',
      parts: [
        { role: 'band', poly: [[0.37, 0.708], [0.64, 0.705], [0.642, 0.734], [0.372, 0.736]] },
        { role: 'clear', ring: [0.43, 0.692, 0.028, 0.04, 12] },
        { role: 'lampF', disc: [0.43, 0.692, 0.028, 12] },
        { role: 'lampF', poly: [[0.52, 0.66], [0.624, 0.658], [0.626, 0.722], [0.522, 0.724]] },
      ],
    }, other);
    const side = other ? -1 : 1;
    lamps.front.push([2.29, 0.693, side * 0.5]);
  }
  /* The amber from the lens's end round the corner and back along the
   * wing, one piece in the corner's view. */
  lay(M, sh, 'amber', 'fr', [[-1.123, 0.641], [-0.91, 0.644], [-0.91, 0.726], [-1.123, 0.741]], 0.007);
  /* The grille: body coloured slats in a body coloured frame. */
  podOn(M, sh, 'front', [[-0.334, 0.646], [0.334, 0.646], [0.334, 0.742], [-0.334, 0.742]], {
    rim: 0.014, h: 0.016, lens: 0.006, rimRole: 'body', lensRole: 'dark', bars: { n: 3, w: 0.012, role: 'body' },
  });
  /* The bumper: the plate, the wide mesh intake under it, the ducts. */
  plateOn(M, sh, 'front', 0.49);
  podOn(M, sh, 'front', [[-0.49, 0.222], [0.49, 0.222], [0.51, 0.392], [-0.51, 0.392]], {
    rim: 0.012, h: 0.014, lens: 0.004, rimRole: 'dark', lensRole: 'dark', bars: [{ n: 3, w: 0.006, role: 'briteDark' }, { n: 7, w: 0.006, role: 'briteDark', dir: 'v' }],
  });
  podsOn(M, sh, 'front', [[0.55, 0.244], [0.735, 0.24], [0.742, 0.352], [0.556, 0.356]], {
    mirror: true, rim: 0.01, h: 0.014, lens: 0.004, rimRole: 'dark', lensRole: 'dark', bars: { n: 2, w: 0.016, role: 'deep' },
  });
  /* The bonnet's shut lines along the wings' tops. */
  lineOn(M, sh, 'dark', [0.64, 0.742], [2.05, 0.742], 0.01, 0.003, 'top');

  /* ---- the flanks ---- */
  lineOn(M, sh, 'dark', [1.735, 0.36], [1.82, 0.585], 0.01, 0.004);
  lineOn(M, sh, 'dark', [-1.765, 0.35], [-1.85, 0.582], 0.01, 0.004);
  const dlo = [[0.39, 0.886], [-1.075, 0.93], [-0.8, 1.262], [-0.095, 1.266]];
  sideGlassOn(M, sh, dlo, { pillars: [[-0.545, -0.52, 0.055]] });
  for (const x of [0.93, -0.535]) {
    lineOn(M, sh, 'dark', [x, 0.365], [x - 0.02, 0.832], 0.012, 0.004);
  }
  lay(M, sh, 'dark', 'side', [[-0.5, 0.768], [-0.4, 0.768], [-0.4, 0.797], [-0.5, 0.797]], 0.004);
  lay(M, sh, 'briteDark', 'side', [[-0.49, 0.774], [-0.41, 0.774], [-0.41, 0.791], [-0.49, 0.791]], 0.007);
  coupeMirrors(M, 0.45, 0.88, 0.77);

  /* ---- the tail ---- */
  /* Two body coloured housings, each holding a pair of big round lamps
   * with a dark bezel and a small dark square between them. */
  const pod = rrect(0.352, 0.68, 0.8, 0.866, 0.035, 1);
  lay(M, sh, 'dark', 'rear', inset(pod, pod.map(() => -0.008)), 0.003);
  for (const other of [false, true]) {
    const side = other ? -1 : 1;
    const lampsAt = [[0.463, 0.774], [0.687, 0.773]];
    const parts = [];
    for (const [z, y] of lampsAt) {
      parts.push({ role: 'dark', disc: [z, y, 0.083, 12] });
    }
    for (const [z, y] of lampsAt) {
      parts.push({ role: 'lampR', disc: [z, y, 0.071, 12] });
    }
    for (const [z, y] of lampsAt) {
      parts.push({ role: 'dark', ring: [z, y, 0.03, 0.036, 10] });
    }
    parts.push({ role: 'dark', poly: [[0.562, 0.751], [0.588, 0.751], [0.588, 0.797], [0.562, 0.797]] });
    podOn(M, sh, 'rear', pod, { rim: 0.012, h: 0.022, lens: 0.014, rimRole: 'body', innerRole: 'deep', lensRole: 'body', parts }, other);
    for (const [z, y] of lampsAt) {
      lamps.rear.push([-2.28, y, side * z]);
    }
  }
  /* The plate in its dark recess on the bumper, the reversing lamps either
   * side of it. */
  lay(M, sh, 'dark', 'rear', rrect(-0.205, 0.345, 0.205, 0.535, 0.02, 1), 0.004);
  plateOn(M, sh, 'rear', 0.44);
  lay(M, sh, 'clear', 'rear', [[0.235, 0.43], [0.31, 0.43], [0.31, 0.482], [0.235, 0.482]], 0.006);
  tailpipe(M, -2.335, 0.278, -0.5, 0.054, 0.16);
  /* The wing: a broad blade on two end plates standing on the boot lid's
   * corners, the hoop the coupe is known by from behind. */
  for (const side of [1, -1]) {
    const fin = [[-2.225, 0.96], [-1.8, 0.985], [-1.935, 1.145], [-2.2, 1.155]];
    slab(M, 'body', fin, side > 0 ? 0.655 : -0.74, side > 0 ? 0.74 : -0.655);
  }
  slab(M, 'body', [[-2.245, 1.137], [-1.915, 1.143], [-1.915, 1.167], [-2.235, 1.177]], -0.79, 0.79);
  M.box('dark', -2.252, 1.171, -0.79, -2.232, 1.187, 0.79);
}

/*
 * THE E82 DRESSED, known with no roundel and no name by: the twin rounded
 * grilles side by side in bright surrounds; big headlamps swept back round
 * the corners with two rings in each, which is what lights first at dusk;
 * the bonnet's two creases converging on the grilles; a bumper of three
 * mouths; the high waist and the rear side window kinked forward at the
 * pillar's foot; the wedge tail lamps wrapping onto the wings with a pale
 * strip at their foot; the plate on the boot lid; the dark diffuser and
 * the twin tips on the left.
 */
function dressE82(M, sh, s, lamps) {
  /* ---- the nose ---- */
  /* The grilles: two rounded mouths side by side, bright surrounds, dark
   * inside, upright slats. */
  for (const side of [1, -1]) {
    const k = rrect(0.032, 0.64, 0.284, 0.772, 0.05, 2);
    podOn(M, sh, 'front', side > 0 ? k : mirrorZ(k), {
      rim: 0.014, h: 0.018, lens: 0.008, rimRole: 'brite', lensRole: 'dark',
      bars: { n: 6, w: 0.009, role: 'briteDark', dir: 'v' },
    });
  }
  /* The headlamps, laid flat in layers so the piece across the face and
   * the piece round the corner and back along the wing (in the corner's
   * view) are one lamp: the dark housing, the glass, the sky's band along
   * its top, the two rings with the projector's lens in each, the amber
   * along the top at the outer end. */
  const head = [[0.305, 0.66], [0.62, 0.642], [0.79, 0.646], [0.83, 0.692], [0.815, 0.774], [0.58, 0.776], [0.32, 0.76]];
  const wrap = [[-0.97, 0.646], [-0.88, 0.664], [-0.75, 0.694], [-0.64, 0.738], [-0.66, 0.75], [-0.8, 0.766], [-0.97, 0.776]];
  lay(M, sh, 'dark', 'front', inset(head, head.map(() => -0.01)), 0.004);
  lay(M, sh, 'dark', 'fr', inset(wrap, wrap.map(() => -0.01)), 0.004);
  lay(M, sh, 'glass', 'front', head, 0.008);
  lay(M, sh, 'glass', 'fr', wrap, 0.008);
  lay(M, sh, 'band', 'front', [[0.33, 0.745], [0.8, 0.756], [0.8, 0.764], [0.34, 0.753]], 0.0095);
  lay(M, sh, 'band', 'fr', [[-0.96, 0.758], [-0.8, 0.752], [-0.79, 0.76], [-0.96, 0.766]], 0.0095);
  for (const [z, y, r] of [[0.43, 0.702, 0.05], [0.625, 0.706, 0.055]]) {
    for (const zz of [z, -z]) {
      ringOn(M, sh, 'lampF', 'front', zz, y, r - 0.013, r, 0.011, 14);
      ringOn(M, sh, 'clear', 'front', zz, y, 0, 0.017, 0.0125, 10);
    }
  }
  lay(M, sh, 'amber', 'front', [[0.7, 0.752], [0.81, 0.758], [0.81, 0.766], [0.7, 0.76]], 0.011);
  for (const side of [1, -1]) {
    lamps.front.push([2.19, 0.704, side * 0.53]);
  }
  /* The bonnet's shut lines along the wings (its two creases are rows of
   * the body, E82_BODY's tenth). */
  lineOn(M, sh, 'dark', [0.98, 0.768], [1.8, 0.75], 0.006, 0.003, 'top');
  /* The bumper: the plate, the wide middle mouth, the two corner mouths. */
  plateOn(M, sh, 'front', 0.49);
  podOn(M, sh, 'front', [[-0.4, 0.248], [0.4, 0.248], [0.45, 0.392], [-0.45, 0.392]], {
    rim: 0.012, h: 0.014, lens: 0.005, rimRole: 'dark', lensRole: 'dark', bars: { n: 2, w: 0.007, role: 'briteDark' },
  });
  podsOn(M, sh, 'front', [[0.53, 0.29], [0.72, 0.27], [0.77, 0.44], [0.58, 0.44]], {
    mirror: true, rim: 0.012, h: 0.016, lens: 0.005, rimRole: 'dark', lensRole: 'dark', bars: { n: 1, w: 0.008, role: 'briteDark' },
  });

  /* ---- the flanks ---- */
  lineOn(M, sh, 'dark', [1.84, 0.3], [1.9, 0.58], 0.009, 0.004);
  lineOn(M, sh, 'dark', [-1.58, 0.36], [-1.72, 0.72], 0.009, 0.004);
  lineOn(M, sh, 'dark', [-1.72, 0.72], [-1.99, 0.728], 0.009, 0.004);
  /* The glass: frameless doors, a dark pillar between the door's glass and
   * the rear side window, whose back comes down the pillar and turns
   * forward at its foot, the kink. */
  const dlo = [[0.84, 1.006], [-1.02, 1.047], [-1.1, 1.078], [-1.075, 1.16], [-1.0, 1.24], [-0.89, 1.3], [-0.72, 1.338], [-0.42, 1.356], [-0.1, 1.356], [0.16, 1.336], [0.24, 1.32]];
  sideGlassOn(M, sh, dlo, { pillars: [[-0.455, -0.56, 0.045]] });
  lay(M, sh, 'dark', 'side', [[0.84, 1.0], [0.56, 1.004], [0.62, 1.1], [0.72, 1.13]], 0.014);
  /* The door's shut lines, the handle, the side repeater on the wing. */
  lineOn(M, sh, 'dark', [0.8, 0.32], [0.84, 0.985], 0.011, 0.004);
  lineOn(M, sh, 'dark', [-0.4, 0.34], [-0.49, 1.02], 0.011, 0.004);
  lay(M, sh, 'dark', 'side', [[-0.37, 0.858], [-0.23, 0.858], [-0.23, 0.886], [-0.37, 0.886]], 0.004);
  lay(M, sh, 'brite', 'side', [[-0.36, 0.864], [-0.24, 0.864], [-0.24, 0.88], [-0.36, 0.88]], 0.009);
  lay(M, sh, 'brite', 'side', [[0.92, 0.828], [1.0, 0.83], [1.0, 0.843], [0.92, 0.84]], 0.005);
  coupeMirrors(M, 0.64, 1.0, 0.765, { len: 0.18, h: 0.11 });

  /* ---- the tail ---- */
  /* The tail lamps, in layers as the headlamps are: a wedge across the
   * wing's corner and round onto its side (the corner's view), the red
   * lens with a dark light guide along its top, and the pale strip at its
   * foot that runs round the corner with it. */
  const tail = [[0.47, 0.796], [0.848, 0.748], [0.858, 0.8], [0.848, 0.95], [0.47, 0.905]];
  const wing = [[-0.96, 0.748], [-0.84, 0.76], [-0.64, 0.905], [-0.62, 0.95], [-0.96, 0.95]];
  lay(M, sh, 'dark', 'rear', inset(tail, tail.map(() => -0.009)), 0.004);
  lay(M, sh, 'dark', 'rr', inset(wing, wing.map(() => -0.009)), 0.004);
  lay(M, sh, 'lampR', 'rear', tail, 0.008);
  lay(M, sh, 'lampR', 'rr', wing, 0.008);
  lay(M, sh, 'clear', 'rear', [[0.48, 0.806], [0.85, 0.759], [0.85, 0.783], [0.48, 0.824]], 0.0105);
  lay(M, sh, 'clear', 'rr', [[-0.96, 0.752], [-0.83, 0.764], [-0.81, 0.784], [-0.96, 0.776]], 0.0105);
  lay(M, sh, 'dark', 'rear', [[0.5, 0.874], [0.8, 0.9], [0.8, 0.91], [0.5, 0.884]], 0.0105);
  for (const side of [1, -1]) {
    lamps.rear.push([-2.2, 0.86, side * 0.66]);
  }
  /* The plate in its recess on the boot lid. */
  lay(M, sh, 'deep', 'rear', rrect(-0.25, 0.782, 0.25, 0.94, 0.03, 1), 0.003);
  plateOn(M, sh, 'rear', 0.858);
  /* The diffuser's twin tips, on the left. */
  for (const z of [-0.4, -0.515]) {
    tailpipe(M, -2.215, 0.285, z, 0.042, 0.14);
  }
  /* Reflectors low on the bumper's corners. */
  lay(M, sh, 'lampR', 'rear', [[0.64, 0.36], [0.77, 0.35], [0.77, 0.37], [0.64, 0.38]], 0.004);
}

/* ------------------------------------------------------------------ *
 * THE KEI TRUCK. makeKeiTruck's own sizes (3.32 by 1.46, the cab over
 * the front wheels to 1.91, the bed floor at 0.85 to 0.91 with its drop
 * sides to 1.27), drawn the same way as the cars.
 * ------------------------------------------------------------------ */

/* The kei truck's second pass face: its bumper wrapping the corners, the
 * lamps at the corners in painted rims, a black barred grille between
 * them, the plate on the bumper, and a lip on the front arch. */
function keiTruckFrontP2(M, s, hw, front, lamps, arch) {
  const t = {
    ...s,
    nose: { face: -0.005, bumper: 0.575, dam: 0.38, wrap: { rp: [0.07, 0.08], front: 0.045, side: 0.02 } },
    arch: arch.arch, lip: { w: 0.035, proud: 0.012 },
  };
  const fb = bumperLoft(M, t, 1, hw, 'brite');
  const chain = [...fb, [chainX(front, 0.576), 0.576], ...front.filter((p) => p[1] > 0.577)];
  endP2(M, t, chain, 1, hw, {
    pods: [
      {
        poly: rrect(0.37, 0.70, 0.65, 0.86, 0.02, 1), mirror: true, rim: 0.018, h: 0.02, lens: 0.006,
        rimRole: 'body', lensRole: 'lampF', lamp: true, lampAt: [0.47, 0.78],
        parts: [{ role: 'amber', poly: rrect(0.575, 0.716, 0.63, 0.844, 0.006, 1) }, { role: 'dark', poly: rrect(0.47, 0.716, 0.477, 0.844, 0.002, 1) }],
      },
      {
        poly: rrect(-0.31, 0.725, 0.31, 0.835, 0.015, 1), rim: 0.012, h: 0.016, lens: 0.004, rimRole: 'dark', lensRole: 'dark',
        bars: { n: 2, w: 0.014, role: 'briteDark' },
      },
    ],
    plate: 0.47,
  }, lamps);
  archLipP2(M, { ...arch, lip: t.lip }, hw, s.axle[0]);
}

function keiTruckBody(M, s, o, lamps) {
  const L2 = s.L / 2;
  const hw = s.W / 2;
  const xb = s.cab[0];
  /* The cab: one profile from its back, over the front arch, up the flat
   * front and the screen, along the roof. */
  const prof = [];
  const P = (x, y, c, d, edge) => prof.push({ x, y, c, d, edge });
  P(xb, 0.44, 0, 0, 'under');
  const arch = { ...s, R: s.R, sill: 0.44, arch: { gap: 0.04, lift: 0.02 } };
  for (const [x, y] of archPoints(arch, s.axle[0], 7)) {
    P(x, y, 0.02, 0.02, 'well');
  }
  prof[prof.length - 1].edge = 'under';
  const f0 = prof.length;
  if (s.p2) {
    /* The bumper is a piece of its own (bumperLoft), below. */
    P(L2 - 0.03, 0.42, 0.05, 0.06, 'body');
    P(L2 - 0.005, 0.55, 0.05, 0.06, 'body');
  } else {
    P(L2 + 0.03 - 0.05, 0.38, 0.05, 0.06, 'bumper');
    P(L2 + 0.03, 0.42, 0.05, 0.06, 'bumper');
    P(L2 + 0.03, 0.56, 0.05, 0.06, 'body');
    P(L2 - 0.005, 0.575, 0.05, 0.06, 'body');
  }
  P(L2 - 0.02, 1.0, 0.05, 0.06, 'body');
  const front = prof.slice(f0).map((p) => [p.x, p.y]);
  P(L2 - 0.045, 1.05, 0.04, 0.04, 'body');
  P(L2 - 0.2, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb + 0.04, s.roof + 0.02, 0.06, 0.06, 'body');
  P(xb, s.roof - 0.06, 0.03, 0.03, 'body');
  const cap = prism(M, 'body', prof, () => hw, {
    smooth: s.p2 === true, edgeRole: (i, ch) => (ch ? 'body' : ({ well: 'dark', under: 'dark', bumper: 'brite' }[prof[i].edge] ?? 'body')),
  });
  /* The roof's lip, a thin cap a touch wider than the cab, where the
   * vendored truck had its own: the one crisp line over the cab. */
  M.box('deep', xb + 0.02, s.roof + 0.005, -(hw + 0.015), L2 - 0.17, s.roof + 0.04, hw + 0.015, '-y');
  /* Glass: the screen on the raked face, the door windows on the flanks. */
  const zs = hw - 0.04;
  screen(M, [L2 - 0.045, 1.05], [L2 - 0.2, s.roof + 0.02], zs, hw - 0.06, [1, 1], {
    frame: 0.06, bottom: 0.05, band: s.p2 ? [0.55, 0.78] : null,
    wipers: s.p2 ? [[0.42 * zs, 0.012, -0.3 * zs, 0.06], [-0.26 * zs, 0.012, -0.88 * zs, 0.05]] : null,
  });
  const dlo = clip(clip(clip(inset(cap, cap.map(() => 0.07)), 0, 1, -1.18), 1, 0, -(xb + 0.12)), -1, 0, L2 - 0.1);
  for (const side of [1, -1]) {
    const lay = (role, poly, lift) => {
      const q = area2(poly) >= 0 ? poly : poly.slice().reverse();
      M.face(role, q.map((p) => [p[0], p[1], side * (hw + lift)]), { toward: [0, 0, side] });
    };
    lay('dark', inset(dlo, dlo.map(() => -0.012)), 0.005);
    const glass = inset(dlo, dlo.map(() => 0.012));
    lay('glass', glass, 0.009);
    if (s.p2) {
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const p of glass) {
        y0 = Math.min(y0, p[1]);
        y1 = Math.max(y1, p[1]);
      }
      lay('band', clip(clip(glass, 0, 1, -(y0 + (y1 - y0) * 0.55)), 0, -1, y0 + (y1 - y0) * 0.78), 0.0105);
    }
    glints(glass, 0.9, [[0.35, 0.12]], (q) => lay('glint', q, 0.012));
  }
  /* The door's shut lines and handle, the step under it. */
  const doorX0 = xb + 0.08;
  const doorX1 = s.axle[0] + 0.34;
  for (const x of [doorX0, doorX1]) {
    onFlank(M, 'dark', hw, x - 0.009, 0.62, x + 0.009, 1.16, 0.005);
  }
  onFlank(M, 'dark', hw, doorX0 + 0.08, 1.03, doorX0 + 0.22, 1.07, 0.005);
  onFlank(M, 'brite', hw, doorX0 + 0.09, 1.04, doorX0 + 0.21, 1.06, 0.008);
  /* The front: lamps at the corners, the grille slot, the plate. */
  const ch = { front };
  if (s.p2) {
    keiTruckFrontP2(M, s, hw, front, lamps, arch);
  }
  for (const side of s.p2 ? [] : [1, -1]) {
    const z0 = side > 0 ? hw - 0.36 : -(hw - 0.08);
    const z1 = side > 0 ? hw - 0.08 : -(hw - 0.36);
    blockOnEnd(M, 'dark', ch.front, 1, 0.7, 0.86, z0 - 0.012, z1 + 0.012, 0.016);
    const lz0 = side > 0 ? z0 : z0 + 0.07;
    const lz1 = side > 0 ? z1 - 0.07 : z1;
    onEnd(M, 'lampF', ch.front, 1, 0.712, 0.848, lz0, lz1, 0.02);
    onEnd(M, 'amber', ch.front, 1, 0.712, 0.848, side > 0 ? z1 - 0.062 : z0, side > 0 ? z1 : z0 + 0.062, 0.02);
    lamps.front.push([L2 + 0.03, 0.78, side * (hw - 0.22)]);
  }
  if (!s.p2) {
    blockOnEnd(M, 'dark', ch.front, 1, 0.74, 0.82, -(hw - 0.42), hw - 0.42, 0.01);
    plate(M, ch.front, 1, 0.47);
  }
  mirrors(M, { ...s, cab: [xb, L2 - 0.1], waist: 1.08 }, hw, 'dark');
  /* The chassis under the bed, with the rear arch cut in it. */
  const cz = hw - 0.04;
  const chassis = [{ x: -L2 + 0.08, y: 0.5, c: 0, d: 0, edge: 'dark' }];
  const rearArch = { ...s, sill: 0.5, arch: { gap: 0.04, lift: 0.02 } };
  for (const [x, y] of archPoints(rearArch, s.axle[1], 7)) {
    chassis.push({ x, y, c: 0, d: 0, edge: 'dark' });
  }
  chassis.push({ x: xb + 0.02, y: 0.5, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: xb + 0.02, y: 0.85, c: 0, d: 0, edge: 'dark' });
  chassis.push({ x: -L2 + 0.08, y: 0.85, c: 0, d: 0, edge: 'dark' });
  prism(M, 'dark', chassis, () => cz);
  /* The bed: floor, headboard, drop sides and the tailgate, each a panel
   * with a pressed rib along it, and the guard frame over the cab's back. */
  const bx0 = -L2;
  const bx1 = xb - 0.02;
  M.box('bed', bx0, 0.85, -hw + 0.06, bx1, 0.91, hw - 0.06, '-y');
  const top = 1.27;
  for (const side of [1, -1]) {
    const z0 = side > 0 ? hw - 0.06 : -hw;
    const z1 = side > 0 ? hw : -hw + 0.06;
    M.box('body', bx0 + 0.06, 0.85, z0, bx1, top, z1);
    onFlank(M, 'deep', hw, bx0 + 0.1, 1.05, bx1 - 0.04, 1.08, 0.004);
    onFlank(M, 'dark', hw, bx0 + 0.1, 0.87, bx1 - 0.04, 0.885, 0.004);
    for (const x of [bx0 + 0.55, bx1 - 0.55]) {
      onFlank(M, 'dark', hw, x - 0.02, 0.9, x + 0.02, 0.97, 0.007);
    }
  }
  M.box('body', bx0, 0.85, -hw, bx0 + 0.06, top, hw);
  M.face('deep', [[bx0 - 0.004, 1.05, hw - 0.06], [bx0 - 0.004, 1.05, -hw + 0.06], [bx0 - 0.004, 1.08, -hw + 0.06], [bx0 - 0.004, 1.08, hw - 0.06]], { toward: [-1, 0, 0] });
  M.box('body', bx1 - 0.05, 0.91, -hw + 0.06, bx1, top + 0.08, hw - 0.06);
  /* The guard frame: two posts and three rails up to the roof. */
  for (const z of [hw - 0.08, -(hw - 0.08)]) {
    M.box('dark', bx1 - 0.04, top, z - 0.025, bx1 + 0.01, s.roof - 0.12, z + 0.025);
  }
  for (const y of [top + 0.18, top + 0.36, s.roof - 0.14]) {
    M.box('dark', bx1 - 0.04, y - 0.02, -(hw - 0.08), bx1 + 0.01, y + 0.02, hw - 0.08);
  }
  /* The rear: lamps and plate under the tailgate. */
  for (const side of [1, -1]) {
    const z = side * (hw - 0.2);
    M.box('dark', -L2 - 0.02, 0.62, z - 0.13, -L2 + 0.02, 0.76, z + 0.13);
    if (s.p2) {
      /* On the housing's face, a bright bezel, the tail lamp over the
       * amber. */
      const rc = [[-L2 - 0.02, 0.5], [-L2 - 0.02, 0.9]];
      onEndPoly(M, 'briteDark', rc, -1, rrect(z - 0.118, 0.63, z + 0.118, 0.75, 0.014, 1), 0.003);
      onEndPoly(M, 'lampR', rc, -1, rrect(z - 0.104, 0.668, z + 0.104, 0.738, 0.01, 1), 0.006);
      onEndPoly(M, 'amber', rc, -1, [[z - 0.104, 0.642], [z + 0.104, 0.642], [z + 0.104, 0.66], [z - 0.104, 0.66]], 0.006);
    } else {
      M.face('lampR', [[-L2 - 0.022, 0.66, z + 0.11], [-L2 - 0.022, 0.66, z - 0.11], [-L2 - 0.022, 0.74, z - 0.11], [-L2 - 0.022, 0.74, z + 0.11]], { toward: [-1, 0, 0] });
      M.face('amber', [[-L2 - 0.022, 0.635, z + 0.11], [-L2 - 0.022, 0.635, z - 0.11], [-L2 - 0.022, 0.655, z - 0.11], [-L2 - 0.022, 0.655, z + 0.11]], { toward: [-1, 0, 0] });
    }
    lamps.rear.push([-L2 - 0.05, 0.7, z]);
  }
  M.face('plate', [[-L2 - 0.01, 0.95, -0.2], [-L2 - 0.01, 0.95, 0.2], [-L2 - 0.01, 1.15, 0.2], [-L2 - 0.01, 1.15, -0.2]], { uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], toward: [-1, 0, 0] });
  M.box('brite', -L2 + 0.04, 0.44, -(hw - 0.06), -L2 + 0.1, 0.52, hw - 0.06);
  /* What is on the bed. */
  const load = o.load ?? 'crates';
  if (load === 'crates') {
    for (let i = 0; i < 3; i += 1) {
      const x = -0.35 - i * 0.15 - 0.3;
      const y = 0.91 + i * 0.26;
      const z = i % 2 ? 0.08 : -0.08;
      M.box(i === 1 ? 'crate' : 'crate2', x - 0.21, y, z - 0.17, x + 0.21, y + 0.25, z + 0.17);
      M.box('dark', x - 0.212, y + 0.2, z - 0.172, x + 0.212, y + 0.215, z + 0.172, '-y');
    }
  } else if (load === 'sheet') {
    const cx = (bx0 + bx1) / 2;
    M.box('sheet', cx - 0.75, 0.91, -hw + 0.1, cx + 0.75, 1.32, hw - 0.1, '-y');
    for (const dx of [-0.5, 0, 0.5]) {
      M.box('rope', cx + dx - 0.025, 0.91, -hw + 0.08, cx + dx + 0.025, 1.335, hw - 0.08, '-y');
    }
  }
}

/* ------------------------------------------------------------------ *
 * BUILDING ONE.
 * ------------------------------------------------------------------ */

const NO_CAST = new Set(['glass', 'band', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate']);
const ORDER = ['body', 'body2', 'stripe', 'accent', 'deep', 'dark', 'brite', 'briteDark', 'rim', 'bed', 'crate', 'crate2', 'sheet', 'rope', 'glass', 'band', 'glint', 'lampF', 'lampR', 'amber', 'clear', 'plate'];

/*
 * One car at the origin, nose along +x, as a Group of one mesh a material.
 *
 *   o.kind     a MODEL key; anything else is a kei
 *   o.color    the body colour (a CAR value); the r32 takes its livery
 *   o.variant  the r32's and the e82's livery, by number (carLivery),
 *              unless o.livery
 *   o.wheels   false leaves the wheels out, for a caller that draws its
 *              own that turn (src/maps/built/cars.js)
 *   o.detail   'parked' (the default) or 'full'
 *   o.hero     an inverted hull ink shell on the body as well
 *   o.load     the kei truck's: 'crates', 'sheet' or 'empty'
 *
 * g.userData.lamps holds where the lamps are, { front, rear }, each a
 * list of [x, y, z] in the car's frame, for whatever draws their light.
 */
export function buildCar(o = {}) {
  const kind = MODEL[o.kind] ? o.kind : 'kei';
  const s = MODEL[kind];
  const m = mats();
  const detail = o.detail === 'full' ? 'full' : 'parked';
  const livery = LIVERIES[kind] ? (o.livery ?? carLivery(kind, o.variant)) : null;
  const truck = kind === 'keitruck';
  const col = livery ? livery.body : (o.color ?? (truck ? PAL.taxiYellow : CAR.white));
  const rimRole = livery && livery.rim ? 'rim' : 'brite';
  const M = new Mesher();
  let lamps = { front: [], rear: [] };
  if (truck) {
    keiTruckBody(M, s, o, lamps);
  } else if (s.sculpt) {
    lamps = sculpted(M, s, livery).lamps;
  } else {
    const info = bodyOf(M, s);
    lamps = info.lamps;
    if (s.rails) {
      rails(M, s, info.rf, info.rr, info.hwC);
    }
    if (s.rear && s.rear.spoiler) {
      roofSpoiler(M, s, info.rr, info.hwC);
    }
    if (s.box) {
      lorry(M, s, lamps);
    }
    if (s.bus) {
      bus(M, s, s.W / 2);
    }
  }
  if (o.wheels !== false) {
    wheels(M, s, detail, rimRole);
  }
  const bodyMat = truck
    ? cel({ color: col, bands: 3, tint: 0x8f7050 })
    : paint(col);
  const matFor = {
    body: bodyMat,
    deep: truck ? cel({ color: deepOf(col), bands: 3, tint: 0x8f7050 }) : deepPaint(col),
    dark: m.dark,
    brite: m.brite,
    briteDark: m.briteDark,
    glass: m.glass,
    band: m.band,
    glint: m.glint,
    lampF: m.lampF,
    lampR: m.lampR,
    amber: m.amber,
    clear: m.clear,
    plate: m.plate,
  };
  if (livery) {
    if (livery.lower) {
      matFor.body2 = paint(livery.lower);
    }
    if (livery.stripe) {
      matFor.stripe = paint(livery.stripe);
    }
    if (livery.rim) {
      matFor.rim = cel({ color: livery.rim, bands: 3, tint: 0x666090 });
    }
  }
  if (s.band) {
    matFor.accent = paint(s.band);
  }
  if (truck) {
    matFor.bed = cel({ color: 0xbba98c, bands: 3, tint: 0x6f6790 });
    matFor.crate = cel({ color: PAL.crate, bands: 3, tint: 0x4a4a92 });
    matFor.crate2 = cel({ color: PAL.crateAlt, bands: 3, tint: 0x4a4a92 });
    matFor.sheet = cel({ color: 0x8fa2b4, bands: 3, tint: 0x5c5680 });
    matFor.rope = cel({ color: PAL.rope, bands: 3, tint: 0x6f6790 });
  }
  const g = new THREE.Group();
  let bodyMesh = null;
  for (const role of ORDER) {
    const geo = M.geometry(role);
    if (!geo) {
      continue;
    }
    const mesh = new THREE.Mesh(geo, matFor[role] ?? m.dark);
    mesh.castShadow = !NO_CAST.has(role);
    mesh.receiveShadow = true;
    g.add(mesh);
    if (role === 'body') {
      bodyMesh = mesh;
    }
  }
  if (o.hero && bodyMesh) {
    hullOutline(bodyMesh, { thickness: 0.0034 });
  }
  g.userData.lamps = lamps;
  g.userData.kind = kind;
  g.userData.triangles = M.triangles;
  return g;
}

/* ------------------------------------------------------------------ *
 * THE TOWN'S HOOKS. The vendored makeVehicle and makeKeiTruck hand their
 * drawing here (setVehicleModel, setKeiTruckModel, registered by
 * src/maps/city/index.js before the town is built), and these place and
 * name the car exactly as the vendored builders did, so nothing that reads
 * a town car by its group changes.
 * ------------------------------------------------------------------ */

export function townVehicle(o) {
  if (o.kind === 'keitruck') {
    return townKeiTruck({ x: o.x, y: o.y, z: o.z, ry: o.ry, color: o.color, load: o.load, hero: o.hero });
  }
  const g = buildCar({ kind: o.kind, color: o.color, hero: o.hero === true });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = (o.ry ?? 0) + (o.skew ?? 0);
  g.name = 'vehicle_' + (o.kind ?? 'kei');
  g.userData.vehicle = { kind: o.kind, ...vehicleSize(o.kind) };
  return g;
}

/* The kei truck. The one at the crossing is makeKeiTruck's default: the
 * taxi yellow hero with its ink shell. A parked one names its colour and
 * says hero: false, or leaves hero unset, which the vendored builder took
 * as a shell too; here only the crossing's truck, the one the town's
 * opening frame is built round, keeps one. */
export function townKeiTruck(o) {
  const hero = o.hero === true || (o.hero === undefined && o.color === undefined);
  const g = buildCar({ kind: 'keitruck', color: o.color, load: o.load, hero });
  g.position.set(o.x, o.y ?? 0, o.z);
  g.rotation.y = o.ry ?? 0;
  return g;
}

/* ------------------------------------------------------------------ *
 * A MOVING CAR'S WHEEL, for src/maps/built/cars.js: one wheel of a kind at
 * 'full' detail, centred on its axle, the axle along z and its outer face
 * toward +z, every material painted into a vertex colour so a whole set of
 * wheels is one batch (cel, white, vertexColors). `rim` is a coupe's
 * livery's wheel colour, or nothing for the kind's own.
 * ------------------------------------------------------------------ */

const WHEEL_PAINT = { dark: 0x36333e, brite: PAL.metal, briteDark: PAL.metalDark };

export function carWheelGeometry(kind, { rim = null } = {}) {
  const s = MODEL[MODEL[kind] ? kind : 'kei'];
  const M = new Mesher();
  wheel(M, s, 'full', rim ? 'rim' : 'brite');
  const pos = [];
  const nor = [];
  const uv = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  for (const [role, b] of M.roles) {
    c.setHex(role === 'rim' ? rim : (WHEEL_PAINT[role] ?? WHEEL_PAINT.dark));
    const base = pos.length / 3;
    for (let i = 0; i < b.p.length; i += 3) {
      col.push(c.r, c.g, c.b);
    }
    pos.push(...b.p);
    nor.push(...b.n);
    uv.push(...b.uv);
    for (const k of b.idx) {
      idx.push(base + k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* Where a kind's wheels are, for a caller drawing them: the axles, the
 * wheel's radius, its middle across the car and its camber (rad, the top
 * in). */
export function carWheelBase(kind) {
  const s = MODEL[MODEL[kind] ? kind : 'kei'];
  const z = wheelZ(s);
  /* The box lorry's rear axle carries a twin inside each wheel. */
  const twins = s.kind === 'boxtruck'
    ? [1, -1].map((side) => ({ x: s.axle[1], z: side * (z - tyreWidth(s) - 0.02) }))
    : [];
  return { axle: s.axle.slice(), R: s.R, z, camber: s.camber ?? 0, width: tyreWidth(s), twins };
}
