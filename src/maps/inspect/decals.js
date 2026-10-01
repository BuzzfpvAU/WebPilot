/*
 * inspect/decals.js: what every inspection world's defects are drawn with,
 * and the one answer to "which defects does this photograph show".
 *
 * Moved out of src/maps/tank/defects.js when the ballast tank became the
 * second inspection world, so both vessels' defects are drawn by the same
 * hand and found by the same rule.
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

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* A soft band across v, for the halo either side of a crack. */
export function haloTexture() {
  return canvasTexture(4, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
  });
}

export const decal = (opts) => new THREE.MeshStandardMaterial({
  roughness: 0.95,
  metalness: 0.1,
  transparent: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
  ...opts,
});

/*
 * A ribbon along a polyline on a surface: pts and normals per point,
 * width in metres, lifted off the surface by `lift`. u runs along, v
 * across.
 */
export function ribbon(pts, normals, width, lift) {
  const pos = [];
  const uv = [];
  const idx = [];
  const side = new THREE.Vector3();
  const along = new THREE.Vector3();
  const v = new THREE.Vector3();
  let u = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    along.subVectors(b, a).normalize();
    side.crossVectors(normals[i], along).normalize();
    if (i > 0) {
      u += pts[i].distanceTo(pts[i - 1]);
    }
    for (const sgn of [-1, 1]) {
      v.copy(pts[i]).addScaledVector(side, sgn * width * 0.5).addScaledVector(normals[i], lift);
      pos.push(v.x, v.y, v.z);
      uv.push(u / width, sgn < 0 ? 0 : 1);
    }
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/* Half the frame each way, in normalised device coordinates. */
const CENTRE = 0.7;
/* The cosine of the steepest angle a defect can be seen at off its face. */
const FACING = 0.2;

const ray = new THREE.Raycaster();
const cp = new THREE.Vector3();
const to = new THREE.Vector3();
const tmp = new THREE.Vector3();

/*
 * Which of `active` the camera's current frame shows, as { id, dist, pos }.
 * A defect is shown when it is inside the middle 70% of the frame, no
 * further than its own `range`, looked at from its own side (`n`, its
 * surface's normal; null for a defect that shows from either side, a bent
 * stiffener's), and nothing in `occluders` stands between.
 */
export function defectsSeen(active, camera, occluders) {
  camera.updateMatrixWorld();
  cp.setFromMatrixPosition(camera.matrixWorld);
  const out = [];
  for (const d of active) {
    tmp.copy(d.pos).project(camera);
    if (tmp.z < -1 || tmp.z > 1 || Math.abs(tmp.x) > CENTRE || Math.abs(tmp.y) > CENTRE) {
      continue;
    }
    to.subVectors(cp, d.pos);
    const dist = to.length();
    if (dist > d.range || dist < 0.2) {
      continue;
    }
    to.divideScalar(dist);
    if (d.n && to.dot(d.n) < FACING) {
      continue;
    }
    ray.set(cp, to.clone().negate());
    ray.near = 0;
    ray.far = dist - 0.03;
    if (ray.intersectObjects(occluders, false).length) {
      continue;
    }
    out.push({ id: d.id, dist, pos: d.pos.toArray() });
  }
  return out;
}
