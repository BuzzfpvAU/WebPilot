/*
 * ballast/defects.js: the faults a ballast tank inspection is sent to find.
 *
 * The owner chose all four on 2026-10-01, and they are the findings a
 * ballast tank survey writes up:
 *
 *   COATING BREAKDOWN  the epoxy failed and the steel rusting through it,
 *                      most often at edges: round a lightening hole, along
 *                      the foot or the head of a plate
 *   PITTING            clusters of corrosion pits on the bottom shell,
 *                      where water and sludge lie between the longitudinals
 *   CRACK AT A BRACKET TOE
 *                      a fatigue crack running from the sharp end of a
 *                      bracket into the floor or the longitudinal it is on,
 *                      the classic double bottom finding
 *   BUCKLED OR HOLED STIFFENER
 *                      a longitudinal bent out of line between two floors,
 *                      or wasted through by corrosion
 *
 * Every run rolls a new set from a seed, six to ten, none within 0.8 m of
 * another, at least one crack and one patch of pitting. Found is
 * photographed, by the same rule as the storage tank (inspect/decals.js):
 * in the middle of the frame, near enough for its kind, seen from its side
 * (a stiffener's either side), nothing in between.
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

import { canvasTexture, decal, defectsSeen, haloTexture, ribbon } from '../inspect/decals.js';
import { lcg } from '../tank/hardware.js';
import { DB } from './index.js';

const RANGE = { coating: 3.0, pitting: 1.5, crack: 1.5, buckled: 2.5, holed: 2.0 };
const LABEL = {
  coating: 'Coating breakdown',
  pitting: 'Pitting',
  crack: 'Crack at bracket toe',
  buckled: 'Buckled stiffener',
  holed: 'Holed stiffener',
};
const KINDS = [
  ['coating', 0.3],
  ['pitting', 0.2],
  ['crack', 0.25],
  ['buckled', 0.12],
  ['holed', 0.13],
];
const SPACING = 0.8;

/* Rust through failed paint: a ragged patch, darker and pitted in the
 * middle, a rim of lifted, blistered coating round it. Alpha is the shape. */
