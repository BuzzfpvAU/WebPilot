/*
 * tank/index.js: the inside of a storage tank, the first inspection world.
 *
 * WHAT IT IS. A welded steel storage tank, 14 m across and 12 m to the
 * roof, the size of a mid sized fuel or water tank, as an inspection
 * aircraft sees it from inside: no daylight, no sky, the only light the
 * aircraft's own. The shell, plates and welds are drawn from real practice
 * (API 650 courses of 2 m plate with staggered vertical seams), and the
 * internals are the things a pilot has to fly round in a real one: a centre
 * roof support column, radial roof rafters, a fixed ladder up the shell, a
 * heating coil on stands near the floor, a manway, and an inlet nozzle with
 * a schoepentoeter on it. The welds as beads, the bolts, the schoepentoeter
 * and the manway are hardware.js; the faults a flight is sent to find are
 * defects.js.
 *
 * GEOMETRY IS PARAMETRIC on purpose. TANK below is the only place a size
 * lives, so the next vessels (a boiler, a ship's hold, a ballast tank) are
 * a different table and a different set of internals on the same builder,
 * and an imported model will hand its own solids to the same Colliders.
 *
 * THE WALL IS A RING OF CAPSULES, and the reason is the cage. The plant's
 * solid world (src/native/world.c) has axis aligned boxes and capsules.
 * Boxes would make the curved shell a staircase, and a caged aircraft
 * rolling along a staircase is struck by every tread. 240 vertical
 * capsules of 0.5 m radius, their axes on a circle 0.5 m outside the shell,
 * overlap into a surface whose scallops are under a centimetre deep, and
 * every normal points at the tank's axis, so a cage rolling round the shell
 * is rolling round a cylinder.
 *
 * THE LIGHT IS THE AIRCRAFT'S. Two spot lights stand on the aircraft and
 * point where it points, set every frame from the craft's own rendered pose
 * in onBeforeRender, plus a dim fill that is the light bouncing back off
 * the steel. There is no other light in the world, which is the point of
 * training in one: a pilot learns where the light is going.
 *
 * DUST, which every confined space pilot meets: motes drift in a box round
 * the aircraft and glow only inside the light cones, so the light can be
 * seen hitting it.
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

import { Colliders } from '../../game/collide.js';
import { qualityFor } from '../../render/quality.js';
import { yieldToPaint } from '../../ui/loading.js';
import {
  beadTexture, boltMeshes, fittings, floorSeams, lcg, memberSeams, schoepentoeter, shellSeams, sweepBeads,
} from './hardware.js';
import { createDefects } from './defects.js';
import { boxRay, gatherOccluders, inspectionWorld, prepareRenderer } from '../inspect/world.js';

/* Everything a tank is, in metres, Three.js frame (y up). */
export const TANK = {
  radius: 7.0,
  height: 12.0,
  course: 2.0,          /* plate course height, the horizontal weld spacing */
  plateArc: 3.0,        /* plate length round the shell, the vertical seams */
  wallCapsules: 240,
  wallCapsuleR: 0.5,
  columnR: 0.30,        /* the roof's centre support */
  rafters: 12,
  rafterDrop: 0.35,     /* rafter depth under the roof */
  coilR: 4.6,           /* heating coil ring radius */
  coilY: 0.55,
  coilPipeR: 0.06,
  nozzleY: 1.2,
  nozzleR: 0.35,
  nozzleLen: 0.9,
  manwayY: 0.75,        /* a 24 inch manway in the bottom course */
  manwayR: 0.305,
  ladderAngle: Math.PI * 0.5,
  /* Between the centre column (0.3 m) and the heating coil (4.6 m), on the
   * floor, facing the column. */
  spawn: { x: 0, z: 3.0, yaw: 0 },
  /* The tethered aircraft's ground station, on the floor a metre behind
   * the spawn, and the cable it pays out, metres. */
  station: { x: 0.7, z: 4.0, w: 0.45, d: 0.35, h: 0.30 },
  tetherLength: 30,
};

/* A canvas texture of rolled steel plate: a mill scale ground, rust
 * blooming from the welds and the lower courses, and the seams themselves.
 * Deterministic: a fixed LCG, so every load draws the same tank. */
