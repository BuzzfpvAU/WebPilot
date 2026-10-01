/*
 * tank/hardware.js: the welds, the bolts and the schoepentoeter.
 *
 * WELDS ARE GEOMETRY. A weld seen from half a metre under an aircraft's own
 * light is a raised bead with a rippled cap that throws a highlight, and a
 * line painted into the plate reads as mortar. Every seam here is a SEAM:
 * a centre line on a parent surface, `frame(s)` giving the point, the
 * direction along the weld and the surface normal at arc length s. One
 * sweep turns every seam into one merged bead mesh, and the defects in
 * defects.js are placed on the same seams by the same frame, so a crack
 * sits on the crown of the bead it belongs to.
 *
 * BOLTS ARE INSTANCES: a washer, a hex nut and the stud end, three
 * InstancedMeshes for every bolt in the tank, so a missing bolt is one
 * instance scaled to nothing.
 *
 * THE SCHOEPENTOETER is the vane inlet device of a separator: the feed
 * comes in through the nozzle into a tapering box, and rows of curved vanes
 * down both sides turn it out sideways so it loses its momentum before it
 * reaches the liquid. It runs from the inlet nozzle toward the tank's axis
 * at nozzle height, its top and bottom plates are seam welded, and every
 * vane is bolted top and bottom. A pilot inspects it from above and from
 * below.
 *
 * Three.js frame, metres, like the rest of the tank.
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

/* A fixed LCG, the tank's only source of randomness, so a seed is a tank. */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* The schoepentoeter, in metres. u runs from the nozzle's inner end toward
 * the tank's axis. */
export const SCHOEP = {
  length: 4.6,          /* nozzle flange to end plate */
  spool: 0.35,          /* round spool from the flange to the box */
  h0: 0.70,             /* box height at the spool */
  h1: 0.34,             /* box height at the end plate */
  channel: 0.62,        /* the flow channel between the vane roots */
  vaneOut: 0.15,        /* how far a vane reaches past the channel */
  vanePitch: 0.22,
  plate: 0.012,
  splices: [1.8, 3.2],  /* transverse butt welds in the plates */
  legU: 4.25,           /* the support legs, from the flange */
};

/* Bead sizes, metres: width and cap height. */
const BEAD_SHELL = { w: 0.028, h: 0.006 };
const BEAD_FLOOR = { w: 0.026, h: 0.005 };
const BEAD_FILLET = { w: 0.024, h: 0.007 };
const BEAD_PLATE = { w: 0.020, h: 0.005 };

/*
 * A seam. frame(s, f) writes into f = { p, t, n } the centre line point,
 * the unit direction along the weld and the unit normal of the surface the
 * bead stands on, pointing into the open tank. snap(v) moves a point near
 * the seam onto that surface, for decals that must lie on it.
 */
function seam(name, zone, len, bead, straight, frame, snap) {
  return { name, zone, len, bead, straight, frame, snap };
}

export function newFrame() {
  return { p: new THREE.Vector3(), t: new THREE.Vector3(), n: new THREE.Vector3() };
}

const _f = newFrame();
const _b = new THREE.Vector3();

/* The point on a bead at arc length s, across a (-1 and 1 are the toes,
 * beyond them the parent surface), lifted `lift` off it along the normal. */
export function seamPoint(sm, s, a, lift, out) {
  sm.frame(s, _f);
  _b.crossVectors(_f.t, _f.n);
  const cap = Math.abs(a) < 1 ? sm.bead.h * Math.sqrt(1 - a * a) : 0;
  out.copy(_f.p).addScaledVector(_b, a * sm.bead.w * 0.5).addScaledVector(_f.n, cap + lift);
  return out;
}

/* A rippled weld cap: chevrons along u, the way a stick or MIG bead
 * freezes, on a grey a shade lighter than the plate. Used as colour and
 * as bump, so the ripples catch the light. */