function coatingTexture(seed) {
  const rnd = lcg(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = w * 0.32 * Math.sqrt(rnd());
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r * 0.8;
      const rr = w * (0.04 + rnd() * 0.09);
      g.fillStyle = `rgba(${200 + Math.floor(rnd() * 30)},${196 + Math.floor(rnd() * 30)},178,0.9)`;
      g.beginPath();
      g.arc(x, y, rr * 1.18, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 90; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = w * 0.3 * Math.sqrt(rnd());
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r * 0.8;
      const rr = w * (0.03 + rnd() * 0.08);
      const v = rnd();
      g.fillStyle = v < 0.4 ? 'rgba(92,40,14,1)' : v < 0.8 ? 'rgba(140,64,22,1)' : 'rgba(176,96,40,1)';
      g.beginPath();
      g.arc(x, y, rr, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 160; i += 1) {
      g.fillStyle = `rgba(40,18,8,${0.4 + rnd() * 0.5})`;
      g.beginPath();
      g.arc(w / 2 + (rnd() - 0.5) * w * 0.45, h / 2 + (rnd() - 0.5) * h * 0.35, 0.8 + rnd() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/* Pits: dark craters in rust rings, in a cluster that thins out. */
function pittingTexture(seed) {
  const rnd = lcg(seed);
  return canvasTexture(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 120; i += 1) {
      const a = rnd() * Math.PI * 2;
      const r = w * 0.42 * Math.pow(rnd(), 0.7);
      const x = w / 2 + Math.cos(a) * r;
      const y = h / 2 + Math.sin(a) * r;
      const rr = 2 + rnd() * 6;
      const gr = g.createRadialGradient(x, y, rr * 0.3, x, y, rr * 2.2);
      gr.addColorStop(0, 'rgba(126,58,20,0.9)');
      gr.addColorStop(1, 'rgba(126,58,20,0)');
      g.fillStyle = gr;
      g.fillRect(x - rr * 2.2, y - rr * 2.2, rr * 4.4, rr * 4.4);
      g.fillStyle = 'rgba(22,12,6,0.95)';
      g.beginPath();
      g.arc(x, y, rr * 0.75, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/* A hole wasted through a web: black, ragged, with a thin rust rim. */
function holeTexture(seed) {
  const rnd = lcg(seed);
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const pts = [];
    for (let i = 0; i < 18; i += 1) {
      const a = (i / 18) * Math.PI * 2;
      const r = w * (0.26 + rnd() * 0.14);
      pts.push([w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.75]);
    }
    const poly = (scale, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      pts.forEach(([x, y], i) => {
        const px = w / 2 + (x - w / 2) * scale;
        const py = h / 2 + (y - h / 2) * scale;
        if (i === 0) {
          g.moveTo(px, py);
        } else {
          g.lineTo(px, py);
        }
      });
      g.closePath();
      g.fill();
    };
    poly(1.35, 'rgba(150,70,24,0.9)');
    poly(1.0, 'rgba(6,5,4,1)');
  });
}

export function createBallastDefects({ scene, structure }) {
  const st = structure;
  const root = new THREE.Group();
  root.name = 'defects';
  scene.add(root);
  const revealRoot = new THREE.Group();
  scene.add(revealRoot);
  const coatTex = [coatingTexture(0xc0a71), coatingTexture(0xc0a72), coatingTexture(0xc0a73)];
  const pitTex = [pittingTexture(0x9171), pittingTexture(0x9172)];
  const holeTex = holeTexture(0x401e);
  const coatMats = coatTex.map((map) => decal({ map, transparent: true, alphaTest: 0.05, roughness: 1 }));
  const pitMats = pitTex.map((map) => decal({ map, transparent: true, alphaTest: 0.05, roughness: 1 }));
  const holeMat = decal({ map: holeTex, transparent: true, alphaTest: 0.05, roughness: 1, side: THREE.DoubleSide });
  const crackCore = decal({ color: 0x050403, roughness: 1, opacity: 1, transparent: false });
  const crackHalo = decal({ color: 0x3a1a0a, alphaMap: haloTexture(), opacity: 0.95 });
  const revealMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.95 });
  const revealGeo = new THREE.TorusGeometry(0.14, 0.014, 6, 28);

  let seed = 0;
  let active = [];
  const H = DB.height;

  function clear() {
    for (const c of [...root.children]) {
      root.remove(c);
      c.geometry.dispose();
    }
    for (const c of [...revealRoot.children]) {
      revealRoot.remove(c);
    }
  }

  function pick(rnd, list) {
    return list[Math.floor(rnd() * list.length)];
  }

  function pickKind(rnd) {
    let x = rnd();
    for (const [k, w] of KINDS) {
      x -= w;
      if (x <= 0) {
        return k;
      }
    }
    return 'coating';
  }

  /* A point on a plate face, in the coating's favourite places. */
  function coatingSite(rnd) {
    const total = st.faces.reduce((a, f) => a + f.hu * f.hv, 0);
    let x = rnd() * total;
    let f = st.faces[0];
    for (const c of st.faces) {
      x -= c.hu * c.hv;
      if (x <= 0) {
        f = c;
        break;
      }
    }
    let u;
    let v;
    if (f.kind === 'top') {
      /* Between the tank top's longitudinals, where the coating is. */
      const s = pick(rnd, st.strips);
      u = s.x0 + rnd() * (s.x1 - s.x0);
      v = s.z0 + 0.08 + rnd() * (s.z1 - s.z0 - 0.16);
      return { face: f, p: new THREE.Vector3(u, H - 0.0006, v) };
    }
    const hy = DB.hole.y - H / 2;
    const r = rnd();
    if (f.hole && r < 0.45) {
      /* Round the rim of the lightening hole. */
      const a = rnd() * Math.PI * 2;
      u = Math.cos(a) * (DB.hole.w / 2 + 0.07);
      v = hy + Math.sin(a) * (DB.hole.h / 2 + 0.07);
    } else if (r < 0.75) {
      /* Along the foot or the head of the plate, clear of the
       * longitudinals' slots. */
      u = (rnd() * 2 - 1) * (f.hu - 0.25);
      v = (rnd() < 0.5 ? -1 : 1) * (H / 2 - DB.longDepth - 0.12);
    } else {
      u = (rnd() * 2 - 1) * (f.hu - 0.2);
      v = (rnd() * 2 - 1) * (H / 2 - DB.longDepth - 0.1);
      if (f.hole && Math.abs(u) < DB.hole.w / 2 + 0.08 && Math.abs(v - hy) < DB.hole.h / 2 + 0.08) {
        return null;
      }
    }
    const p = f.c.clone().addScaledVector(f.u, u).addScaledVector(f.v, v).addScaledVector(f.n, 0.0006);
    return { face: f, p };
  }

  function addDecal(p, n, size, mat, rnd) {
    const g = new THREE.PlaneGeometry(size, size * (0.75 + rnd() * 0.3));
    const m = new THREE.Mesh(g, mat);
    m.position.copy(p);
    m.lookAt(p.clone().add(n));
    m.rotateZ(rnd() * Math.PI * 2);
    root.add(m);
  }

  function crackAlong(start, dir, across, n, len, rnd, lift) {
    const pts = [];
    const nrm = [];
    const N = Math.max(6, Math.ceil(len / 0.006));
    let off = 0;
    for (let i = 0; i <= N; i += 1) {
      off = Math.max(-0.012, Math.min(0.012, off + (rnd() - 0.5) * 0.004));
      pts.push(start.clone().addScaledVector(dir, (len * i) / N).addScaledVector(across, off).addScaledVector(n, lift));
      nrm.push(n.clone());
    }
    root.add(new THREE.Mesh(ribbon(pts, nrm, 0.026, 0.0004), crackHalo));
    root.add(new THREE.Mesh(ribbon(pts, nrm, 0.005, 0.0009), crackCore));
  }

  function makeSite(rnd, kind, taken) {
    if (kind === 'coating') {
      const s = coatingSite(rnd);
      if (!s) {
        return null;
      }
      return { type: kind, where: s.face.name, pos: s.p, n: s.face.n.clone(), size: 0.16 + rnd() * 0.24 };
    }
    if (kind === 'pitting') {
      const s = pick(rnd, st.strips);
      const p = new THREE.Vector3(s.x0 + rnd() * (s.x1 - s.x0), 0.0007, s.z0 + 0.1 + rnd() * (s.z1 - s.z0 - 0.2));
      return {
        type: kind, where: `bottom shell, bay ${s.bay + 1} fore and aft`, pos: p,
        n: new THREE.Vector3(0, 1, 0), size: 0.14 + rnd() * 0.16,
      };
    }
    if (kind === 'crack') {
      const b = pick(rnd, st.brackets);
      const onFloor = rnd() < 0.55;
      if (onFloor) {
        return {
          type: kind, where: `${b.name}, into the floor`, bracket: b, onFloor,
          pos: b.toeF.clone().add(new THREE.Vector3(b.side * 0.001, 0, 0)), n: new THREE.Vector3(b.side, 0, 0),
        };
      }
      return {
        type: kind, where: `${b.name}, into the longitudinal`, bracket: b, onFloor,
        pos: b.toeL.clone(), n: null,
      };
    }
    /* Buckled or holed: a stiffener segment, not one already used. */
    const k = Math.floor(rnd() * st.stiffeners.list.length);
    if (taken.some((d) => d.seg === k)) {
      return null;
    }
    const L = st.stiffeners.list[k];
    const where = `${L.top ? 'tank top' : 'bottom'} longitudinal at ${L.z.toFixed(1)} m, bay ${L.bay + 1} fore and aft`;
    if (kind === 'buckled') {
      return {
        type: kind, where, seg: k, L, n: null,
        pos: new THREE.Vector3((L.x0 + L.x1) / 2, L.edge, L.z), amp: 0.04 + rnd() * 0.04,
      };
    }
    const x = L.x0 + 0.3 + rnd() * (L.x1 - L.x0 - 0.6);
    return { type: kind, where, seg: k, L, n: null, pos: new THREE.Vector3(x, L.y, L.z), size: 0.09 + rnd() * 0.05 };
  }

  function draw(d, rnd) {
    if (d.type === 'coating') {
      addDecal(d.pos, d.n, d.size, pick(rnd, coatMats), rnd);
    } else if (d.type === 'pitting') {
      addDecal(d.pos, d.n, d.size, pick(rnd, pitMats), rnd);
    } else if (d.type === 'crack') {
      const b = d.bracket;
      const len = 0.06 + rnd() * 0.1;
      if (d.onFloor) {
        /* From the toe on, the way the bracket was pointing, on its face
         * of the floor. */
        const dir = new THREE.Vector3(0, b.top ? -1 : 1, 0);
        crackAlong(b.toeF, dir, new THREE.Vector3(0, 0, 1), d.n, len, rnd, DB.t / 2);
      } else {
        /* Down into the longitudinal's web from its free edge, on both
         * faces of it. */
        const dir = new THREE.Vector3(0, b.top ? 1 : -1, 0);
        for (const sd of [-1, 1]) {
          crackAlong(b.toeL, dir, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, sd),
            Math.min(len, DB.longDepth * 0.8), rnd, DB.longT / 2);
        }
      }
    } else if (d.type === 'buckled') {
      /* The segment bent sideways, most at its free edge and mid span,
       * the shape a stiffener takes when it trips. */
      const L = d.L;
      const len = L.x1 - L.x0;
      const g = new THREE.BoxGeometry(len, DB.longDepth, DB.longT, 24, 4, 1);
      const pos = g.getAttribute('position');
      const sgn = rnd() < 0.5 ? -1 : 1;
      for (let i = 0; i < pos.count; i += 1) {
        const u = (pos.getX(i) + len / 2) / len;
        const free = L.top ? (DB.longDepth / 2 - pos.getY(i)) / DB.longDepth : (pos.getY(i) + DB.longDepth / 2) / DB.longDepth;
        pos.setZ(i, pos.getZ(i) + sgn * d.amp * Math.pow(Math.sin(Math.PI * u), 2) * free);
      }
      g.computeVertexNormals();
      const web = new THREE.Mesh(g, st.stiffeners.material);
      web.position.set((L.x0 + L.x1) / 2, L.y, L.z);
      root.add(web);
      const curve = new THREE.CatmullRomCurve3(Array.from({ length: 13 }, (_, i) => {
        const u = i / 12;
        return new THREE.Vector3(L.x0 + len * u, L.edge, L.z + sgn * d.amp * Math.pow(Math.sin(Math.PI * u), 2));
      }));
      root.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, DB.bulbR, 8, false), st.stiffeners.material));
      d.pos.z += sgn * d.amp;
    } else if (d.type === 'holed') {
      const g = new THREE.PlaneGeometry(d.size * 1.4, d.size);
      const m = new THREE.Mesh(g, holeMat);
      m.position.copy(d.pos);
      root.add(m);
      /* Both faces: the plane is double sided and sits in the web, lifted
       * a hair either side by a second copy. */
      for (const sd of [-1, 1]) {
        const c = new THREE.Mesh(g.clone(), holeMat);
        c.position.copy(d.pos).add(new THREE.Vector3(0, 0, sd * (DB.longT / 2 + 0.0008)));
        root.add(c);
      }
    }
  }

  function roll(newSeed) {
    seed = (Number.isFinite(newSeed) ? newSeed : Math.floor(Math.random() * 4294967296)) >>> 0;
    const rnd = lcg(seed ^ 0x51ab11a5);
    clear();
    const count = 6 + Math.floor(rnd() * 5);
    const want = ['crack', 'pitting'];
    active = [];
    let tries = 0;
    while (active.length < count && tries < 400) {
      tries += 1;
      const kind = want.length ? want[0] : pickKind(rnd);
      const d = makeSite(rnd, kind, active);
      if (!d || active.some((o) => o.pos.distanceTo(d.pos) < SPACING)) {
        continue;
      }
      if (want.length) {
        want.shift();
      }
      d.id = active.length + 1;
      d.range = RANGE[d.type];
      d.label = `${LABEL[d.type]}: ${d.where}`;
      active.push(d);
    }
    for (const d of active) {
      draw(d, rnd);
    }
    st.stiffeners.setHidden(active.filter((d) => d.type === 'buckled').map((d) => d.seg));
    return list();
  }

  function list() {
    return active.map((d) => ({
      id: d.id,
      type: d.type,
      label: d.label,
      zone: d.type,
      pos: d.pos.toArray(),
      n: d.n ? d.n.toArray() : null,
      range: d.range,
    }));
  }

  function seen(camera, occluders) {
    return defectsSeen(active, camera, occluders);
  }

  /* Red rings on the ones listed, facing out of their surfaces, or up
   * for a stiffener. */
  function reveal(ids) {
    for (const d of active) {
      if (!ids.includes(d.id)) {
        continue;
      }
      const n = d.n || new THREE.Vector3(0, d.L && d.L.top ? -1 : 1, 0);
      const ring = new THREE.Mesh(revealGeo, revealMat);
      ring.position.copy(d.pos).addScaledVector(n, 0.03);
      ring.lookAt(ring.position.clone().add(n));
      revealRoot.add(ring);
    }
  }

  return {
    roll,
    list,
    seen,
    reveal,
    seed: () => seed,
  };
}