function plateTexture(w, h, coursesTall, platesRound, seed) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  g.fillStyle = '#5d5a55';
  g.fillRect(0, 0, w, h);
  /* Mill scale mottling. */
  for (let i = 0; i < 2600; i += 1) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = 2 + rnd() * 14;
    const v = 70 + Math.floor(rnd() * 40);
    g.fillStyle = `rgba(${v},${v - 4},${v - 8},${0.08 + rnd() * 0.12})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  /* Rust, heavier low down where product and water sat: clusters of small
   * specks rather than round blots, which close to the steel read as
   * paint, and which a pilot hunting a corroded weld would chase. */
  for (let i = 0; i < 700; i += 1) {
    const cx = rnd() * w;
    const cy = h * Math.pow(rnd(), 0.6);
    const spread = 4 + rnd() * 18;
    const a = 0.04 + 0.14 * (cy / h);
    for (let k = 0; k < 9; k += 1) {
      const x = cx + (rnd() - 0.5) * spread * 2;
      const y = cy + (rnd() - 0.5) * spread * 2;
      g.fillStyle = `rgba(${100 + Math.floor(rnd() * 50)},${48 + Math.floor(rnd() * 22)},22,${a})`;
      g.beginPath();
      g.arc(x, y, 0.8 + rnd() * 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }
  /*
   * The seams' heat tint: the plate either side of a weld darkened and
   * blued by the heat, a band a few centimetres wide. The welds themselves
   * are raised beads in hardware.js on exactly these lines. A dark line
   * painted here is what made the shell read as brickwork, so there is
   * none: what separates the plates is the bead and the light on it.
   */
  const ch = h / coursesTall;
  const pw = w / platesRound;
  const tint = (x0, y0, x1, y1, across) => {
    const grd = across === 'y'
      ? g.createLinearGradient(0, y0 - 6, 0, y0 + 6)
      : g.createLinearGradient(x0 - 6, 0, x0 + 6, 0);
    grd.addColorStop(0, 'rgba(48,46,52,0)');
    grd.addColorStop(0.5, 'rgba(48,46,52,0.45)');
    grd.addColorStop(1, 'rgba(48,46,52,0)');
    g.fillStyle = grd;
    if (across === 'y') {
      g.fillRect(x0, y0 - 6, x1 - x0, 12);
    } else {
      g.fillRect(x0 - 6, y0, 12, y1 - y0);
    }
  };
  for (let k = 0; k <= coursesTall; k += 1) {
    const y = k * ch;
    tint(0, y, w, y, 'y');
    /* Rust weeping down from the seam. */
    for (let i = 0; i < platesRound * 3; i += 1) {
      const x = rnd() * w;
      const len = 6 + rnd() * ch * 0.5;
      const grad = g.createLinearGradient(x, y, x, y + len);
      grad.addColorStop(0, 'rgba(140,62,22,0.55)');
      grad.addColorStop(1, 'rgba(140,62,22,0)');
      g.fillStyle = grad;
      g.fillRect(x - 1.5, y, 3 + rnd() * 3, len);
    }
  }
  for (let k = 0; k < coursesTall; k += 1) {
    const off = (k % 2) * pw * 0.5;
    for (let i = 0; i <= platesRound; i += 1) {
      const x = (off + i * pw) % w;
      tint(x, (coursesTall - 1 - k) * ch, x, (coursesTall - k) * ch, 'x');
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

/* The floor: lapped plates and sludge pooled toward the low side. The
 * roof's plates are the same grid with no sludge. */
function floorTexture(size, seed, roof) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  g.fillStyle = roof ? '#57534d' : '#3f3b36';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < (roof ? 600 : 1800); i += 1) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 3 + rnd() * 20;
    const k = rnd();
    g.fillStyle = k < 0.5
      ? `rgba(30,26,22,${0.1 + rnd() * 0.25})`
      : `rgba(110,60,28,${0.05 + rnd() * 0.15})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  /* The lap edges, a thin shadow where one plate steps onto the next. The
   * welds are beads in hardware.js (floorSeams) on the same lines. */
  const plate = size / 7;
  g.strokeStyle = 'rgba(25,22,20,0.45)';
  g.lineWidth = Math.max(1, size / 1024);
  for (let i = 0; i <= 7; i += 1) {
    g.beginPath();
    g.moveTo(i * plate, 0);
    g.lineTo(i * plate, size);
    g.stroke();
    const off = (i % 2) * plate * 0.5;
    for (let j = 0; j <= 7; j += 1) {
      g.beginPath();
      g.moveTo(i * plate, off + j * plate);
      g.lineTo((i + 1) * plate, off + j * plate);
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/*
 * The colliders: the shell as a ring of capsules, the roof as a slab, and
 * every internal as what it is. Three.js frame, metres.
 */
function buildColliders(T, hw) {
  const col = new Colliders();
  const ringR = T.radius + T.wallCapsuleR;
  for (let i = 0; i < T.wallCapsules; i += 1) {
    const a = (i / T.wallCapsules) * Math.PI * 2;
    const x = ringR * Math.cos(a);
    const z = ringR * Math.sin(a);
    col.add('wall', x, -1, z, x, T.height + 1, z, T.wallCapsuleR);
  }
  /* Roof: a slab over the whole tank. */
  const R = T.radius + 1;
  col.addBox('wall', -R, T.height, -R, R, T.height + 0.5, R);
  /* Centre column, floor to roof. */
  col.add('pole', 0, 0, 0, 0, T.height, 0, T.columnR);
  /* Rafters: column top to shell, just under the roof. */
  const ry = T.height - T.rafterDrop * 0.5;
  for (let i = 0; i < T.rafters; i += 1) {
    const a = (i / T.rafters) * Math.PI * 2;
    col.add('pole', 0.4 * Math.cos(a), ry, 0.4 * Math.sin(a),
      (T.radius - 0.05) * Math.cos(a), ry, (T.radius - 0.05) * Math.sin(a), T.rafterDrop * 0.5);
  }
  /* Heating coil: a ring of short capsules on the floor stands. */
  const segs = 48;
  for (let i = 0; i < segs; i += 1) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    col.add('pole', T.coilR * Math.cos(a0), T.coilY, T.coilR * Math.sin(a0),
      T.coilR * Math.cos(a1), T.coilY, T.coilR * Math.sin(a1), T.coilPipeR);
  }
  /* Inlet nozzle, through the shell opposite the ladder. */
  const na = T.ladderAngle + Math.PI;
  const nx = Math.cos(na);
  const nz = Math.sin(na);
  col.add('pole', (T.radius - T.nozzleLen) * nx, T.nozzleY, (T.radius - T.nozzleLen) * nz,
    T.radius * nx, T.nozzleY, T.radius * nz, T.nozzleR);
  /* Ladder: two stiles standing 0.25 m off the shell. */
  const la = T.ladderAngle;
  const lr = T.radius - 0.25;
  for (const side of [-1, 1]) {
    const a = la + side * (0.22 / lr);
    col.add('pole', lr * Math.cos(a), 0, lr * Math.sin(a), lr * Math.cos(a), T.height - 0.5, lr * Math.sin(a), 0.03);
  }
  /* The tether's ground station: a case on the floor. */
  {
    const st = T.station;
    col.addBox('obstacle', st.x - st.w / 2, 0, st.z - st.d / 2, st.x + st.w / 2, st.h, st.z + st.d / 2);
  }
  /* The schoepentoeter, the manway and the support legs (hardware.js). */
  for (const b of hw.boxes) {
    col.addBox('pole', b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z);
  }
  for (const p of hw.poles) {
    col.add('pole', p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z, p.r);
  }
  col.build();
  return col;
}

function buildVisuals(scene, T, q) {
  const steel = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.82, metalness: 0.35 });
  const circ = 2 * Math.PI * T.radius;
  const plates = Math.round(circ / T.plateArc);
  const courses = Math.round(T.height / T.course);
  const texW = q.id === 'low' ? 2048 : 4096;
  const shellTex = plateTexture(texW, 1024, courses, plates, 0x7a3b11);
  /* 256 segments, not 128: a facet's chord falls half a millimetre inside
   * the circle rather than two, so a weld bead on the true circle never
   * shows a gap or sinks out of sight mid facet. */
  const shell = new THREE.Mesh(
    new THREE.CylinderGeometry(T.radius, T.radius, T.height, 256, 1, true),
    steel(shellTex),
  );
  shell.material.side = THREE.BackSide;
  shell.userData.noRay = true;
  shell.position.y = T.height * 0.5;
  scene.add(shell);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 96), steel(floorTexture(2048, 0x11f00d)));
  floor.rotation.x = -Math.PI / 2;
  floor.userData.noRay = true;
  scene.add(floor);

  const roof = new THREE.Mesh(new THREE.CircleGeometry(T.radius, 96), steel(floorTexture(1024, 0x2bad, true)));
  roof.rotation.x = Math.PI / 2;
  roof.position.y = T.height;
  roof.userData.noRay = true;
  scene.add(roof);

  const member = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.7, metalness: 0.5 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(T.columnR, T.columnR, T.height, 24), member);
  column.position.y = T.height * 0.5;
  scene.add(column);
  for (let i = 0; i < T.rafters; i += 1) {
    const a = (i / T.rafters) * Math.PI * 2;
    const len = T.radius - 0.45;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len, T.rafterDrop, 0.12), member);
    beam.position.set((0.4 + len * 0.5) * Math.cos(a), T.height - T.rafterDrop * 0.5, (0.4 + len * 0.5) * Math.sin(a));
    beam.rotation.y = -a;
    scene.add(beam);
  }
  /* Heating coil and its stands. */
  const coil = new THREE.Mesh(new THREE.TorusGeometry(T.coilR, T.coilPipeR, 10, 96), member);
  coil.rotation.x = Math.PI / 2;
  coil.position.y = T.coilY;
  scene.add(coil);
  /* The stands stop under the saddle the U bolt clamps the pipe to. */
  const standH = T.coilY - T.coilPipeR - 0.012;
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, standH, 0.06), member);
    stand.position.set(T.coilR * Math.cos(a), standH * 0.5, T.coilR * Math.sin(a));
    scene.add(stand);
  }
  /* Inlet nozzle. */
  const na = T.ladderAngle + Math.PI;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(T.nozzleR, T.nozzleR, T.nozzleLen, 24, 1, true), member);
  nozzle.material = member.clone();
  nozzle.material.side = THREE.DoubleSide;
  nozzle.rotation.z = Math.PI / 2;
  nozzle.rotation.y = -na;
  nozzle.position.set((T.radius - T.nozzleLen * 0.5) * Math.cos(na), T.nozzleY, (T.radius - T.nozzleLen * 0.5) * Math.sin(na));
  scene.add(nozzle);
  /* Ladder: stiles and rungs every 0.3 m. */
  const la = T.ladderAngle;
  const lr = T.radius - 0.25;
  const ladder = new THREE.Group();
  const stileGeo = new THREE.CylinderGeometry(0.03, 0.03, T.height - 0.5, 8);
  for (const side of [-1, 1]) {
    const stile = new THREE.Mesh(stileGeo, member);
    stile.position.set(side * 0.22, (T.height - 0.5) * 0.5, 0);
    ladder.add(stile);
  }
  const rungGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.44, 6);
  for (let y = 0.3; y < T.height - 0.6; y += 0.3) {
    const rung = new THREE.Mesh(rungGeo, member);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(0, y, 0);
    ladder.add(rung);
  }
  ladder.position.set(lr * Math.cos(la), 0, lr * Math.sin(la));
  ladder.rotation.y = -la + Math.PI / 2;
  scene.add(ladder);

  /* The hardware: fittings and their bolts, the schoepentoeter, and every
   * weld as a bead (hardware.js). */
  const fit = fittings(scene, T, member);
  const sch = schoepentoeter(scene, T, member);
  const blocked = blockedFor(T);
  const seams = [
    ...shellSeams(T, blocked),
    ...floorSeams(T, false),
    ...floorSeams(T, true),
    ...memberSeams(T),
    ...sch.seams,
  ];
  const beadTex = beadTexture();
  const beadMat = new THREE.MeshStandardMaterial({
    map: beadTex,
    bumpMap: beadTex,
    bumpScale: 3,
    roughness: 0.7,
    metalness: 0.45,
  });
  const beads = new THREE.Mesh(sweepBeads(seams, q.id === 'low' ? 0.16 : 0.08), beadMat);
  beads.userData.noRay = true;
  scene.add(beads);
  const groups = [...fit.groups, ...sch.groups];
  const bolts = boltMeshes(groups, lcg(0xb017));
  for (const m of bolts.meshes) {
    scene.add(m);
  }
  return {
    seams,
    groups,
    bolts,
    blocked,
    boxes: sch.boxes,
    poles: [...sch.poles, ...fit.solids],
  };
}