export function beadTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  const rnd = lcg(0xbead);
  g.fillStyle = '#7d7871';
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 26; i += 1) {
    const x = i * (256 / 26) + rnd() * 2;
    const v = 120 + Math.floor(rnd() * 40);
    g.strokeStyle = `rgba(${v},${v - 4},${v - 10},0.85)`;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 6, 2);
    g.quadraticCurveTo(x + 7, 32, x - 6, 62);
    g.stroke();
    g.strokeStyle = 'rgba(40,36,32,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x - 3, 2);
    g.quadraticCurveTo(x + 10, 32, x - 3, 62);
    g.stroke();
  }
  /* Toes: darker where the bead meets the plate, and a little rust. */
  const toe = g.createLinearGradient(0, 0, 0, 64);
  toe.addColorStop(0, 'rgba(60,40,28,0.7)');
  toe.addColorStop(0.18, 'rgba(60,40,28,0)');
  toe.addColorStop(0.82, 'rgba(60,40,28,0)');
  toe.addColorStop(1, 'rgba(60,40,28,0.7)');
  g.fillStyle = toe;
  g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 40; i += 1) {
    g.fillStyle = `rgba(130,62,24,${0.1 + rnd() * 0.2})`;
    g.beginPath();
    g.arc(rnd() * 256, rnd() * 64, 1 + rnd() * 4, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/* The bead's cross section, across from toe to toe. */
const PROFILE = [-1, -0.8, -0.45, 0, 0.45, 0.8, 1];
/* One ripple texture repeat, metres along the weld. */
const RIPPLE_REPEAT = 0.12;

/*
 * Sweep a list of seams into one geometry. `step` is the longest segment
 * along a curved seam; a straight seam is one segment. `scaleW`, `scaleH`
 * and `lump(s)` let defects.js sweep a fatter, lumpy rusted copy of a
 * stretch of bead with the same code.
 */
export function sweepBeads(list, step, opts = {}) {
  const scaleW = opts.scaleW ?? 1;
  const scaleH = opts.scaleH ?? 1;
  const lump = opts.lump ?? null;
  const pos = [];
  const uv = [];
  const idx = [];
  const p = new THREE.Vector3();
  const K = PROFILE.length;
  for (const item of list) {
    const sm = item.seam || item;
    const s0 = item.s0 ?? 0;
    const s1 = item.s1 ?? sm.len;
    const n = sm.straight && !lump ? 1 : Math.max(2, Math.ceil((s1 - s0) / step));
    const base = pos.length / 3;
    for (let i = 0; i <= n; i += 1) {
      const s = s0 + ((s1 - s0) * i) / n;
      sm.frame(s, _f);
      _b.crossVectors(_f.t, _f.n);
      const k2 = lump ? lump(s) : 1;
      for (let k = 0; k < K; k += 1) {
        const a = PROFILE[k];
        const cap = sm.bead.h * scaleH * k2 * Math.sqrt(Math.max(0, 1 - a * a));
        /* The toes sink a millimetre and a half into the plate, so the
         * bead never shows a gap where the plate is faceted. */
        p.copy(_f.p)
          .addScaledVector(_b, a * sm.bead.w * 0.5 * scaleW)
          .addScaledVector(_f.n, cap - 0.0015);
        pos.push(p.x, p.y, p.z);
        uv.push(s / RIPPLE_REPEAT, k / (K - 1));
      }
    }
    for (let i = 0; i < n; i += 1) {
      for (let k = 0; k < K - 1; k += 1) {
        const a = base + i * K + k;
        const b = a + K;
        /* Wound so the face looks along +n: t x b is -n, so the order is
         * (i,k), (i,k+1), (i+1,k). */
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}

/*
 * The shell's seams, the same ones plateTexture paints the heat tint for:
 * a horizontal seam at every course and vertical seams staggered by half
 * a plate on alternate courses. Angle a puts a point at (R cos a, y,
 * R sin a); plateTexture's u is the cylinder's theta, which is pi/2 - a.
 */
export function shellSeamAngles(T) {
  const plates = Math.round((2 * Math.PI * T.radius) / T.plateArc);
  const courses = Math.round(T.height / T.course);
  const out = [];
  for (let k = 0; k < courses; k += 1) {
    for (let i = 0; i < plates; i += 1) {
      const theta = (2 * Math.PI * (i + 0.5 * (k % 2))) / plates;
      out.push({ course: k, index: i, a: Math.PI / 2 - theta });
    }
  }
  return { plates, courses, vertical: out };
}

function ringSeam(name, zone, R, y, bead, n) {
  return seam(name, zone, 2 * Math.PI * R, bead, false, (s, f) => {
    const a = s / R;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    f.p.set(R * c, y, R * sn);
    f.t.set(-sn, 0, c);
    if (n) {
      n(c, sn, f.n);
    } else {
      f.n.set(-c, 0, -sn);
    }
  }, (v) => {
    const r = Math.hypot(v.x, v.z) || 1;
    v.x *= R / r;
    v.z *= R / r;
    return v;
  });
}

export function shellSeams(T, blocked) {
  const R = T.radius;
  const { courses, vertical } = shellSeamAngles(T);
  const out = [];
  /* The bottom corner: the shell to floor fillet, its normal halfway
   * between the shell's and the floor's. */
  const fillet = ringSeam('shell to floor fillet weld', 'shell', R, 0.004, BEAD_FILLET, (c, sn, n) => {
    n.set(-c, 1, -sn).normalize();
  });
  fillet.fillet = true;
  out.push(fillet);
  for (let k = 1; k < courses; k += 1) {
    out.push(ringSeam(`shell seam between plate rings ${k} and ${k + 1}`, 'shell', R, k * T.course, BEAD_SHELL));
  }
  for (const v of vertical) {
    const c = Math.cos(v.a);
    const sn = Math.sin(v.a);
    const y0 = v.course * T.course;
    const sm = seam(`shell plate ring ${v.course + 1}, vertical seam ${v.index + 1}`, 'shell', T.course, BEAD_SHELL, true,
      (s, f) => {
        f.p.set(R * c, y0 + s, R * sn);
        f.t.set(0, 1, 0);
        f.n.set(-c, 0, -sn);
      },
      (p) => {
        const r = Math.hypot(p.x, p.z) || 1;
        p.x *= R / r;
        p.z *= R / r;
        return p;
      });
    /* A seam that runs through the manway or the nozzle is not welded
     * there: drawn, but never a defect site. */
    sm.noDefects = blocked(new THREE.Vector3(R * c, y0 + T.course * 0.5, R * sn));
    out.push(sm);
  }
  return out;
}

/* The floor's lap welds, on the same plate grid floorTexture paints:
 * seven 2 m strips running along z, their cross seams staggered by half a
 * plate. Clipped to the shell. The roof is the same grid seen from below:
 * its disc is turned the other way up, so its texture's z is mirrored. */
export function floorSeams(T, roof) {
  const R = T.radius;
  const plate = (2 * R) / 7;
  const out = [];
  const y = roof ? T.height : 0;
  const zone = roof ? 'roof' : 'floor';
  const what = roof ? 'roof' : 'floor';
  const mz = roof ? -1 : 1;
  const up = (f) => f.n.set(0, roof ? -1 : 1, 0);
  const snap = (v) => {
    v.y = y;
    return v;
  };
  const line = (name, x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.2) {
      return;
    }
    const tx = (x1 - x0) / len;
    const tz = (z1 - z0) / len;
    out.push(seam(name, zone, len, BEAD_FLOOR, true, (s, f) => {
      f.p.set(x0 + tx * s, y, z0 + tz * s);
      f.t.set(tx, 0, tz);
      up(f);
    }, snap));
  };
  const rIn = R - 0.06;
  for (let i = 1; i < 7; i += 1) {
    const x = -R + i * plate;
    const h = Math.sqrt(Math.max(0, rIn * rIn - x * x));
    line(`${what} seam ${i}`, x, -h, x, h);
  }
  for (let i = 0; i < 7; i += 1) {
    const xa = -R + i * plate;
    const xb = xa + plate;
    const off = (i % 2) * plate * 0.5;
    for (let j = 0; j <= 7; j += 1) {
      const z = mz * (-R + off + j * plate);
      if (Math.abs(z) >= rIn) {
        continue;
      }
      const h = Math.sqrt(rIn * rIn - z * z);
      const x0 = Math.max(xa, -h);
      const x1 = Math.min(xb, h);
      if (x1 > x0) {
        line(`${what} strip ${i + 1}, cross seam`, x0, z, x1, z);
      }
    }
  }
  return out;
}

/* A circle of weld round a member where it meets a surface. */
function circleSeam(name, zone, centre, r, ax, ay, normal, bead, snap) {
  return seam(name, zone, 2 * Math.PI * r, bead, false, (s, f) => {
    const phi = s / r;
    const c = Math.cos(phi);
    const sn = Math.sin(phi);
    f.p.copy(centre).addScaledVector(ax, r * c).addScaledVector(ay, r * sn);
    f.t.copy(ax).multiplyScalar(-sn).addScaledVector(ay, c).normalize();
    normal(c, sn, f.n);
  }, snap);
}

export function memberSeams(T) {
  const out = [];
  /* The column's foot. */
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  out.push(circleSeam('centre column base weld', 'floor', new THREE.Vector3(0, 0.004, 0), T.columnR + 0.006, X, Z,
    (c, sn, n) => n.set(c, 1, sn).normalize(), BEAD_FILLET, (v) => {
      v.y = 0;
      return v;
    }));
  /* The inlet nozzle where it passes through the shell. */
  const na = T.ladderAngle + Math.PI;
  const inward = new THREE.Vector3(-Math.cos(na), 0, -Math.sin(na));
  const tw = new THREE.Vector3(-Math.sin(na), 0, Math.cos(na));
  const up = new THREE.Vector3(0, 1, 0);
  const C = new THREE.Vector3(T.radius * Math.cos(na), T.nozzleY, T.radius * Math.sin(na)).addScaledVector(inward, 0.004);
  const nz = circleSeam('inlet nozzle to shell weld', 'shell', C, T.nozzleR + 0.01, tw, up,
    (c, sn, n) => n.copy(inward).addScaledVector(tw, c * 0.8).addScaledVector(up, sn * 0.8).normalize(),
    BEAD_FILLET, (v) => {
      const r = Math.hypot(v.x, v.z) || 1;
      v.x *= T.radius / r;
      v.z *= T.radius / r;
      return v;
    });
  out.push(nz);
  for (const sm of out) {
    sm.fillet = true;
  }
  return out;
}

/*
 * BOLTS. A group is { name, zone, size, items: [{ p, n }] }: p on the
 * clamped face, n the bolt's axis out of it. size is the nut's radius
 * across corners, metres (0.0185 is an M20, 0.014 an M16, 0.011 an M12).
 */
export function boltMeshes(groups, rnd) {
  let count = 0;
  for (const g of groups) {
    count += g.items.length;
  }
  const steel = new THREE.MeshStandardMaterial({ color: 0x5f5a54, roughness: 0.6, metalness: 0.6 });
  const zinc = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.5, metalness: 0.7 });
  const nutGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
  const studGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  const washerGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
  const nuts = new THREE.InstancedMesh(nutGeo, steel, count);
  const studs = new THREE.InstancedMesh(studGeo, zinc, count);
  const washers = new THREE.InstancedMesh(washerGeo, zinc, count);
  const Y = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  const spin = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const index = [];
  let i = 0;
  for (const g of groups) {
    const r = g.size;
    g.first = i;
    for (const it of g.items) {
      q.setFromUnitVectors(Y, it.n);
      spin.setFromAxisAngle(Y, rnd() * Math.PI);
      q.multiply(spin);
      /* Washer, then the nut on it, then a few threads of stud. */
      v.copy(it.p).addScaledVector(it.n, 0.0015);
      m.compose(v, q, sc.set(r * 1.35, 0.003, r * 1.35));
      washers.setMatrixAt(i, m);
      v.copy(it.p).addScaledVector(it.n, 0.003 + r * 0.45);
      m.compose(v, q, sc.set(r, r * 0.9, r));
      nuts.setMatrixAt(i, m);
      v.copy(it.p).addScaledVector(it.n, 0.003 + r * 0.9 + r * 0.3);
      m.compose(v, q, sc.set(r * 0.55, r * 0.6, r * 0.55));
      studs.setMatrixAt(i, m);
      index.push({ group: g, item: it });
      i += 1;
    }
  }
  for (const im of [nuts, studs, washers]) {
    im.instanceMatrix.needsUpdate = true;
    im.userData.noRay = true;
  }
  const saved = {
    nuts: nuts.instanceMatrix.array.slice(),
    studs: studs.instanceMatrix.array.slice(),
    washers: washers.instanceMatrix.array.slice(),
  };
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    meshes: [nuts, studs, washers],
    count,
    index,
    /* Put every bolt back, then take out the ones listed (instance ids). */
    setMissing(ids) {
      nuts.instanceMatrix.array.set(saved.nuts);
      studs.instanceMatrix.array.set(saved.studs);
      washers.instanceMatrix.array.set(saved.washers);
      for (const id of ids) {
        nuts.setMatrixAt(id, zero);
        studs.setMatrixAt(id, zero);
        washers.setMatrixAt(id, zero);
      }
      for (const im of [nuts, studs, washers]) {
        im.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

/* n points round a circle of radius r centred on c, in the plane of ax
 * and ay, each bolt's axis along `axis`. */
function boltCircle(c, r, n, ax, ay, axis, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = phase + (i / n) * Math.PI * 2;
    out.push({ p: c.clone().addScaledVector(ax, r * Math.cos(a)).addScaledVector(ay, r * Math.sin(a)), n: axis.clone() });
  }
  return out;
}

/*
 * The bolted fittings that are not the schoepentoeter: the manway cover,
 * the rafter clips at the column and at the shell, the ladder brackets and
 * the coil stands. Adds their steel to `scene` and returns their bolt
 * groups and the solids they add, for the colliders.
 */
export function fittings(scene, T, member) {
  const groups = [];
  const solids = [];
  const up = new THREE.Vector3(0, 1, 0);
  const plateMat = member;
  const box = (w, h, d, p, rotY) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plateMat);
    mesh.position.copy(p);
    mesh.rotation.y = rotY || 0;
    scene.add(mesh);
    return mesh;
  };

  /* MANWAY: a 24 inch manway in the bottom course, a quarter turn round
   * from the ladder, its blind cover bolted on the inside face. */
  {
    const ma = T.ladderAngle + Math.PI / 2;
    const inward = new THREE.Vector3(-Math.cos(ma), 0, -Math.sin(ma));
    const tw = new THREE.Vector3(-Math.sin(ma), 0, Math.cos(ma));
    const y = T.manwayY;
    const C = new THREE.Vector3(T.radius * Math.cos(ma), y, T.radius * Math.sin(ma));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(T.manwayR + 0.012, T.manwayR + 0.012, 0.16, 32, 1, true), plateMat);
    neck.material = plateMat.clone();
    neck.material.side = THREE.DoubleSide;
    const face = C.clone().addScaledVector(inward, 0.16);
    neck.position.copy(C).addScaledVector(inward, 0.08);
    neck.quaternion.setFromUnitVectors(up, inward);
    scene.add(neck);
    const flange = new THREE.Mesh(new THREE.CylinderGeometry(T.manwayR + 0.11, T.manwayR + 0.11, 0.03, 40), plateMat);
    flange.position.copy(face).addScaledVector(inward, 0.015);
    flange.quaternion.setFromUnitVectors(up, inward);
    scene.add(flange);
    const cover = new THREE.Mesh(new THREE.CylinderGeometry(T.manwayR + 0.11, T.manwayR + 0.11, 0.025, 40), plateMat);
    cover.position.copy(face).addScaledVector(inward, 0.0425);
    cover.quaternion.setFromUnitVectors(up, inward);
    scene.add(cover);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 16, Math.PI), plateMat);
    handle.position.copy(face).addScaledVector(inward, 0.055);
    handle.lookAt(handle.position.clone().add(inward));
    scene.add(handle);
    groups.push({
      name: 'manway cover',
      zone: 'shell',
      size: 0.0185,
      items: boltCircle(face.clone().addScaledVector(inward, 0.055), T.manwayR + 0.07, 20, tw, up, inward, Math.PI / 20),
    });
    solids.push({ kind: 'pole', a: C.clone(), b: face.clone().addScaledVector(inward, 0.07), r: T.manwayR + 0.11 });
  }

  /* RAFTER CLIPS: a plate welded to the column and one to the shell at each
   * rafter, the rafter's web bolted to it, two by two. The bolts' axes are
   * across the rafter. */
  const ry = T.height - T.rafterDrop * 0.5;
  for (let i = 0; i < T.rafters; i += 1) {
    const a = (i / T.rafters) * Math.PI * 2;
    const along = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    for (const end of ['column', 'shell']) {
      const r0 = end === 'column' ? T.columnR : T.radius - 0.34;
      const len = 0.34;
      const mid = r0 + len * 0.5;
      const clipP = along.clone().multiplyScalar(mid).addScaledVector(side, 0.068);
      clipP.y = ry;
      box(len, 0.26, 0.012, clipP, -a);
      const items = [];
      for (const dr of [-0.07, 0.07]) {
        for (const dy of [-0.07, 0.07]) {
          const p = along.clone().multiplyScalar(mid + dr).addScaledVector(side, 0.074);
          p.y = ry + dy;
          items.push({ p, n: side.clone() });
        }
      }
      groups.push({
        name: `rafter ${i + 1} clip at the ${end}`,
        zone: 'roof',
        size: 0.014,
        items,
      });
    }
  }

  /* LADDER BRACKETS: every two metres, a flat bar from a clip on the shell
   * to each stile, bolted at the clip. */
  {
    const la = T.ladderAngle;
    const inward = new THREE.Vector3(-Math.cos(la), 0, -Math.sin(la));
    const tw = new THREE.Vector3(-Math.sin(la), 0, Math.cos(la));
    for (let y = 1.0; y < T.height - 0.6; y += 2.0) {
      for (const sd of [-1, 1]) {
        const base = new THREE.Vector3(T.radius * Math.cos(la), y, T.radius * Math.sin(la)).addScaledVector(tw, sd * 0.22);
        const bar = box(0.012, 0.05, 0.25, base.clone().addScaledVector(inward, 0.125).addScaledVector(tw, sd * 0.012), -la + Math.PI / 2);
        bar.lookAt(bar.position.clone().add(inward));
        const clip = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.12), plateMat);
        clip.position.copy(base).addScaledVector(inward, 0.06);
        clip.lookAt(clip.position.clone().add(inward));
        scene.add(clip);
        /* The clip is at the stile's line, the bar outside it, the nuts
         * on the bar's outer face. */
        const n = tw.clone().multiplyScalar(sd);
        const items = [0.035, 0.09].map((dd) => ({
          p: base.clone().addScaledVector(inward, dd).addScaledVector(n, 0.018),
          n: n.clone(),
        }));
        groups.push({
          name: `ladder bracket at ${Math.round(y)} m, ${sd < 0 ? 'left' : 'right'}`,
          zone: 'shell',
          size: 0.011,
          items,
        });
      }
    }
  }

  /* COIL STANDS: a base plate with four anchor bolts and a saddle with a
   * U bolt over the pipe, its two nuts on the saddle. */
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const along = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    const c = along.clone().multiplyScalar(T.coilR);
    box(0.18, 0.012, 0.18, c.clone().setY(0.006), -a);
    const items = [];
    for (const dr of [-0.06, 0.06]) {
      for (const ds of [-0.06, 0.06]) {
        items.push({ p: c.clone().addScaledVector(along, dr).addScaledVector(side, ds).setY(0.012), n: up.clone() });
      }
    }
    groups.push({ name: `coil stand ${i + 1} base`, zone: 'floor', size: 0.012, items });
    const sy = T.coilY - T.coilPipeR - 0.006;
    box(0.22, 0.012, 0.06, c.clone().setY(sy), -a);
    const ub = new THREE.Mesh(new THREE.TorusGeometry(T.coilPipeR + 0.008, 0.006, 6, 16, Math.PI), plateMat);
    ub.position.copy(c).setY(sy + 0.006);
    ub.rotation.y = -a;
    scene.add(ub);
    groups.push({
      name: `coil stand ${i + 1} U bolt`,
      zone: 'floor',
      size: 0.009,
      items: [-1, 1].map((sd) => ({
        p: c.clone().addScaledVector(along, sd * (T.coilPipeR + 0.008)).setY(sy + 0.006),
        n: up.clone(),
      })),
    });
  }
  return { groups, solids };
}

