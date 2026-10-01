/*
 * tank/defects.js: the faults an inspection flight is sent to find.
 *
 * WHAT THEY ARE. Three things an inspector of a tank like this one writes
 * up: a CORRODED WELD (a stretch of bead grown fat and lumpy with rust, a
 * stain weeping from it), a CRACKED WELD (along the crown or across the
 * bead from toe to toe, a dark line in a rust halo), and a MISSING BOLT
 * (the nut gone from a flange, a clip or a stand, the hole and the clean
 * footprint of the washer left). They sit on the same seams and bolt groups
 * as the tank's sound welds and bolts (hardware.js), so a defect is the
 * hardware gone wrong and never a sticker on a blank wall.
 *
 * EVERY FLIGHT ROLLS A NEW SET from a seed, six to ten of them, at least
 * one on the schoepentoeter's top and one on its underside, none within
 * 0.8 m of another. The seed is reported, so a set can be flown again.
 * Nothing here is physics: this is the world's paint and the photo
 * grader's answer key, and it reads no frame time.
 *
 * FOUND IS PHOTOGRAPHED. seen(camera) is asked straight after a photo's
 * frame is drawn, with that frame's camera, and answers which defects that
 * photo shows: inside the middle 70% of the frame, near enough for its
 * kind (a crack has to be close), looked at from the side it is on (the
 * top of a plate is not seen from under it), and with nothing solid in
 * between. The grader in src/game/inspection.js decides whether the photo
 * was good enough to count.
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

import { lcg, newFrame, seamPoint, sweepBeads } from './hardware.js';
import { canvasTexture, decal, defectsSeen, haloTexture, ribbon } from '../inspect/decals.js';

/* How close the camera must be for a photo to show each kind, metres. */
const RANGE = { crack: 1.5, rust: 3.0, bolt: 2.0 };
const LABEL = { crack: 'Cracked weld', rust: 'Corroded weld', bolt: 'Missing bolt' };
const SPACING = 0.8;
/* How often a pick lands in each zone. The schoepentoeter's two faces get
 * one each before these apply. */
const ZONES = [
  ['shell', 0.38],
  ['floor', 0.2],
  ['schoep-top', 0.14],
  ['schoep-bottom', 0.14],
  ['roof', 0.08],
  ['schoep', 0.06],
];

/* Scale and pitting: the colour of a weld that has been wet for years. */
function rustTexture() {
  const rnd = lcg(0x0c0ffee);
  return canvasTexture(128, 64, (g, w, h) => {
    g.fillStyle = '#7a3a16';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) {
      const v = rnd();
      g.fillStyle = v < 0.35 ? `rgba(40,18,8,${0.3 + rnd() * 0.5})`
        : v < 0.75 ? `rgba(160,78,30,${0.3 + rnd() * 0.4})` : `rgba(190,110,50,${0.2 + rnd() * 0.3})`;
      g.beginPath();
      g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/* A stain, white where it is heaviest, as an alpha map. `streak` runs it
 * down from the top edge, the way rust weeps down a wall; otherwise it is a
 * blotch spreading from the middle. */
function stainTexture(streak, seed) {
  const rnd = lcg(seed);
  return canvasTexture(128, 128, (g, w, h) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h);
    if (streak) {
      for (let i = 0; i < 26; i += 1) {
        const x = w * (0.2 + rnd() * 0.6);
        const len = h * (0.25 + rnd() * 0.7);
        const gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, `rgba(255,255,255,${0.5 + rnd() * 0.4})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(x, 0, 2 + rnd() * 6, len);
      }
      const top = g.createRadialGradient(w / 2, 0, 2, w / 2, 0, w * 0.4);
      top.addColorStop(0, 'rgba(255,255,255,0.9)');
      top.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = top;
      g.fillRect(0, 0, w, h * 0.5);
    } else {
      for (let i = 0; i < 40; i += 1) {
        const r = w * (0.05 + rnd() * 0.2);
        const x = w / 2 + (rnd() - 0.5) * w * 0.5;
        const y = h / 2 + (rnd() - 0.5) * h * 0.5;
        const gr = g.createRadialGradient(x, y, 1, x, y, r);
        gr.addColorStop(0, `rgba(255,255,255,${0.3 + rnd() * 0.4})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, w, h);
      }
    }
  });
}

