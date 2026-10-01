/*
 * inspectcraft.js: the two inspection aircraft's models.
 *
 * Until this file they were drawn as the five inch, which is neither of
 * them. The owner asked for each to look like its class:
 *
 *   CAGED, an Elios 3 class machine: a quad of 5 inch props inside a
 *   geodesic cage half a metre across, carbon struts meeting at nodes, a
 *   LiDAR puck on top and a camera and light array on the nose, the
 *   cage being the outermost thing in every direction. Built inside
 *   plant.c's hull for SIM_AIRFRAME_CAGED (0.25 m each way across, 0.20 m
 *   down and 0.25 m up from the CG) with its motors at plant.c's 85 mm.
 *
 *   TETHERED, a Scout 137 class machine: an uncaged quad on 8 inch props
 *   in push configuration (props under the motors, plant.c's pos_z of -60
 *   mm), a fuselage with skids, a LiDAR on top, a gimbal camera and two
 *   light bars at the nose, and the tether boss at the tail where
 *   src/native/tether.c attaches the cable (120 mm behind the CG). Inside
 *   plant.c's hull for SIM_AIRFRAME_TETHERED.
 *
 * No maker's marks, colours that say the class rather than the brand.
 *
 * The contract with the shell is herocraft.js's, field for field: group,
 * discs, blades, leds, cameraMount, stator, propSpin. Model frame as
 * herocraft.js: forward is -z, up is +y, so plant x is model -z and plant
 * y is model -x.
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
import { celMaterial } from './celmat.js';
import { WORLD_SCALE } from './frame.js';
import { PROP_SPIN } from './herocraft.js';

/* Betaflight motor order, as plant.c: 0 RR, 1 FR, 2 RL, 3 FL. Plant x
 * forward, y left; in the model forward is -z and left is -x. */
const MOTOR_SIGN = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
function motorAt(arm, m) {
  const [px, py] = MOTOR_SIGN[m];
  return { x: -py * arm, z: -px * arm, front: px > 0 };
}

/* A strut from a to b, as a cylinder geometry in place. */
function strutGeo(a, b, r, seg) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.applyQuaternion(q);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/* The parts both share: rotors, blur discs, lamps, the stator material,
 * and the measurement box. */
function common(group, opts, spec) {
  const fog = opts.fog !== false;
  const lite = Boolean(opts.lite);
  const cel = (o) => celMaterial({ fog, cloudShadow: 0, ...o });
  const discs = [];
  const blades = [];
  const leds = [];
  const stator = cel({ color: 0x30383c, rim: 0.24, spec: 0.22 });
  const bell = cel({ color: 0x9aa3a8, rim: 0.3, spec: 0.5 });
  const propMat = cel({ color: spec.propColor, rim: 0.2, spec: 0.3 });
  const bladeGeo = new THREE.BoxGeometry(spec.propR * 0.98, 0.0025, spec.propR * 0.16);
  bladeGeo.translate(spec.propR * 0.5, 0, 0);
  for (let m = 0; m < 4; m += 1) {
    const at = motorAt(spec.arm, m);
    const can = new THREE.Mesh(new THREE.CylinderGeometry(spec.motorR, spec.motorR, spec.motorH, lite ? 10 : 18), stator);
    can.position.set(at.x, spec.motorY, at.z);
    group.add(can);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(spec.motorR * 0.92, spec.motorR * 0.92, 0.004, lite ? 10 : 18), bell);
    cap.position.set(at.x, spec.motorY + spec.motorH * 0.5 * spec.capSide, at.z);
    group.add(cap);
    const rotor = new THREE.Group();
    rotor.position.set(at.x, spec.rotorY, at.z);
    for (let b = 0; b < 2; b += 1) {
      const blade = new THREE.Mesh(bladeGeo, propMat);
      blade.rotation.y = b * Math.PI;
      rotor.add(blade);
    }
    group.add(rotor);
    blades.push(rotor);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(spec.propR, spec.propR, 0.0008, lite ? 14 : 28),
      new THREE.MeshBasicMaterial({
        color: at.front ? 0xf0d8e0 : 0xdde6e8, transparent: true, opacity: 0.1, depthWrite: false, fog,
      }),
    );
    disc.position.set(at.x, spec.rotorY + 0.001, at.z);
    disc.renderOrder = 1;
    group.add(disc);
    discs.push(disc);
    const base = at.front ? 0xffffff : 0xff5a4a;
    const ledMat = new THREE.MeshBasicMaterial({ color: base, fog });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.005, 6, 4), ledMat);
    led.position.set(at.x * 0.7, spec.ledY, at.z * 0.7);
    group.add(led);
    leds.push({ mesh: led, mat: ledMat, front: at.front, base });
  }
  if (opts.measure) {
    /* The plant's hull, hidden: what scripts/craft-check.js and check 15
     * compare the drawn machine with. */
    const box = new THREE.Mesh(new THREE.BoxGeometry(spec.hull[0] * 2, spec.hull[2] + spec.hull[3], spec.hull[1] * 2), stator);
    box.position.y = (spec.hull[3] - spec.hull[2]) * 0.5;
    box.visible = false;
    group.add(box);
  }
  return { cel, discs, blades, leds, stator, lite, fog };
}

