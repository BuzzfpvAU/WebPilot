/*
 * ballast/index.js: a ship's double bottom ballast tank, the second
 * inspection world.
 *
 * WHAT IT IS. The space between a ship's bottom shell and its inner bottom
 * (the tank top), 1.6 m deep, divided into bays by transverse plate FLOORS
 * and longitudinal GIRDERS. Every internal floor and girder is pierced by a
 * LIGHTENING HOLE, 800 by 600 mm, which is the only way from one bay to the
 * next: the owner chose the realistic size on 2026-10-01, knowing a 50 cm
 * cage has 50 mm to spare top and bottom in it. Longitudinal stiffeners
 * (bulb flats) run fore and aft on the bottom shell and under the tank top,
 * 800 mm apart, through slots in the floors, and a bracket ties each one to
 * each floor. The plating is coated in the light epoxy a ballast tank is
 * painted with, which is what makes rust read in it. There is no light but
 * the aircraft's, and the way in is a manhole in the tank top, which is
 * where the tethered aircraft's cable comes down.
 *
 * Three.js frame (y up), metres, origin at the centre of the bottom shell's
 * top face: x fore and aft along the girders, z athwartships along the
 * floors. DB below is the only place a size lives.
 *
 * COLLIDERS are boxes: a holed plate is four boxes round its hole, so the
 * hole the plant flies through is the hole that is drawn, square cornered
 * where the drawing has a 60 mm radius. The brackets are not solid; they
 * stand inside the stiffeners' corner where a hull cannot reach without
 * touching the stiffener or the floor first.
 *
 * The defects are defects.js; everything an inspection world shares (the
 * aircraft's lights, the exposure, photographs, markers, the cable) is
 * inspect/world.js.
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
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { Colliders } from '../../game/collide.js';
import { qualityFor } from '../../render/quality.js';
import { yieldToPaint } from '../../ui/loading.js';
import { boxRay, gatherOccluders, inspectionWorld, prepareRenderer } from '../inspect/world.js';
import { lcg } from '../tank/hardware.js';
import { createBallastDefects } from './defects.js';

/* Everything a double bottom is, in metres. */
export const DB = {
  nx: 4,              /* bays fore and aft */
  nz: 3,              /* bays athwartships */
  bayX: 2.4,          /* floor spacing: three 800 mm frames */
  bayZ: 3.2,          /* girder spacing */
  height: 1.6,        /* bottom shell to tank top */
  t: 0.012,           /* plate */
  hole: { w: 0.8, h: 0.6, r: 0.06, y: 0.8 },
  longPitch: 0.8,     /* longitudinal spacing */
  longDepth: 0.18,    /* a 180 mm bulb flat */
  longT: 0.010,
  bulbR: 0.014,
  bracket: 0.25,      /* bracket legs */
  manhole: { x: -0.6, z: 0.4, w: 0.6, d: 0.4 },
  /* In the second bay aft, between two longitudinals, facing the girder
   * whose hole is the first one to fly through. */
  spawn: { x: -1.2, z: 0.4, yaw: 0 },
  tetherLength: 30,
};

const X0 = -(DB.nx * DB.bayX) / 2;
const Z0 = -(DB.nz * DB.bayZ) / 2;
const X1 = -X0;
const Z1 = -Z0;
export const floorX = (i) => X0 + i * DB.bayX;
export const girderZ = (j) => Z0 + j * DB.bayZ;

/* The longitudinals' lines across the ship: every 800 mm, less the ones
 * that would fall on a girder. */
export function longLines() {
  const out = [];
  const n = Math.round((Z1 - Z0) / DB.longPitch);
  for (let k = 1; k < n; k += 1) {
    const z = Z0 + k * DB.longPitch;
    let onGirder = false;
    for (let j = 0; j <= DB.nz; j += 1) {
      if (Math.abs(z - girderZ(j)) < 1e-6) {
        onGirder = true;
      }
    }
    if (!onGirder) {
      out.push(z);
    }
  }
  return out;
}

/* Light epoxy, a little dirty, with rust weeping from edges and specks:
 * a ballast tank a few years into its coating's life. Covers 2 m. */