/*
 * A patch on the seam's parent surface centred at c, laid out along e1
 * (rows) and e2 (columns), snapped point by point so it follows the shell's
 * curve. sy runs from -0.15 sy to 0.85 sy along e1 when `hang` is set, so a
 * streak starts at the weld and runs away from it.
 */
function patch(sm, c, n, e1, e2, sx, sy, hang, lift) {
  const N = 8;
  const pos = [];
  const uv = [];
  const idx = [];
  const v = new THREE.Vector3();
  for (let j = 0; j <= N; j += 1) {
    for (let i = 0; i <= N; i += 1) {
      const x = (i / N - 0.5) * sx;
      const y = hang ? (j / N - 0.15) * sy : (j / N - 0.5) * sy;
      v.copy(c).addScaledVector(e2, x).addScaledVector(e1, y);
      sm.snap(v);
      v.addScaledVector(n, lift);
      pos.push(v.x, v.y, v.z);
      uv.push(i / N, 1 - j / N);
    }
  }
  for (let j = 0; j < N; j += 1) {
    for (let i = 0; i < N; i += 1) {
      const a = j * (N + 1) + i;
      const b = a + N + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/*
 * seams and groups are hardware.js's. bolts is boltMeshes' result.
 * blocked(p) says a weld point is under something a defect cannot be seen
 * past (the ladder, the manway, the nozzle's bore).
 */
export function createDefects({ scene, seams, groups, bolts, blocked }) {
  const root = new THREE.Group();
  root.name = 'defects';
  scene.add(root);
  const revealRoot = new THREE.Group();
  scene.add(revealRoot);
  const rustMat = new THREE.MeshStandardMaterial({ map: rustTexture(), roughness: 1, metalness: 0.1 });
  rustMat.bumpMap = rustMat.map;
  rustMat.bumpScale = 2;
  const streakTex = stainTexture(true, 0x5eed1);
  const blotchTex = stainTexture(false, 0x5eed2);
  const stainStreak = decal({ color: 0x4e2410, alphaMap: streakTex, opacity: 0.8 });
  const stainBlotch = decal({ color: 0x46200e, alphaMap: blotchTex, opacity: 0.7 });
  const crackCore = decal({ color: 0x050403, roughness: 1, opacity: 1, transparent: false });
  const crackHalo = decal({ color: 0x2e160a, alphaMap: haloTexture(), opacity: 0.95 });
  const holeMat = decal({ color: 0x050403, transparent: false });
  const footMat = decal({ color: 0x6a655e, transparent: false, roughness: 0.55, metalness: 0.5 });
  const revealMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.95 });
  const revealGeo = new THREE.TorusGeometry(0.14, 0.014, 6, 28);
  const holeGeo = new THREE.CircleGeometry(1, 20);

  const byZone = new Map();
  for (const sm of seams) {
    if (sm.noDefects || sm.len < 0.6) {
      continue;
    }
    if (!byZone.has(sm.zone)) {
      byZone.set(sm.zone, { seams: [], groups: [] });
    }
    byZone.get(sm.zone).seams.push(sm);
  }
  for (const g of groups) {
    if (!byZone.has(g.zone)) {
      byZone.set(g.zone, { seams: [], groups: [] });
    }
    byZone.get(g.zone).groups.push(g);
  }

  let seed = 0;
  let active = [];
  const f = newFrame();

  function clear() {
    for (const c of [...root.children]) {
      root.remove(c);
      c.geometry.dispose();
    }
    for (const c of [...revealRoot.children]) {
      revealRoot.remove(c);
    }
  }

  function pickZone(rnd) {
    let total = 0;
    for (const [z, wgt] of ZONES) {
      if (byZone.has(z)) {
        total += wgt;
      }
    }
    let x = rnd() * total;
    for (const [z, wgt] of ZONES) {
      if (!byZone.has(z)) {
        continue;
      }
      x -= wgt;
      if (x <= 0) {
        return z;
      }
    }
    return ZONES[0][0];
  }

  function pickSite(rnd, zone, taken) {
    const z = byZone.get(zone);
    if (!z) {
      return null;
    }
    const useBolt = z.groups.length && (!z.seams.length || rnd() < 0.35);
    if (useBolt) {
      const g = z.groups[Math.floor(rnd() * z.groups.length)];
      const k = Math.floor(rnd() * g.items.length);
      const id = g.first + k;
      if (taken.some((d) => d.type === 'bolt' && d.bolt === id)) {
        return null;
      }
      const it = g.items[k];
      return {
        type: 'bolt',
        bolt: id,
        group: g,
        item: it,
        where: g.name,
        pos: it.p.clone().addScaledVector(it.n, 0.004),
        n: it.n.clone(),
      };
    }
    let total = 0;
    for (const sm of z.seams) {
      total += sm.len;
    }
    let x = rnd() * total;
    let sm = z.seams[0];
    for (const c of z.seams) {
      x -= c.len;
      if (x <= 0) {
        sm = c;
        break;
      }
    }
    const s = 0.3 + rnd() * (sm.len - 0.6);
    sm.frame(s, f);
    return {
      type: rnd() < 0.45 ? 'crack' : 'rust',
      seam: sm,
      s,
      where: sm.name,
      pos: seamPoint(sm, s, 0, 0.002, new THREE.Vector3()),
      n: f.n.clone(),
    };
  }

  function drawRust(d, rnd) {
    const sm = d.seam;
    const len = 0.2 + rnd() * 0.3;
    const s0 = Math.max(0.02, d.s - len * 0.5);
    const s1 = Math.min(sm.len - 0.02, d.s + len * 0.5);
    const ph = [rnd() * 6.28, rnd() * 6.28, rnd() * 6.28];
    const lump = (s) => {
      const e = Math.min(1, (s - s0) / 0.04, (s1 - s) / 0.04);
      return Math.max(0.3, e) * (0.85 + 0.35 * Math.sin(s * 57 + ph[0]) * Math.sin(s * 23 + ph[1]) + 0.2 * Math.sin(s * 131 + ph[2]));
    };
    root.add(new THREE.Mesh(sweepBeads([{ seam: sm, s0, s1 }], 0.008, { scaleW: 1.35, scaleH: 1.7, lump }), rustMat));
    if (sm.fillet) {
      return;
    }
    /* The stain, weeping down a wall or spread round the weld on a floor or
     * a plate. */
    sm.frame(d.s, f);
    const n = f.n.clone();
    const down = new THREE.Vector3(0, -1, 0).addScaledVector(n, n.y);
    const hang = down.length() > 0.5;
    const e1 = hang ? down.normalize() : f.t.clone().cross(n).normalize();
    const e2 = n.clone().cross(e1).normalize();
    const c = f.p.clone();
    const sx = hang ? Math.max(0.25, len * 1.1) : len * 1.4;
    const sy = hang ? 0.35 + rnd() * 0.5 : len * 1.4;
    const geo = patch(sm, c, n, e1, e2, sx, sy, hang, 0.0008);
    root.add(new THREE.Mesh(geo, hang ? stainStreak : stainBlotch));
  }

  function drawCrack(d, rnd) {
    const sm = d.seam;
    const pts = [];
    const nrm = [];
    const across = rnd() < 0.4;
    if (across) {
      /* Toe to toe, and on into the plate either side, the way a crack
       * runs once it has left the weld. */
      let s = d.s;
      const reach = 3 + rnd() * 3;
      for (let i = 0; i <= 24; i += 1) {
        const a = -reach + (2 * reach * i) / 24;
        s += (rnd() - 0.5) * 0.008;
        pts.push(seamPoint(sm, s, a, 0, new THREE.Vector3()));
        sm.frame(s, f);
        nrm.push(f.n.clone());
      }
    } else {
      const len = 0.1 + rnd() * 0.16;
      let a = (rnd() - 0.5) * 0.3;
      const N = Math.ceil(len / 0.008);
      for (let i = 0; i <= N; i += 1) {
        const s = Math.max(0.01, Math.min(sm.len - 0.01, d.s - len * 0.5 + (len * i) / N));
        a = Math.max(-0.5, Math.min(0.5, a + (rnd() - 0.5) * 0.18));
        pts.push(seamPoint(sm, s, a, 0, new THREE.Vector3()));
        sm.frame(s, f);
        nrm.push(f.n.clone());
      }
    }
    root.add(new THREE.Mesh(ribbon(pts, nrm, 0.03, 0.0006), crackHalo));
    root.add(new THREE.Mesh(ribbon(pts, nrm, 0.006, 0.0011), crackCore));
  }

  function drawBolt(d) {
    const r = d.group.size;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.n);
    /* Each its own geometry, so clear() can dispose what it finds. */
    const foot = new THREE.Mesh(holeGeo.clone(), footMat);
    foot.scale.setScalar(r * 1.35);
    foot.quaternion.copy(q);
    foot.position.copy(d.item.p).addScaledVector(d.n, 0.0006);
    const hole = new THREE.Mesh(holeGeo.clone(), holeMat);
    hole.scale.setScalar(r * 0.7);
    hole.quaternion.copy(q);
    hole.position.copy(d.item.p).addScaledVector(d.n, 0.0010);
    root.add(foot, hole);
  }

  /* A new set. Returns it. */
  function roll(newSeed) {
    seed = (Number.isFinite(newSeed) ? newSeed : Math.floor(Math.random() * 4294967296)) >>> 0;
    const rnd = lcg(seed ^ 0x9e3779b9);
    clear();
    const count = 6 + Math.floor(rnd() * 5);
    const want = ['schoep-top', 'schoep-bottom'].filter((z) => byZone.has(z));
    active = [];
    let tries = 0;
    while (active.length < count && tries < 400) {
      tries += 1;
      const zone = want.length ? want[0] : pickZone(rnd);
      const d = pickSite(rnd, zone, active);
      if (!d) {
        continue;
      }
      /* A weld is never a site where something stands over it; a bolt is
       * on the thing that stands there. */
      if ((d.type !== 'bolt' && blocked(d.pos)) || active.some((o) => o.pos.distanceTo(d.pos) < SPACING)) {
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
      if (d.type === 'rust') {
        drawRust(d, rnd);
      } else if (d.type === 'crack') {
        drawCrack(d, rnd);
      } else {
        drawBolt(d);
      }
    }
    bolts.setMissing(active.filter((d) => d.type === 'bolt').map((d) => d.bolt));
    return list();
  }

  function list() {
    return active.map((d) => ({
      id: d.id,
      type: d.type,
      label: d.label,
      zone: d.seam ? d.seam.zone : d.group.zone,
      pos: d.pos.toArray(),
      n: d.n.toArray(),
      range: d.range,
    }));
  }

  /* Which defects the camera's current frame shows: inspect/decals.js. */
  function seen(camera, occluders) {
    return defectsSeen(active, camera, occluders);
  }

  /* Red rings on the ones listed, facing out of their surfaces. */
  function reveal(ids) {
    for (const d of active) {
      if (!ids.includes(d.id)) {
        continue;
      }
      const ring = new THREE.Mesh(revealGeo, revealMat);
      ring.position.copy(d.pos).addScaledVector(d.n, 0.02);
      ring.lookAt(ring.position.clone().add(d.n));
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