/* The nose camera and its lights, on a mount that tilts. */
function nose(group, cel, at, lightW, lightGap) {
  const cameraMount = new THREE.Group();
  cameraMount.position.set(0, at.y, at.z);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.035), cel({ color: 0x23272b, rim: 0.2, spec: 0.3 }));
  cameraMount.add(housing);
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.006, 18),
    new THREE.MeshBasicMaterial({ color: 0x0b1620 }));
  glass.rotation.x = Math.PI / 2;
  glass.position.z = -0.0185;
  cameraMount.add(glass);
  group.add(cameraMount);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
  for (const sd of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(lightW, 0.022, 0.012), cel({ color: 0x2b3034, rim: 0.2 }));
    bar.position.set(sd * lightGap, at.y, at.z + 0.006);
    group.add(bar);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(lightW * 0.88, 0.014), lampMat);
    lens.position.set(sd * lightGap, at.y, at.z - 0.0005);
    lens.rotation.y = Math.PI;
    group.add(lens);
  }
  return cameraMount;
}

function lidar(group, cel, y, r, h) {
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, h, 24), cel({ color: 0x1d2124, rim: 0.3, spec: 0.4 }));
  body.position.y = y;
  group.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.01, r * 1.01, h * 0.3, 24),
    new THREE.MeshBasicMaterial({ color: 0x1a3a44 }));
  band.position.y = y + h * 0.08;
  group.add(band);
}

/*
 * CAGED. Every number from plant.c's SIM_AIRFRAME_CAGED or the class: the
 * cage is a geodesic shell of 8 mm carbon tube with 15 mm nodes, 0.24 m out
 * and 0.2175 m up and down at the struts' centres, centred 25 mm above the
 * CG, so with the nodes it is 495 mm across and spans 0.20 down and 0.25
 * up: plant.c's hull, the class's 50 by 50 by 45 cm. A little flatter than
 * a sphere, because the hull is.
 */
export function buildCagedCraft(opts = {}) {
  const group = new THREE.Group();
  group.name = opts.name ?? 'caged-craft';
  group.scale.setScalar(1 / (opts.worldScale ? WORLD_SCALE : 1));
  const spec = {
    arm: 0.085, propR: 0.0635, motorR: 0.014, motorH: 0.016, motorY: 0.012,
    rotorY: 0.025, capSide: 1, ledY: -0.012, propColor: 0x2a2d30,
    hull: [0.25, 0.25, 0.20, 0.25],
  };
  const c = common(group, opts, spec);
  const { cel, lite } = c;
  const carbon = cel({ color: 0x2c3135, rim: 0.35, spec: 0.45 });
  const frame = cel({ color: 0x3a4045, rim: 0.3, spec: 0.3 });

  /* The cage. */
  const RX = 0.24;
  const RY = 0.2175;
  const cy = 0.025;
  const ico = new THREE.IcosahedronGeometry(1, lite ? 1 : 2);
  /* A node on the side axis, so the cage is its full width across. */
  ico.rotateZ(-Math.atan2((1 + Math.sqrt(5)) / 2, 1));
  ico.scale(RX, RY, RX);
  const pos = ico.getAttribute('position');
  const key = (v) => `${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)}`;
  const verts = new Map();
  const edges = new Map();
  const tri = [];
  for (let i = 0; i < pos.count; i += 1) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = key(v);
    if (!verts.has(k)) {
      verts.set(k, v);
    }
    tri.push(k);
  }
  for (let i = 0; i < tri.length; i += 3) {
    for (let j = 0; j < 3; j += 1) {
      const a = tri[i + j];
      const b = tri[i + ((j + 1) % 3)];
      const ek = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!edges.has(ek)) {
        edges.set(ek, [verts.get(a), verts.get(b)]);
      }
    }
  }
  const struts = [];
  const off = new THREE.Vector3(0, cy, 0);
  for (const [a, b] of edges.values()) {
    struts.push(strutGeo(a.clone().add(off), b.clone().add(off), 0.004, lite ? 4 : 6));
  }
  const cage = new THREE.Mesh(mergeGeometries(struts), carbon);
  cage.name = 'cage';
  group.add(cage);
  const nodes = [];
  for (const v of verts.values()) {
    const g = new THREE.SphereGeometry(0.0075, lite ? 5 : 8, lite ? 4 : 6);
    g.translate(v.x, v.y + cy, v.z);
    nodes.push(g);
  }
  group.add(new THREE.Mesh(mergeGeometries(nodes), cel({ color: 0xd8dcdf, rim: 0.3, spec: 0.5 })));

  /* The cage's mounts: four struts from the frame out to the shell. */
  for (const sd of [-1, 1]) {
    const m = new THREE.Mesh(strutGeo(new THREE.Vector3(sd * 0.05, 0, 0), new THREE.Vector3(sd * (RX - 0.01), cy, 0), 0.005, 6), carbon);
    group.add(m);
  }

  /* The frame: a body, four arms to the motors. */
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.05, 0.14), frame);
  group.add(body);
  for (let m = 0; m < 4; m += 1) {
    const at = motorAt(spec.arm, m);
    group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(0, 0.004, 0), new THREE.Vector3(at.x, 0.004, at.z), 0.006, 6), carbon));
  }
  /* The pack under the body. */
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.035, 0.1), cel({ color: 0x1b1e21, rim: 0.2 }));
  pack.position.y = -0.045;
  group.add(pack);
  lidar(group, cel, 0.05, 0.03, 0.04);
  const cameraMount = nose(group, cel, { y: 0.0, z: -0.09 }, 0.04, 0.05);
  return {
    group, discs: c.discs, blades: c.blades, leds: c.leds, cameraMount, stator: c.stator, propSpin: PROP_SPIN,
  };
}