function coatingTexture(size, seed, sludge) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const rnd = lcg(seed);
  g.fillStyle = sludge ? '#8d8a7c' : '#b9b8a6';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i += 1) {
    const v = rnd();
    g.fillStyle = v < 0.6 ? `rgba(90,88,74,${0.03 + rnd() * 0.06})` : `rgba(230,228,210,${0.03 + rnd() * 0.06})`;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, 2 + rnd() * 18, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 260; i += 1) {
    g.fillStyle = `rgba(${120 + Math.floor(rnd() * 40)},${58 + Math.floor(rnd() * 20)},24,${0.15 + rnd() * 0.35})`;
    g.beginPath();
    g.arc(rnd() * size, rnd() * size, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 40; i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const len = 10 + rnd() * size * 0.25;
    const gr = g.createLinearGradient(x, y, x, y + len);
    gr.addColorStop(0, 'rgba(130,64,26,0.35)');
    gr.addColorStop(1, 'rgba(130,64,26,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 1 + rnd() * 2.5, len);
  }
  if (sludge) {
    for (let i = 0; i < 60; i += 1) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 10 + rnd() * size * 0.12;
      const gr = g.createRadialGradient(x, y, 1, x, y, r);
      gr.addColorStop(0, 'rgba(52,44,32,0.55)');
      gr.addColorStop(1, 'rgba(52,44,32,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.5, 0.5);
  t.anisotropy = 4;
  return t;
}

/* UVs in metres, projected along each vertex's own normal's main axis, so
 * one texture tiles every plate at one scale however it was built. */
function worldUV(geo) {
  const pos = geo.getAttribute('position');
  if (!geo.getAttribute('normal')) {
    geo.computeVertexNormals();
  }
  const nrm = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nrm.getX(i));
    const ay = Math.abs(nrm.getY(i));
    const az = Math.abs(nrm.getZ(i));
    if (ax >= ay && ax >= az) {
      uv[2 * i] = z;
      uv[2 * i + 1] = y;
    } else if (ay >= az) {
      uv[2 * i] = x;
      uv[2 * i + 1] = z;
    } else {
      uv[2 * i] = x;
      uv[2 * i + 1] = y;
    }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

function roundedRect(path, cx, cy, w, h, r) {
  const x0 = cx - w / 2;
  const y0 = cy - h / 2;
  path.moveTo(x0 + r, y0);
  path.lineTo(x0 + w - r, y0);
  path.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  path.lineTo(x0 + w, y0 + h - r);
  path.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
  path.lineTo(x0 + r, y0 + h);
  path.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
}

/*
 * A plate in its own (u, v) plane, u from u0 to u1, v from 0 to height,
 * with a lightening hole at the middle of u if `hole`. Extruded by the plate
 * thickness and centred on it. Placed by `basis`, a Matrix4 taking the
 * shape's x, y and z to the world.
 */
function plateGeo(u0, u1, hole, basis) {
  const H = DB.height;
  const s = new THREE.Shape();
  s.moveTo(u0, 0);
  s.lineTo(u1, 0);
  s.lineTo(u1, H);
  s.lineTo(u0, H);
  s.lineTo(u0, 0);
  if (hole) {
    const p = new THREE.Path();
    roundedRect(p, (u0 + u1) / 2, DB.hole.y, DB.hole.w, DB.hole.h, DB.hole.r);
    s.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: DB.t, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -DB.t / 2);
  g.applyMatrix4(basis);
  return g;
}

/* The boxes a holed plate is to the plant, in (u, v, w) of the plate, w
 * across it: either side of the hole, under it and over it. */
function plateBoxes(u0, u1, hole) {
  const H = DB.height;
  const h = DB.t / 2;
  if (!hole) {
    return [[u0, 0, -h, u1, H, h]];
  }
  const c = (u0 + u1) / 2;
  const hl = c - DB.hole.w / 2;
  const hr = c + DB.hole.w / 2;
  const hb = DB.hole.y - DB.hole.h / 2;
  const ht = DB.hole.y + DB.hole.h / 2;
  return [
    [u0, 0, -h, hl, H, h],
    [hr, 0, -h, u1, H, h],
    [hl, 0, -h, hr, hb, h],
    [hl, ht, -h, hr, H, h],
  ];
}

function buildStructure(scene, q) {
  /* The colour multiplies the texture down: the epoxy is light, but the
   * aircraft's lights and its camera's exposure were set on grey steel
   * (inspect/world.js EXPOSURE), and at full albedo every wall was white. */
  const coat = new THREE.MeshStandardMaterial({
    color: 0x7c7c74,
    map: coatingTexture(q.id === 'low' ? 512 : 1024, 0xba11a5, false),
    roughness: 0.75,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    color: 0x7c7c74,
    map: coatingTexture(q.id === 'low' ? 512 : 1024, 0x5106e, true),
    roughness: 0.9,
    metalness: 0.05,
  });
  const boxes = [];
  const box = (x0, y0, z0, x1, y1, z1) => {
    boxes.push(new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)),
    ));
  };
  const H = DB.height;
  const t = DB.t;
  const geos = [];
  /* Faces a coating defect can sit on: centre, normal, the two in-plane
   * axes and half sizes, and the hole if it has one. */
  const faces = [];

  /* FLOORS, transverse, at x = floorX(i). Shape x is world z, shape y is
   * world y, the plate's thickness is world x. */
  for (let i = 0; i <= DB.nx; i += 1) {
    const x = floorX(i);
    const end = i === 0 || i === DB.nx;
    const basis = new THREE.Matrix4().makeBasis(
      new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0),
    ).setPosition(x, 0, 0);
    for (let j = 0; j < DB.nz; j += 1) {
      const u0 = girderZ(j) + t / 2;
      const u1 = girderZ(j + 1) - t / 2;
      geos.push(plateGeo(u0, u1, !end, basis));
      for (const b of plateBoxes(u0, u1, !end)) {
        box(x + b[2], b[1], b[0], x + b[5], b[4], b[3]);
      }
      for (const sd of end ? [i === 0 ? 1 : -1] : [-1, 1]) {
        faces.push({
          kind: 'floor', name: `${end ? 'end bulkhead' : `floor ${i}`}, bay ${j + 1} across`,
          c: new THREE.Vector3(x + sd * t / 2, H / 2, (u0 + u1) / 2),
          n: new THREE.Vector3(sd, 0, 0),
          u: new THREE.Vector3(0, 0, 1), v: new THREE.Vector3(0, 1, 0),
          hu: (u1 - u0) / 2, hv: H / 2, hole: !end,
        });
      }
    }
  }
  /* GIRDERS, longitudinal, at z = girderZ(j), between the floors. Shape x
   * is world x, y is y, thickness z. */
  for (let j = 0; j <= DB.nz; j += 1) {
    const z = girderZ(j);
    const side = j === 0 || j === DB.nz;
    const basis = new THREE.Matrix4().setPosition(0, 0, z);
    for (let i = 0; i < DB.nx; i += 1) {
      const u0 = floorX(i) + t / 2;
      const u1 = floorX(i + 1) - t / 2;
      geos.push(plateGeo(u0, u1, !side, basis));
      for (const b of plateBoxes(u0, u1, !side)) {
        box(b[0], b[1], z + b[2], b[3], b[4], z + b[5]);
      }
      for (const sd of side ? [j === 0 ? 1 : -1] : [-1, 1]) {
        faces.push({
          kind: 'girder', name: `${side ? 'side girder' : `girder ${j}`}, bay ${i + 1} fore and aft`,
          c: new THREE.Vector3((u0 + u1) / 2, H / 2, z + sd * t / 2),
          n: new THREE.Vector3(0, 0, sd),
          u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0),
          hu: (u1 - u0) / 2, hv: H / 2, hole: !side,
        });
      }
    }
  }
  const plates = new THREE.Mesh(worldUV(mergeGeometries(geos)), coat);
  plates.name = 'plates';
  scene.add(plates);

  /* The BOTTOM SHELL and the TANK TOP, the tank top with its manhole. */
  const bottom = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0).rotateX(-Math.PI / 2)), bottomMat);
  bottom.userData.noRay = true;
  scene.add(bottom);
  box(X0 - 0.5, -0.5, Z0 - 0.5, X1 + 0.5, 0, Z1 + 0.5);
  {
    const m = DB.manhole;
    const s = new THREE.Shape();
    s.moveTo(X0, Z0);
    s.lineTo(X1, Z0);
    s.lineTo(X1, Z1);
    s.lineTo(X0, Z1);
    s.lineTo(X0, Z0);
    const p = new THREE.Path();
    p.absellipse(m.x, m.z, m.w / 2, m.d / 2, 0, Math.PI * 2, false, 0);
    s.holes.push(p);
    /* Shape x is world x, shape y is world z, at the tank top. */
    const g = new THREE.ShapeGeometry(s, 24);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0),
    ).setPosition(0, H, 0));
    const top = new THREE.Mesh(worldUV(g), coat);
    top.userData.noRay = true;
    scene.add(top);
    /* The manhole's coaming above it, a short ring, and the dark beyond. */
    const coam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.12, 32, 1, true), coat);
    coam.scale.set(m.w / 2, 1, m.d / 2);
    coam.position.set(m.x, H + 0.06, m.z);
    scene.add(coam);
    box(X0 - 0.5, H, Z0 - 0.5, X1 + 0.5, H + 0.5, Z1 + 0.5);
  }
  faces.push({
    kind: 'top', name: 'tank top, underside',
    c: new THREE.Vector3(0, H - 0.0005, 0), n: new THREE.Vector3(0, -1, 0),
    u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1), hu: (X1 - X0) / 2, hv: (Z1 - Z0) / 2,
  });

  /*
   * LONGITUDINALS, each a bulb flat cut into one segment per bay so a
   * defect can take one segment out and put a bent or holed one in its
   * place. Instanced: the web, and the bulb along its free edge.
   */
  const lines = longLines();
  const longs = [];
  for (const z of lines) {
    for (const top of [false, true]) {
      for (let i = 0; i < DB.nx; i += 1) {
        longs.push({
          z, top, bay: i,
          x0: floorX(i) + t / 2, x1: floorX(i + 1) - t / 2,
          y: top ? H - DB.longDepth / 2 : DB.longDepth / 2,
          edge: top ? H - DB.longDepth : DB.longDepth,
        });
      }
      const y0 = top ? H - DB.longDepth - DB.bulbR : 0;
      const y1 = top ? H : DB.longDepth + DB.bulbR;
      box(X0, y0, z - DB.longT / 2 - DB.bulbR, X1, y1, z + DB.longT / 2 + DB.bulbR);
    }
  }
  const steel = new THREE.MeshStandardMaterial({ color: coat.color, map: coat.map, roughness: 0.75, metalness: 0.1 });
  const web = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steel, longs.length);
  const bulb = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10).rotateZ(Math.PI / 2), steel, longs.length);
  const m4 = new THREE.Matrix4();
  const qI = new THREE.Quaternion();
  longs.forEach((L, k) => {
    const len = L.x1 - L.x0;
    m4.compose(new THREE.Vector3((L.x0 + L.x1) / 2, L.y, L.z), qI, new THREE.Vector3(len, DB.longDepth, DB.longT));
    web.setMatrixAt(k, m4);
    m4.compose(new THREE.Vector3((L.x0 + L.x1) / 2, L.edge, L.z), qI, new THREE.Vector3(len, DB.bulbR, DB.bulbR));
    bulb.setMatrixAt(k, m4);
  });
  for (const im of [web, bulb]) {
    im.instanceMatrix.needsUpdate = true;
    im.userData.noRay = true;
    scene.add(im);
  }
  const savedWeb = web.instanceMatrix.array.slice();
  const savedBulb = bulb.instanceMatrix.array.slice();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const stiffeners = {
    list: longs,
    material: steel,
    /* Put every segment back, then take out the ones listed. */
    setHidden(ids) {
      web.instanceMatrix.array.set(savedWeb);
      bulb.instanceMatrix.array.set(savedBulb);
      for (const k of ids) {
        web.setMatrixAt(k, zero);
        bulb.setMatrixAt(k, zero);
      }
      web.instanceMatrix.needsUpdate = true;
      bulb.instanceMatrix.needsUpdate = true;
    },
  };

  /*
   * BRACKETS, a triangle of plate in each longitudinal's own vertical
   * plane, tying it to each internal floor, on alternate sides. Their two
   * sharp ends, the TOES, are where a double bottom cracks: one on the
   * longitudinal, one on the floor.
   */
  const bracketGeos = [];
  const brackets = [];
  const b = DB.bracket;
  for (let i = 1; i < DB.nx; i += 1) {
    const x = floorX(i);
    lines.forEach((z, k) => {
      for (const top of [false, true]) {
        const sd = (i + k + (top ? 1 : 0)) % 2 ? 1 : -1;
        const yE = top ? H - DB.longDepth : DB.longDepth;
        const dy = top ? -1 : 1;
        const a = new THREE.Vector3(x + sd * t / 2, yE, z);
        const toeL = new THREE.Vector3(x + sd * (t / 2 + b), yE, z);
        const toeF = new THREE.Vector3(x + sd * t / 2, yE + dy * b, z);
        const g = new THREE.BufferGeometry().setFromPoints([a, toeL, toeF]);
        g.setIndex([0, 1, 2]);
        g.computeVertexNormals();
        bracketGeos.push(g);
        brackets.push({
          floor: i, z, top, side: sd, toeL, toeF,
          name: `bracket at floor ${i}, ${top ? 'tank top' : 'bottom'} longitudinal ${k + 1}`,
        });
      }
    });
  }
  const bracketMesh = new THREE.Mesh(worldUV(mergeGeometries(bracketGeos)), coat);
  bracketMesh.userData.noRay = true;
  scene.add(bracketMesh);

  /* The bottom shell between longitudinals, for pitting: one strip per
   * gap per bay. */
  const strips = [];
  const zs = [Z0, ...lines, Z1].sort((p, q2) => p - q2);
  for (let i = 0; i < DB.nx; i += 1) {
    for (let k = 0; k < zs.length - 1; k += 1) {
      const za = zs[k] + 0.03;
      const zb = zs[k + 1] - 0.03;
      if (zb - za > 0.3) {
        strips.push({ x0: floorX(i) + 0.15, x1: floorX(i + 1) - 0.15, z0: za, z1: zb, bay: i });
      }
    }
  }

  return { boxes, faces, stiffeners, brackets, strips, coat };
}