/*
 * The schoepentoeter: geometry, seams, bolts and solids. `O` is the
 * nozzle's inner end on its axis, `d` the unit direction into the tank.
 */
export function schoepentoeter(scene, T, member) {
  const S = SCHOEP;
  const na = T.ladderAngle + Math.PI;
  const d = new THREE.Vector3(-Math.cos(na), 0, -Math.sin(na));
  const w = new THREE.Vector3(-d.z, 0, d.x);
  const up = new THREE.Vector3(0, 1, 0);
  const O = new THREE.Vector3(T.radius * Math.cos(na), T.nozzleY, T.radius * Math.sin(na)).addScaledVector(d, T.nozzleLen);
  const Y = T.nozzleY;
  const at = (u, across, y) => O.clone().addScaledVector(d, u).addScaledVector(w, across).setY(y);
  const height = (u) => {
    const k = Math.min(1, Math.max(0, (u - S.spool) / (S.length - S.spool)));
    return S.h0 + (S.h1 - S.h0) * k;
  };
  const half = S.channel * 0.5 + S.vaneOut;     /* the plates' half width */
  const slope = (S.h0 - S.h1) * 0.5 / (S.length - S.spool);
  const group = new THREE.Group();
  scene.add(group);
  const plateMat = member.clone();
  plateMat.side = THREE.DoubleSide;
  const groups = [];
  const seams = [];

  /* The mating flanges, nozzle side and device side, and the spool. */
  for (const u of [-0.02, 0.02]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(T.nozzleR + 0.12, T.nozzleR + 0.12, 0.035, 40), member);
    fl.position.copy(at(u, 0, Y));
    fl.quaternion.setFromUnitVectors(up, d);
    group.add(fl);
  }
  {
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(T.nozzleR, T.nozzleR, S.spool, 28, 1, true), plateMat);
    sp.position.copy(at(S.spool * 0.5, 0, Y));
    sp.quaternion.setFromUnitVectors(up, d);
    group.add(sp);
  }
  groups.push({
    name: 'inlet nozzle flange',
    zone: 'schoep',
    size: 0.0185,
    items: boltCircle(at(0.0375, 0, Y), T.nozzleR + 0.075, 16, w, up, d, Math.PI / 16),
  });

  /* The box: a front plate round the spool, top and bottom plates sloping
   * toward each other, the end plate. Plates are thin boxes. */
  const L = S.length - S.spool;
  const rot = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
  for (const sgn of [1, -1]) {
    const mid = at(S.spool + L * 0.5, 0, Y + sgn * ((S.h0 + S.h1) * 0.25 + S.plate * 0.5));
    const pl = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(L, (S.h0 - S.h1) * 0.5), S.plate, half * 2), member);
    pl.position.copy(mid);
    pl.quaternion.copy(rot);
    /* The pitch: the top plate falls toward the end, the bottom rises. */
    pl.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sgn * Math.atan(slope)));
    group.add(pl);
  }
  {
    const front = new THREE.Mesh(new THREE.BoxGeometry(S.plate, S.h0, half * 2), member);
    front.position.copy(at(S.spool, 0, Y));
    front.quaternion.copy(rot);
    group.add(front);
    const end = new THREE.Mesh(new THREE.BoxGeometry(S.plate, S.h1, half * 2), member);
    end.position.copy(at(S.length, 0, Y));
    end.quaternion.copy(rot);
    group.add(end);
  }

  /* VANES: curved plates down both sides, root on the channel, tip out and
   * downstream, each spanning plate to plate. Built as one strip geometry. */
  {
    const pos = [];
    const idx = [];
    const SEG = 6;
    let vane = 0;
    for (let u = S.spool + 0.18; u < S.length - 0.12; u += S.vanePitch) {
      vane += 1;
      for (const sd of [-1, 1]) {
        const base = pos.length / 3;
        for (let i = 0; i <= SEG; i += 1) {
          const k = i / SEG;
          /* A quarter of a circle, flattened: tangent along d at the root,
           * turned well out by the tip. */
          const uu = u + 0.14 * Math.sin(k * Math.PI * 0.5);
          const ww = sd * (S.channel * 0.5 + S.vaneOut * (1 - Math.cos(k * Math.PI * 0.5)));
          const h = height(uu);
          const lo = at(uu, ww, Y - h * 0.5);
          const hi = at(uu, ww, Y + h * 0.5);
          pos.push(lo.x, lo.y, lo.z, hi.x, hi.y, hi.z);
        }
        for (let i = 0; i < SEG; i += 1) {
          const a = base + i * 2;
          idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
        }
        /* Bolted to both plates by a clip at the tip. */
        const tipU = u + 0.13;
        const tipW = sd * (S.channel * 0.5 + S.vaneOut * 0.85);
        const h = height(tipU);
        const sideName = sd < 0 ? 'left' : 'right';
        const nTop = up.clone().addScaledVector(d, slope).normalize();
        const nBot = up.clone().multiplyScalar(-1).addScaledVector(d, slope).normalize();
        groups.push({
          name: `schoepentoeter vane ${vane} ${sideName}, top`,
          zone: 'schoep-top',
          size: 0.011,
          items: [{ p: at(tipU, tipW, Y + h * 0.5 + S.plate), n: nTop }],
        });
        groups.push({
          name: `schoepentoeter vane ${vane} ${sideName}, underside`,
          zone: 'schoep-bottom',
          size: 0.011,
          items: [{ p: at(tipU, tipW, Y - h * 0.5 - S.plate), n: nBot }],
        });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    group.add(new THREE.Mesh(geo, plateMat));
  }

  /* SUPPORT LEGS near the end: pipe legs to the floor on bolted base
   * plates, clamped to the bottom plate by a saddle bolted from below. */
  const legs = [];
  {
    const hu = height(S.legU);
    const yb = Y - hu * 0.5 - S.plate;
    for (const sd of [-1, 1]) {
      const ww = sd * half * 0.6;
      const foot = at(S.legU, ww, 0);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, yb - 0.02, 12), member);
      leg.position.copy(foot).setY((yb - 0.02) * 0.5 + 0.012);
      group.add(leg);
      const bp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.2), member);
      bp.position.copy(foot).setY(0.006);
      bp.quaternion.copy(rot);
      group.add(bp);
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.12), member);
      saddle.position.copy(at(S.legU, ww, yb - 0.01));
      saddle.quaternion.copy(rot);
      group.add(saddle);
      const sideName = sd < 0 ? 'left' : 'right';
      const base = [];
      for (const du of [-0.07, 0.07]) {
        for (const dw of [-0.07, 0.07]) {
          base.push({ p: at(S.legU + du, ww + dw, 0.012), n: up.clone() });
        }
      }
      groups.push({ name: `schoepentoeter support leg ${sideName}, base`, zone: 'floor', size: 0.014, items: base });
      groups.push({
        name: `schoepentoeter support leg ${sideName}, saddle`,
        zone: 'schoep-bottom',
        size: 0.012,
        items: [-0.055, 0.055].map((du) => ({ p: at(S.legU + du, ww, yb - 0.02), n: up.clone().multiplyScalar(-1) })),
      });
      legs.push({ kind: 'pole', a: foot.clone(), b: foot.clone().setY(yb), r: 0.06 });
    }
  }

  /* SEAMS on the plates: a centre seam the length of each plate, where
   * the two halves are butt welded, and the transverse splices. The top's
   * normal leans back up the slope; the bottom's down it. */
  for (const sgn of [1, -1]) {
    const zone = sgn > 0 ? 'schoep-top' : 'schoep-bottom';
    const face = sgn > 0 ? 'top plate' : 'underside';
    const n = up.clone().multiplyScalar(sgn).addScaledVector(d, slope).normalize();
    const surfY = (u) => Y + sgn * (height(u) * 0.5 + S.plate);
    const t0 = d.clone().addScaledVector(up, -sgn * slope).normalize();
    const lenC = L - 0.02;
    const snapPlate = (v) => {
      /* Onto the plate: its height at v's distance along d. */
      const u = v.clone().sub(O).dot(d);
      v.y = surfY(u);
      return v;
    };
    seams.push(seam(`schoepentoeter ${face}, centre seam`, zone, lenC, BEAD_PLATE, true, (s, f) => {
      const u = S.spool + 0.01 + s;
      f.p.copy(at(u, 0, surfY(u)));
      f.t.copy(t0);
      f.n.copy(n);
    }, snapPlate));
    S.splices.forEach((su, k) => {
      const wlen = half * 2 - 0.02;
      seams.push(seam(`schoepentoeter ${face}, splice ${k + 1}`, zone, wlen, BEAD_PLATE, true, (s, f) => {
        f.p.copy(at(su, -half + 0.01 + s, surfY(su)));
        f.t.copy(w);
        f.n.copy(n);
      }, snapPlate));
    });
  }

  /*
   * SOLIDS. The box is axis aligned when the nozzle is (the default tank's
   * is, on -z), so the colliders are boxes over steps along u, each as
   * tall as its spool end, which overstates the taper by at most
   * (h0 - h1) / steps / 2, under 3 cm. If the nozzle is ever turned off an
   * axis the bounds still hold, only looser.
   */
  const boxes = [];
  const STEPS = 6;
  for (let i = 0; i < STEPS; i += 1) {
    const ua = S.spool + (L * i) / STEPS;
    const ub = S.spool + (L * (i + 1)) / STEPS;
    const hh = height(ua) * 0.5 + S.plate;
    const pts = [];
    for (const u of [ua, ub]) {
      for (const sw of [-half, half]) {
        for (const yy of [Y - hh, Y + hh]) {
          pts.push(at(u, sw, yy));
        }
      }
    }
    const bb = new THREE.Box3().setFromPoints(pts);
    boxes.push(bb);
  }
  const poles = [
    /* The flanges and the spool. */
    { kind: 'pole', a: at(-0.04, 0, Y), b: at(0.04, 0, Y), r: T.nozzleR + 0.12 },
    { kind: 'pole', a: at(0, 0, Y), b: at(S.spool, 0, Y), r: T.nozzleR },
    ...legs,
  ];

  return { group, groups, seams, boxes, poles, frame: { O, d, w, Y, height, half } };
}