/*
 * Where a weld defect cannot be: under the ladder, where the stiles stand
 * between it and any camera; behind the manway's cover; inside the
 * nozzle's bore.
 */
function blockedFor(T) {
  const la = T.ladderAngle;
  const lx = Math.cos(la);
  const lz = Math.sin(la);
  const ma = T.ladderAngle + Math.PI / 2;
  const man = new THREE.Vector3(T.radius * Math.cos(ma), T.manwayY, T.radius * Math.sin(ma));
  const na = T.ladderAngle + Math.PI;
  const noz = new THREE.Vector3(T.radius * Math.cos(na), T.nozzleY, T.radius * Math.sin(na));
  return (p) => {
    /* The ladder: within half a metre of its plane, near the shell. */
    const along = p.x * lx + p.z * lz;
    const across = Math.abs(-p.x * lz + p.z * lx);
    if (along > T.radius - 0.6 && across < 0.45) {
      return true;
    }
    if (p.distanceTo(man) < T.manwayR + 0.15) {
      return true;
    }
    return p.distanceTo(noz) < T.nozzleR - 0.02;
  };
}

/*
 * The tether's ground station, a case on the floor with its reel. Returns
 * where the cable leaves it. The cable itself is drawn by
 * inspect/world.js.
 */
function stationVisuals(scene, T) {
  const st = T.station;
  const caseMat = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.6, metalness: 0.2 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(st.w, st.h, st.d), caseMat);
  box.position.set(st.x, st.h / 2, st.z);
  scene.add(box);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.12, 24),
    new THREE.MeshStandardMaterial({ color: 0x444a52, roughness: 0.5, metalness: 0.6 }));
  reel.rotation.z = Math.PI / 2;
  reel.position.set(st.x, st.h + 0.11, st.z);
  scene.add(reel);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 6), new THREE.MeshBasicMaterial({ color: 0x55ff88 }));
  lamp.position.set(st.x + st.w * 0.35, st.h + 0.01, st.z - st.d * 0.4);
  scene.add(lamp);
  return new THREE.Vector3(st.x, st.h + 0.22, st.z);
}