/* Where the tethered aircraft's cable comes in: a fairlead at the manhole,
 * just under the tank top. */
function fairlead(scene) {
  const m = DB.manhole;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.4, metalness: 0.7 }));
  roll.position.set(m.x, DB.height + 0.02, m.z);
  roll.userData.noRay = true;
  scene.add(roll);
  return new THREE.Vector3(m.x, DB.height - 0.05, m.z);
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const opts = options || {};
  const q = qualityFor(opts.quality);
  const t0 = performance.now();
  const restore = prepareRenderer(shell.renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x0a0908, 0.06);
  /* A glimmer down the open manhole and nothing else. */
  scene.add(new THREE.HemisphereLight(0x6a7480, 0x1a1612, 0.03));
  progress(0.2);
  await yieldToPaint();

  const st = buildStructure(scene, q);
  progress(0.6);
  await yieldToPaint();

  const colliders = new Colliders();
  for (const bx of st.boxes) {
    colliders.addBox('wall', bx.min.x, bx.min.y, bx.min.z, bx.max.x, bx.max.y, bx.max.z);
  }
  colliders.build();
  const anchor = fairlead(scene);
  const occluders = gatherOccluders(scene);
  const defects = createBallastDefects({ scene, structure: st });
  defects.roll(Number.isFinite(opts.defectSeed) ? opts.defectSeed : undefined);

  /* The first box along a ray: every solid here is one. */
  const frontDistance = (p, f) => Math.max(0.05, boxRay(st.boxes, p, f, 30));

  /* The title's loop: along the middle row through three floors' holes,
   * across through a girder's, back along the next row, and home. */
  const zc = girderZ(1) + DB.bayZ / 2;
  const zn = zc + DB.bayZ;
  const xa = floorX(0) + DB.bayX / 2;
  const xb = floorX(DB.nx) - DB.bayX / 2;
  const y = DB.hole.y;
  const corners = [[xa, zc], [xb, zc], [xb, zn], [xa, zn]];
  const attractPath = [];
  for (let c = 0; c < 4; c += 1) {
    const [ax, az] = corners[c];
    const [bx, bz] = corners[(c + 1) % 4];
    for (let s = 0; s < 12; s += 1) {
      attractPath.push({ x: ax + ((bx - ax) * s) / 12, y, z: az + ((bz - az) * s) / 12 });
    }
  }

  return inspectionWorld({
    shell,
    opts,
    q,
    t0,
    progress,
    restore,
    scene,
    colliders,
    occluders,
    frontDistance,
    defects,
    tetherAnchor: anchor,
    tetherLength: DB.tetherLength,
    id: 'ballast',
    name: 'Ballast tank',
    spawn: DB.spawn,
    aim: new THREE.Vector3(0, DB.height / 2, 0),
    attractPath,
    extra: { ballast: { ...DB } },
    stats: () => ({ faces: st.faces.length, stiffeners: st.stiffeners.list.length, brackets: st.brackets.length }),
  });
}