/*
 * TETHERED. plant.c's SIM_AIRFRAME_TETHERED: motors 120 mm out on each axis,
 * 8 inch props (0.1016 m) 60 mm under the CG in push configuration, a hull
 * 0.224 by 0.240 across, 0.12 down and 0.142 up.
 */
export function buildTetheredCraft(opts = {}) {
  const group = new THREE.Group();
  group.name = opts.name ?? 'tethered-craft';
  group.scale.setScalar(1 / (opts.worldScale ? WORLD_SCALE : 1));
  const spec = {
    arm: 0.12, propR: 0.1016, motorR: 0.017, motorH: 0.022, motorY: -0.036,
    rotorY: -0.06, capSide: -1, ledY: -0.024, propColor: 0x1f2326,
    hull: [0.224, 0.24, 0.12, 0.142],
  };
  const c = common(group, opts, spec);
  const { cel } = c;
  const shellMat = cel({ color: 0xd9dcde, rim: 0.3, spec: 0.35 });
  const dark = cel({ color: 0x2a2e32, rim: 0.25, spec: 0.3 });
  const accent = cel({ color: 0xe5762a, rim: 0.25, spec: 0.3 });

  /* Fuselage: a light shell over a dark deck, an orange stripe. */
  const fus = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.22), shellMat);
  fus.position.y = 0.0;
  group.add(fus);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.18), dark);
  deck.position.y = 0.041;
  group.add(deck);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.012, 0.06), accent);
  stripe.position.set(0, 0.012, 0.04);
  group.add(stripe);
  /* Arms down to the motors, which hang under them for the push props. */
  for (let m = 0; m < 4; m += 1) {
    const at = motorAt(spec.arm, m);
    group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(at.x * 0.3, -0.012, at.z * 0.3),
      new THREE.Vector3(at.x, -0.022, at.z), 0.009, 8), dark));
  }
  /* Skids. */
  for (const sd of [-1, 1]) {
    const x = sd * 0.075;
    group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(x, -0.035, -0.06), new THREE.Vector3(x, -0.112, -0.07), 0.005, 6), dark));
    group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(x, -0.035, 0.06), new THREE.Vector3(x, -0.112, 0.07), 0.005, 6), dark));
    group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(x, -0.114, -0.11), new THREE.Vector3(x, -0.114, 0.11), 0.006, 6), dark));
  }
  /* The LiDAR on a short mast, its top at the hull's 142 mm: the tallest
   * thing on the aircraft, as on the class. */
  group.add(new THREE.Mesh(strutGeo(new THREE.Vector3(0, 0.045, 0), new THREE.Vector3(0, 0.085, 0), 0.01, 8), dark));
  lidar(group, cel, 0.112, 0.035, 0.06);
  /* The tether boss at the tail, where tether.c attaches the cable. */
  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.02, 12), accent);
  boss.rotation.x = Math.PI / 2;
  boss.position.set(0, 0, 0.12);
  group.add(boss);
  const cameraMount = nose(group, cel, { y: -0.045, z: -0.105 }, 0.05, 0.075);
  return {
    group, discs: c.discs, blades: c.blades, leds: c.leds, cameraMount, stator: c.stator, propSpin: PROP_SPIN,
  };
}