export async function buildMap(shell, onProgress, options) {
  const progress = onProgress ?? (() => {});
  const opts = options || {};
  const q = qualityFor(opts.quality);
  const T = TANK;
  const t0 = performance.now();
  const restore = prepareRenderer(shell.renderer);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x0a0908, 0.025);
  /* Not zero: a real tank has a manway open somewhere and a pilot's eye
   * adapts. Enough to make out the shell's silhouette and nothing more. */
  scene.add(new THREE.HemisphereLight(0x6a7480, 0x1a1612, 0.035));
  progress(0.2);
  await yieldToPaint();

  const hw = buildVisuals(scene, T, q);
  progress(0.6);
  await yieldToPaint();

  const colliders = buildColliders(T, hw);
  const anchor = stationVisuals(scene, T);
  /* What can stand between a camera and a defect, or stop a photo's ray
   * short of the shell: every solid built so far but the shell, floor and
   * roof (a ray from inside never crosses them before its end), the beads
   * and the bolts (millimetres high). */
  const occluders = gatherOccluders(scene);
  const defects = createDefects({
    scene,
    seams: hw.seams,
    groups: hw.groups,
    bolts: hw.bolts,
    blocked: hw.blocked,
  });
  defects.roll(Number.isFinite(opts.defectSeed) ? opts.defectSeed : undefined);

  /*
   * The first solid along a ray, analytically: the shell's inside, the
   * floor, the roof and the centre column, then the schoepentoeter by its
   * collider boxes. The auto exposure runs it every frame; the photo
   * grader adds a mesh ray on top. Returns the distance, at most 50 m.
   */
  const frontDistance = (p, f) => {
    let t = 50;
    {
      /* The column, from outside: the near root of the ray against a
       * vertical cylinder of radius columnR on the axis. */
      const a = f.x * f.x + f.z * f.z;
      if (a > 1e-9) {
        const b = 2 * (p.x * f.x + p.z * f.z);
        const c = p.x * p.x + p.z * p.z - T.columnR * T.columnR;
        const disc = b * b - 4 * a * c;
        if (c > 0 && disc >= 0) {
          const tc = (-b - Math.sqrt(disc)) / (2 * a);
          const y = p.y + tc * f.y;
          if (tc > 0 && y >= 0 && y <= T.height) {
            t = Math.min(t, tc);
          }
        }
      }
    }
    const a = f.x * f.x + f.z * f.z;
    if (a > 1e-9) {
      const b = 2 * (p.x * f.x + p.z * f.z);
      const c = p.x * p.x + p.z * p.z - T.radius * T.radius;
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const tc = (-b + Math.sqrt(disc)) / (2 * a);
        if (tc > 0) {
          t = Math.min(t, tc);
        }
      }
    }
    if (f.y < -1e-6) {
      t = Math.min(t, -p.y / f.y);
    } else if (f.y > 1e-6) {
      t = Math.min(t, (T.height - p.y) / f.y);
    }
    return Math.max(0.05, boxRay(hw.boxes, p, f, t));
  };

  const attractPath = [];
  for (let i = 0; i < 48; i += 1) {
    const a = (i / 48) * Math.PI * 2;
    attractPath.push({ x: 4.2 * Math.cos(a), y: 3.0, z: 4.2 * Math.sin(a) });
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
    tetherLength: T.tetherLength,
    id: 'tank',
    name: 'Storage tank',
    spawn: T.spawn,
    aim: new THREE.Vector3(0, T.height * 0.4, 0),
    attractPath,
    extra: { tank: { ...T } },
    stats: () => ({ seams: hw.seams.length, bolts: hw.bolts.count }),
  });
}
